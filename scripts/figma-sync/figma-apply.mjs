#!/usr/bin/env node

/**
 * Rareview Starter Theme — Figma Apply
 *
 * Reads generated/figma-export.json and variable_mapping_figma_sync.csv in this directory,
 * resolves each token (Figma value first, CSV default as fallback), then writes
 * the resolved values to theme.json and variables.scss.
 *
 * Usage:
 *   npm run figma-apply               # Apply and write
 *   npm run figma-apply -- --dry-run  # Preview without writing
 *
 * CSV column schema (variable_mapping_figma_sync.csv):
 *   figma_sync_slug         – machine-readable key (used for logs)
 *   label                   – human description
 *   figma_tag               – optional: first Figma node whose name contains this string; used as priority lookup via taggedNodes[tag][figma_path]
 *   figma_path              – dot-notation path into figma-export.json (empty/NULL = no figma source)
 *   theme_json_target       – custom.<dot.path> | palette:<slug> | typography:<slug> | NULL
 *   theme_json_value_type   – px | hex | rem | number | string | font-family | scss-color-match | NULL
 *   theme_json_default_value – fallback value for theme.json when figma path absent | NULL
 *   scss_target             – SCSS variable name without $ (empty/NULL = skip SCSS)
 *   scss_value_type         – px | hex | rem | number | string | font-family | scss-ref | theme-json-var-ref | scss-color-match | NULL
 *                             scss-color-match (variables.scss only): exact palette hex match → $color-<slug>;
 *                             otherwise literal hex from Figma. theme-json-var-ref is unchanged (Gutenberg-safe).
 *   scss_default_value      – fallback value for SCSS when figma path absent | NULL
 *
 * @author Rareview <hello@rareview.com>
 */

