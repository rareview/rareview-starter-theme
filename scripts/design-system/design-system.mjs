#!/usr/bin/env node

/**
 * Rareview Starter Theme — Design System CLI
 *
 * Interactive CLI to set up and sync design tokens between
 * theme.json and variables.scss.
 *
 * Usage:
 *   npm run design-system                    # Interactive mode
 *   npm run design-system -- --import tokens.json  # Import from JSON
 *   npm run design-system -- --dry-run       # Preview changes
 *
 * @author Rareview <hello@rareview.com>
 */

import { createInterface } from 'node:readline/promises';
import process, { stdin, stdout, argv, exit } from 'node:process';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { select } from '@inquirer/prompts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

// CLI flags
const args = argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const importIndex = args.indexOf('--import');
const IMPORT_FILE = importIndex !== -1 ? args[importIndex + 1] : null;

// ANSI colors
const color = {
	green: (s) => `\x1b[32m${s}\x1b[0m`,
	yellow: (s) => `\x1b[33m${s}\x1b[0m`,
	cyan: (s) => `\x1b[36m${s}\x1b[0m`,
	red: (s) => `\x1b[31m${s}\x1b[0m`,
	bold: (s) => `\x1b[1m${s}\x1b[0m`,
	dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

/**
 * Theme folder slugs referenced in root package.json scripts (setup rewrites these paths).
 * @param {unknown} pkg
 */
function themeSlugsFromPackageScripts(pkg) {
	const slugs = [];
	const seen = new Set();
	const scripts = pkg && typeof pkg === 'object' && pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
	for (const val of Object.values(scripts)) {
		if (typeof val !== 'string') continue;
		for (const m of val.matchAll(/wp-content\/themes\/([a-z0-9-]+)/gi)) {
			const s = m[1];
			if (!seen.has(s)) {
				seen.add(s);
				slugs.push(s);
			}
		}
	}
	return slugs;
}

/**
 * Detect the theme directory. Prefers paths from package.json (kept in sync by npm run setup),
 * then any theme that contains docs/variable-mapping.md, then the first folder with theme.json.
 */
async function findThemeDir() {
	const { readdir } = await import('node:fs/promises');
	const themesDir = resolve(ROOT, 'wp-content', 'themes');

	try {
		const pkg = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf-8'));
		for (const slug of themeSlugsFromPackageScripts(pkg)) {
			const dir = resolve(themesDir, slug);
			try {
				await readFile(resolve(dir, 'theme.json'), 'utf-8');
				return dir;
			} catch {
				// slug from package.json but folder missing — try next
			}
		}
	} catch {
		// package.json missing or invalid
	}

	const entries = await readdir(themesDir, { withFileTypes: true });
	const withMappingDoc = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
		const dir = resolve(themesDir, entry.name);
		try {
			await readFile(resolve(dir, 'theme.json'), 'utf-8');
			await readFile(resolve(dir, 'docs', 'variable-mapping.md'), 'utf-8');
			withMappingDoc.push(dir);
		} catch {
			// skip
		}
	}
	if (withMappingDoc.length === 1) return withMappingDoc[0];
	if (withMappingDoc.length > 1) {
		withMappingDoc.sort();
		return withMappingDoc[0];
	}

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
		try {
			await readFile(resolve(themesDir, entry.name, 'theme.json'), 'utf-8');
			return resolve(themesDir, entry.name);
		} catch {
			// not a valid theme directory
		}
	}

	console.log(color.red('\nError: No theme with theme.json found in wp-content/themes/'));
	exit(1);
}

/**
 * Read and parse theme.json.
 */
async function readThemeJson(themeDir) {
	const path = resolve(themeDir, 'theme.json');
	const raw = await readFile(path, 'utf-8');
	return JSON.parse(raw);
}

/**
 * Read variables.scss.
 */
async function readVariablesScss(themeDir) {
	const path = resolve(themeDir, 'assets', 'css', 'abstracts', 'variables', 'variables.scss');
	return readFile(path, 'utf-8');
}

/**
 * Validate hex color.
 */
function isValidHex(hex) {
	return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex);
}

/**
 * Validate pixel value.
 */
function isValidPx(val) {
	return /^\d+px$/.test(val) || /^\d+$/.test(val);
}

/**
 * Normalize pixel value — ensure it ends with 'px'.
 */
function normalizePx(val) {
	return val.endsWith('px') ? val : `${val}px`;
}

function hexToRgb(hex) {
	if (!hex || typeof hex !== 'string') return null;
	let v = hex.trim().replace('#', '');
	if (v.length === 3) {
		v = v.split('').map((c) => c + c).join('');
	}
	if (!/^[0-9a-fA-F]{6}$/.test(v)) return null;
	return {
		r: Number.parseInt(v.slice(0, 2), 16),
		g: Number.parseInt(v.slice(2, 4), 16),
		b: Number.parseInt(v.slice(4, 6), 16),
	};
}

function colorSwatch(hex) {
	const rgb = hexToRgb(hex);
	if (!rgb) return '[]';
	return `\x1b[48;2;${rgb.r};${rgb.g};${rgb.b}m  \x1b[0m`;
}

/**
 * Build readline prompt: "Label (default value): " — no ANSI (readline-safe).
 * Strips a trailing ":" from `question` so callers can keep "Foo:" style labels.
 */
function formatAskPrompt(question, defaultValue) {
	const raw = String(question);
	const label = raw.endsWith(':') ? raw.slice(0, -1).trimEnd() : raw.trimEnd();
	return `  ${label} (default ${String(defaultValue)}): `;
}

/**
 * Prompt user for input with default value and optional validation.
 */
async function ask(rl, question, defaultValue, validator = null) {
	while (true) {
		const answer = await rl.question(formatAskPrompt(question, defaultValue));
		const value = answer.trim() || defaultValue;

		if (validator && !validator(value)) {
			console.log(color.red('    Invalid value. Please try again.'));
			continue;
		}

		return value;
	}
}

/**
 * Single-line hex prompt used for compact color update UX.
 * Enter keeps the current value.
 */
async function askHexInline(rl, label, currentHex) {
	while (true) {
		const answer = await rl.question(`  ${label} `);
		const value = answer.trim();
		if (!value) return currentHex;
		if (isValidHex(value)) return value;
		console.log(color.red('    Invalid hex. Use #RGB or #RRGGBB.'));
	}
}

/**
 * Prompt user to choose from a list.
 * Uses arrow-key selection in TTY terminals, numeric fallback otherwise.
 */
async function askChoice(rl, question, options, defaultIndex = 0) {
	if (stdin.isTTY) {
		const normalizedDefault = Math.min(Math.max(defaultIndex, 0), Math.max(options.length - 1, 0));
		rl.pause();
		try {
			const selected = await select({
				message: `  ${question}`,
				choices: options.map((name, idx) => ({ name, value: idx })),
				default: normalizedDefault,
				pageSize: 12,
			});
			return selected;
		} finally {
			rl.resume();
		}
	}

	while (true) {
		for (let i = 0; i < options.length; i += 1) {
			console.log(color.dim(`    ${i + 1}. ${options[i]}`));
		}
		const answer = await rl.question(`  ${question} ${color.dim(`(${defaultIndex + 1})`)} `);
		const raw = answer.trim();
		if (!raw) return defaultIndex;
		const idx = Number(raw) - 1;
		if (Number.isInteger(idx) && idx >= 0 && idx < options.length) {
			return idx;
		}
		console.log(color.red('    Invalid selection. Enter a number from the list.'));
	}
}

/**
 * Create a slug from a color name.
 */
function slugify(name) {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.trim()
		.replace(/\s+/g, '-');
}

