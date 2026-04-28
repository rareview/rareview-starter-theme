#!/usr/bin/env node

/**
 * RV Starter Theme — Figma Apply
 *
 * Reads scripts/figma-sync/figma-export.json and scripts/variable_mapping.csv,
 * resolves each token (Figma value first, CSV default as fallback), then writes
 * the resolved values to theme.json and variables.scss.
 *
 * Usage:
 *   npm run figma-apply               # Apply and write
 *   npm run figma-apply -- --dry-run  # Preview without writing
 *
 * CSV column schema (variable_mapping.csv):
 *   slug            – machine-readable key (used for logs)
 *   label           – human description
 *   figma_key       – optional: first Figma node whose name contains this string; overrides figma_path when a value is stored in keyedBySlug
 *   figma_path      – dot-notation path into figma-export.json (empty = no figma source)
 *   type            – px | hex | rem | number | string | font-family | scss-ref | scss-color-match
 *   default_value   – fallback when figma path is absent or empty
 *   scss_target     – SCSS variable name without $ (empty = skip SCSS)
 *   theme_json_target – custom.<dot.path> | palette:<slug> | empty
 *
 * @author Rareview <hello@rareview.com>
 */

import { appendFile, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exit } from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
const LOG_FILE_PATH = resolve(ROOT, 'scripts', 'figma-sync', 'figma-sync.log');
const logLines = [];
const fontsToInstall = new Set();

// ─── ANSI helpers ─────────────────────────────────────────────────────────────

