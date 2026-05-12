import { countCornerRadiusByNamePattern } from '../lib/corner-radius.mjs';
import { findFirstTextNode } from '../lib/node-utils.mjs';

// ─── Constants (aligned with button structural caps where applicable) ───────

/** Same cap as `BUTTON_MAX_HEIGHT` in `button.mjs` — single-line fields, not full pages. */
const INPUT_MAX_HEIGHT = 80;

/** Same cap as `BUTTON_MAX_WIDTH` in `button.mjs` — ignore huge layout wrappers. */
const INPUT_MAX_WIDTH = 500;

/**
 * Minimum size so icon-only frames (arrows, chevrons, 16×16 assets) are never counted.
 * Typical inputs are at least ~32px tall and wider than a glyph strip.
 */
const INPUT_MIN_HEIGHT = 32;
const INPUT_MIN_WIDTH = 80;

const INPUT_NAME_RE = /input|text.?field|textarea|search.?field|form.?field/i;

/**
 * Stroke weights recognised as an input field border.
 * Most design systems use 1–3 px; anything larger is likely a decorative shape.
 */
const INPUT_STROKE_MIN = 1;
const INPUT_STROKE_MAX = 3;

/**
 * Placeholder text patterns. Italic / reduced-opacity text is also accepted
 * but requires text content as the primary signal here.
 */
const PLACEHOLDER_RE = /enter|type|your|e\.g\.|placeholder|search|write|fill\s*in|\.\.\.|@|\.(com|org|net)/i;

const INPUT_FIELD_TYPES = ['FRAME', 'RECTANGLE', 'INSTANCE'];

/** Icon / decorative layer names — never treat as input sources (substring, case-insensitive). */
const DECORATIVE_NAME_RE = /arrow|icon|chevron|caret|glyph|sprite/i;

// ─── Shared sizing & eligibility (scoped + named + heuristic) ────────────────

function isExcludedDecorativeInputName(name) {
	return DECORATIVE_NAME_RE.test(String(name ?? ''));
}

/**
 * Enforces the same width/height band as button heuristic caps (max) plus a minimum
 * so tiny controls (icons inside buttons) never register as inputs.
 */
function nodePassesInputFieldSizing(node) {
	if (!INPUT_FIELD_TYPES.includes(node.type)) {
		return false;
	}
	const box = node.absoluteBoundingBox;
	if (!box || typeof box.width !== 'number' || typeof box.height !== 'number') {
		return false;
	}
	const w = box.width;
	const h = box.height;
	if (h < INPUT_MIN_HEIGHT || h > INPUT_MAX_HEIGHT) {
		return false;
	}
	if (w < INPUT_MIN_WIDTH || w > INPUT_MAX_WIDTH) {
		return false;
	}
	return true;
}

/**
 * True when a TEXT descendant looks like field content (placeholder, hint, or
 * multi-character copy) — not a lone icon glyph inside a decorative frame.
 */
function hasInputStyleTextChild(node) {
	const t = findFirstTextNode(node);
	if (!t) {
		return false;
	}
	const chars = String(t.characters ?? '').trim();
	const lowOpacity = typeof t.opacity === 'number' && t.opacity < 0.7;
	if (chars.length === 0) {
		return lowOpacity;
	}
	if (chars.length === 1) {
		return lowOpacity || PLACEHOLDER_RE.test(chars);
	}
	if (PLACEHOLDER_RE.test(chars)) {
		return true;
	}
	if (lowOpacity) {
		return true;
	}
	return chars.length >= 2;
}

/**
 * @param {boolean} requireName  When true, require INPUT_NAME_RE on the node (full-document pass).
 *                                When false (scoped pass), require structural text signal instead.
 */
function isBaseInputFieldCandidate(node, requireName) {
	if (!nodePassesInputFieldSizing(node)) {
		return false;
	}
	if (isExcludedDecorativeInputName(node.name)) {
		return false;
	}
	if (requireName) {
		return INPUT_NAME_RE.test(node.name ?? '');
	}
	return hasInputStyleTextChild(node);
}

// ─── Sub-extractors (accept any node list) ────────────────────────────────────

/**
 * @param {object[]} nodes
 * @param {boolean}  requireName  When false, skips the INPUT_NAME_RE filter.
 *                                Used for scoped nodes (already inside an Inputs frame).
 */