import { appendFile, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exit } from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
const GENERATED_DIR = resolve(__dirname, 'generated');
const LOG_FILE_PATH = resolve(GENERATED_DIR, 'figma-sync.log');
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

	const required = [
		'label', 'figma_sync_slug', 'figma_path', 'theme_json_target',
		'theme_json_value_type', 'theme_json_default_value',
		'scss_target', 'scss_value_type', 'scss_default_value',
	];
	const missing = required.filter((name) => !columns.has(name));
	if (missing.length > 0) {
		throw new Error(`variable_mapping_figma_sync.csv is missing required column(s): ${missing.join(', ')}`);
	}

	// figma_tag is optional
	if (!columns.has('figma_tag')) {
		columns.set('figma_tag', -1);
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
	} else {
		existing.name = fontName;
		existing.fontFamily = `${fontName}, ${inferGenericFamily(fontName)}`;
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

/** Zero lengths without units (stylelint `length-zero-no-unit`). */
function formatZeroAwareLength(num, unit) {
	if (num === 0) {
		return '0';
	}
	return `${formatNumberValue(num, 4)}${unit}`;
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
 *   scss-color-match – theme.json side still maps to nearest palette var(); SCSS side uses exact palette match or hex (see main loop).
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
			return formatZeroAwareLength(parsed.value, 'px');
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
			return formatZeroAwareLength(remVal, 'rem');
		}
		case 'font-family': {
			return resolveFontFamilyValue(rawValue, context.themeJson, context.defaultVal);
		}
		case 'em': {
			const parsed = parseNumericWithUnit(value);
			if (!parsed || !Number.isFinite(parsed.value)) {
				return value;
			}
			// Figma letter-spacing is in em; pass through as-is (no px conversion).
			return formatZeroAwareLength(parsed.value, 'em');
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
 * Deep-get a value inside themeJson.settings using dot notation.
 * Returns undefined when any segment is missing.
 */
function getDeepSettings(themeJson, pathStr) {
	const parts = pathStr.split('.');
	let cur = themeJson.settings;
	for (const key of parts) {
		if (cur == null || typeof cur !== 'object' || !(key in cur)) {
			return undefined;
		}
		cur = cur[key];
	}
	return cur;
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

// ─── Palette helpers (exact vs nearest) ────────────────────────────────────

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

/**
 * Exact palette match only (after hex normalization). Used for variables.scss
 * scss-color-match so we never assign a misleading $color-* from a distant swatch.
 */
function findExactPaletteSlug(figmaHex, themeJson) {
	const key = normalizeValue(String(figmaHex), 'hex');
	if (!key || !key.startsWith('#')) {
		return null;
	}
	const list = themeJson?.settings?.color?.palette;
	if (!Array.isArray(list)) {
		return null;
	}
	for (const e of list) {
		if (!e?.color || !e.slug) {
			continue;
		}
		const candidate = normalizeValue(String(e.color), 'hex');
		if (candidate.toLowerCase() === key.toLowerCase()) {
			return e.slug;
		}
	}
	return null;
}

/**
 * Resolve SCSS value for scss-color-match: exact $color-<slug> or literal hex from Figma.
 * When Figma did not supply a color, keep CSV scss_default_value (often $color-*).
 */
function resolveScssColorMatchForVariablesScss(figmaRaw, scssDefault, themeJson, logLines, verbose, label, scssTarget) {
	const fromFigma = figmaRaw != null;
	const hexForMatch =
		fromFigma && String(figmaRaw).trim().length
			? normalizeValue(String(figmaRaw), 'hex')
			: null;
	const defScss = String(scssDefault).trim();

	if (hexForMatch != null && hexForMatch.startsWith('#')) {
		const exact = findExactPaletteSlug(hexForMatch, themeJson);
		if (exact != null) {
			return `$color-${exact}`;
		}
		const msg = `  scss-color-match → hex (no exact palette match): $${scssTarget} ← ${hexForMatch}  (${label})`;
		logLines.push(msg);
		if (verbose) {
			console.log(c.yellow(msg));
		}
		return hexForMatch;
	}
	return defScss;
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
	// Support both standard WP (wp-content/themes/) and WP VIP (themes/) layouts.
	const wpContentThemesDir = resolve(ROOT, 'wp-content', 'themes');
	const vipThemesDir = resolve(ROOT, 'themes');
	const themesDir = existsSync(wpContentThemesDir) ? wpContentThemesDir : vipThemesDir;

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
				`\n  Error: \`${themesDir.replace(ROOT + '/', '')}/rv-starter/theme.json\` is missing.\n` +
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
	const primary = resolve(GENERATED_DIR, 'figma-export.json');
	const fallback = resolve(GENERATED_DIR, 'figma-ai-export.json');
	if (existsSync(primary)) return primary;
	if (existsSync(fallback)) return fallback;
	return null;
}

// ─── Font check ───────────────────────────────────────────────────────────────

/** Well-known system / web-safe fonts that don't need local font files. */
const SYSTEM_FONTS = new Set([
	'arial', 'helvetica', 'verdana', 'tahoma', 'trebuchet ms', 'impact',
	'comic sans ms', 'georgia', 'palatino', 'garamond', 'bookman',
	'times', 'times new roman', 'courier', 'courier new', 'lucida console',
	'lucida sans unicode', 'sans-serif', 'serif', 'monospace',
]);

function isSystemFont(name) {
	return SYSTEM_FONTS.has(String(name ?? '').toLowerCase());
}

/**
 * Map a filename like "FuturaPT-Bold.woff2" or "Instrument_Serif-Italic.ttf"
 * to a CSS font-weight value string.
 */
function fontWeightFromFilename(filename) {
	const n = filename.toLowerCase();
	if (/extra.?bold|ultra.?bold|extra.?black/.test(n)) return '800';
	if (/black|heavy/.test(n)) return '900';
	if (/semi.?bold|demi.?bold/.test(n)) return '600';
	if (/medium/.test(n)) return '500';
	if (/bold/.test(n)) return '700';
	if (/extra.?light|ultra.?light|thin|hairline/.test(n)) return '200';
	if (/light/.test(n)) return '300';
	return '400'; // book, regular, roman, normal, or unknown
}

/** Returns "italic" or "normal" based on the filename. */
function fontStyleFromFilename(filename) {
	return /italic|oblique/i.test(filename) ? 'italic' : 'normal';
}

/**
 * Recursively collect all font files (.woff2 / .woff / .ttf / .otf) under dir.
 * Returns [] when the directory does not exist.
 */
async function findFontFiles(dir) {
	const results = [];
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return results;
	}
	for (const entry of entries) {
		const full = resolve(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...await findFontFiles(full));
		} else if (/\.(woff2|woff|ttf|otf)$/i.test(entry.name)) {
			results.push(full);
		}
	}
	return results;
}

/**
 * Filter allFiles to those that belong to fontName.
 * Matching is done on each path segment (directory names + filename stem),
 * using the slugified name, no-separator form, and individual words.
 * e.g. "Futura PT" matches paths containing "futura-pt", "futurapt",
 *      or any segment where both "futura" and "pt" are present.
 */
function matchFontFilesToFamily(fontName, allFiles) {
	const slug = slugifyFont(fontName);                                   // futura-pt
	const noSep = fontName.toLowerCase().replace(/[\s\-_]+/g, '');       // futurapt
	const words = fontName.toLowerCase().split(/[\s\-_]+/).filter(Boolean);

	return allFiles.filter((filePath) => {
		const segments = filePath.toLowerCase().replace(/\\/g, '/').split('/');
		return segments.some((seg) => {
			const clean = seg.replace(/\.(woff2|woff|ttf|otf)$/i, '');
			return (
				clean === slug ||
				clean === noSep ||
				clean.replace(/[\s\-_]+/g, '') === noSep ||
				(words.length > 1 && words.every((w) => clean.includes(w)))
			);
		});
	});
}

/**
 * Every non-system font family in the Figma export with each numeric weight
 * seen on body, headings, buttons, and paragraph-size defaults.
 * Returns Map<fontFamilyName, Set<weightString>>.
 *
 * @param {object} figmaExport
 * @returns {Map<string, Set<string>>}
 */
function collectAllFigmaFontUsage(figmaExport) {
	/** @type {Map<string, Set<string>>} */
	const usage = new Map();

	function add(family, weight) {
		if (!family || isSystemFont(family)) {
			return;
		}
		const fam = String(family).trim();
		if (!fam) {
			return;
		}
		if (!usage.has(fam)) {
			usage.set(fam, new Set());
		}
		usage.get(fam).add(String(weight ?? 400));
	}

	const body = figmaExport.body ?? null;
	const bodyWeight = body?.fontWeight ?? 400;
	if (body?.fontFamilyPrimary) {
		add(body.fontFamilyPrimary, bodyWeight);
	}
	if (body?.fontFamilySecondary) {
		add(body.fontFamilySecondary, bodyWeight);
	}

	for (const ctx of ['desktop', 'mobile']) {
		for (const h of (figmaExport.headings?.[ctx] ?? [])) {
			if (h?.fontFamily) {
				add(h.fontFamily, h.fontWeight ?? 400);
			}
		}
	}

	for (const btn of figmaExport.buttons ?? []) {
		if (btn?.fontFamily) {
			add(btn.fontFamily, btn.fontWeight ?? 400);
		}
	}

	const ps = body?.paragraphSizes;
	if (ps?.fontFamily) {
		const w =
			ps.desktop?.medium?.fontWeight
			?? ps.mobile?.medium?.fontWeight
			?? bodyWeight;
		add(ps.fontFamily, w);
	}

	return usage;
}

/**
 * Ensure fontFamily entry exists in theme.json and populate its fontFace array
 * from the matched font files. Returns the number of fontFace variations added.
 *
 * @param {string | null} targetSlug When set, write fontFace onto this preset slug
 *        (e.g. CSV typography:geist-mono) using files matched for fontName.
 */
function applyFontFaceToThemeJson(themeJson, fontName, files, themeDir, targetSlug = null) {
	if (!targetSlug) {
		ensureThemeFontFamilyPreset(themeJson, fontName);
	}

	const slug = targetSlug ?? slugifyFont(fontName);
	const entry = themeJson?.settings?.typography?.fontFamilies?.find((f) => f.slug === slug);
	if (!entry) return 0;

	const faces = files
		.map((filePath) => {
			const file = basename(filePath);
			const relPath = filePath.replace(themeDir + '/', '').replace(/\\/g, '/');
			return {
				fontFamily: fontName,
				fontWeight: fontWeightFromFilename(file),
				fontStyle: fontStyleFromFilename(file),
				src: [`file:./${relPath}`],
			};
		})
		.sort((a, b) => Number(a.fontWeight) - Number(b.fontWeight) || a.fontStyle.localeCompare(b.fontStyle));

	entry.fontFace = faces;
	return faces.length;
}

/**
 * Format a weight+style label, e.g. "400", "700 italic".
 */
function weightLabel(file) {
	const w = fontWeightFromFilename(file);
	const s = fontStyleFromFilename(file);
	return s === 'italic' ? `${w} italic` : w;
}

/**
 * Align a theme.json font preset (CSV typography:<slug>) with the Figma font name
 * and wire fontFace from theme assets when files exist.
 *
 * @param {object} themeJson
 * @param {string} themeDir
 * @param {string} presetSlug
 * @param {string} figmaFontName
 * @param {string[]} allFontFiles
 */
/**
 * Remove any fontFamilies entries whose slug is not in wantedSlugs.
 * Called after the full CSV loop so both Figma-registered and CSV-mapped
 * presets are already in place before anything is removed.
 *
 * @param {object} themeJson
 * @param {Set<string>} wantedSlugs
 */
function pruneUnusedFontPresets(themeJson, wantedSlugs) {
	const families = themeJson?.settings?.typography?.fontFamilies;
	if (!Array.isArray(families) || wantedSlugs.size === 0) {
		return;
	}
	themeJson.settings.typography.fontFamilies = families.filter((f) => wantedSlugs.has(f.slug));
}

function syncTypographyPresetFromFigmaFont(themeJson, themeDir, presetSlug, figmaFontName, allFontFiles) {
	const families = themeJson?.settings?.typography?.fontFamilies;
	if (!Array.isArray(families) || !presetSlug || !figmaFontName) {
		return;
	}
	const entry = families.find((f) => f.slug === presetSlug);
	if (!entry) {
		return;
	}
	entry.name = figmaFontName;
	entry.fontFamily = `${figmaFontName}, ${inferGenericFamily(figmaFontName)}`;
	const matched = matchFontFilesToFamily(figmaFontName, allFontFiles);
	if (matched.length > 0) {
		applyFontFaceToThemeJson(themeJson, figmaFontName, matched, themeDir, presetSlug);
	} else if (slugifyFont(figmaFontName) !== presetSlug) {
		delete entry.fontFace;
	}
}

/**
 * Check for font files, wire up theme.json and create placeholder folders.
 * Never prompts — always continues. Returns an array of missing-font records
 * to be displayed in the end-of-run summary.
 *
 * @param {string[]} [allFontFiles] Optional pre-scanned font file paths (avoids second disk walk).
 * @returns {Promise<Array<{name:string, slug:string, weights:string[], dir:string}>>}
 */
async function runFontCheck(figmaExport, themeJson, themeDir, allFontFiles) {
	const usage = collectAllFigmaFontUsage(figmaExport);
	if (usage.size === 0) return [];

	const fontsDir = resolve(themeDir, 'assets', 'fonts');
	const allFiles = allFontFiles != null ? allFontFiles : await findFontFiles(fontsDir);
	const missing = [];

	for (const [fontName, weightSet] of usage) {
		// Always register the font family in theme.json so the CSS custom
		// property exists even before the actual files are added.
		ensureThemeFontFamilyPreset(themeJson, fontName);

		const matched = matchFontFilesToFamily(fontName, allFiles);

		if (matched.length > 0) {
			applyFontFaceToThemeJson(themeJson, fontName, matched, themeDir);
		} else {
			// Create a placeholder folder so the user knows exactly where to drop files
			const fontDir = resolve(fontsDir, slugifyFont(fontName));
			if (!DRY_RUN) {
				await mkdir(fontDir, { recursive: true });
			}
			missing.push({
				name: fontName,
				slug: slugifyFont(fontName),
				weights: [...weightSet].sort((a, b) => Number(a) - Number(b)),
				dir: fontDir.replace(themeDir + '/', ''),
			});
		}
	}

	return missing;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	console.log('');
	console.log(c.bold('  Rareview Starter Theme — Figma Sync'));
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
		console.log(c.yellow('  ⚠  generated/figma-export.json not found — using CSV defaults only.'));
		console.log(c.dim('     Run `npm run figma-sync` first to fetch from Figma.\n'));
	}

	logLines.push('Applied values');
	logLines.push(`Source: ${figmaExportPath ? figmaExportPath.replace(ROOT + '/', '') : 'CSV defaults only'}`);
	logLines.push('');

	// CSV
	const csvPath = resolve(__dirname, 'variable_mapping_figma_sync.csv');
	const rows = parseCsv(await readFile(csvPath, 'utf-8'));
	const [headerRow, ...dataRows] = rows;
	const columns = getCsvColumns(headerRow ?? []);

	// Theme files
	const themeDir = await findThemeDir();
	const themeJsonPath = resolve(themeDir, 'theme.json');
	const scssPath = resolve(themeDir, 'assets', 'css', 'abstracts', 'variables', 'variables.scss');

	const themeJson = JSON.parse(await readFile(themeJsonPath, 'utf-8'));
	let scss = await readFile(scssPath, 'utf-8');

	const allFontFilesCache = await findFontFiles(resolve(themeDir, 'assets', 'fonts'));

	// ── Font file check ─────────────────────────────────────────────────────
	let missingFonts = [];
	if (figmaExportPath) {
		missingFonts = await runFontCheck(figmaExport, themeJson, themeDir, allFontFilesCache);
	}

	const changes = { themeJson: [], scss: [] };
	let skipped = 0;

	// Slugs of every font family Figma detected — used after the loop to prune stale presets.
	const figmaFontSlugs = new Set(
		[...collectAllFigmaFontUsage(figmaExport).keys()].map(slugifyFont),
	);
	// CSV typography:<slug> rows add their preset slug here so those entries are kept.
	const csvTypographySlugs = new Set();
	// Figma font slugs already covered by a CSV typography remap (e.g. Montserrat covered
	// by typography:geist-mono). These are excluded from figmaFontSlugs to avoid duplicates.
	const csvTypographyHandledFontSlugs = new Set();

	for (const row of dataRows) {
		const slug = csvCell(row, columns, 'figma_sync_slug');
		const label = csvCell(row, columns, 'label') || slug;
		const figmaKey = csvCell(row, columns, 'figma_tag');
		const figmaPath = csvCell(row, columns, 'figma_path');
		const scssTarget = csvCell(row, columns, 'scss_target');
		const tjTarget = csvCell(row, columns, 'theme_json_target');

		// NULL string means "no target/value" for that side
		const tjTargetResolved = tjTarget === 'NULL' ? '' : tjTarget;
		const figmaPathResolved = figmaPath === 'NULL' ? '' : figmaPath;

		let tjType = csvCell(row, columns, 'theme_json_value_type');
		let tjDefault = csvCell(row, columns, 'theme_json_default_value');
		let scssType = csvCell(row, columns, 'scss_value_type');
		let scssDefault = csvCell(row, columns, 'scss_default_value');
		if (tjType === 'NULL') tjType = '';
		if (tjDefault === 'NULL') tjDefault = '';
		if (scssType === 'NULL') scssType = '';
		if (scssDefault === 'NULL') scssDefault = '';

		// Section header rows have no slug or targets
		if (!slug) continue;
		if (!scssTarget && !tjTargetResolved) continue;

		// Resolution priority:
		//   1. taggedNodes[figma_tag][figma_path]  — tag-matched node (most specific)
		//   2. keyedBySlug[slug]                   — pre-extracted per-slug value (legacy)
		//   3. figma_path on structured export     — broad heuristic extraction (fallback)
		let figmaRaw = null;
		if (figmaKey && figmaPathResolved) {
			const taggedNode = figmaExport.taggedNodes?.[figmaKey];
			if (taggedNode != null) {
				figmaRaw = taggedNode[figmaPathResolved] ?? null;
			}
		}
		if (figmaRaw == null && figmaKey) {
			figmaRaw = resolveFromFigma(figmaExport, `keyedBySlug.${slug}`);
		}
		if (figmaRaw == null && figmaPathResolved) {
			figmaRaw = resolveFromFigma(figmaExport, figmaPathResolved);
		}

		// ── theme.json side ────────────────────────────────────────────────────
		if (tjTargetResolved && tjType) {
			let rawTjValue = figmaRaw != null ? figmaRaw : tjDefault;

			// Guard against writing circular/self-referencing theme vars into theme.json,
			// e.g. custom.font-size.mobile.bodySmall = var(--wp--custom--font-size--mobile--body-small).
			// When Figma did not resolve a value and CSV default is a var() reference,
			// keep the current concrete theme.json value if available.
			if (
				figmaRaw == null &&
				typeof rawTjValue === 'string' &&
				rawTjValue.trim().startsWith('var(')
			) {
				const existingThemeValue = getDeepSettings(themeJson, tjTargetResolved);
				if (existingThemeValue != null && String(existingThemeValue).trim() !== '') {
					rawTjValue = existingThemeValue;
				} else {
					const warning =
						`  ! ${tjTargetResolved} fallback is var() with no concrete existing value - skipping theme.json update`;
					logLines.push(warning);
					if (VERBOSE) {
						console.log(c.yellow(warning));
					}
					skipped++;
					continue;
				}
			}

			if (rawTjValue !== '' && rawTjValue != null) {
				const source = figmaRaw != null ? 'figma' : 'default';
				let tjValue;
				let themeValue = null;

				if (tjType === 'scss-color-match') {
					const fromFigma = figmaRaw != null;
					const hexForMatch =
						fromFigma && String(figmaRaw).trim().length
							? normalizeValue(String(figmaRaw), 'hex')
							: null;
					const closest = hexForMatch != null && hexForMatch.startsWith('#') ? findClosestPaletteSlug(hexForMatch, themeJson) : null;
					const defScss = String(tjDefault).trim();
					const scssResolved = closest != null ? `$color-${closest}` : defScss;
					themeValue = closest != null ? `var(--wp--preset--color--${closest})` : themeVarFromScssColorRef(defScss) ?? scssResolved;
					tjValue = themeValue;
				} else {
					tjValue = normalizeValue(rawTjValue, tjType, { themeJson, defaultVal: tjDefault });
				}

			if (tjTargetResolved.startsWith('typography:')) {
				const presetSlug = tjTargetResolved.slice('typography:'.length);
				csvTypographySlugs.add(presetSlug);
				if (tjType === 'font-family' && figmaRaw != null && String(figmaRaw).trim()) {
					const figmaFontName = String(figmaRaw).trim();
					syncTypographyPresetFromFigmaFont(
						themeJson,
						themeDir,
						presetSlug,
						figmaFontName,
						allFontFilesCache,
					);
					// Mark this font's own slug as handled so the direct Figma registration
					// is dropped from wantedSlugs, preventing a duplicate preset entry.
					csvTypographyHandledFontSlugs.add(slugifyFont(figmaFontName));
				}
					// Font family registration is handled as a side effect of normalizeValue
					// with type 'font-family'. Just record the action.
					changes.themeJson.push({ label, target: tjTargetResolved, value: tjValue, source });
				} else if (tjTargetResolved.startsWith('palette:')) {
					const palSlug = tjTargetResolved.slice('palette:'.length);
					const action = updatePalette(themeJson, palSlug, tjValue, label);
					changes.themeJson.push({ label, target: `palette:${palSlug}`, value: tjValue, source });

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
					setDeepSettings(themeJson, tjTargetResolved, tjValue);
					changes.themeJson.push({ label, target: tjTargetResolved, value: tjValue, source });
				}
			}
		}

		// ── variables.scss side ────────────────────────────────────────────────
		if (scssTarget && scssType) {
			const rawScssValue = figmaRaw != null ? figmaRaw : scssDefault;
			if (rawScssValue === '' || rawScssValue == null) {
				skipped++;
				continue;
			}

			const source = figmaRaw != null ? 'figma' : 'default';
			let value;

			if (scssType === 'scss-color-match') {
				value = resolveScssColorMatchForVariablesScss(
					figmaRaw,
					scssDefault,
					themeJson,
					logLines,
					VERBOSE,
					label,
					scssTarget,
				);
			} else if (scssType === 'theme-json-var-ref') {
				if (tjType === 'font-family' && figmaRaw != null) {
					// Derive the CSS custom property from the actual Figma font name
					value = `var(--wp--preset--font-family--${slugifyFont(String(figmaRaw))})`;
				} else {
					// For non-font refs (sizes, etc.), always use the static var() reference
					value = scssDefault || String(rawScssValue);
				}
			} else {
				value = normalizeValue(rawScssValue, scssType, { themeJson, defaultVal: scssDefault });
			}

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

	// ── Prune stale font presets ───────────────────────────────────────────────
	if (figmaFontSlugs.size > 0) {
		const directFigmaSlugs = [...figmaFontSlugs].filter(
			(s) => !csvTypographyHandledFontSlugs.has(s),
		);
		const wantedSlugs = new Set([...directFigmaSlugs, ...csvTypographySlugs]);
		pruneUnusedFontPresets(themeJson, wantedSlugs);
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
		console.log(c.dim('  Run `npm run build` to rebuild with the updated tokens.'));

		if (missingFonts.length > 0) {
			console.log('');
			console.log(`  ${c.yellow('⚠')}  ${c.bold('Fonts required — add .woff2 files to complete setup:')}`);
			for (const { name, weights, dir } of missingFonts) {
				console.log('');
				console.log(`     ${c.bold(name)}`);
				console.log(c.dim(`       Weights : ${weights.join(', ')}`));
				console.log(c.dim(`       Folder  : ${dir}/`));
			}
			console.log(c.dim('\n     Theme.json and variables.scss are already wired up.'));
			console.log(c.dim('     Re-run `npm run figma-apply` after adding the files to register fontFace entries.\n'));
		} else {
			console.log('');
		}
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
