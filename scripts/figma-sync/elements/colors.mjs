import { hexLuminance, isMonoColor, rgbToHex, firstSolidHex } from '../lib/color-utils.mjs';

// ─── Swatch detection constants ───────────────────────────────────────────────

/** Semantic colour role keywords, checked against the swatch layer name. */
const SWATCH_ROLE_MAP = [
	[/primary/i,           'primary'],
	[/secondary/i,         'secondary'],
	[/neutral|gray|grey/i, 'neutral'],
	[/accent/i,            'accent'],
	[/brand/i,             'brand'],
	[/success/i,           'success'],
	[/warning/i,           'warning'],
	[/error|danger/i,      'error'],
	[/info/i,              'info'],
];

/** Hex-code-like string anywhere in a layer name (e.g. "#3B82F6", "3B82F6"). */
const HEX_IN_NAME_RE = /#?[0-9a-fA-F]{6}\b/;

/**
 * Max dimension (px) of a node to qualify as a swatch.
 * Prevents large background rectangles / banners from being treated as swatches.
 */
const SWATCH_MAX_DIM = 300;

// ─── Swatch helpers ───────────────────────────────────────────────────────────

function getSwatchRole(name) {
	for (const [re, role] of SWATCH_ROLE_MAP) {
		if (re.test(name)) return role;
	}
	return null;
}

/**
 * Try to extract a curated swatch list from nodes that are already scoped to a
 * colour palette frame (e.g. "Colors", "Palette", "Brand").
 *
 * Accepts RECTANGLE, ELLIPSE, or roughly-square FRAME/COMPONENT nodes that carry
 * a solid fill. Falls back to ALL coloured fills in the scoped area (without
 * semantic names) if named swatches are insufficient.
 *
 * Returns null when fewer than 2 unique colours are found so the caller can fall
 * back to the frequency-based approach.
 */
function extractSwatches(scopedNodes) {
	const seen   = new Set();
	const result = [];

	for (const node of scopedNodes) {
		if (!['RECTANGLE', 'ELLIPSE', 'FRAME', 'COMPONENT', 'INSTANCE'].includes(node.type)) continue;

		const fill = firstSolidHex(node.fills);
		if (!fill || seen.has(fill)) continue;

		const w = node.absoluteBoundingBox?.width  ?? 0;
		const h = node.absoluteBoundingBox?.height ?? 0;
		if (w <= 0 || h <= 0 || w > SWATCH_MAX_DIM || h > SWATCH_MAX_DIM) continue;

		const name = node.name ?? '';
		const hasSemanticName = SWATCH_ROLE_MAP.some(([re]) => re.test(name));
		const hasHexInName    = HEX_IN_NAME_RE.test(name);
		// Within a colour palette frame any roughly square coloured shape is a swatch.
		const aspectRatio = Math.min(w, h) / Math.max(w, h);
		const isSquarish  = aspectRatio > 0.35;

		if (!hasSemanticName && !hasHexInName && !isSquarish) continue;

		seen.add(fill);
		result.push({
			hex:        fill,
			name:       name || null,
			role:       getSwatchRole(name),
			usageCount: 0,
		});
	}

	return result.length >= 2 ? result : null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {object[]} nodes         Flat list of ALL Figma document nodes.
 * @param {object}   styleRegistry Map of styleId → { name }.
 * @param {object[]|null} [scopedNodes] Descendants of keyword-matched palette frames
 *   (e.g. "Colors", "Palette", "Brand"). When provided, swatch detection is
 *   attempted first before falling back to the frequency-based approach.
 */
export function extractColors(nodes, styleRegistry, scopedNodes = null) {
	// ── Pass 1: curated swatch detection inside scoped palette frames ──────────
	let swatches = null;
	if (scopedNodes?.length) {
		swatches = extractSwatches(scopedNodes);
	}

	// ── Pass 2: frequency-based approach (existing logic) ─────────────────────
	const byHex = new Map();

	for (const node of nodes) {
		for (const fill of Array.isArray(node.fills) ? node.fills : []) {
			if (fill?.type !== 'SOLID' || fill?.visible === false) continue;
			const hex = rgbToHex(fill.color);
			if (!hex) continue;
			const styleId   = node.styles?.fill ?? null;
			const styleName = styleId ? (styleRegistry[styleId]?.name ?? null) : null;
			if (!byHex.has(hex)) {
				byHex.set(hex, { hex, name: styleName, usageCount: 0 });
			}
			const entry = byHex.get(hex);
			entry.usageCount += 1;
			if (!entry.name && styleName) entry.name = styleName;
		}
	}

	const all = [...byHex.values()].sort((a, b) => b.usageCount - a.usageCount);

	const monoCandidates = all.filter((c) => {
		if (!isMonoColor(c.hex)) return false;
		const L = hexLuminance(c.hex);
		return L > 0.02 && L < 0.98;
	});
	// `all` is already sorted by usageCount desc; keep that order for top picks.
	const mono = monoCandidates.slice(0, 4);

	const colored = all
		.filter((c) => !isMonoColor(c.hex))
		.slice(0, 10);

	const result = { colored, mono };

	// Attach swatches when found — enriches the output with semantic roles without
	// replacing the existing colored/mono structure that variable-mapping depends on.
	if (swatches) {
		result.swatches = swatches;
	}

	return result;
}