function extractBorderWidth(nodes, requireName = true) {
	const counts = new Map();
	for (const node of nodes) {
		if (!isBaseInputFieldCandidate(node, requireName)) {
			continue;
		}
		const w = node.strokeWeight;
		if (typeof w !== 'number' || w <= 0 || !Array.isArray(node.strokes) || !node.strokes.length) {
			continue;
		}
		if (w < INPUT_STROKE_MIN || w > INPUT_STROKE_MAX) {
			continue;
		}
		counts.set(w, (counts.get(w) ?? 0) + 1);
	}
	return counts.size ? [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
}

function extractHeight(nodes, requireName = true) {
	const counts = new Map();
	for (const node of nodes) {
		if (!isBaseInputFieldCandidate(node, requireName)) {
			continue;
		}
		const h = node.absoluteBoundingBox?.height;
		if (typeof h !== 'number' || h <= 0) {
			continue;
		}
		const rounded = Math.round(h);
		counts.set(rounded, (counts.get(rounded) ?? 0) + 1);
	}
	return counts.size ? [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
}

function extractBorderRadius(nodes, requireName = true) {
	const filtered = nodes.filter((n) => isBaseInputFieldCandidate(n, requireName));
	if (requireName) {
		const counts = countCornerRadiusByNamePattern(filtered, INPUT_NAME_RE);
		return counts.size ? [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
	}
	const counts = new Map();
	for (const node of filtered) {
		if (!['FRAME', 'INSTANCE'].includes(node.type)) {
			continue;
		}
		const r = node.cornerRadius;
		if (typeof r !== 'number' || r < 0) {
			continue;
		}
		counts.set(r, (counts.get(r) ?? 0) + 1);
	}
	return counts.size ? [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
}

function buildResult(borderWidth, height, borderRadius) {
	if (borderWidth == null && height == null && borderRadius == null) {
		return null;
	}
	const out = {};
	if (borderWidth != null) {
		out.borderWidth = borderWidth;
	}
	if (height != null) {
		out.height = height;
	}
	if (borderRadius != null) {
		out.borderRadius = borderRadius;
	}
	return out;
}

// ─── Structural heuristic ─────────────────────────────────────────────────────

/**
 * Identify input fields by visual structure rather than layer names:
 * - FRAME / RECTANGLE / INSTANCE
 * - same min/max width & height as named/scoped passes (`nodePassesInputFieldSizing`)
 * - stroke weight between INPUT_STROKE_MIN and INPUT_STROKE_MAX
 * - not decorative/icon name
 * - contains a TEXT child that passes `hasInputStyleTextChild` signal
 */
function runInputHeuristic(nodes) {
	const borderWidthCounts = new Map();
	const heightCounts = new Map();
	const radiusCounts = new Map();

	for (const node of nodes) {
		if (!isBaseInputFieldCandidate(node, false)) {
			continue;
		}

		const stroke = node.strokeWeight;
		if (
			!Array.isArray(node.strokes) ||
			!node.strokes.length ||
			typeof stroke !== 'number' ||
			stroke < INPUT_STROKE_MIN ||
			stroke > INPUT_STROKE_MAX
		) {
			continue;
		}

		const h = node.absoluteBoundingBox?.height ?? 0;
		const rounded = Math.round(h);
		heightCounts.set(rounded, (heightCounts.get(rounded) ?? 0) + 1);
		borderWidthCounts.set(stroke, (borderWidthCounts.get(stroke) ?? 0) + 1);

		const r = node.cornerRadius;
		if (typeof r === 'number' && r >= 0) {
			radiusCounts.set(r, (radiusCounts.get(r) ?? 0) + 1);
		}
	}

	const borderWidth = borderWidthCounts.size ? [...borderWidthCounts.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
	const height = heightCounts.size ? [...heightCounts.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
	const borderRadius = radiusCounts.size ? [...radiusCounts.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;

	return buildResult(borderWidth, height, borderRadius);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {object[]} nodes        Flat list of ALL Figma document nodes.
 * @param {object[]|null} [scopedNodes] Descendants of keyword-matched input frames
 *   (e.g. "Inputs", "Forms", "Text Fields"). Tried without name filtering first.
 * @returns {{ borderWidth?: number, height?: number, borderRadius?: number } | null}
 */
export function extractInputField(nodes, scopedNodes = null) {
	// 1. Keyword-scoped pass — same sizing / decor / text rules as document pass, but
	//    `requireName` is false so layer name need not say "input".
	if (scopedNodes?.length) {
		const result = buildResult(
			extractBorderWidth(scopedNodes, false),
			extractHeight(scopedNodes, false),
			extractBorderRadius(scopedNodes, false),
		);
		if (result) {
			return result;
		}
	}

	// 2. Full-document pass — require input-like naming plus the same structural filters.
	const result = buildResult(
		extractBorderWidth(nodes, true),
		extractHeight(nodes, true),
		extractBorderRadius(nodes, true),
	);
	if (result) {
		return result;
	}

	// 3. Structural heuristic — stroke + text signal + sizing (no input name required).
	return runInputHeuristic(nodes);
}