const c = {
	green: (s) => `\x1b[32m${s}\x1b[0m`,
	yellow: (s) => `\x1b[33m${s}\x1b[0m`,
	cyan: (s) => `\x1b[36m${s}\x1b[0m`,
	red: (s) => `\x1b[31m${s}\x1b[0m`,
	bold: (s) => `\x1b[1m${s}\x1b[0m`,
	dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

function progressBar(label, current, total) {
	if (VERBOSE) {
		return;
	}
	const percent = Math.round((current / total) * 100);
	const width = 28;
	const filled = Math.min(width, Math.round((percent / 100) * width));
	process.stdout.write(
		`\r  ${label} [${'#'.repeat(filled)}${'.'.repeat(width - filled)}] ${String(percent).padStart(3)}%`,
	);
	if (current >= total) {
		process.stdout.write('\n');
	}
}

function sourceTag(source) {
	if (source === 'figma') return '[figma]';
	if (source === 'auto') return '[auto]';
	return '[default]';
}

async function appendSyncLog() {
	await mkdir(dirname(LOG_FILE_PATH), { recursive: true });
	await appendFile(LOG_FILE_PATH, `\n${logLines.join('\n')}\n`, 'utf-8');
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

/**
 * Parse a CSV string into an array of field arrays.
 * Handles double-quoted fields (which may contain commas).
 */
function parseCsv(raw) {
	const rows = [];
	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		const fields = [];
		let i = 0;
		while (i < trimmed.length) {
			if (trimmed[i] === '"') {
				let value = '';
				i++; // skip opening quote
				while (i < trimmed.length) {
					if (trimmed[i] === '"' && trimmed[i + 1] === '"') {
						value += '"';
						i += 2;
					} else if (trimmed[i] === '"') {
						i++; // skip closing quote
						break;
					} else {
						value += trimmed[i++];
					}
				}
				fields.push(value);
				if (trimmed[i] === ',') i++;
			} else {
				const end = trimmed.indexOf(',', i);
				if (end === -1) {
					fields.push(trimmed.slice(i));
					break;
				}
				fields.push(trimmed.slice(i, end));
				i = end + 1;
			}
		}
		rows.push(fields);
	}
	return rows;
}

function getCsvColumns(headerRow) {
	const columns = new Map();
	for (const [index, header] of headerRow.entries()) {
		columns.set(header.trim(), index);
	}

	const required = ['slug', 'label', 'figma_path', 'type', 'default_value', 'scss_target', 'theme_json_target'];
	const missing = required.filter((name) => !columns.has(name));
	if (missing.length > 0) {
		throw new Error(`variable_mapping.csv is missing required column(s): ${missing.join(', ')}`);
	}

	// figma_key is optional (older CSVs)
	if (!columns.has('figma_key')) {
		columns.set('figma_key', -1);
	}

	return columns;
}

function csvCell(row, columns, name) {
	const index = columns.get(name);
	if (index === -1) {
		return '';
	}
	return (row[index] ?? '').trim();
}

// ─── Figma path resolver ──────────────────────────────────────────────────────

/**
 * Traverse figmaExport using a dot-notation path.
 * Array indices are supported (e.g. "buttons.0.backgroundColor").
 * Returns null when any segment is missing.
 */
function resolveFromFigma(figmaExport, figmaPath) {
	if (!figmaPath) return null;
	let obj = figmaExport;
	for (const part of figmaPath.split('.')) {
		if (obj == null) return null;
		const idx = parseInt(part, 10);
		obj = isNaN(idx) ? obj[part] : obj[idx];
	}
	return obj != null ? obj : null;
}

// ─── Value normalisation ──────────────────────────────────────────────────────

function slugifyFont(name) {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function getThemeFontFamilies(themeJson) {
	const list = themeJson?.settings?.typography?.fontFamilies;
	return Array.isArray(list) ? list.filter((f) => f?.slug) : [];
}

function inferGenericFamily(fontName) {
	return /serif/i.test(String(fontName ?? '')) ? 'serif' : 'sans-serif';
}

function ensureThemeFontFamilyPreset(themeJson, rawFontName) {
	const fontName = String(rawFontName ?? '').trim();
	if (!fontName) {
		return null;
	}
	const slug = slugifyFont(fontName);
	const list = getThemeFontFamilies(themeJson);
	const existing = list.find((f) => String(f.slug) === slug);
	if (!existing) {
		if (!themeJson.settings) {
			themeJson.settings = {};
		}
		if (!themeJson.settings.typography) {
			themeJson.settings.typography = {};
		}
		if (!Array.isArray(themeJson.settings.typography.fontFamilies)) {
			themeJson.settings.typography.fontFamilies = [];
		}
		themeJson.settings.typography.fontFamilies.push({
			name: fontName,
			slug,
			fontFamily: `${fontName}, ${inferGenericFamily(fontName)}`,
		});
		fontsToInstall.add(fontName);
	}
	return `var(--wp--preset--font-family--${slug})`;
}

function resolveFontFamilyValue(rawValue, themeJson, defaultVal = '') {
	const raw = String(rawValue ?? '').trim();
	if (!raw) {
		return String(defaultVal ?? '');
	}
	// Keep authored references as-is.
	if (raw.startsWith('$') || raw.startsWith('var(')) {
		return raw;
	}
	return ensureThemeFontFamilyPreset(themeJson, raw) ?? String(defaultVal ?? '');
}

/**
 * Round numeric values to a max precision and trim trailing zeros.
 * Example: 1.2305168151855468 -> "1.2305", 2.0000 -> "2"
 */
function formatNumberValue(input, decimals = 4) {
	const num = typeof input === 'number' ? input : Number.parseFloat(String(input));
	if (!Number.isFinite(num)) {
		return String(input);
	}
	return num
		.toFixed(decimals)
		.replace(/\.?0+$/, '');
}

function parseNumericWithUnit(input) {
	const raw = String(input ?? '').trim();
	const m = raw.match(/^(-?\d*\.?\d+)\s*([a-zA-Z%]*)$/);
	if (!m) {
		return null;
	}
	return { value: Number.parseFloat(m[1]), unit: (m[2] || '').toLowerCase() };
}

/**
 * Normalise a raw value according to its declared type.
 *
 * Types:
 *   px         – append "px" to a numeric value
 *   hex        – ensure 6-char lowercase hex with "#" prefix
 *   rem        – ensure "rem" suffix
 *   number     – pass through as string
 *   string     – pass through as-is
 *   scss-ref   – pass through as-is (a SCSS variable reference like $color-dark)
 *   font-family – convert font name to CSS var reference for SCSS
 *   scss-color-match – handled in main: map Figma hex to nearest theme palette, write $color-<slug> (not used here for SCSS; see main loop)
 */
function normalizeValue(rawValue, type, context = {}) {
	const value = String(rawValue);

	// SCSS variable references and CSS var() values pass through unchanged,
	// regardless of declared type. This handles defaults like $color-dark,
	// $body-font-family, var(--wp--preset--spacing--40), etc.
	if (value.startsWith('$') || value.startsWith('var(')) return value;

	switch (type) {
		case 'px': {
			const parsed = parseNumericWithUnit(value);
			if (!parsed || !Number.isFinite(parsed.value)) {
				return value;
			}
			// Enforce px output for numeric data.
			return `${formatNumberValue(parsed.value, 4)}px`;
		}
		case 'hex': {
			let hex = value.replace(/^#/, '');
			if (hex.length === 3) hex = hex.split('').map((ch) => ch + ch).join('');
			hex = hex.toLowerCase().slice(0, 6);
			if (hex.length === 6 && hex[0] === hex[1] && hex[2] === hex[3] && hex[4] === hex[5]) {
				hex = `${hex[0]}${hex[2]}${hex[4]}`;
			}
			return '#' + hex;
		}
		case 'rem': {
			const parsed = parseNumericWithUnit(value);
			if (!parsed || !Number.isFinite(parsed.value)) {
				return value;
			}
			// Figma numeric dimensions are px; convert px->rem when needed.
			const remVal = parsed.unit === 'rem' ? parsed.value : parsed.value / 16;
			return `${formatNumberValue(remVal, 4)}rem`;
		}
		case 'font-family': {
			return resolveFontFamilyValue(rawValue, context.themeJson, context.defaultVal);
		}
		case 'number':
			return formatNumberValue(rawValue, 4);
		case 'string':
			// Keep authored strings intact, but normalize numeric values coming
			// from Figma to avoid excessive floating-point precision in SCSS.
			if (typeof rawValue === 'number') {
				return formatNumberValue(rawValue, 4);
			}
			return value;
		case 'scss-ref':
		default:
			return value.replace(/^0[a-zA-Z%]+$/, '0');
	}
}

// ─── theme.json helpers ───────────────────────────────────────────────────────

/**
 * Deep-set a value inside themeJson.settings using a dot-notation path.
 * Intermediate objects are created if absent.
 * Example: "custom.font-size.desktop.heading1" → settings.custom["font-size"].desktop.heading1
 */
function setDeepSettings(themeJson, pathStr, value) {
	const parts = pathStr.split('.');
	let cur = themeJson.settings;
	for (let i = 0; i < parts.length - 1; i++) {
		const key = parts[i];
		if (cur[key] == null) cur[key] = {};
		cur = cur[key];
	}
	cur[parts[parts.length - 1]] = value;
}

/**
 * Update the color field of a palette entry by slug.
 * Creates a new entry if the slug does not yet exist.
 * Returns "updated" or "created".
 */
function updatePalette(themeJson, slug, hex, label) {
	const palette = themeJson.settings.color.palette;
	const newEntryName = label && String(label).trim() ? label.trim() : slug;
	const entry = palette.find((e) => e.slug === slug);
	if (entry) {
		entry.color = hex;
		return 'updated';
	}
	palette.push({ name: newEntryName, slug, color: hex });
	return 'created';
}

// ─── scss-color-match: nearest palette ─────────────────────────────────────

function scssColorToSlugVar(scssRef) {
	const m = /^\$color-([a-z0-9-]+)\s*$/i.exec(String(scssRef).trim());
	return m ? m[1] : null;
}

function themeVarFromScssColorRef(scssRef) {
	const s = scssColorToSlugVar(scssRef);
	if (!s) {
		return null;
	}
	return `var(--wp--preset--color--${s})`;
}

function parseHex6(hexStr) {
	const s = String(hexStr).replace(/^#/, '');
	if (s.length === 3) {
		const [r, g, b] = s;
		return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16)];
	}
	if (s.length < 6) {
		return null;
	}
	return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

function findClosestPaletteSlug(figmaHex, themeJson) {
	const p = parseHex6(normalizeValue(String(figmaHex), 'hex'));
	if (!p) {
		return null;
	}
	const list = themeJson?.settings?.color?.palette;
	if (!Array.isArray(list)) {
		return null;
	}
	let best = null;
	let bestD = Infinity;
	for (const e of list) {
		if (!e?.color) {
			continue;
		}
		const t = parseHex6(normalizeValue(String(e.color), 'hex'));
		if (!t) {
			continue;
		}
		const d = Math.hypot(p[0] - t[0], p[1] - t[1], p[2] - t[2]);
		if (d < bestD) {
			bestD = d;
			best = e.slug;
		}
	}
	return best ?? null;
}

// ─── SCSS helpers ─────────────────────────────────────────────────────────────

function escRe(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replace the value portion of `$varName: VALUE;` in the SCSS string. */
function replaceScssVar(scss, varName, newValue) {
	const re = new RegExp(`(\\$${escRe(varName)}:\\s*)([^;]+)(;)`, 'g');
	return scss.replace(re, `$1${newValue}$3`);
}

/** Return true if the SCSS file already declares `$varName`. */
function scssHasVar(scss, varName) {
	return new RegExp(`\\$${escRe(varName)}:`).test(scss);
}

/**
 * Ensure `$color-{slug}: var(--wp--preset--color--{paletteSlug});` exists in
 * SCSS. Inserts before the "Theme colors" comment if the declaration is new.
 */
function ensureScssColorVar(scss, paletteSlug) {
	const varName = `color-${paletteSlug}`;
	const varValue = `var(--wp--preset--color--${paletteSlug})`;
	const declaration = `$${varName}: ${varValue};`;

	if (scssHasVar(scss, varName)) {
		return { scss: replaceScssVar(scss, varName, varValue), added: false };
	}

	const themeAnchor = '/* Colors - Theme colors. */';
	if (scss.includes(themeAnchor)) {
		return { scss: scss.replace(themeAnchor, declaration + '\n' + themeAnchor), added: true };
	}

	// Fallback: append after last color-* declaration
	const lastColorLine = scss.lastIndexOf('\n$color-');
	if (lastColorLine !== -1) {
		const lineEnd = scss.indexOf('\n', lastColorLine + 1);
		const insert = lineEnd !== -1 ? lineEnd : scss.length;
		return { scss: scss.slice(0, insert) + '\n' + declaration + scss.slice(insert), added: true };
	}

	return { scss: scss + '\n' + declaration, added: true };
}

// ─── File discovery ───────────────────────────────────────────────────────────

async function findThemeDir() {
	const themesDir = resolve(ROOT, 'wp-content', 'themes');
	const entries = await readdir(themesDir, { withFileTypes: true });
	const themes = entries
		.filter((entry) => entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.'))
		.map((entry) => {
			const dir = resolve(themesDir, entry.name);
			return {
				name: entry.name,
				dir,
				hasThemeJson: existsSync(resolve(dir, 'theme.json')),
				hasVariablesScss: existsSync(resolve(dir, 'assets', 'css', 'abstracts', 'variables', 'variables.scss')),
			};
		});

	// A valid target theme for figma-apply must have BOTH files.
	const ready = themes.filter((t) => t.hasThemeJson && t.hasVariablesScss);
	const preferred = ready.find((t) => t.name === 'rv-starter') ?? ready[0];
	if (preferred) {
		return preferred.dir;
	}

	const hasRvStarter = themes.find((t) => t.name === 'rv-starter') ?? null;
	if (hasRvStarter && !hasRvStarter.hasThemeJson && hasRvStarter.hasVariablesScss) {
		console.error(
			c.red(
				'\n  Error: `wp-content/themes/rv-starter/theme.json` is missing.\n' +
					'  figma-apply needs both:\n' +
					'  - theme.json\n' +
					'  - assets/css/abstracts/variables/variables.scss\n',
			),
		);
		exit(1);
	}

	const details = themes
		.map((t) => `  - ${t.name}: theme.json=${t.hasThemeJson ? 'yes' : 'no'}, variables.scss=${t.hasVariablesScss ? 'yes' : 'no'}`)
		.join('\n');
	console.error(
		c.red(
			`\n  Error: No eligible theme found for figma-apply.\n${details}\n\n` +
				'  Expected a theme with both theme.json and assets/css/abstracts/variables/variables.scss.\n',
		),
	);
	exit(1);
}

async function findFigmaExport() {
	const primary = resolve(ROOT, 'scripts', 'figma-sync', 'figma-export.json');
	const fallback = resolve(ROOT, 'scripts', 'figma-sync', 'figma-ai-export.json');
	if (existsSync(primary)) return primary;
	if (existsSync(fallback)) return fallback;
	return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	console.log('');
	console.log(c.bold('  RV Starter Theme — Figma Sync'));
	console.log(c.dim('  ─────────────────────────────────'));
	if (DRY_RUN) console.log(c.yellow('\n  DRY RUN — no files will be written'));
	console.log('');

	// Figma export
	const figmaExportPath = await findFigmaExport();
	let figmaExport = {};

	if (figmaExportPath) {
		if (VERBOSE) {
			console.log(`  ${c.dim('Source:')} ${c.cyan(figmaExportPath.replace(ROOT + '/', ''))}`);
		}
		figmaExport = JSON.parse(await readFile(figmaExportPath, 'utf-8'));
	} else {
		console.log(c.yellow('  ⚠  figma-export.json not found — using CSV defaults only.'));
		console.log(c.dim('     Run `npm run figma-sync` first to fetch from Figma.\n'));
	}

	logLines.push('Applied values');
	logLines.push(`Source: ${figmaExportPath ? figmaExportPath.replace(ROOT + '/', '') : 'CSV defaults only'}`);
	logLines.push('');

	// CSV
	const csvPath = resolve(ROOT, 'scripts', 'variable_mapping.csv');
	const rows = parseCsv(await readFile(csvPath, 'utf-8'));
	const [headerRow, ...dataRows] = rows;
	const columns = getCsvColumns(headerRow ?? []);

	// Theme files
	const themeDir = await findThemeDir();
	const themeJsonPath = resolve(themeDir, 'theme.json');
	const scssPath = resolve(themeDir, 'assets', 'css', 'abstracts', 'variables', 'variables.scss');

	const themeJson = JSON.parse(await readFile(themeJsonPath, 'utf-8'));
	let scss = await readFile(scssPath, 'utf-8');

	const changes = { themeJson: [], scss: [] };
	let skipped = 0;

	for (const row of dataRows) {
		const slug = csvCell(row, columns, 'slug');
		const label = csvCell(row, columns, 'label') || slug;
		const figmaKey = csvCell(row, columns, 'figma_key');
		const figmaPath = csvCell(row, columns, 'figma_path');
		const type = csvCell(row, columns, 'type');
		const defaultVal = csvCell(row, columns, 'default_value');
		const scssTarget = csvCell(row, columns, 'scss_target');
		const tjTarget = csvCell(row, columns, 'theme_json_target');

		// Section header rows have no targets
		if (!scssTarget && !tjTarget) continue;
		// Rows with no type are malformed
		if (!type) continue;

		// figma_key (keyedBySlug) wins over figma_path when set in export
		let figmaRaw = null;
		if (figmaKey) {
			figmaRaw = resolveFromFigma(figmaExport, `keyedBySlug.${slug}`);
		}
		if (figmaRaw == null && figmaPath) {
			figmaRaw = resolveFromFigma(figmaExport, figmaPath);
		}
		const rawValue = figmaRaw != null ? figmaRaw : defaultVal;

		if (rawValue === '' || rawValue == null) {
			skipped++;
			continue;
		}

		/** @type {string} */
		let value;
		/** @type {string | null} */
		let themeValue = null;
		const source = figmaRaw != null ? 'figma' : 'default';

		if (type === 'scss-color-match') {
			const fromFigma = figmaRaw != null;
			const hexForMatch =
				fromFigma && String(figmaRaw).trim().length
					? normalizeValue(String(figmaRaw), 'hex')
					: null;
			const closest = hexForMatch != null && hexForMatch.startsWith('#') ? findClosestPaletteSlug(hexForMatch, themeJson) : null;
			const defScss = String(defaultVal).trim();
			const scssResolved = closest != null ? `$color-${closest}` : defScss;
			const themeV = closest != null ? `var(--wp--preset--color--${closest})` : themeVarFromScssColorRef(defScss) ?? scssResolved;
			value = scssResolved;
			themeValue = themeV;
		} else {
			value = normalizeValue(rawValue, type, { themeJson, defaultVal });
		}

		// ── theme.json ─────────────────────────────────────────────────────────
		if (tjTarget) {
			if (tjTarget.startsWith('palette:')) {
				const palSlug = tjTarget.slice('palette:'.length);
				const action = updatePalette(themeJson, palSlug, value, label);
				changes.themeJson.push({ label, target: `palette:${palSlug}`, value, source });

				// Auto-create SCSS color var for new palette entries
				if (action === 'created') {
					const result = ensureScssColorVar(scss, palSlug);
					scss = result.scss;
					if (result.added) {
						const scssVarName = `color-${palSlug}`;
						const scssVarValue = `var(--wp--preset--color--${palSlug})`;
						changes.scss.push({ label: `Auto: ${label}`, target: `$${scssVarName}`, value: scssVarValue, source: 'auto' });
					}
				}
			} else {
				const tj = type === 'scss-color-match' && themeValue != null ? themeValue : value;
				setDeepSettings(themeJson, tjTarget, tj);
				changes.themeJson.push({ label, target: tjTarget, value: tj, source });
			}
		}

		// ── variables.scss ─────────────────────────────────────────────────────
		if (scssTarget) {
			if (!scssHasVar(scss, scssTarget)) {
				const warning = `  ! $${scssTarget} not found in variables.scss - skipping`;
				logLines.push(warning);
				if (VERBOSE) {
					console.log(c.yellow(warning));
				}
				skipped++;
				continue;
			}
			scss = replaceScssVar(scss, scssTarget, value);
			changes.scss.push({ label, target: `$${scssTarget}`, value, source });
		}
	}

	// ── Summary ────────────────────────────────────────────────────────────────
	logLines.push('theme.json updates:');
	logLines.push('');
	if (VERBOSE) {
		console.log('');
		console.log(c.bold('  theme.json updates:\n'));
	}
	for (const ch of changes.themeJson) {
		const tag = ch.source === 'figma' ? c.cyan('[figma]  ') : c.dim('[default]');
		logLines.push(`    ${sourceTag(ch.source).padEnd(9)} ${ch.target}: ${ch.value}  ${ch.label}`);
		if (VERBOSE) {
			console.log(`    ${tag}  ${c.dim(ch.target)}: ${c.green(ch.value)}  ${c.dim(ch.label)}`);
		}
	}

	logLines.push('');
	logLines.push('variables.scss updates:');
	logLines.push('');
	if (VERBOSE) {
		console.log('');
		console.log(c.bold('  variables.scss updates:\n'));
	}
	for (const ch of changes.scss) {
		const tag =
			ch.source === 'figma'
				? c.cyan('[figma]  ')
				: ch.source === 'auto'
					? c.yellow('[auto]   ')
					: c.dim('[default]');
		logLines.push(`    ${sourceTag(ch.source).padEnd(9)} ${ch.target}: ${ch.value}  ${ch.label}`);
		if (VERBOSE) {
			console.log(`    ${tag}  ${c.dim(ch.target)}: ${c.green(ch.value)}  ${c.dim(ch.label)}`);
		}
	}

	if (skipped > 0) {
		logLines.push('');
		logLines.push(`(${skipped} row(s) skipped - no value resolved)`);
		if (VERBOSE) {
			console.log(c.dim(`\n  (${skipped} row(s) skipped — no value resolved)`));
		}
	}
	if (fontsToInstall.size > 0) {
		const names = [...fontsToInstall].sort();
		const heading = 'Manual font files required:';
		logLines.push('');
		logLines.push(heading);
		for (const name of names) {
			logLines.push(`  - ${name}`);
		}
		logLines.push('Add each family files under wp-content/themes/<theme>/assets/fonts and wire @font-face entries in theme.json.');
		console.log('');
		console.log(c.yellow(`  ⚠ ${heading}`));
		for (const name of names) {
			console.log(c.yellow(`    - ${name}`));
		}
		console.log(c.dim('  Add each family under assets/fonts and define fontFace sources in theme.json.\n'));
	}

	// ── Write ──────────────────────────────────────────────────────────────────
	if (VERBOSE) {
		console.log('');
	} else {
		console.log('Applying values...');
	}
	if (!DRY_RUN) {
		await writeFile(themeJsonPath, JSON.stringify(themeJson, null, '  ') + '\n', 'utf-8');
		progressBar('Applying', 1, 2);
		if (VERBOSE) {
			console.log(`  ${c.green('✓')} Updated theme.json`);
		}

		await writeFile(scssPath, scss, 'utf-8');
		progressBar('Applying', 2, 2);
		if (VERBOSE) {
			console.log(`  ${c.green('✓')} Updated variables.scss`);
		}

		logLines.push('');
		logLines.push('Updated theme.json');
		logLines.push('Updated variables.scss');
		await appendSyncLog();

		console.log('');
		console.log(c.bold(c.green('  ✓ Figma sync complete')));
		console.log(c.dim(`  Log: ${LOG_FILE_PATH.replace(ROOT + '/', '')}`));
		console.log(c.dim('  Run `npm run build` to rebuild with the updated tokens.\n'));
	} else {
		logLines.push('');
		logLines.push('Dry run complete - no files were written.');
		await appendSyncLog();
		console.log(c.yellow('  Dry run complete — no files were written.'));
		console.log(c.dim(`  Log: ${LOG_FILE_PATH.replace(ROOT + '/', '')}\n`));
	}
}

main().catch((err) => {
	console.error(c.red(`\n  Error: ${err.message}\n`));
	console.error(err.stack);
	exit(1);
});
