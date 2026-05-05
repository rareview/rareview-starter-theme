#!/usr/bin/env node

/**
 * figma-ai-sync
 *
 * Fetches the full Figma file and strips it down to only CSS-relevant style
 * data. Output: scripts/figma-sync/figma-export.json
 *
 * Sections:
 *   colors          — { colored: top 10, mono: top 4 greys; black/white are not from Figma }
 *   headings        — { desktop: [H1→H6], mobile: [H1→H6] }
 *   paragraphSizes  — { fontFamily, desktop: {small,medium,large}, mobile: {...} }
 *   body            — primary/secondary font family + weight/lineHeight/letterSpacing
 *   borderWidth     — most common stroke width on input/textarea nodes
 *   borderRadius    — most common corner radius on button nodes
 *   containerWidth  — most common frame width in the 900–1440 px range
 *   buttons         — top 2 (palette colors preferred)
 *   links           — most-used link style with hover fields where available
 */

import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const EXPORT_FILE_PATH = path.resolve(process.cwd(), 'scripts/figma-sync/figma-export.json');
const LOG_FILE_PATH = path.resolve(process.cwd(), 'scripts/figma-sync/figma-sync.log');
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const logLines = [];
const FIGMA_TOKEN_ENV_KEY = 'FIGMA_ACCESS_TOKEN';

function log(message = '') {
	logLines.push(message);
	if (VERBOSE) {
		console.log(message);
	}
}

function getFigmaTokenFromEnv() {
	dotenv.config({ override: true, quiet: true });
	return process.env[FIGMA_TOKEN_ENV_KEY]?.trim() || '';
}

async function waitForFigmaToken(rl, message) {
	let figmaToken = getFigmaTokenFromEnv();

	while (!figmaToken) {
		const answer = await rl.question(`${message}\nPress Enter after updating .env, or type "exit" to stop: `);

		if (answer.trim().toLowerCase() === 'exit') {
			throw new Error('Figma sync cancelled. Define FIGMA_ACCESS_TOKEN in .env and run again.');
		}

		figmaToken = getFigmaTokenFromEnv();
	}

	return figmaToken;
}

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

async function writeSyncLog() {
	await fs.mkdir(path.dirname(LOG_FILE_PATH), { recursive: true });
	await fs.writeFile(LOG_FILE_PATH, `${logLines.join('\n')}\n`, 'utf8');
}

// ---------------------------------------------------------------------------
// Figma API
// ---------------------------------------------------------------------------

class FigmaApiError extends Error {
	constructor(status, bodyText) {
		super(`Figma API request failed (${status}): ${bodyText}`);
		this.name = 'FigmaApiError';
		this.status = status;
		this.bodyText = bodyText;
	}
}

function parseFigmaUrl(figmaUrl) {
	const m = figmaUrl.trim().match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
	return m ? { fileKey: m[1] } : null;
}

function hasMissingScope(error) {
	if (!(error instanceof FigmaApiError) || error.status !== 403) {
		return false;
	}
	const body = error.bodyText.toLowerCase();
	return body.includes('invalid scope') || body.includes('requires');
}

async function fetchFigmaFile(fileKey, figmaToken) {
	const endpoint = new URL(`https://api.figma.com/v1/files/${fileKey}`);


	const response = await fetch(endpoint, {
		headers: { 'X-Figma-Token': figmaToken.trim() },
	});

	if (!response.ok) {
		throw new FigmaApiError(response.status, await response.text());
	}

	const contentLength = Number(response.headers.get('content-length') || 0);
	const reader = response.body?.getReader();
	if (!reader) {
		return response.json();
	}

	let received = 0;
	let lastPercent = -1;
	let lastMbShown = -1;
	const chunks = [];

	log('Downloading Figma JSON...');

	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		received += value.byteLength;

		if (contentLength > 0) {
			const percent = Math.floor((received / contentLength) * 100);
			if (percent >= lastPercent + 2 || percent === 100) {
				lastPercent = percent;
				const bw = 28;
				const filled = Math.min(bw, Math.round((percent / 100) * bw));
				process.stdout.write(
					`\r  Downloading [${'#'.repeat(filled)}${'.'.repeat(bw - filled)}] ${String(percent).padStart(3)}%  (${Math.round(received / 1024)} KB / ${Math.round(contentLength / 1024)} KB)`,
				);
			}
		} else {
			const mb = Math.floor(received / (1024 * 1024));
			if (mb > lastMbShown) {
				lastMbShown = mb;
				process.stdout.write(`\r  ${mb} MB downloaded...`);
			}
		}
	}
	process.stdout.write('\n');

	const merged = new Uint8Array(received);
	let off = 0;
	for (const chunk of chunks) {
		merged.set(chunk, off);
		off += chunk.byteLength;
	}
	log('Parsing JSON...');
	return JSON.parse(new TextDecoder().decode(merged));
}

// ---------------------------------------------------------------------------
// Color utilities
// ---------------------------------------------------------------------------

function rgbToHex(color) {
	if (!color || typeof color !== 'object') {
		return null;
	}
	const b = (v) => Math.max(0, Math.min(255, Math.round(Number(v ?? 0) * 255)));
	return `#${b(color.r).toString(16).padStart(2, '0')}${b(color.g).toString(16).padStart(2, '0')}${b(color.b).toString(16).padStart(2, '0')}`.toUpperCase();
}

function firstSolidHex(fills) {
	if (!Array.isArray(fills)) {
		return null;
	}
	const f = fills.find((f) => f?.type === 'SOLID' && f?.visible !== false);
	return f ? rgbToHex(f.color) : null;
}

function isMonoColor(hex) {
	if (!hex || hex.length !== 7) {
		return false;
	}
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const bv = parseInt(hex.slice(5, 7), 16);
	return Math.max(r, g, bv) - Math.min(r, g, bv) <= 22;
}

/**
 * Hue angle (0..360) from #RRGGBB.
 * Used only for ordering chromatic palette entries by color tone.
 */
function hexHue(hex) {
	if (!hex || hex.length !== 7) {
		return 0;
	}
	const r = parseInt(hex.slice(1, 3), 16) / 255;
	const g = parseInt(hex.slice(3, 5), 16) / 255;
	const b = parseInt(hex.slice(5, 7), 16) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const d = max - min;
	if (d === 0) {
		return 0;
	}
	let h;
	if (max === r) {
		h = ((g - b) / d) % 6;
	} else if (max === g) {
		h = (b - r) / d + 2;
	} else {
		h = (r - g) / d + 4;
	}
	const deg = h * 60;
	return deg < 0 ? deg + 360 : deg;
}

// ---------------------------------------------------------------------------
// Node traversal
// ---------------------------------------------------------------------------

function walkNodes(node, visitor) {
	if (!node || typeof node !== 'object') {
		return;
	}
	visitor(node);
	if (Array.isArray(node.children)) {
		for (const child of node.children) {
			walkNodes(child, visitor);
		}
	}
}