function titleFromSlug(slug) {
	return String(slug)
		.split('-')
		.filter(Boolean)
		.map((s) => s.charAt(0).toUpperCase() + s.slice(1))
		.join(' ');
}

function parseFontMetaFromFilename(fileName) {
	const base = fileName.replace(/\.[^.]+$/, '').toLowerCase();
	const isItalic = /italic|oblique/.test(base);
	const style = isItalic ? 'italic' : 'normal';
	if (/thin|hairline/.test(base)) return { weight: '100', style };
	if (/extralight|ultralight/.test(base)) return { weight: '200', style };
	if (/light/.test(base)) return { weight: '300', style };
	if (/regular|book|normal/.test(base)) return { weight: '400', style };
	if (/medium/.test(base)) return { weight: '500', style };
	if (/semibold|demibold/.test(base)) return { weight: '600', style };
	if (/extrabold|ultrabold/.test(base)) return { weight: '800', style };
	if (/black|heavy/.test(base)) return { weight: '900', style };
	if (/bold/.test(base)) return { weight: '700', style };
	return { weight: '400', style };
}

async function scanAvailableFonts(themeDir) {
	const fontsRoot = resolve(themeDir, 'assets', 'fonts');
	let entries = [];
	try {
		entries = await readdir(fontsRoot, { withFileTypes: true });
	} catch {
		return [];
	}

	const out = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const slug = entry.name;
		const dir = resolve(fontsRoot, slug);
		let files = [];
		try {
			files = await readdir(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		const fontFiles = files
			.filter((f) => f.isFile() && /\.(woff2|woff|ttf|otf)$/i.test(f.name))
			.map((f) => f.name)
			.sort((a, b) => a.localeCompare(b));
		if (fontFiles.length === 0) continue;
		const name = titleFromSlug(slug);
		const faces = fontFiles.map((fileName) => {
			const meta = parseFontMetaFromFilename(fileName);
			return {
				fontFamily: name,
				fontWeight: meta.weight,
				fontStyle: meta.style,
				src: [`file:./assets/fonts/${slug}/${fileName}`],
			};
		});
		out.push({
			name,
			slug,
			fontFamily: `${name}, sans-serif`,
			fontFace: faces,
		});
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get current values from theme.json for defaults.
 */
function getCurrentDefaults(themeJson) {
	const palette = themeJson.settings?.color?.palette || [];
	const custom = themeJson.settings?.custom || {};
	const typography = custom.typography || {};
	const layout = custom.layout || {};
	const fontSize = custom['font-size'] || {};
	const mobile = fontSize.mobile || {};
	const desktop = fontSize.desktop || {};

	// Build a color map from palette
	const colors = {};
	for (const c of palette) {
		colors[c.slug] = c.color;
	}

	return {
		colors,
		palette,
		fontFamily: typography.fontFamily || 'Inter, sans-serif',
		fontFamilySecondary: typography.fontFamilySecondary || 'Georgia, serif',
		contentSize: layout.contentSize || '1420px',
		fontSize: { mobile, desktop },
	};
}

/**
 * Get current values from variables.scss for defaults.
 */
function getScssDefaults(scssContent) {
	const extract = (pattern) => {
		const match = scssContent.match(pattern);
		return match ? match[1] : null;
	};

	return {
		containerPadding: extract(/\$container-padding-sides:\s*([^;]+);/) || '1.2rem',
		transition: extract(/\$transition-default:\s*([^;]+);/) || '0.2s ease-out',
		inputFieldHeight: extract(/\$input-field-height:\s*([^;]+);/) || '3.2rem',
		inputFieldBorderRadius: extract(/\$input-field-border-radius:\s*([^;]+);/) || '999px',
		inputFieldBorderWidth: extract(/\$input-field-border-width:\s*([^;]+);/) || '1px',
		buttonPrimaryBackgroundColor: extract(/\$button-primary-background-color:\s*([^;]+);/) || '$color-primary',
		buttonPrimaryFontColor: extract(/\$button-primary-font-color:\s*([^;]+);/) || '$color-dark',
		buttonPrimaryBorderRadius: extract(/\$button-primary-border-radius:\s*([^;]+);/) || '999rem',
		buttonPrimaryPaddingX: extract(/\$button-primary-padding-x:\s*([^;]+);/) || '1.5rem',
		buttonPrimaryPaddingY: extract(/\$button-primary-padding-y:\s*([^;]+);/) || '0.5rem',
		buttonPrimaryFontSize: extract(/\$button-primary-font-size:\s*([^;]+);/) || '1.125rem',
		buttonPrimaryFontWeight: extract(/\$button-primary-font-weight:\s*([^;]+);/) || '700',
		buttonPrimaryLetterSpacing: extract(/\$button-primary-letter-spacing:\s*([^;]+);/) || '0.05em',
		buttonPrimaryTextTransform: extract(/\$button-primary-text-transform:\s*([^;]+);/) || 'uppercase',
		buttonPrimaryHeight: extract(/\$button-primary-height:\s*([^;]+);/) || '3.2rem',
		buttonPrimaryBorderWidth: extract(/\$button-primary-border-width:\s*([^;]+);/) || '2px',
		buttonSecondaryBackgroundColor: extract(/\$button-secondary-background-color:\s*([^;]+);/) || '$color-secondary',
		buttonSecondaryFontColor: extract(/\$button-secondary-font-color:\s*([^;]+);/) || '$color-dark',
		buttonSecondaryBorderRadius: extract(/\$button-secondary-border-radius:\s*([^;]+);/) || '999rem',
		buttonSecondaryPaddingX: extract(/\$button-secondary-padding-x:\s*([^;]+);/) || '1.5rem',
		buttonSecondaryPaddingY: extract(/\$button-secondary-padding-y:\s*([^;]+);/) || '0.5rem',
		buttonSecondaryFontSize: extract(/\$button-secondary-font-size:\s*([^;]+);/) || '1.125rem',
		buttonSecondaryFontWeight: extract(/\$button-secondary-font-weight:\s*([^;]+);/) || '700',
		buttonSecondaryLetterSpacing: extract(/\$button-secondary-letter-spacing:\s*([^;]+);/) || '0.05em',
		buttonSecondaryTextTransform: extract(/\$button-secondary-text-transform:\s*([^;]+);/) || 'uppercase',
		buttonSecondaryHeight: extract(/\$button-secondary-height:\s*([^;]+);/) || '3.2rem',
		buttonSecondaryBorderWidth: extract(/\$button-secondary-border-width:\s*([^;]+);/) || '2px',
		breakpointMobile: extract(/\$breakpoint-mobile:\s*([^;]+);/) || '500px',
		breakpointTablet: extract(/\$breakpoint-tablet:\s*([^;]+);/) || '781px',
		breakpointDesktop: extract(/\$breakpoint-desktop:\s*([^;]+);/) || '1024px',
		breakpointDesktopLarge: extract(/\$breakpoint-desktop-large:\s*([^;]+);/) || '1440px',
		breakpointDesktopXLarge: extract(/\$breakpoint-desktop-x-large:\s*([^;]+);/) || '1600px',
		breakpointDesktopXXLarge: extract(/\$breakpoint-desktop-xx-large:\s*([^;]+);/) || '1920px',
		// Detect semantic color mappings
		colorPrimary: extract(/\$color-primary:\s*\$color-([^;]+);/) || 'brand-1',
		colorSecondary: extract(/\$color-secondary:\s*\$color-([^;]+);/) || 'brand-2',
		colorLink: extract(/\$link-color:\s*\$color-([^;]+);/) || 'brand-1',
		colorBackground: extract(/\$color-background:\s*\$color-([^;]+);/) || 'black',
		colorBody: extract(/\$color-body:\s*\$color-([^;]+);/) || 'white',
	};
}

/** Neutral palette slugs (mono) used when listing choices for semantic color mapping */
const MONO_COLOR_SLUGS = new Set(['black', 'dark', 'dark-grey', 'grey', 'grey-light', 'white']);

function printPaletteSlugGroupsForSemantics(paletteEntries) {
	const slugs = paletteEntries.map((c) => c.slug);
	const mono = slugs.filter((s) => MONO_COLOR_SLUGS.has(s));
	const chroma = slugs.filter((s) => !MONO_COLOR_SLUGS.has(s));
	if (mono.length) {
		console.log(color.dim(`    Mono: ${mono.join(', ')}`));
	}
	if (chroma.length) {
		console.log(color.dim(`    Chromatic: ${chroma.join(', ')}`));
	}
	if (!mono.length && !chroma.length) {
		console.log(color.dim(`    Slugs: ${slugs.join(', ')}`));
	}
}

/**
 * Interactive mode — prompt for all design tokens.
 */
async function interactiveMode(rl, themeJson, scssContent, availableFonts = []) {
	const defaults = getCurrentDefaults(themeJson);
	const scssDefaults = getScssDefaults(scssContent);

	const tokens = {
		colors: { palette: [], semantics: {} },
		typography: {},
		fontSize: { mobile: {}, desktop: {} },
		layout: {},
		components: {},
		breakpoints: {},
	};

	// ── Colors ──────────────────────────────────────────
	console.log(color.bold('\n  Colors\n'));
	console.log(color.dim('  Define your color palette. These become available in the block editor.\n'));

	// Required semantic colors
	const semanticColors = [
		{ key: 'primary', label: 'Primary color', defaultSlug: scssDefaults.colorPrimary },
		{ key: 'secondary', label: 'Secondary color', defaultSlug: scssDefaults.colorSecondary },
		{ key: 'link', label: 'Link color', defaultSlug: scssDefaults.colorLink },
		{ key: 'background', label: 'Background color', defaultSlug: scssDefaults.colorBackground },
		{ key: 'body', label: 'Body text color', defaultSlug: scssDefaults.colorBody },
	];

	// Start with existing palette or build new
	const startFresh = defaults.palette.length === 0;
	const paletteEntries = [];
	const SKIP_EDIT_MONO_SLUGS = new Set(['black', 'white']);
	const monoEntries = defaults.palette.filter((c) => MONO_COLOR_SLUGS.has(c.slug));
	const chromaEntries = defaults.palette.filter((c) => !MONO_COLOR_SLUGS.has(c.slug));

	if (!startFresh) {
		const keepExisting = await rl.question(`  ${color.bold('Set the colors, or keep defaults?')} (Y/n) `);

		if (keepExisting.toLowerCase() !== 'n') {
			// Let user update existing palette colors in groups
			console.log(color.dim('\n  Mono colors (Enter to keep unchanged):\n'));
			for (const c of monoEntries) {
				if (SKIP_EDIT_MONO_SLUGS.has(c.slug)) {
					paletteEntries.push({ name: c.name, slug: c.slug, color: c.color });
					continue;
				}
				const newColor = await askHexInline(
					rl,
					`Updating ${c.name} (default ${c.color} ${colorSwatch(c.color)}):`,
					c.color,
				);
				paletteEntries.push({ name: c.name, slug: c.slug, color: newColor });
			}

			console.log(color.dim('\n  Colorful colors:\n'));
			for (const c of chromaEntries) {
				const newColor = await askHexInline(
					rl,
					`Updating ${c.name} (default ${c.color} ${colorSwatch(c.color)}):`,
					c.color,
				);
				paletteEntries.push({ name: c.name, slug: c.slug, color: newColor });
			}
		} else {
			// Build from scratch
			console.log(color.dim('\n  Mono colors (excluding black and white). Leave name empty when done.\n'));
			let addingMono = true;
			while (addingMono) {
				const name = await rl.question('  Mono color name (empty to stop): ');
				if (!name.trim()) {
					addingMono = false;
					continue;
				}
				const hex = await ask(rl, `  ${name} hex:`, '#808080', isValidHex);
				const slug = slugify(name);
				paletteEntries.push({ name: name.trim(), slug, color: hex });
				console.log(color.dim(`    Added: ${hex} ${colorSwatch(hex)}`));
			}

			console.log(color.dim('\n  Colorful colors. Leave name empty when done.\n'));
			let addingColorful = true;
			while (addingColorful) {
				const name = await rl.question('  Colorful color name (empty to stop): ');
				if (!name.trim()) {
					addingColorful = false;
					continue;
				}
				const hex = await ask(rl, `  ${name} hex:`, '#000000', isValidHex);
				const slug = slugify(name);
				paletteEntries.push({ name: name.trim(), slug, color: hex });
				console.log(color.dim(`    Added: ${hex} ${colorSwatch(hex)}`));
			}
		}
	} else {
		console.log(color.dim('  Mono colors (excluding black and white). Leave name empty when done.\n'));
		let addingMono = true;
		while (addingMono) {
			const name = await rl.question('  Mono color name (empty to stop): ');
			if (!name.trim()) {
				addingMono = false;
				continue;
			}
			const hex = await ask(rl, `  ${name} hex:`, '#808080', isValidHex);
			const slug = slugify(name);
			paletteEntries.push({ name: name.trim(), slug, color: hex });
			console.log(color.dim(`    Added: ${hex} ${colorSwatch(hex)}`));
		}

		console.log(color.dim('\n  Colorful colors. Leave name empty when done.\n'));
		let addingColorful = true;
		while (addingColorful) {
			const name = await rl.question('  Colorful color name (empty to stop): ');
			if (!name.trim()) {
				addingColorful = false;
				continue;
			}
			const hex = await ask(rl, `  ${name} hex:`, '#000000', isValidHex);
			const slug = slugify(name);
			paletteEntries.push({ name: name.trim(), slug, color: hex });
			console.log(color.dim(`    Added: ${hex} ${colorSwatch(hex)}`));
		}
	}

	tokens.colors.palette = paletteEntries;

	// Map role colors to palette slugs
	if (paletteEntries.length > 0) {
		console.log(color.bold('\n  Theme Role Colors\n'));
		console.log(
			color.dim(
				'  Select a color for each role from the palette (mono + colorful).\n',
			),
		);
		printPaletteSlugGroupsForSemantics(paletteEntries);
		console.log('');

		const sourcePalette = paletteEntries;
		const slugs = sourcePalette.map((c) => c.slug);

		for (const sem of semanticColors) {
			const defaultSlug = slugs.includes(sem.defaultSlug) ? sem.defaultSlug : slugs[0];
			const defaultIndexInPalette = Math.max(0, slugs.indexOf(defaultSlug));
			const defaultColor = sourcePalette[defaultIndexInPalette]?.color || '';
			const roleOptions = [
				`Keep default (${defaultSlug}) ${defaultColor} ${colorSwatch(defaultColor)}`,
				...sourcePalette.map((c) => `${c.name} (${c.slug}) ${c.color} ${colorSwatch(c.color)}`),
			];
			const selectedIndex = await askChoice(rl, `${sem.label}:`, roleOptions, 0);
			tokens.colors.semantics[sem.key] = selectedIndex === 0 ? defaultSlug : slugs[selectedIndex - 1];
			console.log(color.dim(`    Selected slug: ${tokens.colors.semantics[sem.key]}\n`));
		}
	}

	// ── Typography ──────────────────────────────────────
	console.log(color.bold('\n  Typography\n'));
	console.log(color.dim('  Enter to keep unchanged.\n'));

	if (availableFonts.length > 0) {
		console.log(color.dim('  Available fonts detected in assets/fonts:\n'));
		const opts = availableFonts.map((f) => `${f.name} (${f.slug})`);
		for (const item of opts) console.log(color.dim(`    - ${item}`));
		console.log('');
		const primaryChoices = ['Keep current', ...opts, 'Manual entry'];
		const secondaryChoices = ['Keep current', ...opts, 'Manual entry'];
		const primaryChoice = await askChoice(rl, 'Primary font:', primaryChoices, 0);
		if (primaryChoice === 0) {
			tokens.typography.fontFamily = defaults.fontFamily;
		} else if (primaryChoice === primaryChoices.length - 1) {
			tokens.typography.fontFamily = await ask(rl, 'Primary font family:', defaults.fontFamily);
		} else {
			const picked = availableFonts[primaryChoice - 1];
			tokens.typography.fontFamily = picked.fontFamily;
			tokens.typography.primarySlug = picked.slug;
			tokens.typography.primaryFont = picked;
		}

		const secondaryChoice = await askChoice(rl, 'Secondary font:', secondaryChoices, 0);
		if (secondaryChoice === 0) {
			tokens.typography.fontFamilySecondary = defaults.fontFamilySecondary;
		} else if (secondaryChoice === secondaryChoices.length - 1) {
			tokens.typography.fontFamilySecondary = await ask(
				rl,
				'Secondary font family:',
				defaults.fontFamilySecondary
			);
		} else {
			const picked = availableFonts[secondaryChoice - 1];
			tokens.typography.fontFamilySecondary = picked.fontFamily;
			tokens.typography.secondarySlug = picked.slug;
			tokens.typography.secondaryFont = picked;
		}
	} else {
		tokens.typography.fontFamily = await ask(rl, 'Primary font family:', defaults.fontFamily);
		tokens.typography.fontFamilySecondary = await ask(
			rl,
			'Secondary font family:',
			defaults.fontFamilySecondary
		);
	}

	// Font sizes
	console.log(color.bold('\n  Font Sizes (px)'));
	console.log(color.dim('  Heading and body sizes for mobile and desktop.'));

	const headings = ['heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6'];
	const bodySizes = ['bodySmall', 'bodyMedium', 'bodyLarge'];
	const friendlyNames = {
		heading1: 'H1',
		heading2: 'H2',
		heading3: 'H3',
		heading4: 'H4',
		heading5: 'H5',
		heading6: 'H6',
		bodySmall: 'Body Small',
		bodyMedium: 'Body Medium',
		bodyLarge: 'Body Large',
	};

	console.log(color.dim('  Headings desktop (Enter to keep unchanged):'));
	for (const h of headings) {
		const dDefault = defaults.fontSize.desktop[h] || '16px';
		const desk = await ask(rl, `${friendlyNames[h]} desktop:`, dDefault, isValidPx);
		tokens.fontSize.desktop[h] = normalizePx(desk);
	}

	console.log(color.dim('\n  Headings mobile (Enter to keep unchanged):'));
	for (const h of headings) {
		const mDefault = defaults.fontSize.mobile[h] || '16px';
		const mob = await ask(rl, `${friendlyNames[h]} mobile:`, mDefault, isValidPx);
		tokens.fontSize.mobile[h] = normalizePx(mob);
	}

	console.log(color.dim('\n  Body sizes desktop (Enter to keep unchanged):'));
	for (const b of bodySizes) {
		const dDefault = defaults.fontSize.desktop[b] || '18px';
		const desk = await ask(rl, `${friendlyNames[b]} desktop:`, dDefault, isValidPx);
		tokens.fontSize.desktop[b] = normalizePx(desk);
	}

	console.log(color.dim('\n  Body sizes mobile (Enter to keep unchanged):'));
	for (const b of bodySizes) {
		const mDefault = defaults.fontSize.mobile[b] || '14px';
		const mob = await ask(rl, `${friendlyNames[b]} mobile:`, mDefault, isValidPx);
		tokens.fontSize.mobile[b] = normalizePx(mob);
	}

	// ── Layout & Spacing ────────────────────────────────
	console.log(color.bold('\n  Layout & Spacing'));
	console.log(color.dim('  Enter to keep unchanged.'));

	tokens.layout.contentSize = await ask(rl, 'Content max width (px):', defaults.contentSize, isValidPx);
	tokens.layout.contentSize = normalizePx(tokens.layout.contentSize);
	tokens.layout.containerPadding = await ask(
		rl,
		'Container side padding (rem):',
		scssDefaults.containerPadding
	);

	// ── Buttons & Inputs ────────────────────────────────
	console.log(color.bold('\n  Buttons & Inputs'));
	console.log(color.dim('  Enter to keep unchanged.'));

	console.log(color.dim('  Button - Primary:'));
	tokens.components.buttonPrimaryBackgroundColor = await ask(rl, 'Button primary background color:', scssDefaults.buttonPrimaryBackgroundColor);
	tokens.components.buttonPrimaryFontColor = await ask(rl, 'Button primary font color:', scssDefaults.buttonPrimaryFontColor);
	tokens.components.buttonPrimaryBorderRadius = await ask(rl, 'Button primary border radius:', scssDefaults.buttonPrimaryBorderRadius);
	tokens.components.buttonPrimaryPaddingX = await ask(rl, 'Button primary padding X:', scssDefaults.buttonPrimaryPaddingX);
	tokens.components.buttonPrimaryPaddingY = await ask(rl, 'Button primary padding Y:', scssDefaults.buttonPrimaryPaddingY);
	tokens.components.buttonPrimaryFontSize = await ask(rl, 'Button primary font size:', scssDefaults.buttonPrimaryFontSize);
	tokens.components.buttonPrimaryFontWeight = await ask(rl, 'Button primary font weight:', scssDefaults.buttonPrimaryFontWeight);
	tokens.components.buttonPrimaryLetterSpacing = await ask(rl, 'Button primary letter spacing:', scssDefaults.buttonPrimaryLetterSpacing);
	tokens.components.buttonPrimaryTextTransform = await ask(rl, 'Button primary text transform:', scssDefaults.buttonPrimaryTextTransform);
	tokens.components.buttonPrimaryHeight = await ask(rl, 'Button primary height:', scssDefaults.buttonPrimaryHeight);
	tokens.components.buttonPrimaryBorderWidth = await ask(rl, 'Button primary border width:', scssDefaults.buttonPrimaryBorderWidth);

	console.log(color.dim('\n  Button - Secondary:'));
	tokens.components.buttonSecondaryBackgroundColor = await ask(rl, 'Button secondary background color:', scssDefaults.buttonSecondaryBackgroundColor);
	tokens.components.buttonSecondaryFontColor = await ask(rl, 'Button secondary font color:', scssDefaults.buttonSecondaryFontColor);
	tokens.components.buttonSecondaryBorderRadius = await ask(rl, 'Button secondary border radius:', scssDefaults.buttonSecondaryBorderRadius);
	tokens.components.buttonSecondaryPaddingX = await ask(rl, 'Button secondary padding X:', scssDefaults.buttonSecondaryPaddingX);
	tokens.components.buttonSecondaryPaddingY = await ask(rl, 'Button secondary padding Y:', scssDefaults.buttonSecondaryPaddingY);
	tokens.components.buttonSecondaryFontSize = await ask(rl, 'Button secondary font size:', scssDefaults.buttonSecondaryFontSize);
	tokens.components.buttonSecondaryFontWeight = await ask(rl, 'Button secondary font weight:', scssDefaults.buttonSecondaryFontWeight);
	tokens.components.buttonSecondaryLetterSpacing = await ask(rl, 'Button secondary letter spacing:', scssDefaults.buttonSecondaryLetterSpacing);
	tokens.components.buttonSecondaryTextTransform = await ask(rl, 'Button secondary text transform:', scssDefaults.buttonSecondaryTextTransform);
	tokens.components.buttonSecondaryHeight = await ask(rl, 'Button secondary height:', scssDefaults.buttonSecondaryHeight);
	tokens.components.buttonSecondaryBorderWidth = await ask(rl, 'Button secondary border width:', scssDefaults.buttonSecondaryBorderWidth);

	console.log(color.dim('\n  Input fields:'));
	tokens.components.inputFieldHeight = await ask(rl, 'Input field height:', scssDefaults.inputFieldHeight);
	tokens.components.inputFieldBorderRadius = await ask(rl, 'Input field border radius:', scssDefaults.inputFieldBorderRadius);
	tokens.components.inputFieldBorderWidth = await ask(rl, 'Input field border width:', scssDefaults.inputFieldBorderWidth);

	// Keep existing breakpoint values (not prompted in interactive mode)
	tokens.breakpoints.mobile = scssDefaults.breakpointMobile;
	tokens.breakpoints.tablet = scssDefaults.breakpointTablet;
	tokens.breakpoints.desktop = scssDefaults.breakpointDesktop;
	tokens.breakpoints.desktopLarge = scssDefaults.breakpointDesktopLarge;
	tokens.breakpoints.desktopXLarge = scssDefaults.breakpointDesktopXLarge;
	tokens.breakpoints.desktopXXLarge = scssDefaults.breakpointDesktopXXLarge;

	return tokens;
}

/**
 * Import mode — read tokens from a JSON file.
 *
 * Supports multiple formats:
 *   1. Our native format (same structure as interactiveMode output)
 *   2. 10up Figma-to-WordPress exporter format
 *   3. Simple flat format
 */
async function importMode(filePath, themeJson, scssContent) {
	const raw = await readFile(resolve(filePath), 'utf-8');
	const imported = JSON.parse(raw);
	const defaults = getCurrentDefaults(themeJson);
	const scssDefaults = getScssDefaults(scssContent);

	const tokens = {
		colors: { palette: [], semantics: {} },
		typography: {},
		fontSize: { mobile: {}, desktop: {} },
		layout: {},
		components: {},
		breakpoints: {},
	};

	// ── Colors ──
	if (imported.colors) {
		if (Array.isArray(imported.colors)) {
			// Array format: [{ name, slug, color }]
			tokens.colors.palette = imported.colors;
		} else if (typeof imported.colors === 'object') {
			// Object format: { primary: { name, slug, color } } or { primary: "#hex" }
			for (const [key, val] of Object.entries(imported.colors)) {
				if (typeof val === 'string') {
					tokens.colors.palette.push({ name: key, slug: slugify(key), color: val });
				} else if (val && typeof val === 'object') {
					tokens.colors.palette.push({
						name: val.name || key,
						slug: val.slug || slugify(val.name || key),
						color: val.color || val.value || '#000000',
					});
				}
			}
		}
	} else {
		// Keep existing palette
		tokens.colors.palette = defaults.palette;
	}

	// Semantic mappings
	if (imported.semantics) {
		tokens.colors.semantics = imported.semantics;
	} else {
		// Try to auto-detect from color names
		const slugs = tokens.colors.palette.map((c) => c.slug);
		tokens.colors.semantics = {
			primary: slugs.includes(scssDefaults.colorPrimary)
				? scssDefaults.colorPrimary
				: slugs[0] || 'black',
			secondary: slugs.includes(scssDefaults.colorSecondary)
				? scssDefaults.colorSecondary
				: slugs[1] || slugs[0] || 'black',
			link: slugs.includes(scssDefaults.colorLink)
				? scssDefaults.colorLink
				: slugs[2] || slugs[0] || 'black',
			background: slugs.includes(scssDefaults.colorBackground)
				? scssDefaults.colorBackground
				: slugs[0] || 'black',
			body: slugs.includes(scssDefaults.colorBody) ? scssDefaults.colorBody : slugs[0] || 'white',
		};
	}

	// ── Typography ──
	if (imported.typography) {
		tokens.typography.fontFamily =
			imported.typography.fontFamily || defaults.fontFamily;
		tokens.typography.fontFamilySecondary =
			imported.typography.fontFamilySecondary ||
			imported.typography.secondaryFontFamily ||
			defaults.fontFamilySecondary;
	} else {
		tokens.typography.fontFamily = defaults.fontFamily;
		tokens.typography.fontFamilySecondary = defaults.fontFamilySecondary;
	}

	// ── Font Sizes ──
	if (imported.fontSize) {
		tokens.fontSize = imported.fontSize;
	} else if (imported.typography?.fontSize) {
		tokens.fontSize = imported.typography.fontSize;
	} else {
		tokens.fontSize = defaults.fontSize;
	}

	// Normalize all font size values
	for (const bp of ['mobile', 'desktop']) {
		if (tokens.fontSize[bp]) {
			for (const [key, val] of Object.entries(tokens.fontSize[bp])) {
				tokens.fontSize[bp][key] = normalizePx(String(val).replace('px', ''));
			}
		}
	}

	// ── Layout ──
	tokens.layout.contentSize = imported.layout?.contentSize || defaults.contentSize;
	tokens.layout.containerPadding =
		imported.layout?.containerPadding || scssDefaults.containerPadding;

	tokens.components = {
		buttonPrimaryBackgroundColor: imported.components?.buttonPrimaryBackgroundColor || scssDefaults.buttonPrimaryBackgroundColor,
		buttonPrimaryFontColor: imported.components?.buttonPrimaryFontColor || scssDefaults.buttonPrimaryFontColor,
		buttonPrimaryBorderRadius: imported.components?.buttonPrimaryBorderRadius || scssDefaults.buttonPrimaryBorderRadius,
		buttonPrimaryPaddingX: imported.components?.buttonPrimaryPaddingX || scssDefaults.buttonPrimaryPaddingX,
		buttonPrimaryPaddingY: imported.components?.buttonPrimaryPaddingY || scssDefaults.buttonPrimaryPaddingY,
		buttonPrimaryFontSize: imported.components?.buttonPrimaryFontSize || scssDefaults.buttonPrimaryFontSize,
		buttonPrimaryFontWeight: imported.components?.buttonPrimaryFontWeight || scssDefaults.buttonPrimaryFontWeight,
		buttonPrimaryLetterSpacing: imported.components?.buttonPrimaryLetterSpacing || scssDefaults.buttonPrimaryLetterSpacing,
		buttonPrimaryTextTransform: imported.components?.buttonPrimaryTextTransform || scssDefaults.buttonPrimaryTextTransform,
		buttonPrimaryHeight: imported.components?.buttonPrimaryHeight || scssDefaults.buttonPrimaryHeight,
		buttonPrimaryBorderWidth: imported.components?.buttonPrimaryBorderWidth || scssDefaults.buttonPrimaryBorderWidth,
		buttonSecondaryBackgroundColor: imported.components?.buttonSecondaryBackgroundColor || scssDefaults.buttonSecondaryBackgroundColor,
		buttonSecondaryFontColor: imported.components?.buttonSecondaryFontColor || scssDefaults.buttonSecondaryFontColor,
		buttonSecondaryBorderRadius: imported.components?.buttonSecondaryBorderRadius || scssDefaults.buttonSecondaryBorderRadius,
		buttonSecondaryPaddingX: imported.components?.buttonSecondaryPaddingX || scssDefaults.buttonSecondaryPaddingX,
		buttonSecondaryPaddingY: imported.components?.buttonSecondaryPaddingY || scssDefaults.buttonSecondaryPaddingY,
		buttonSecondaryFontSize: imported.components?.buttonSecondaryFontSize || scssDefaults.buttonSecondaryFontSize,
		buttonSecondaryFontWeight: imported.components?.buttonSecondaryFontWeight || scssDefaults.buttonSecondaryFontWeight,
		buttonSecondaryLetterSpacing: imported.components?.buttonSecondaryLetterSpacing || scssDefaults.buttonSecondaryLetterSpacing,
		buttonSecondaryTextTransform: imported.components?.buttonSecondaryTextTransform || scssDefaults.buttonSecondaryTextTransform,
		buttonSecondaryHeight: imported.components?.buttonSecondaryHeight || scssDefaults.buttonSecondaryHeight,
		buttonSecondaryBorderWidth: imported.components?.buttonSecondaryBorderWidth || scssDefaults.buttonSecondaryBorderWidth,
		inputFieldHeight: imported.components?.inputFieldHeight || scssDefaults.inputFieldHeight,
		inputFieldBorderRadius: imported.components?.inputFieldBorderRadius || scssDefaults.inputFieldBorderRadius,
		inputFieldBorderWidth: imported.components?.inputFieldBorderWidth || scssDefaults.inputFieldBorderWidth,
	};

	// ── Breakpoints ──
	if (imported.breakpoints) {
		tokens.breakpoints = {
			mobile: normalizePx(String(imported.breakpoints.mobile || scssDefaults.breakpointMobile).replace('px', '')),
			tablet: normalizePx(String(imported.breakpoints.tablet || scssDefaults.breakpointTablet).replace('px', '')),
			desktop: normalizePx(String(imported.breakpoints.desktop || scssDefaults.breakpointDesktop).replace('px', '')),
			desktopLarge: normalizePx(String(imported.breakpoints.desktopLarge || scssDefaults.breakpointDesktopLarge).replace('px', '')),
			desktopXLarge: normalizePx(String(imported.breakpoints.desktopXLarge || scssDefaults.breakpointDesktopXLarge).replace('px', '')),
			desktopXXLarge: normalizePx(String(imported.breakpoints.desktopXXLarge || scssDefaults.breakpointDesktopXXLarge).replace('px', '')),
		};
	} else {
		tokens.breakpoints = {
			mobile: scssDefaults.breakpointMobile,
			tablet: scssDefaults.breakpointTablet,
			desktop: scssDefaults.breakpointDesktop,
			desktopLarge: scssDefaults.breakpointDesktopLarge,
			desktopXLarge: scssDefaults.breakpointDesktopXLarge,
			desktopXXLarge: scssDefaults.breakpointDesktopXXLarge,
		};
	}

	return tokens;
}

/**
 * Apply tokens to theme.json.
 */
function applyToThemeJson(themeJson, tokens) {
	const updated = JSON.parse(JSON.stringify(themeJson));
	updated.settings = updated.settings || {};
	updated.settings.color = updated.settings.color || {};
	updated.settings.custom = updated.settings.custom || {};
	updated.settings.custom.typography = updated.settings.custom.typography || {};
	updated.settings.custom.layout = updated.settings.custom.layout || {};
	updated.settings.custom['font-size'] = updated.settings.custom['font-size'] || {};
	updated.settings.typography = updated.settings.typography || {};
	updated.settings.typography.fontFamilies = updated.settings.typography.fontFamilies || [];

	// Update color palette
	if (tokens.colors.palette.length > 0) {
		updated.settings.color.palette = tokens.colors.palette.map((c) => ({
			name: c.name,
			slug: c.slug,
			color: c.color,
		}));
	}

	// Update typography
	if (tokens.typography.fontFamily) {
		updated.settings.custom.typography.fontFamily = tokens.typography.fontFamily;
	}
	if (tokens.typography.fontFamilySecondary) {
		updated.settings.custom.typography.fontFamilySecondary = tokens.typography.fontFamilySecondary;
	}

	const ensureFontFamily = (font) => {
		if (!font || !font.slug || !font.name || !font.fontFamily) return;
		const existing = updated.settings.typography.fontFamilies.find((f) => f.slug === font.slug);
		const payload = {
			name: font.name,
			slug: font.slug,
			fontFamily: font.fontFamily,
		};
		if (Array.isArray(font.fontFace) && font.fontFace.length > 0) {
			payload.fontFace = font.fontFace;
		}
		if (existing) {
			Object.assign(existing, payload);
		} else {
			updated.settings.typography.fontFamilies.push(payload);
		}
	};
	ensureFontFamily(tokens.typography.primaryFont);
	ensureFontFamily(tokens.typography.secondaryFont);

	// Update font sizes
	if (tokens.fontSize.mobile && Object.keys(tokens.fontSize.mobile).length > 0) {
		updated.settings.custom['font-size'].mobile = tokens.fontSize.mobile;
	}
	if (tokens.fontSize.desktop && Object.keys(tokens.fontSize.desktop).length > 0) {
		updated.settings.custom['font-size'].desktop = tokens.fontSize.desktop;
	}

	// Update layout
	if (tokens.layout.contentSize) {
		updated.settings.custom.layout.contentSize = tokens.layout.contentSize;
	}

	return updated;
}

/**
 * Apply tokens to variables.scss.
 * Only updates specific values, preserving the rest of the file.
 */
function applyToVariablesScss(scssContent, tokens) {
	let updated = scssContent;

	// Helper to replace a SCSS variable value
	const replaceVar = (varName, newValue) => {
		const regex = new RegExp(`(\\$${varName}:\\s*)([^;]+)(;)`, 'g');
		updated = updated.replace(regex, `$1${newValue}$3`);
	};

	// Layout & spacing
	if (tokens.layout.containerPadding) {
		replaceVar('container-padding-sides', tokens.layout.containerPadding);
	}

	// Buttons & inputs
	if (tokens.components.buttonPrimaryBackgroundColor) replaceVar('button-primary-background-color', tokens.components.buttonPrimaryBackgroundColor);
	if (tokens.components.buttonPrimaryFontColor) replaceVar('button-primary-font-color', tokens.components.buttonPrimaryFontColor);
	if (tokens.components.buttonPrimaryBorderRadius) replaceVar('button-primary-border-radius', tokens.components.buttonPrimaryBorderRadius);
	if (tokens.components.buttonPrimaryPaddingX) replaceVar('button-primary-padding-x', tokens.components.buttonPrimaryPaddingX);
	if (tokens.components.buttonPrimaryPaddingY) replaceVar('button-primary-padding-y', tokens.components.buttonPrimaryPaddingY);
	if (tokens.components.buttonPrimaryFontSize) replaceVar('button-primary-font-size', tokens.components.buttonPrimaryFontSize);
	if (tokens.components.buttonPrimaryFontWeight) replaceVar('button-primary-font-weight', tokens.components.buttonPrimaryFontWeight);
	if (tokens.components.buttonPrimaryLetterSpacing) replaceVar('button-primary-letter-spacing', tokens.components.buttonPrimaryLetterSpacing);
	if (tokens.components.buttonPrimaryTextTransform) replaceVar('button-primary-text-transform', tokens.components.buttonPrimaryTextTransform);
	if (tokens.components.buttonPrimaryHeight) replaceVar('button-primary-height', tokens.components.buttonPrimaryHeight);
	if (tokens.components.buttonPrimaryBorderWidth) replaceVar('button-primary-border-width', tokens.components.buttonPrimaryBorderWidth);

	if (tokens.components.buttonSecondaryBackgroundColor) replaceVar('button-secondary-background-color', tokens.components.buttonSecondaryBackgroundColor);
	if (tokens.components.buttonSecondaryFontColor) replaceVar('button-secondary-font-color', tokens.components.buttonSecondaryFontColor);
	if (tokens.components.buttonSecondaryBorderRadius) replaceVar('button-secondary-border-radius', tokens.components.buttonSecondaryBorderRadius);
	if (tokens.components.buttonSecondaryPaddingX) replaceVar('button-secondary-padding-x', tokens.components.buttonSecondaryPaddingX);
	if (tokens.components.buttonSecondaryPaddingY) replaceVar('button-secondary-padding-y', tokens.components.buttonSecondaryPaddingY);
	if (tokens.components.buttonSecondaryFontSize) replaceVar('button-secondary-font-size', tokens.components.buttonSecondaryFontSize);
	if (tokens.components.buttonSecondaryFontWeight) replaceVar('button-secondary-font-weight', tokens.components.buttonSecondaryFontWeight);
	if (tokens.components.buttonSecondaryLetterSpacing) replaceVar('button-secondary-letter-spacing', tokens.components.buttonSecondaryLetterSpacing);
	if (tokens.components.buttonSecondaryTextTransform) replaceVar('button-secondary-text-transform', tokens.components.buttonSecondaryTextTransform);
	if (tokens.components.buttonSecondaryHeight) replaceVar('button-secondary-height', tokens.components.buttonSecondaryHeight);
	if (tokens.components.buttonSecondaryBorderWidth) replaceVar('button-secondary-border-width', tokens.components.buttonSecondaryBorderWidth);

	if (tokens.components.inputFieldHeight) replaceVar('input-field-height', tokens.components.inputFieldHeight);
	if (tokens.components.inputFieldBorderRadius) replaceVar('input-field-border-radius', tokens.components.inputFieldBorderRadius);
	if (tokens.components.inputFieldBorderWidth) replaceVar('input-field-border-width', tokens.components.inputFieldBorderWidth);

	// Breakpoints
	if (tokens.breakpoints.mobile) {
		replaceVar('breakpoint-mobile', tokens.breakpoints.mobile);
	}
	if (tokens.breakpoints.tablet) {
		replaceVar('breakpoint-tablet', tokens.breakpoints.tablet);
	}
	if (tokens.breakpoints.desktop) {
		replaceVar('breakpoint-desktop', tokens.breakpoints.desktop);
	}
	if (tokens.breakpoints.desktopLarge) {
		replaceVar('breakpoint-desktop-large', tokens.breakpoints.desktopLarge);
	}
	if (tokens.breakpoints.desktopXLarge) {
		replaceVar('breakpoint-desktop-x-large', tokens.breakpoints.desktopXLarge);
	}
	if (tokens.breakpoints.desktopXXLarge) {
		replaceVar('breakpoint-desktop-xx-large', tokens.breakpoints.desktopXXLarge);
	}

	// Semantic color mappings
	if (tokens.colors.semantics.primary) {
		replaceVar('color-primary', `$color-${tokens.colors.semantics.primary}`);
	}
	if (tokens.colors.semantics.secondary) {
		replaceVar('color-secondary', `$color-${tokens.colors.semantics.secondary}`);
	}
	if (tokens.colors.semantics.link) {
		replaceVar('link-color', `$color-${tokens.colors.semantics.link}`);
	}
	if (tokens.colors.semantics.background) {
		replaceVar('color-background', `$color-${tokens.colors.semantics.background}`);
	}
	if (tokens.colors.semantics.body) {
		replaceVar('color-body', `$color-${tokens.colors.semantics.body}`);
	}

	// Font family wiring to selected theme.json preset slugs
	if (tokens.typography.primarySlug) {
		replaceVar('body-font-family', `var(--wp--preset--font-family--${tokens.typography.primarySlug})`);
	}
	if (tokens.typography.secondarySlug) {
		replaceVar('font-family-secondary', `var(--wp--preset--font-family--${tokens.typography.secondarySlug})`);
	}

	// Ensure SCSS color variables exist for any new palette colors
	const existingColorVars = updated.match(/\$color-[\w-]+:\s*var\(--wp--preset--color--[\w-]+\);/g) || [];
	const existingSlugs = new Set(
		existingColorVars.map((v) => {
			const match = v.match(/\$color-([\w-]+):/);
			return match ? match[1] : null;
		}).filter(Boolean)
	);

		if (tokens.colors.palette.length > 0) {
			const newColorVars = [];
			const protectedColorSlugs = new Set([
				'black',
				'dark',
				'dark-grey',
				'grey',
				'grey-light',
				'white',
			]);

			for (const c of tokens.colors.palette) {
				if (!existingSlugs.has(c.slug)) {
					newColorVars.push(`$color-${c.slug}: var(--wp--preset--color--${c.slug});`);
				}
			}

		if (newColorVars.length > 0) {
			// Insert new color variables before the "Theme colors" comment
			const themeColorsComment = '/* Colors - Theme colors. */';
			if (updated.includes(themeColorsComment)) {
				updated = updated.replace(
					themeColorsComment,
					newColorVars.join('\n') + '\n\n' + themeColorsComment
				);
			}
		}

			// Remove color variables for slugs no longer in the palette.
			const paletteSlugSet = new Set(tokens.colors.palette.map((c) => c.slug));
			for (const existingSlug of existingSlugs) {
				if (!paletteSlugSet.has(existingSlug) && !protectedColorSlugs.has(existingSlug)) {
					const removeRegex = new RegExp(
						`\\$color-${existingSlug}:\\s*var\\(--wp--preset--color--${existingSlug}\\);\\n?`,
						'g'
					);
					updated = updated.replace(removeRegex, '');
				}
			}
		}

	return updated;
}

/**
 * Print a summary of changes.
 */
function printSummary(tokens) {
	console.log(color.bold('\n  Summary of Changes\n'));

	if (tokens.colors.palette.length > 0) {
		console.log(color.bold('  Colors:'));
		for (const c of tokens.colors.palette) {
			console.log(`    ${c.name} (${c.slug}): ${color.cyan(c.color)}`);
		}

		if (Object.keys(tokens.colors.semantics).length > 0) {
			console.log(color.bold('\n  Semantic Mapping:'));
			for (const [role, slug] of Object.entries(tokens.colors.semantics)) {
				console.log(`    ${role}: ${color.cyan(`$color-${slug}`)}`);
			}
		}
	}

	console.log(color.bold('\n  Typography:'));
	console.log(`    Primary:   ${color.cyan(tokens.typography.fontFamily)}`);
	console.log(`    Secondary: ${color.cyan(tokens.typography.fontFamilySecondary)}`);

	console.log(color.bold('\n  Font Sizes (mobile / desktop):'));
	const allKeys = new Set([
		...Object.keys(tokens.fontSize.mobile || {}),
		...Object.keys(tokens.fontSize.desktop || {}),
	]);
	for (const key of allKeys) {
		const mob = tokens.fontSize.mobile?.[key] || '—';
		const desk = tokens.fontSize.desktop?.[key] || '—';
		console.log(`    ${key}: ${color.cyan(mob)} / ${color.cyan(desk)}`);
	}

	console.log(color.bold('\n  Layout:'));
	console.log(`    Content width:    ${color.cyan(tokens.layout.contentSize)}`);
	console.log(`    Container padding: ${color.cyan(tokens.layout.containerPadding)}`);

	console.log(color.bold('\n  Buttons & Inputs:'));
	console.log(`    Primary bg:       ${color.cyan(tokens.components.buttonPrimaryBackgroundColor || '—')}`);
	console.log(`    Primary font:     ${color.cyan(tokens.components.buttonPrimaryFontColor || '—')}`);
	console.log(`    Secondary bg:     ${color.cyan(tokens.components.buttonSecondaryBackgroundColor || '—')}`);
	console.log(`    Secondary font:   ${color.cyan(tokens.components.buttonSecondaryFontColor || '—')}`);
	console.log(`    Input height:     ${color.cyan(tokens.components.inputFieldHeight || '—')}`);
	console.log(`    Input radius:     ${color.cyan(tokens.components.inputFieldBorderRadius || '—')}`);
	console.log(`    Input border:     ${color.cyan(tokens.components.inputFieldBorderWidth || '—')}`);

	console.log(color.bold('\n  Breakpoints:'));
	console.log(`    Mobile:           ${color.cyan(tokens.breakpoints.mobile)}`);
	console.log(`    Tablet:           ${color.cyan(tokens.breakpoints.tablet)}`);
	console.log(`    Desktop:          ${color.cyan(tokens.breakpoints.desktop)}`);
	console.log(`    Desktop Large:    ${color.cyan(tokens.breakpoints.desktopLarge)}`);
	console.log(`    Desktop X-Large:  ${color.cyan(tokens.breakpoints.desktopXLarge)}`);
	console.log(`    Desktop XX-Large: ${color.cyan(tokens.breakpoints.desktopXXLarge)}`);
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

const BOX_W = 51;

/** Strip ANSI escape codes so we measure visible character width only. */
function stripAnsi(str) {
	return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function boxLine(content = '') {
	const pad = BOX_W - 4 - stripAnsi(content).length;
	return `│ ${content}${' '.repeat(Math.max(0, pad))} │`;
}

function printBox(lines) {
	const top = `┌${'─'.repeat(BOX_W - 2)}┐`;
	const bot = `└${'─'.repeat(BOX_W - 2)}┘`;
	console.log(top);
	for (const l of lines) console.log(boxLine(l));
	console.log(bot);
}

function sectionHeader(title) {
	const bar = '━'.repeat(3);
	const fill = '━'.repeat(Math.max(0, BOX_W - 5 - title.length));
	return `\n${bar} ${color.bold(title)} ${fill}`;
}

// ─── Figma sync runner ────────────────────────────────────────────────────────

function runScript(scriptPath, args = []) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [scriptPath, ...args], {
			stdio: 'inherit',
			cwd: ROOT,
		});
		child.on('close', (code) => {
			// Exit code is forwarded to the caller (child prints its own errors).
			resolve(code ?? 1);
		});
		child.on('error', reject);
	});
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	console.log('');
	printBox([
		'',
		color.bold('  Rareview Starter Theme — Design System'),
		'',
		'  How would you like to configure your',
		'  design tokens?',
		'',
	]);
	console.log('');
	console.log(`  ${color.bold('1.')}  Set variables manually  ${color.dim('(variable mapping guide)')}`);
	console.log(`  ${color.bold('2.')}  Set variables in the terminal`);
	console.log(`  ${color.bold('3.')}  Figma sync  ${color.dim('(beta)')}`);
	console.log('');

	if (DRY_RUN) {
		console.log(color.yellow('  DRY RUN MODE — no files will be modified\n'));
	}

	const rl = createInterface({ input: stdin, output: stdout });

	try {
		let choice = '';
		while (!['1', '2', '3'].includes(choice)) {
			choice = (await rl.question(`  ${color.bold('❯')} Choose an option (1–3): `)).trim();
		}

		console.log('');

		// ── Option 1: manual guide ─────────────────────────────────────────────
		if (choice === '1') {
			const themeDir = await findThemeDir();
			const docPath = resolve(themeDir, 'docs', 'variable-mapping.md');
			const docHref = pathToFileURL(docPath).href;
			const docLabel = relative(ROOT, docPath).split(/[/\\]/).join('/');

			printBox([
				'',
				color.bold('  Variable mapping (manual)'),
				'',
				'  See the list of variables to update.',
				'',
			]);
			console.log('');
			console.log(
				'  Please refer to the variable mapping guide for which values to update so global styles align with your design.',
			);
			console.log('');
			// OSC 8 file:// link — clickable in VS Code / iTerm2 / WezTerm / Ghostty, etc.
			console.log(`  \x1b]8;;${docHref}\x1b\\\x1b[36m${docLabel}\x1b[0m\x1b]8;;\x1b\\`);
			console.log('');
			return;
		}

		// ── Option 3: figma sync ───────────────────────────────────────────────
		if (choice === '3') {
			console.log(`  ${color.yellow('⚠')}  ${color.bold('Figma Sync')} ${color.dim('(beta)')}`);
			console.log(color.dim('  This will ask for Figma URL, fetch design tokens, then apply them.\n'));
			// Release stdin before spawning an interactive child process.
			rl.close();
			const syncExit = await runScript(resolve(__dirname, '..', 'figma-sync', 'figma-sync.mjs'), DRY_RUN ? ['--dry-run'] : []);
			if (syncExit !== 0) {
				exit(syncExit);
			}
			const applyExit = await runScript(resolve(__dirname, '..', 'figma-sync', 'figma-apply.mjs'), DRY_RUN ? ['--dry-run'] : []);
			if (applyExit !== 0) {
				exit(applyExit);
			}
			return;
		}

		// ── Option 2: interactive terminal ────────────────────────────────────
		printBox([
			'',
			color.bold('  Design Token Setup'),
			'',
			"  We'll collect your design tokens in",
			'  sections. Press Enter to use defaults,',
			'  or type a new value.',
			'',
		]);

		const themeDir = await findThemeDir();
		const themeJson = await readThemeJson(themeDir);
		const scssContent = await readVariablesScss(themeDir);
		const availableFonts = await scanAvailableFonts(themeDir);

		let tokens;

		if (IMPORT_FILE) {
			console.log(`  Importing from: ${color.cyan(IMPORT_FILE)}\n`);
			try {
				tokens = await importMode(IMPORT_FILE, themeJson, scssContent);
			} catch (err) {
				console.log(color.red(`\n  Error reading import file: ${err.message}\n`));
				exit(1);
			}
		} else {
			// Patch section headers in interactiveMode by pre-printing them
			console.log(sectionHeader('COLORS'));
			tokens = await interactiveMode(rl, themeJson, scssContent, availableFonts);
		}

		printSummary(tokens);

		console.log(color.bold('\n  Applying changes...\n'));

		const updatedThemeJson = applyToThemeJson(themeJson, tokens);
		const updatedScss = applyToVariablesScss(scssContent, tokens);

		const themeJsonPath = resolve(themeDir, 'theme.json');
		const scssPath = resolve(themeDir, 'assets', 'css', 'abstracts', 'variables', 'variables.scss');
		console.log(color.dim(`  Target theme: ${relative(ROOT, themeDir).split(/[/\\]/).join('/')}`));
		console.log(color.dim(`  Target files:`));
		console.log(color.dim(`    - ${relative(ROOT, themeJsonPath).split(/[/\\]/).join('/')}`));
		console.log(color.dim(`    - ${relative(ROOT, scssPath).split(/[/\\]/).join('/')}`));

		if (!DRY_RUN) {
			await writeFile(themeJsonPath, JSON.stringify(updatedThemeJson, null, '  ') + '\n', 'utf-8');
			console.log(`    ${color.green('✓')} Updated theme.json`);
			await writeFile(scssPath, updatedScss, 'utf-8');
			console.log(`    ${color.green('✓')} Updated variables.scss`);
		} else {
			console.log(`    ${color.dim('Would update: theme.json')}`);
			console.log(`    ${color.dim('Would update: variables.scss')}`);
		}

		console.log('');
		console.log(color.green(color.bold('  ✓ Design system updated!')));
		if (!DRY_RUN) {
			console.log(color.dim('\n  Run `npm run build` to rebuild the theme with the new tokens.\n'));
		} else {
			console.log(color.yellow('\n  This was a dry run. Run without --dry-run to apply changes.\n'));
		}

	} finally {
		rl.close();
	}
}

main().catch((err) => {
	console.error(`\n${err.message}\n`);
	exit(1);
});
