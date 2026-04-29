#!/usr/bin/env node

/**
 * RV Starter Theme — Design System CLI
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
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

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

/**
 * Prompt user for input with default value and optional validation.
 */
async function ask(rl, question, defaultValue, validator = null) {
	while (true) {
		const answer = await rl.question(`  ${question} ${color.dim(`(${defaultValue})`)} `);
		const value = answer.trim() || defaultValue;

		if (validator && !validator(value)) {
			console.log(color.red('    Invalid value. Please try again.'));
			continue;
		}

		return value;
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
		borderRadius: extract(/\$border-radius-default:\s*([^;]+);/) || '999px',
		transition: extract(/\$transition-default:\s*([^;]+);/) || '0.2s ease-out',
		inputFieldHeight: extract(/\$input-field-height:\s*([^;]+);/) || '3.2rem',
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

/**
 * Interactive mode — prompt for all design tokens.
 */
async function interactiveMode(rl, themeJson, scssContent) {
	const defaults = getCurrentDefaults(themeJson);
	const scssDefaults = getScssDefaults(scssContent);

	const tokens = {
		colors: { palette: [], semantics: {} },
		typography: {},
		fontSize: { mobile: {}, desktop: {} },
		layout: {},
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

	if (!startFresh) {
		console.log(color.dim('  Current palette:'));
		for (const c of defaults.palette) {
			console.log(color.dim(`    ${c.name}: ${c.color} (${c.slug})`));
		}
		console.log('');

		const keepExisting = await rl.question(`  ${color.bold('Keep current palette and update values?')} (Y/n) `);

		if (keepExisting.toLowerCase() !== 'n') {
			// Let user update existing palette colors
			for (const c of defaults.palette) {
				const newColor = await ask(rl, `  ${c.name} (${c.slug}):`, c.color, isValidHex);
				paletteEntries.push({ name: c.name, slug: c.slug, color: newColor });
			}
		} else {
			// Build from scratch
			console.log(color.dim('\n  Enter colors one at a time. Leave name empty when done.\n'));

			let adding = true;
			while (adding) {
				const name = await rl.question('  Color name (empty to stop): ');
				if (!name.trim()) {
					adding = false;
					continue;
				}
				const hex = await ask(rl, `  ${name} hex:`, '#000000', isValidHex);
				const slug = slugify(name);
				paletteEntries.push({ name: name.trim(), slug, color: hex });
			}
		}
	} else {
		console.log(color.dim('  Enter colors one at a time. Leave name empty when done.\n'));

		let adding = true;
		while (adding) {
			const name = await rl.question('  Color name (empty to stop): ');
			if (!name.trim()) {
				adding = false;
				continue;
			}
			const hex = await ask(rl, `  ${name} hex:`, '#000000', isValidHex);
			const slug = slugify(name);
			paletteEntries.push({ name: name.trim(), slug, color: hex });
		}
	}

	tokens.colors.palette = paletteEntries;

	// Map semantic colors to palette slugs
	if (paletteEntries.length > 0) {
		console.log(color.bold('\n  Semantic Color Mapping\n'));
		console.log(color.dim('  Map theme roles to palette colors.\n'));

		const slugs = paletteEntries.map((c) => c.slug);
		const slugList = slugs.join(', ');

		for (const sem of semanticColors) {
			const defaultSlug = slugs.includes(sem.defaultSlug) ? sem.defaultSlug : slugs[0];
			console.log(color.dim(`    Available: ${slugList}`));
			const chosen = await ask(rl, `  ${sem.label} (slug):`, defaultSlug, (v) => slugs.includes(v));
			tokens.colors.semantics[sem.key] = chosen;
		}
	}

	// ── Typography ──────────────────────────────────────
	console.log(color.bold('\n  Typography\n'));

	tokens.typography.fontFamily = await ask(rl, 'Primary font family:', defaults.fontFamily);
	tokens.typography.fontFamilySecondary = await ask(
		rl,
		'Secondary font family:',
		defaults.fontFamilySecondary
	);

	// Font sizes
	console.log(color.bold('\n  Font Sizes (px)\n'));
	console.log(color.dim('  Heading and body sizes for mobile and desktop.\n'));

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

	console.log(color.dim('  Headings:\n'));
	for (const h of headings) {
		const mDefault = defaults.fontSize.mobile[h] || '16px';
		const dDefault = defaults.fontSize.desktop[h] || '16px';
		const mob = await ask(rl, `  ${friendlyNames[h]} mobile:`, mDefault, isValidPx);
		const desk = await ask(rl, `  ${friendlyNames[h]} desktop:`, dDefault, isValidPx);
		tokens.fontSize.mobile[h] = normalizePx(mob);
		tokens.fontSize.desktop[h] = normalizePx(desk);
	}

	console.log(color.dim('\n  Body sizes:\n'));
	for (const b of bodySizes) {
		const mDefault = defaults.fontSize.mobile[b] || '14px';
		const dDefault = defaults.fontSize.desktop[b] || '18px';
		const mob = await ask(rl, `  ${friendlyNames[b]} mobile:`, mDefault, isValidPx);
		const desk = await ask(rl, `  ${friendlyNames[b]} desktop:`, dDefault, isValidPx);
		tokens.fontSize.mobile[b] = normalizePx(mob);
		tokens.fontSize.desktop[b] = normalizePx(desk);
	}

	// ── Layout & Spacing ────────────────────────────────
	console.log(color.bold('\n  Layout & Spacing\n'));

	tokens.layout.contentSize = await ask(rl, 'Content max width (px):', defaults.contentSize, isValidPx);
	tokens.layout.contentSize = normalizePx(tokens.layout.contentSize);
	tokens.layout.containerPadding = await ask(
		rl,
		'Container side padding (rem):',
		scssDefaults.containerPadding
	);
	tokens.layout.borderRadius = await ask(rl, 'Default border radius:', scssDefaults.borderRadius);

	// ── Breakpoints ─────────────────────────────────────
	console.log(color.bold('\n  Breakpoints\n'));
	console.log(color.dim('  Responsive breakpoints in px.\n'));

	tokens.breakpoints.mobile = normalizePx(
		await ask(rl, 'Mobile:', scssDefaults.breakpointMobile, isValidPx)
	);
	tokens.breakpoints.tablet = normalizePx(
		await ask(rl, 'Tablet:', scssDefaults.breakpointTablet, isValidPx)
	);
	tokens.breakpoints.desktop = normalizePx(
		await ask(rl, 'Desktop:', scssDefaults.breakpointDesktop, isValidPx)
	);
	tokens.breakpoints.desktopLarge = normalizePx(
		await ask(rl, 'Desktop Large:', scssDefaults.breakpointDesktopLarge, isValidPx)
	);
	tokens.breakpoints.desktopXLarge = normalizePx(
		await ask(rl, 'Desktop X-Large:', scssDefaults.breakpointDesktopXLarge, isValidPx)
	);
	tokens.breakpoints.desktopXXLarge = normalizePx(
		await ask(rl, 'Desktop XX-Large:', scssDefaults.breakpointDesktopXXLarge, isValidPx)
	);

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
	tokens.layout.borderRadius =
		imported.layout?.borderRadius || scssDefaults.borderRadius;

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
	if (tokens.layout.borderRadius) {
		replaceVar('border-radius-default', tokens.layout.borderRadius);
	}

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
	console.log(`    Border radius:    ${color.cyan(tokens.layout.borderRadius)}`);

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
		color.bold('  RV Starter Theme — Design System'),
		'',
		'  How would you like to configure your',
		'  design tokens?',
		'',
	]);
	console.log('');
	console.log(`  ${color.bold('1.')}  Set variables in the terminal`);
	console.log(`  ${color.bold('2.')}  Set variables manually  ${color.dim('(variable mapping guide)')}`);
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

		// ── Option 2: manual guide ─────────────────────────────────────────────
		if (choice === '2') {
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
			const syncExit = await runScript(resolve(__dirname, 'figma-sync.mjs'), DRY_RUN ? ['--dry-run'] : []);
			if (syncExit !== 0) {
				exit(syncExit);
			}
			const applyExit = await runScript(resolve(__dirname, 'figma-apply.mjs'), DRY_RUN ? ['--dry-run'] : []);
			if (applyExit !== 0) {
				exit(applyExit);
			}
			return;
		}

		// ── Option 1: interactive terminal ────────────────────────────────────
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
			tokens = await interactiveMode(rl, themeJson, scssContent);
		}

		printSummary(tokens);

		console.log(color.bold('\n  Applying changes...\n'));

		const updatedThemeJson = applyToThemeJson(themeJson, tokens);
		const updatedScss = applyToVariablesScss(scssContent, tokens);

		const themeJsonPath = resolve(themeDir, 'theme.json');
		const scssPath = resolve(themeDir, 'assets', 'css', 'abstracts', 'variables', 'variables.scss');

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