function findFirstTextNode(node) {
	if (!node) {
		return null;
	}
	if (node.type === 'TEXT') {
		return node;
	}
	if (Array.isArray(node.children)) {
		for (const child of node.children) {
			const found = findFirstTextNode(child);
			if (found) {
				return found;
			}
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// CSS conversion helpers
// ---------------------------------------------------------------------------

function textCaseToCss(tc) {
	if (tc === 'UPPER') {
		return 'uppercase';
	}
	if (tc === 'LOWER') {
		return 'lowercase';
	}
	if (tc === 'TITLE') {
		return 'capitalize';
	}
	return 'none';
}

function textDecorationToCss(td) {
	if (td === 'UNDERLINE') {
		return 'underline';
	}
	if (td === 'STRIKETHROUGH') {
		return 'line-through';
	}
	return 'none';
}

function buildTypographyKey(s) {
	return [s?.fontFamily, s?.fontWeight, s?.fontSize, s?.lineHeightPx, s?.letterSpacing, s?.textCase].join('|');
}

// ---------------------------------------------------------------------------
// Style registry
// ---------------------------------------------------------------------------

function buildStyleRegistry(figmaStyles) {
	if (!figmaStyles || typeof figmaStyles !== 'object') {
		return {};
	}
	return Object.fromEntries(
		Object.entries(figmaStyles).map(([id, style]) => [id, { id, name: style?.name ?? null, type: style?.styleType ?? null }]),
	);
}

// ---------------------------------------------------------------------------
// Colors — colored top 10 + mono top 6
// ---------------------------------------------------------------------------

function extractColors(nodes, styleRegistry) {
	const byHex = new Map();

	for (const node of nodes) {
		for (const fill of Array.isArray(node.fills) ? node.fills : []) {
			if (fill?.type !== 'SOLID' || fill?.visible === false) {
				continue;
			}
			const hex = rgbToHex(fill.color);
			if (!hex) {
				continue;
			}
			const styleId = node.styles?.fill ?? null;
			const styleName = styleId ? styleRegistry[styleId]?.name ?? null : null;
			if (!byHex.has(hex)) {
				byHex.set(hex, { hex, name: styleName, usageCount: 0 });
			}
			const entry = byHex.get(hex);
			entry.usageCount += 1;
			if (!entry.name && styleName) {
				entry.name = styleName;
			}
		}
	}

	const all = [...byHex.values()].sort((a, b) => b.usageCount - a.usageCount);
	// Monochrome pool: only greys, exclude near-black and near-white (luminance
	// 0.02..0.98), take the top 4 by usage, then order darkest → lightest.
	// (Black/white in theme are hardcoded in CSV, not from Figma.)
	const monoCandidates = all.filter((c) => {
		if (!isMonoColor(c.hex)) {
			return false;
		}
		const L = hexLuminance(c.hex);
		return L > 0.02 && L < 0.98;
	});
	const byUsage = monoCandidates.sort((a, b) => b.usageCount - a.usageCount).slice(0, 4);
	const mono = byUsage.sort((a, b) => hexLuminance(a.hex) - hexLuminance(b.hex));
	const coloredByTone = all
		.filter((c) => !isMonoColor(c.hex))
		.slice(0, 10)
		.sort((a, b) => hexHue(b.hex) - hexHue(a.hex));
	return {
		colored: coloredByTone,
		mono,
	};
}

// ---------------------------------------------------------------------------
// Headings — H1-H6 only, separated desktop / mobile, sorted H1→H6
// ---------------------------------------------------------------------------

const HEADING_LEVEL_RE = /(^|\b|\/)(h[1-6])(\b|\/|-|$)/i;

function headingLevel(name) {
	const m = /h([1-6])/i.exec(name ?? '');
	return m ? parseInt(m[1], 10) : 99;
}

function isMobileContext(name) {
	return /mobile|phone/i.test(name ?? '');
}

function extractHeadings(nodes, styleRegistry) {
	// Collect all candidate heading entries, allowing duplicates per level for now.
	// Each slot key is  "<level>:<desktop|mobile>"  e.g. "1:desktop", "3:mobile"
	// We store an array of candidates per slot so we can pick the best one later.
	const slots = new Map(); // slotKey → candidate[]

	for (const node of nodes) {
		if (node.type !== 'TEXT' || !node.style?.fontSize) {
			continue;
		}
		const styleId = node.styles?.text ?? null;
		const styleName = styleId ? styleRegistry[styleId]?.name ?? '' : '';
		const nodeName = node.name ?? '';
		const label = styleName || nodeName;

		if (!HEADING_LEVEL_RE.test(styleName) && !HEADING_LEVEL_RE.test(nodeName)) {
			continue;
		}

		const level = headingLevel(label);
		if (level === 99) {
			continue;
		}
		const context = isMobileContext(label) ? 'mobile' : 'desktop';
		const slotKey = `${level}:${context}`;

		const s = node.style;
		const candidate = {
			name: label,
			fontFamily: s.fontFamily ?? null,
			fontWeight: s.fontWeight ?? null,
			fontSize: s.fontSize ?? null,
			lineHeightPx: s.lineHeightPx ?? null,
			letterSpacing: s.letterSpacing ?? null,
			textTransform: textCaseToCss(s.textCase),
			color: firstSolidHex(node.fills),
		};

		if (!slots.has(slotKey)) {
			slots.set(slotKey, []);
		}
		// Avoid exact duplicates (same styleId already seen)
		const existing = slots.get(slotKey);
		const alreadyHave = existing.some((c) => c.fontFamily === candidate.fontFamily && c.fontSize === candidate.fontSize);
		if (!alreadyHave) {
			existing.push(candidate);
		}
	}

	// Determine the dominant heading font family (most common across all candidates)
	const fontFamilyCounts = new Map();
	for (const candidates of slots.values()) {
		for (const c of candidates) {
			if (c.fontFamily) {
				fontFamilyCounts.set(c.fontFamily, (fontFamilyCounts.get(c.fontFamily) ?? 0) + 1);
			}
		}
	}
	const dominantFont = [...fontFamilyCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

	// For each slot, pick the best candidate:
	// 1. Prefer the dominant font family
	// 2. Among equal-font candidates, prefer larger fontSize (more likely the real heading)
	function pickBest(candidates) {
		const withDominant = dominantFont ? candidates.filter((c) => c.fontFamily === dominantFont) : [];
		const pool = withDominant.length > 0 ? withDominant : candidates;
		return pool.sort((a, b) => (b.fontSize ?? 0) - (a.fontSize ?? 0))[0];
	}

	const desktop = [];
	const mobile = [];

	for (const [slotKey, candidates] of slots.entries()) {
		const [levelStr, context] = slotKey.split(':');
		const best = pickBest(candidates);
		if (context === 'desktop') {
			desktop.push({ _level: parseInt(levelStr, 10), ...best });
		} else {
			mobile.push({ _level: parseInt(levelStr, 10), ...best });
		}
	}

	// Sort H1→H6, strip internal _level field
	const sortAndClean = (arr) =>
		arr
			.sort((a, b) => a._level - b._level)
			.map(({ _level, ...rest }) => rest);

	return { desktop: sortAndClean(desktop), mobile: sortAndClean(mobile) };
}

// ---------------------------------------------------------------------------
// Paragraph sizes — only TEXT inside frames named Typography / Body / Paragraph
// (no shared-style pass). Missing S/M/L are derived from body fontSize (gap 2).
// Returns one fontFamily for all sizes. Skips missing sizes.
// ---------------------------------------------------------------------------

const SIZE_SMALL_RE = /(small|sm\b|xs\b)/i;
const SIZE_LARGE_RE = /(large|lg\b|xl\b)/i;
const MOBILE_PARA_RE = /(mobile|phone|\/mobile|mobile\/)/i;

function buildParaEntry(s) {
	const entry = {};
	if (s.fontSize != null) {
		entry.fontSize = s.fontSize;
	}
	if (s.lineHeightPx != null) {
		entry.lineHeightPx = s.lineHeightPx;
	}
	if (s.fontWeight != null) {
		entry.fontWeight = s.fontWeight;
	}
	if (s.letterSpacing != null) {
		entry.letterSpacing = s.letterSpacing;
	}
	const tt = textCaseToCss(s.textCase);
	if (tt && tt !== 'none') {
		entry.textTransform = tt;
	}
	return entry;
}

/** Return the slot key for a paragraph label, or null if it doesn't fit. */
function paraSlotKey(label) {
	const isMobile = MOBILE_PARA_RE.test(label);
	const context = isMobile ? 'mobile' : 'desktop';
	const isSmall = SIZE_SMALL_RE.test(label);
	const isLarge = SIZE_LARGE_RE.test(label);
	const size = isSmall ? 'small' : isLarge ? 'large' : 'medium';
	return `${context}:${size}`;
}

function buildParaEntryFromSize(s, size, gap) {
	const base = s?.fontSize;
	if (typeof base !== 'number' || !Number.isFinite(base)) {
		return buildParaEntry(s);
	}
	let targetSize = base;
	if (size === 'small') {
		targetSize = Math.max(8, base - gap);
	} else if (size === 'large') {
		targetSize = base + gap;
	} else {
		targetSize = base;
	}
	return buildParaEntry({ ...s, fontSize: targetSize, lineHeightPx: undefined });
}

function paraSizeValue(entry) {
	return typeof entry?.fontSize === 'number' && Number.isFinite(entry.fontSize) ? entry.fontSize : null;
}

/**
 * Ensure context sizes are strictly ordered: small < medium < large.
 * If extracted labels are noisy, repair from available numeric values and body fallback.
 */
function normalizeParaTriplet(contextObj, bodyStyle, gap) {
	const current = {
		small: contextObj.small ?? null,
		medium: contextObj.medium ?? null,
		large: contextObj.large ?? null,
	};
	const s = paraSizeValue(current.small);
	const m = paraSizeValue(current.medium);
	const l = paraSizeValue(current.large);
	const isOrdered = s != null && m != null && l != null && s < m && m < l;
	if (isOrdered) {
		return current;
	}

	const values = [s, m, l].filter((v) => v != null).sort((a, b) => a - b);
	const unique = [...new Set(values)];

	// Best case: map three unique observed sizes by ascending order.
	if (unique.length >= 3) {
		return {
			small: buildParaEntry({ ...bodyStyle, fontSize: unique[0] }),
			medium: buildParaEntry({ ...bodyStyle, fontSize: unique[1] }),
			large: buildParaEntry({ ...bodyStyle, fontSize: unique[2] }),
		};
	}

	// Otherwise derive around medium baseline.
	const base =
		(typeof bodyStyle?.fontSize === 'number' && Number.isFinite(bodyStyle.fontSize) ? bodyStyle.fontSize : null) ??
		(m ?? (unique.length ? unique[Math.floor(unique.length / 2)] : null));
	if (base == null) {
		return current;
	}
	return {
		small: buildParaEntry({ ...bodyStyle, fontSize: Math.max(8, base - gap) }),
		medium: buildParaEntry({ ...bodyStyle, fontSize: base }),
		large: buildParaEntry({ ...bodyStyle, fontSize: base + gap }),
	};
}

/**
 * @param {object | null} body
 *  body.fontSize = reference for fallback (gap between default 16/18/20 → 2).
 */
function extractParagraphSizes(nodes, _styleRegistry, body) {
	// slot key → candidate[]   where candidate = { fontFamily, entry }
	const slots = new Map();
	const GAP = 2;
	const DEFAULT_DESKTOP_MEDIUM = 18;
	const DEFAULT_MOBILE_MEDIUM = 14;
	const DEFAULT_DESKTOP_SMALL = 16;
	const DEFAULT_DESKTOP_LARGE = 20;
	const DEFAULT_MOBILE_SMALL = 12;
	const DEFAULT_MOBILE_LARGE = 16;

	function addCandidate(label, s) {
		const key = paraSlotKey(label);
		if (!key) {
			return;
		}
		if (!slots.has(key)) {
			slots.set(key, []);
		}
		slots.get(key).push({ fontFamily: s.fontFamily ?? null, entry: buildParaEntry(s) });
	}

	// Only TEXT nodes inside frames named Typography / Body / Paragraph
	const FRAME_NAME_RE = /^(typography|body|paragraph)s?$/i;
	for (const node of nodes) {
		if (!['FRAME', 'GROUP', 'SECTION'].includes(node.type)) {
			continue;
		}
		if (!FRAME_NAME_RE.test((node.name ?? '').trim())) {
			continue;
		}
		walkNodes(node, (child) => {
			if (child === node || child.type !== 'TEXT' || !child.style?.fontSize) {
				return;
			}
			const label = child.name ?? '';
			// require small / medium / large in the text layer name (incl. "body" → medium)
			const hasSmall = SIZE_SMALL_RE.test(label);
			const hasLarge = SIZE_LARGE_RE.test(label);
			const hasMed =
				/(^|\b)(medium|md|base|default|normal|regular)(\b|$)/i.test(label) || /^body$/i.test(String(label).trim());
			if (!hasSmall && !hasLarge && !hasMed) {
				return;
			}
			addCandidate(label, child.style);
		});
	}

	// Determine the dominant body font family across all candidates
	const fontCounts = new Map();
	for (const candidates of slots.values()) {
		for (const { fontFamily } of candidates) {
			if (fontFamily) {
				fontCounts.set(fontFamily, (fontCounts.get(fontFamily) ?? 0) + 1);
			}
		}
	}
	const dominantFromSlots = [...fontCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
	const dominantFont = dominantFromSlots ?? (body?.fontFamilyPrimary ?? null);

	// Pick best candidate per slot: dominant font first, otherwise first available
	const desktop = { small: null, medium: null, large: null };
	const mobile = { small: null, medium: null, large: null };

	for (const [key, candidates] of slots.entries()) {
		const [context, size] = key.split(':');
		const withDominant = dominantFromSlots
			? candidates.filter((c) => c.fontFamily === dominantFromSlots)
			: candidates;
		const best = (withDominant.length > 0 ? withDominant : candidates)[0];
		if (!best) {
			continue;
		}
		if (context === 'desktop') {
			desktop[size] = best.entry;
		} else {
			mobile[size] = best.entry;
		}
	}

	// If all 6 slots are not clearly available from Figma, derive a complete set
	// from detected body text size using default deltas.
	const hasAllSixExplicit = [desktop.small, desktop.medium, desktop.large, mobile.small, mobile.medium, mobile.large].every(
		(v) => paraSizeValue(v) != null,
	);

	// Body text size (detected earlier) is the source of truth for desktop medium.
	const bfs = typeof body?.fontSize === 'number' && Number.isFinite(body.fontSize) ? body.fontSize : null;
	let desktopBase = bfs ?? DEFAULT_DESKTOP_MEDIUM;
	if (!Number.isFinite(desktopBase)) {
		desktopBase = DEFAULT_DESKTOP_MEDIUM;
	}

	// Derive mobile medium from desktop medium using default medium delta.
	const mediumDelta = DEFAULT_DESKTOP_MEDIUM - DEFAULT_MOBILE_MEDIUM; // 4
	let mobileBase = desktopBase - mediumDelta;
	if (!Number.isFinite(mobileBase)) {
		mobileBase = DEFAULT_MOBILE_MEDIUM;
	}

	// Per-context small/large deltas from defaults.
	const desktopSmallDelta = DEFAULT_DESKTOP_MEDIUM - DEFAULT_DESKTOP_SMALL; // 2
	const desktopLargeDelta = DEFAULT_DESKTOP_LARGE - DEFAULT_DESKTOP_MEDIUM; // 2
	const mobileSmallDelta = DEFAULT_MOBILE_MEDIUM - DEFAULT_MOBILE_SMALL; // 2
	const mobileLargeDelta = DEFAULT_MOBILE_LARGE - DEFAULT_MOBILE_MEDIUM; // 2

	const desktopStyle = {
		fontSize: desktopBase,
		fontFamily: body?.fontFamilyPrimary,
		fontWeight: body?.fontWeight,
		letterSpacing: body?.letterSpacing,
	};
	const mobileStyle = {
		fontSize: mobileBase,
		fontFamily: body?.fontFamilyPrimary,
		fontWeight: body?.fontWeight,
		letterSpacing: body?.letterSpacing,
	};

	if (!hasAllSixExplicit) {
		desktop.small = buildParaEntry({
			...desktopStyle,
			fontSize: Math.max(8, desktopBase - desktopSmallDelta),
		});
		desktop.medium = buildParaEntry({ ...desktopStyle, fontSize: desktopBase });
		desktop.large = buildParaEntry({ ...desktopStyle, fontSize: desktopBase + desktopLargeDelta });
		mobile.small = buildParaEntry({
			...mobileStyle,
			fontSize: Math.max(8, mobileBase - mobileSmallDelta),
		});
		mobile.medium = buildParaEntry({ ...mobileStyle, fontSize: mobileBase });
		mobile.large = buildParaEntry({ ...mobileStyle, fontSize: mobileBase + mobileLargeDelta });
	} else {
		// Keep explicit Figma values when all six are present and clear.
		Object.assign(desktop, normalizeParaTriplet(desktop, desktopStyle, GAP));
		Object.assign(mobile, normalizeParaTriplet(mobile, mobileStyle, GAP));
	}

	// Final sanity pass: enforce small < medium < large for both contexts.
	Object.assign(desktop, normalizeParaTriplet(desktop, desktopStyle, GAP));
	Object.assign(mobile, normalizeParaTriplet(mobile, mobileStyle, GAP));

	if (Object.values(desktop).every((v) => !v) && Object.values(mobile).every((v) => !v)) {
		return null;
	}

	const result = {};
	if (dominantFont) {
		result.fontFamily = dominantFont;
	}
	const desktopOut = {};
	if (desktop.small) {
		desktopOut.small = desktop.small;
	}
	if (desktop.medium) {
		desktopOut.medium = desktop.medium;
	}
	if (desktop.large) {
		desktopOut.large = desktop.large;
	}
	if (Object.keys(desktopOut).length) {
		result.desktop = desktopOut;
	}
	const mobileOut = {};
	if (mobile.small) {
		mobileOut.small = mobile.small;
	}
	if (mobile.medium) {
		mobileOut.medium = mobile.medium;
	}
	if (mobile.large) {
		mobileOut.large = mobile.large;
	}
	if (Object.keys(mobileOut).length) {
		result.mobile = mobileOut;
	}
	return result;
}

// ---------------------------------------------------------------------------
// Body — primary / secondary font family + shared body style properties
// ---------------------------------------------------------------------------

function lineHeightRatioFromStyle(s) {
	if (!s) {
		return null;
	}
	const { fontSize, lineHeightPx, lineHeightUnit, lineHeightPercent } = s;
	if (typeof fontSize === 'number' && fontSize > 0) {
		if (lineHeightUnit === 'PIXELS' && typeof lineHeightPx === 'number' && lineHeightPx > 0) {
			return lineHeightPx / fontSize;
		}
		if (
			(lineHeightUnit === 'PERCENT' || lineHeightUnit === 'FONT_SIZE_%') &&
			typeof lineHeightPercent === 'number' &&
			lineHeightPercent > 0
		) {
			return lineHeightPercent / 100;
		}
	}
	return null;
}

function extractBody(nodes, styleRegistry) {
	// Count total characters (not node count) per font family + font size.
	// Body medium size = dominant fontSize among paragraph-like non-heading text.
	const BODY_MIN_CHARS = 20;
	const UI_TEXT_RE =
		/\b(button|cta|label|nav|menu|tab|chip|badge|tag|input|field|helper|hint|caption|eyebrow|meta|breadcrumb|footer|header|icon|logo|search|filter|sort)\b/i;

	/** @type {Array<{node: any, styleName: string, nodeName: string, len: number, fontFamily: string, fontSize: number | null}>} */
	const nonHeading = [];
	for (const node of nodes) {
		if (node.type !== 'TEXT' || !node.style?.fontFamily) {
			continue;
		}
		const styleId = node.styles?.text ?? null;
		const styleName = styleId ? styleRegistry[styleId]?.name ?? '' : '';
		const nodeName = node.name ?? '';
		if (HEADING_LEVEL_RE.test(styleName) || HEADING_LEVEL_RE.test(nodeName)) {
			continue;
		}
		nonHeading.push({
			node,
			styleName,
			nodeName,
			len: typeof node.characters === 'string' ? node.characters.length : 0,
			fontFamily: node.style.fontFamily,
			fontSize: typeof node.style.fontSize === 'number' ? node.style.fontSize : null,
		});
	}

	// Prefer paragraph-like candidates (longer copy + not obvious UI labels).
	const paragraphLike = nonHeading.filter(
		(r) => r.len >= BODY_MIN_CHARS && !UI_TEXT_RE.test(r.styleName) && !UI_TEXT_RE.test(r.nodeName),
	);
	const pool = paragraphLike.length > 0 ? paragraphLike : nonHeading;
	if (pool.length === 0) {
		return null;
	}

	const charByFont = new Map();
	const charBySize = new Map();
	/** Representative node per size: most characters at that size */
	const repNodeBySize = new Map();
	for (const row of pool) {
		const { node, len, fontFamily, fontSize } = row;
		charByFont.set(fontFamily, (charByFont.get(fontFamily) ?? 0) + len);
		if (fontSize != null && Number.isFinite(fontSize)) {
			charBySize.set(fontSize, (charBySize.get(fontSize) ?? 0) + len);
			const prev = repNodeBySize.get(fontSize);
			const prevLen = typeof prev?.characters === 'string' ? prev.characters.length : -1;
			if (!prev || len > prevLen) {
				repNodeBySize.set(fontSize, node);
			}
		}
	}

	const sorted = [...charByFont.entries()].sort((a, b) => b[1] - a[1]);
	const result = {};

	if (sorted[0]) {
		result.fontFamilyPrimary = sorted[0][0];
	}
	if (sorted[1] && sorted[1][0] !== sorted[0][0]) {
		result.fontFamilySecondary = sorted[1][0];
	}

	// Body medium size = size with most characters across non-heading text.
	const dominantSize = [...charBySize.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
	if (dominantSize != null) {
		result.fontSize = dominantSize;
	}

	// Body metrics from the representative node of dominant size.
	let metricNode = dominantSize != null ? repNodeBySize.get(dominantSize) ?? null : null;
	if (!metricNode) {
		// Fallback if Figma omits characters/style sizing oddly: pick first non-heading
		// text node in primary family.
		const topFont = sorted[0]?.[0];
		if (topFont) {
			for (const row of nonHeading) {
				const node = row.node;
				if (node.style?.fontFamily !== topFont) {
					continue;
				}
				metricNode = node;
				break;
			}
		}
	}

	if (metricNode) {
		const s = metricNode.style ?? {};
		if (s.fontWeight != null) {
			result.fontWeight = s.fontWeight;
		}
		if (s.lineHeightPx != null) {
			result.lineHeightPx = s.lineHeightPx;
		}
		if (s.letterSpacing != null) {
			result.letterSpacing = s.letterSpacing;
		}
		if (result.fontSize == null && s.fontSize != null) {
			result.fontSize = s.fontSize;
		}
		const ratio = lineHeightRatioFromStyle(s);
		if (ratio != null) {
			result.bodyLineHeightRatio = ratio;
		}
		const c = firstSolidHex(metricNode.fills);
		if (c) {
			result.color = c;
		}
	}

	return Object.keys(result).length ? result : null;
}

// ---------------------------------------------------------------------------
// Border width — most common from input / textarea nodes
// ---------------------------------------------------------------------------

function extractInputBorderWidth(nodes) {
	const counts = new Map();
	for (const node of nodes) {
		if (!/input|text.?field|textarea|search.?field|form.?field/i.test(node.name ?? '')) {
			continue;
		}
		const w = node.strokeWeight;
		if (typeof w !== 'number' || w <= 0 || !Array.isArray(node.strokes) || !node.strokes.length) {
			continue;
		}
		counts.set(w, (counts.get(w) ?? 0) + 1);
	}
	if (!counts.size) {
		return null;
	}
	return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// ---------------------------------------------------------------------------
// Input height — most common from input / textarea nodes
// ---------------------------------------------------------------------------

function extractInputHeight(nodes) {
	const counts = new Map();
	for (const node of nodes) {
		if (!/input|text.?field|textarea|search.?field|form.?field/i.test(node.name ?? '')) {
			continue;
		}
		const h = node.absoluteBoundingBox?.height;
		if (typeof h !== 'number' || h <= 0) {
			continue;
		}
		const rounded = Math.round(h);
		counts.set(rounded, (counts.get(rounded) ?? 0) + 1);
	}
	if (!counts.size) {
		return null;
	}
	return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// ---------------------------------------------------------------------------
// Input border radius — most common from input / textarea nodes
// ---------------------------------------------------------------------------

function extractInputBorderRadius(nodes) {
	const counts = countCornerRadiusByNamePattern(nodes, /(input|text.?field|textarea|search.?field|form.?field)/i);
	if (!counts.size) {
		return null;
	}
	return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// ---------------------------------------------------------------------------
// Border radius — most common from button nodes
// ---------------------------------------------------------------------------

function countCornerRadiusByNamePattern(nodes, re) {
	const counts = new Map();
	for (const node of nodes) {
		if (!['FRAME', 'COMPONENT', 'INSTANCE'].includes(node.type) || !re.test(node.name ?? '')) {
			continue;
		}
		const r = node.cornerRadius;
		if (typeof r !== 'number' || r < 0) {
			continue;
		}
		counts.set(r, (counts.get(r) ?? 0) + 1);
	}
	return counts;
}

function extractButtonBorderRadius(nodes) {
	const counts = countCornerRadiusByNamePattern(nodes, /(button|cta)/i);
	if (counts.size) {
		return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
	}
	const fromInputs = countCornerRadiusByNamePattern(nodes, /(input|text ?field|textarea|search ?field)/i);
	if (fromInputs.size) {
		return [...fromInputs.entries()].sort((a, b) => b[1] - a[1])[0][0];
	}
	return null;
}

// ---------------------------------------------------------------------------
// Container width — most common frame width in 900–1440 px
// ---------------------------------------------------------------------------

function extractContainerWidth(nodes) {
	const counts = new Map();
	for (const node of nodes) {
		if (node.type !== 'FRAME') {
			continue;
		}
		const w = node.absoluteBoundingBox?.width;
		if (typeof w !== 'number') {
			continue;
		}
		const rounded = Math.round(w);
		if (rounded < 900 || rounded > 1440) {
			continue;
		}
		counts.set(rounded, (counts.get(rounded) ?? 0) + 1);
	}
	if (!counts.size) {
		return null;
	}
	return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// ---------------------------------------------------------------------------
// Body background — large page/background-like surfaces, area weighted
// ---------------------------------------------------------------------------

const BACKGROUND_NAME_RE = /\b(background|bg|body|page|site|canvas|base|main)\b/i;
const BACKGROUND_SKIP_RE = /\b(button|card|badge|chip|icon|input|field|nav|header|footer|cta|modal|tooltip|popover|menu|logo|image|img|avatar|divider|line|text|heading|title)\b/i;

function getNodeFillHex(node) {
	return firstSolidHex(node.fills) || rgbToHex(node.backgroundColor);
}

function extractBodyBackgroundColor(nodes, colors) {
	const candidates = new Map();

	for (const node of nodes) {
		if (!['FRAME', 'SECTION', 'RECTANGLE'].includes(node.type)) {
			continue;
		}

		const name = node.name ?? '';
		if (BACKGROUND_SKIP_RE.test(name)) {
			continue;
		}

		const box = node.absoluteBoundingBox;
		if (!box || typeof box.width !== 'number' || typeof box.height !== 'number') {
			continue;
		}

		const width = Math.round(box.width);
		const height = Math.round(box.height);
		const area = width * height;
		const isExplicit = BACKGROUND_NAME_RE.test(name);
		const isLargeSurface = width >= 900 && height >= 400;

		if (!isExplicit && !isLargeSurface) {
			continue;
		}

		const hex = getNodeFillHex(node);
		if (!hex) {
			continue;
		}

		const current = candidates.get(hex) ?? { hex, score: 0, area: 0, explicitCount: 0 };
		current.area += area;
		current.explicitCount += isExplicit ? 1 : 0;
		current.score += area * (isExplicit ? 4 : 1);
		candidates.set(hex, current);
	}

	if (candidates.size) {
		return [...candidates.values()].sort((a, b) => b.score - a.score || b.area - a.area)[0].hex;
	}

	// Last resort: pick the lightest mono color, which is usually safer as a page background.
	const mono = Array.isArray(colors?.mono) ? colors.mono : [];
	return mono.length ? mono[mono.length - 1].hex : null;
}

// ---------------------------------------------------------------------------
// Buttons — top 2, palette colors preferred
// ---------------------------------------------------------------------------

/**
 * Relative luminance of a hex color (W3C formula, 0 = black, 1 = white).
 * Very light colors (luminance > 0.72) are almost certainly backgrounds,
 * not button fills, so we exclude them from button candidates.
 */
function hexLuminance(hex) {
	if (!hex || hex.length !== 7) {
		return 0;
	}
	const lin = (c) => {
		const v = parseInt(c, 16) / 255;
		return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
	};
	const r = lin(hex.slice(1, 3));
	const g = lin(hex.slice(3, 5));
	const b = lin(hex.slice(5, 7));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const BUTTON_MAX_LUMINANCE = 0.72; // above this → background color, not a button

/** Matches "primary" as a standalone word/variant value in a layer name. */
const PRIMARY_BUTTON_RE = /(^|\b|=|\(|\s)(primary)(\b|\)|\s|,|$)/i;
const SECONDARY_BUTTON_RE = /(^|\b|=|\(|\s)(secondary)(\b|\)|\s|,|$)/i;

/** Non-interactive states to ignore when scanning component variants. */
const SKIP_STATE_RE = /(hover|hovered|focus|active|pressed|disabled)/i;

function buildButtonEntry(node) {
	const textChild = findFirstTextNode(node);
	const s = textChild?.style ?? {};
	return {
		name: node.name,
		backgroundColor: firstSolidHex(node.fills),
		borderColor: firstSolidHex(node.strokes),
		borderWidth: Array.isArray(node.strokes) && node.strokes.length > 0 && (node.strokeWeight ?? 0) > 0
			? node.strokeWeight
			: null,
		borderRadius: node.cornerRadius ?? null,
		paddingX: node.paddingLeft ?? null,
		paddingY: node.paddingTop ?? null,
		height: node.absoluteBoundingBox?.height ?? null,
		fontFamily: s.fontFamily ?? null,
		fontWeight: s.fontWeight ?? null,
		fontSize: s.fontSize ?? null,
		letterSpacing: s.letterSpacing ?? null,
		textTransform: textCaseToCss(s.textCase),
		fontColor: firstSolidHex(textChild?.fills),
	};
}

function isValidButtonBg(hex) {
	return !!hex && hexLuminance(hex) <= BUTTON_MAX_LUMINANCE;
}

function extractButtons(nodes) {
	// Pre-pass: collect IDs of non-interactive COMPONENT variants whose parent
	// COMPONENT_SET is named "button" (not "cta" — CTA is also used for whole page
	// sections and causes false positives). Variant names look like
	// "Type=Primary, State=Default" — "button" lives in the parent set name.
	const buttonVariantIds = new Set();
	for (const node of nodes) {
		if (node.type !== 'COMPONENT_SET' || !/button/i.test(node.name ?? '')) {
			continue;
		}
		if (Array.isArray(node.children)) {
			for (const child of node.children) {
				if (child.type === 'COMPONENT' && !SKIP_STATE_RE.test(child.name ?? '')) {
					buttonVariantIds.add(child.id);
				}
			}
		}
	}

	// Main pass — collect all button candidates.
	// Nodes with "button" in their own name are included; "cta" is excluded (too noisy).
	// Variant components from button component sets are also included.
	const primaryCandidates = new Map(); // fingerprint → { count, entry }
	const secondaryCandidates = new Map();
	const generalFingerprints = new Map(); // fallback pool

	for (const node of nodes) {
		if (!['FRAME', 'COMPONENT', 'INSTANCE'].includes(node.type)) {
			continue;
		}
		const name = node.name ?? '';
		if (SKIP_STATE_RE.test(name)) {
			continue; // skip hover/disabled/etc. regardless of how we found the node
		}
		const isButtonNode = /button/i.test(name) || buttonVariantIds.has(node.id);
		if (!isButtonNode) {
			continue;
		}

		const bg = firstSolidHex(node.fills);
		if (!bg || !isValidButtonBg(bg)) {
			continue;
		}

		const entry = buildButtonEntry(node);
		const key = [bg, node.cornerRadius, node.paddingLeft, node.paddingTop, entry.fontSize, entry.fontWeight].join('|');

		const isPrimary = PRIMARY_BUTTON_RE.test(name);
		const isSecondary = SECONDARY_BUTTON_RE.test(name);
		const pool = isPrimary ? primaryCandidates : isSecondary ? secondaryCandidates : generalFingerprints;

		if (pool.has(key)) {
			pool.get(key).count += 1;
		} else {
			pool.set(key, { count: 1, entry });
		}
	}

	const byCount = (a, b) => b.count - a.count;

	// Named roles resolved directly — fast path
	const bestPrimary = [...primaryCandidates.values()].sort(byCount)[0]?.entry ?? null;
	const bestSecondary = [...secondaryCandidates.values()].sort(byCount)[0]?.entry ?? null;

	if (bestPrimary && bestSecondary) {
		return [bestPrimary, bestSecondary];
	}

	// Fallback: sort general pool by instance count (most repeated = most prominent).
	// Skip fingerprints already claimed by a named role.
	const usedKeys = new Set();
	if (bestPrimary) {
		usedKeys.add([bestPrimary.backgroundColor, bestPrimary.borderRadius, bestPrimary.paddingX, bestPrimary.paddingY, bestPrimary.fontSize, bestPrimary.fontWeight].join('|'));
	}
	if (bestSecondary) {
		usedKeys.add([bestSecondary.backgroundColor, bestSecondary.borderRadius, bestSecondary.paddingX, bestSecondary.paddingY, bestSecondary.fontSize, bestSecondary.fontWeight].join('|'));
	}

	const remaining = [...generalFingerprints.values()]
		.sort(byCount)
		.filter((c) => {
			const k = [c.entry.backgroundColor, c.entry.borderRadius, c.entry.paddingX, c.entry.paddingY, c.entry.fontSize, c.entry.fontWeight].join('|');
			return !usedKeys.has(k);
		})
		.map((c) => c.entry);

	const result = [];
	if (bestPrimary) {
		result.push(bestPrimary);
	}
	if (bestSecondary) {
		result.push(bestSecondary);
	}
	// Fill remaining slots — require a distinct background color per slot
	const usedColors = new Set(result.map((b) => b.backgroundColor));
	for (const entry of remaining) {
		if (result.length >= 2) {
			break;
		}
		if (usedColors.has(entry.backgroundColor)) {
			continue;
		}
		result.push(entry);
		usedColors.add(entry.backgroundColor);
	}

	return result;
}

// ---------------------------------------------------------------------------
// Links — most-used style + hover state from component variants
// ---------------------------------------------------------------------------

function findLinkHoverStyle(nodes) {
	for (const node of nodes) {
		if (node.type !== 'COMPONENT_SET' || !/link/i.test(node.name ?? '')) {
			continue;
		}
		const children = Array.isArray(node.children) ? node.children : [];
		const hoverVariant = children.find((c) => /hover/i.test(c.name ?? ''));
		if (!hoverVariant) {
			continue;
		}
		const hoverText = findFirstTextNode(hoverVariant);
		if (!hoverText) {
			continue;
		}
		return {
			colorHover: firstSolidHex(hoverText.fills),
			textDecorationHover: textDecorationToCss(hoverText.style?.textDecoration),
		};
	}
	return {};
}

function extractLinks(nodes, styleRegistry) {
	// Only match TEXT nodes that have a shared text style explicitly named with "link".
	// Matching by layer/node name is too broad — designers name annotation layers anything,
	// and those get picked up as false positives. If no shared link style exists, skip.
	const styleCounts = new Map();

	for (const node of nodes) {
		if (node.type !== 'TEXT') {
			continue;
		}
		const styleId = node.styles?.text ?? null;
		if (!styleId) {
			continue; // no shared style → not an intentional link style
		}
		const styleName = styleRegistry[styleId]?.name ?? '';
		if (!/link/i.test(styleName)) {
			continue;
		}
		const key = buildTypographyKey(node.style ?? {});
		if (styleCounts.has(key)) {
			styleCounts.get(key).count += 1;
		} else {
			styleCounts.set(key, { count: 1, node, label: styleName });
		}
	}

	if (!styleCounts.size) {
		return null; // no explicit link style in this Figma file — skip the section
	}

	const { node, label } = [...styleCounts.values()].sort((a, b) => b.count - a.count)[0];
	const s = node.style ?? {};

	const result = {};
	if (label) {
		result.name = label;
	}
	const color = firstSolidHex(node.fills);
	if (color) {
		result.color = color;
	}
	if (s.letterSpacing != null) {
		result.letterSpacing = s.letterSpacing;
	}
	if (s.fontWeight != null) {
		result.fontWeight = s.fontWeight;
	}
	const td = textDecorationToCss(s.textDecoration);
	result.textDecoration = td; // include even if "none" — it's explicitly set

	// Hover state from component set variants
	const hover = findLinkHoverStyle(nodes);
	if (hover.colorHover) {
		result.colorHover = hover.colorHover;
	}
	if (hover.textDecorationHover != null) {
		result.textDecorationHover = hover.textDecorationHover;
	}

	return result;
}

// ---------------------------------------------------------------------------
// variable_mapping.csv — figma_key column (node name search in figma-sync)
// ---------------------------------------------------------------------------

/**
 * @param {import('node:fs').PathOrFileDescriptor} [csvPath]
 */
function parseVariableMappingCsvForKeyed(csvPath) {
	const raw = readFileSync(
		csvPath ?? path.resolve(process.cwd(), 'scripts/variable_mapping_figma_sync.csv'),
		'utf-8',
	);
	const lines = raw.split('\n');
	const first = lines.find((l) => l.trim() && l.includes('figma_path'));
	if (!first) {
		return [];
	}
	/** Minimal CSV line parser (quoted fields) */
	const parseLine = (trimmed) => {
		const fields = [];
		let i = 0;
		while (i < trimmed.length) {
			if (trimmed[i] === '"') {
				let value = '';
				i++;
				while (i < trimmed.length) {
					if (trimmed[i] === '"' && trimmed[i + 1] === '"') {
						value += '"';
						i += 2;
					} else if (trimmed[i] === '"') {
						i++;
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
		return fields;
	};

	const header = parseLine(first.trim());
	// Support both old schema (slug/figma_key) and new schema (figma_sync_slug/figma_tag)
	const idxSlug = header.indexOf('figma_sync_slug') >= 0 ? header.indexOf('figma_sync_slug') : header.indexOf('slug');
	const idxFigmaKey = header.indexOf('figma_tag') >= 0 ? header.indexOf('figma_tag') : header.indexOf('figma_key');
	const idxFigmaPath = header.indexOf('figma_path');
	if (idxSlug < 0 || idxFigmaPath < 0 || idxFigmaKey < 0) {
		return [];
	}

	const slugCol = idxSlug === header.indexOf('figma_sync_slug') ? 'figma_sync_slug' : 'slug';

	const rows = [];
	for (const line of lines) {
		const t = line.trim();
		if (!t || t.startsWith(`${slugCol},`) || t.startsWith('slug,') || t.startsWith('figma_sync_slug,')) {
			continue;
		}
		const cells = parseLine(t);
		const slug = (cells[idxSlug] ?? '').trim();
		if (!slug || /^(VARIOUS|SPACING|COLORS|TYPOGRAPHY|BUTTONS|BREAKPOINTS|LINKS|BODY|HEADING|INPUT)/.test(slug)) {
			continue;
		}
		const key = (cells[idxFigmaKey] ?? '').trim();
		const fig = (cells[idxFigmaPath] ?? '').trim();
		if (fig === 'NULL' || key === 'NULL') {
			continue;
		}
		if (key && fig) {
			rows.push({ slug, figmaKey: key, figmaPath: fig });
		}
	}
	return rows;
}

/**
 * First node in document order whose name includes `key` (case-insensitive).
 * (Plan name: extractByKey.)
 */
function extractByKey(allNodes, key) {
	if (!key) {
		return null;
	}
	const k = key.toLowerCase();
	return allNodes.find((n) => (n.name ?? '').toString().toLowerCase().includes(k)) ?? null;
}

/**
 * All nodes in document order whose name includes `key` (case-insensitive).
 */
function extractAllByKey(allNodes, key) {
	if (!key) return [];
	const k = key.toLowerCase();
	// Prefer nodes whose name is exactly the tag (or wrapped in brackets like "(RV tag)")
	const exact = allNodes.filter((n) => {
		const name = (n.name ?? '').toLowerCase();
		return name === k || name === `(${k})` || name === `[${k}]`;
	});
	if (exact.length > 0) return exact;
	// Fall back to substring match
	return allNodes.filter((n) => (n.name ?? '').toString().toLowerCase().includes(k));
}

/**
 * Extract a value from a Figma node to align with a figma_path from variable_mapping.
 */
function extractFigmaValueForKeyNode(node, figmaPath) {
	if (!node || !figmaPath) {
		return null;
	}
	const p = String(figmaPath).trim();
	const mBtn = /^buttons\.[0-9]+\.([a-zA-Z0-9_]+)$/.exec(p);
	if (mBtn) {
		const entry = buildButtonEntry(node);
		if (entry && mBtn[1] in entry) {
			return entry[mBtn[1]];
		}
	}
	if (p === 'bodyBackgroundColor') {
		// TEXT nodes are labels/annotations, not background containers — skip them
		if (node.type === 'TEXT') return null;
		return getNodeFillHex(node);
	}
	if (p === 'body.color' && node.type === 'TEXT') {
		return firstSolidHex(node.fills);
	}
	if (p === 'body.color') {
		return firstSolidHex(findFirstTextNode(node)?.fills) ?? getNodeFillHex(node);
	}
	if (p.endsWith('.hex')) {
		return getNodeFillHex(node) ?? firstSolidHex(node.fills);
	}
	const last = p.split('.').filter(Boolean).pop() ?? '';
	if (['backgroundColor', 'borderColor'].includes(last) || p.includes('Color')) {
		if (['fontColor', 'textColor', 'contentColor', 'linkColor', 'linkHoverColor'].some((k) => p.includes(k)) || last === 'fontColor') {
			if (node.type === 'TEXT') {
				return firstSolidHex(node.fills);
			}
			return firstSolidHex(findFirstTextNode(node)?.fills);
		}
		if (p.includes('headings') && p.includes('color')) {
			if (node.type === 'TEXT') {
				return firstSolidHex(node.fills);
			}
			return firstSolidHex(findFirstTextNode(node)?.fills);
		}
		return getNodeFillHex(node) ?? firstSolidHex(node.fills);
	}
	if (p.includes('headings') && p.includes('fontSize')) {
		if (node.type === 'TEXT' && node.style?.fontSize) {
			return node.style.fontSize;
		}
		const t = findFirstTextNode(node);
		return t?.style?.fontSize ?? null;
	}
	if (p.includes('headings') && p.includes('fontFamily')) {
		if (node.type === 'TEXT' && node.style?.fontFamily) {
			return node.style.fontFamily;
		}
		const t = findFirstTextNode(node);
		return t?.style?.fontFamily ?? null;
	}
	if (p.includes('headings') && p.includes('fontWeight')) {
		if (node.type === 'TEXT' && node.style?.fontWeight != null) {
			return node.style.fontWeight;
		}
		return findFirstTextNode(node)?.style?.fontWeight ?? null;
	}
	if (p.includes('paragraph')) {
		const t = node.type === 'TEXT' ? node : findFirstTextNode(node);
		if (!t?.style) {
			return null;
		}
		if (p.includes('fontSize') && t.style.fontSize != null) {
			return t.style.fontSize;
		}
		if (p.includes('lineHeight') && t.style.lineHeightPx != null) {
			return t.style.lineHeightPx;
		}
	}
	if (p === 'borderWidth' || last === 'borderWidth') {
		if (node.type === 'TEXT' && p.includes('body')) {
			return null;
		}
		if (!Array.isArray(node.strokes) || !node.strokes.length || !(node.strokeWeight > 0)) {
			return null;
		}
		return node.strokeWeight;
	}
	if (p === 'borderRadius' || last === 'borderRadius' || p.includes('borderRadius')) {
		return node.cornerRadius ?? null;
	}
	if (last === 'containerWidth' || p === 'containerWidth') {
		return node.absoluteBoundingBox?.width != null ? Math.round(node.absoluteBoundingBox.width) : null;
	}
	if (p.includes('body.') && p.includes('fontSize')) {
		if (node.type === 'TEXT' && node.style?.fontSize != null) {
			return node.style.fontSize;
		}
		return findFirstTextNode(node)?.style?.fontSize ?? null;
	}
	if (p.includes('body.') && p.includes('fontWeight')) {
		if (node.type === 'TEXT' && node.style?.fontWeight != null) {
			return node.style.fontWeight;
		}
		return findFirstTextNode(node)?.style?.fontWeight ?? null;
	}
	if (p.includes('body') && p.includes('letterSpacing')) {
		if (node.type === 'TEXT' && node.style?.letterSpacing != null) {
			return node.style.letterSpacing;
		}
		return findFirstTextNode(node)?.style?.letterSpacing ?? null;
	}
	// e.g. body.bodyLineHeightRatio
	if (p === 'body.bodyLineHeightRatio' || p.includes('bodyLineHeightRatio') || p.includes('bodylineheight')) {
		if (node.type === 'TEXT') {
			return lineHeightRatioFromStyle(node.style);
		}
		return lineHeightRatioFromStyle(findFirstTextNode(node)?.style);
	}
	if (p.includes('links') || last === 'color' || p.includes('linkColor')) {
		if (node.type === 'TEXT') {
			return firstSolidHex(node.fills);
		}
		return firstSolidHex(findFirstTextNode(node)?.fills);
	}
	if (last === 'fontFamily' || p.includes('fontFamily')) {
		if (node.type === 'TEXT' && node.style?.fontFamily) {
			return node.style.fontFamily;
		}
		return findFirstTextNode(node)?.style?.fontFamily ?? null;
	}
	if (last === 'height' || p === 'inputHeight' || p.includes('Height')) {
		return node.absoluteBoundingBox?.height != null ? Math.round(node.absoluteBoundingBox.height) : null;
	}
	// last resort: if node is TEXT, try fontSize and fills
	if (node.type === 'TEXT' && last === 'fontSize') {
		return node.style?.fontSize ?? null;
	}
	return null;
}

/**
 * @returns {Record<string, string | number | null | undefined>|null}
 */
function buildKeyedBySlug(allNodes) {
	const spec = parseVariableMappingCsvForKeyed();
	if (spec.length === 0) {
		return null;
	}
	/** @type {Record<string, string | number | null | undefined>} */
	const out = {};
	for (const { slug, figmaKey, figmaPath } of spec) {
		const n = extractByKey(allNodes, figmaKey);
		if (!n) {
			continue;
		}
		const v = extractFigmaValueForKeyNode(n, figmaPath);
		if (v == null) {
			continue;
		}
		out[slug] = v;
	}
	return Object.keys(out).length ? out : null;
}

/**
 * Build a map of { [figmaTag]: { [figmaPath]: extractedValue } } for every
 * unique figma_tag in the CSV.  The node is looked up ONCE per unique tag;
 * every figma_path associated with that tag is then extracted from that node.
 * This lets figma-apply resolve any (tag, path) pair against the
 * authoritative tagged element rather than falling back to heuristic extraction.
 *
 * @returns {Record<string, Record<string, string|number>> | null}
 */
function buildTaggedNodes(allNodes) {
	const spec = parseVariableMappingCsvForKeyed();
	if (spec.length === 0) return null;

	// Group paths by figma_tag
	/** @type {Map<string, string[]>} */
	const pathsByTag = new Map();
	for (const { figmaKey, figmaPath } of spec) {
		if (!figmaKey || !figmaPath) continue;
		if (!pathsByTag.has(figmaKey)) pathsByTag.set(figmaKey, []);
		pathsByTag.get(figmaKey).push(figmaPath);
	}

	/** Node-type priority: structural containers first, then components, then text labels last */
	const nodeTypePriority = (type) => {
		if (['FRAME', 'SECTION', 'RECTANGLE', 'ELLIPSE', 'VECTOR', 'POLYGON', 'STAR'].includes(type)) return 0;
		if (['COMPONENT', 'INSTANCE', 'COMPONENT_SET'].includes(type)) return 1;
		if (['GROUP'].includes(type)) return 2;
		if (type === 'TEXT') return 10; // labels/annotations always last for fill extraction
		return 5;
	};

	const out = {};
	for (const [tag, paths] of pathsByTag) {
		const allMatches = extractAllByKey(allNodes, tag);
		if (allMatches.length === 0) continue;

		// Sort: exact or close name matches first, then by node type (containers before text)
		const tagLower = tag.toLowerCase();
		const candidateNodes = [...allMatches].sort((a, b) => {
			const aName = (a.name ?? '').toLowerCase();
			const bName = (b.name ?? '').toLowerCase();
			// Prefer nodes whose name *is* (or closely wraps) the tag — e.g. "(RV background color)"
			const aExact = aName === tagLower || aName === `(${tagLower})` || aName === `[${tagLower}]`;
			const bExact = bName === tagLower || bName === `(${tagLower})` || bName === `[${tagLower}]`;
			if (aExact !== bExact) return aExact ? -1 : 1;
			// Then prefer structural node types over text labels
			return nodeTypePriority(a.type) - nodeTypePriority(b.type);
		});

		const props = {};
		for (const figmaPath of paths) {
			// Use the first candidate that can provide a non-null value for this path.
			const v = candidateNodes
				.map((n) => extractFigmaValueForKeyNode(n, figmaPath))
				.find((val) => val != null);
			if (v != null) props[figmaPath] = v;
		}
		if (Object.keys(props).length > 0) out[tag] = props;
	}
	return Object.keys(out).length ? out : null;
}

// ---------------------------------------------------------------------------
// Main extractor
// ---------------------------------------------------------------------------

function buildCssStyleExport(figmaPayload, sourceInfo) {
	const extractionSteps = 10;
	let extractionStep = 0;
	const tick = () => {
		extractionStep += 1;
		progressBar('Extracting', extractionStep, extractionSteps);
	};

	log('Building style registry...');
	const styleRegistry = buildStyleRegistry(figmaPayload?.styles);

	log('Walking all nodes...');
	const allNodes = [];
	walkNodes(figmaPayload?.document, (n) => allNodes.push(n));
	log(`  Found ${allNodes.length.toLocaleString()} nodes.`);

	log('Extracting colors...');
	const colors = extractColors(allNodes, styleRegistry);
	tick();

	log('Extracting headings (H1-H6, desktop then mobile)...');
	const headings = extractHeadings(allNodes, styleRegistry);
	tick();

	log('Extracting body font properties...');
	const body = extractBody(allNodes, styleRegistry);
	tick();

	log('Extracting paragraph sizes...');
	const paragraphSizes = extractParagraphSizes(allNodes, styleRegistry, body);
	tick();

	log('Extracting input border width...');
	const borderWidth = extractInputBorderWidth(allNodes);
	tick();

	log('Extracting input height...');
	const inputHeight = extractInputHeight(allNodes);

	log('Extracting input border radius...');
	const inputBorderRadius = extractInputBorderRadius(allNodes);

	log('Extracting button border radius...');
	const borderRadius = extractButtonBorderRadius(allNodes);
	tick();

	log('Extracting container width...');
	const containerWidth = extractContainerWidth(allNodes);
	tick();

	log('Extracting body background color...');
	const bodyBackgroundColor = extractBodyBackgroundColor(allNodes, colors);
	tick();

	log('Extracting buttons...');
	const buttons = extractButtons(allNodes);
	tick();

	log('Extracting link style...');
	const links = extractLinks(allNodes, styleRegistry);
	tick();

	// ── Secondary font family: prefer headings → buttons → body fallback ──────
	// Override whatever extractBody detected as secondary with the dominant font
	// found in headings (most semantically intentional source), then buttons,
	// only keeping the body-text fallback if neither differs from the primary.
	if (body) {
		const hFonts = [...(headings.desktop ?? []), ...(headings.mobile ?? [])]
			.map((h) => h.fontFamily)
			.filter(Boolean);
		const hCounts = hFonts.reduce((m, f) => m.set(f, (m.get(f) ?? 0) + 1), new Map());
		const dominantHeadingFont = [...hCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

		if (dominantHeadingFont && dominantHeadingFont !== body.fontFamilyPrimary) {
			body.fontFamilySecondary = dominantHeadingFont;
			log(`  Secondary font resolved from headings: ${dominantHeadingFont}`);
		} else {
			// Fall back to button font if it differs from primary
			const btnFont = buttons[0]?.fontFamily ?? null;
			if (btnFont && btnFont !== body.fontFamilyPrimary) {
				body.fontFamilySecondary = btnFont;
				log(`  Secondary font resolved from buttons: ${btnFont}`);
			} else if (body.fontFamilySecondary) {
				log(`  Secondary font kept from body detection: ${body.fontFamilySecondary}`);
			}
		}
	}

	const sections = ['colors', 'headings'];
	if (paragraphSizes) {
		sections.push('paragraphSizes');
	}
	if (body) {
		sections.push('body');
	}
	if (borderWidth != null) {
		sections.push('borderWidth');
	}
	if (inputHeight != null) {
		sections.push('inputHeight');
	}
	if (inputBorderRadius != null) {
		sections.push('inputBorderRadius');
	}
	if (borderRadius != null) {
		sections.push('borderRadius');
	}
	if (containerWidth != null) {
		sections.push('containerWidth');
	}
	if (bodyBackgroundColor) {
		sections.push('bodyBackgroundColor');
	}
	sections.push('buttons');
	if (links) {
		sections.push('links');
	}

	const keyedBySlug = buildKeyedBySlug(allNodes);
	if (keyedBySlug) {
		sections.push('keyedBySlug');
	}

	const taggedNodes = buildTaggedNodes(allNodes);
	if (taggedNodes) {
		sections.push('taggedNodes');
	}

	const result = {
		meta: {
			generatedAt: new Date().toISOString(),
			source: sourceInfo,
			totalNodesScanned: allNodes.length,
			sections,
		},
		colors,
		headings,
	};

	if (paragraphSizes) {
		result.paragraphSizes = paragraphSizes;
	}
	if (body) {
		result.body = body;
	}
	if (borderWidth != null) {
		result.borderWidth = borderWidth;
	}
	if (inputHeight != null) {
		result.inputHeight = inputHeight;
	}
	if (inputBorderRadius != null) {
		result.inputBorderRadius = inputBorderRadius;
	}
	if (borderRadius != null) {
		result.borderRadius = borderRadius;
	}
	if (containerWidth != null) {
		result.containerWidth = containerWidth;
	}
	if (bodyBackgroundColor) {
		result.bodyBackgroundColor = bodyBackgroundColor;
	}
	result.buttons = buttons;
	if (links) {
		result.links = links;
	}
	if (keyedBySlug) {
		result.keyedBySlug = keyedBySlug;
	}
	if (taggedNodes) {
		result.taggedNodes = taggedNodes;
	}

	return result;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
	const rl = readline.createInterface({ input, output });

	try {
		// Fail fast if token is missing before asking for the URL
		const tokenCheck = getFigmaTokenFromEnv();
		if (!tokenCheck) {
			console.error(`\n  ✖  FIGMA_ACCESS_TOKEN is not set in .env`);
			console.error(`  Add the following to your .env file and re-run:\n`);
			console.error(`  FIGMA_ACCESS_TOKEN=your_personal_access_token\n`);
			console.error(`  Get a token at: https://www.figma.com/developers/api#access-tokens\n`);
			process.exit(1);
		}

		const figmaUrlInput = await rl.question('Figma URL: ');
		let figmaToken = await waitForFigmaToken(
			rl,
			`Figma access token not found. Define ${FIGMA_TOKEN_ENV_KEY} in .env.`,
		);

		if (!figmaUrlInput.trim()) {
			throw new Error('Figma URL is required.');
		}

		const parsed = parseFigmaUrl(figmaUrlInput);
		if (!parsed) {
			throw new Error('Could not parse file key from Figma URL.');
		}

		const sourceInfo = { url: figmaUrlInput.trim(), fileKey: parsed.fileKey };

		for (let attempt = 1; attempt <= 3; attempt += 1) {
			try {
				console.log(`\nFetching Figma file: ${parsed.fileKey}`);
				log(`Rareview Starter Theme - Figma Sync`);
				log(`Generated at: ${new Date().toISOString()}`);
				log(`Source URL: ${sourceInfo.url}`);
				log(`File key: ${sourceInfo.fileKey}`);
				log('');
				const figmaPayload = await fetchFigmaFile(parsed.fileKey, figmaToken);
				const exportPayload = buildCssStyleExport(figmaPayload, sourceInfo);

				log('Writing figma-export.json...');
				await fs.mkdir(path.dirname(EXPORT_FILE_PATH), { recursive: true });
				await fs.writeFile(EXPORT_FILE_PATH, `${JSON.stringify(exportPayload, null, 2)}\n`, 'utf8');

				const stats = await fs.stat(EXPORT_FILE_PATH);
				log('');
				log(`Saved: ${EXPORT_FILE_PATH} (${Math.round(stats.size / 1024)} KB)`);
				log(`  Colors (chromatic/mono): ${exportPayload.colors.colored.length} / ${exportPayload.colors.mono.length}`);
				log(`  Headings (desktop/mobile): ${exportPayload.headings.desktop.length} / ${exportPayload.headings.mobile.length}`);
				if (exportPayload.paragraphSizes) {
					log(`  Paragraph sizes: desktop(${Object.keys(exportPayload.paragraphSizes.desktop ?? {}).join(',')}) mobile(${Object.keys(exportPayload.paragraphSizes.mobile ?? {}).join(',')})`);
				}
				if (exportPayload.body?.fontFamilyPrimary) {
					log(`  Body font: ${exportPayload.body.fontFamilyPrimary}`);
				}
				if (exportPayload.bodyBackgroundColor) {
					log(`  Body background color: ${exportPayload.bodyBackgroundColor}`);
				}
				log(`  Border width: ${exportPayload.borderWidth ?? 'n/a'}  Border radius: ${exportPayload.borderRadius ?? 'n/a'}  Input height: ${exportPayload.inputHeight ?? 'n/a'}  Input border radius: ${exportPayload.inputBorderRadius ?? 'n/a'}`);
				log(`  Container width: ${exportPayload.containerWidth ?? 'n/a'}`);
				log(`  Buttons: ${exportPayload.buttons.length}  Links: ${exportPayload.links ? 1 : 0}`);
				await writeSyncLog();
				if (!VERBOSE) {
					console.log(`Saved figma-export.json (${Math.round(stats.size / 1024)} KB)`);
				}
				break;
			} catch (error) {
				if (hasMissingScope(error) && attempt < 3) {
					figmaToken = await waitForFigmaToken(
						rl,
						`\nToken missing required scopes. Update ${FIGMA_TOKEN_ENV_KEY} in .env.`,
					);
					continue;
				}
				throw error;
			}
		}
	} finally {
		rl.close();
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
