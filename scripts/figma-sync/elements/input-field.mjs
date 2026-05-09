import { countCornerRadiusByNamePattern } from '../lib/corner-radius.mjs';
import { findFirstTextNode } from '../lib/node-utils.mjs';

// ─── Constants ────────────────────────────────────────────────────────────────

const INPUT_NAME_RE = /input|text.?field|textarea|search.?field|form.?field/i;

/**
 * Max height for input field nodes in the structural heuristic.
 * Typical single-line inputs are 36–64 px; cap at 80 px to exclude textareas
 * and large containers that happen to have a border.
 */
const INPUT_MAX_HEIGHT = 80;

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

// ─── Sub-extractors (accept any node list) ────────────────────────────────────

/**
 * @param {object[]} nodes
 * @param {boolean}  requireName  When false, skips the INPUT_NAME_RE filter.
 *                                Used for scoped nodes (already inside an Inputs frame).
 */
function extractBorderWidth(nodes, requireName = true) {
	const counts = new Map();
	for (const node of nodes) {
		if (requireName && !INPUT_NAME_RE.test(node.name ?? '')) continue;
		const w = node.strokeWeight;
		if (typeof w !== 'number' || w <= 0 || !Array.isArray(node.strokes) || !node.strokes.length) continue;
		counts.set(w, (counts.get(w) ?? 0) + 1);
	}
	return counts.size ? [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
}

function extractHeight(nodes, requireName = true) {
	const counts = new Map();
	for (const node of nodes) {
		if (requireName && !INPUT_NAME_RE.test(node.name ?? '')) continue;
		const h = node.absoluteBoundingBox?.height;
		if (typeof h !== 'number' || h <= 0) continue;
		const rounded = Math.round(h);
		counts.set(rounded, (counts.get(rounded) ?? 0) + 1);
	}
	return counts.size ? [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
}

function extractBorderRadius(nodes, requireName = true) {
	if (requireName) {
		const counts = countCornerRadiusByNamePattern(nodes, INPUT_NAME_RE);
		return counts.size ? [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
	}
	// Without name filtering, count cornerRadius on FRAME/INSTANCE nodes directly.
	const counts = new Map();
	for (const node of nodes) {
		if (!['FRAME', 'INSTANCE'].includes(node.type)) continue;
		const r = node.cornerRadius;
		if (typeof r !== 'number' || r < 0) continue;
		counts.set(r, (counts.get(r) ?? 0) + 1);
	}
	return counts.size ? [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
}

function buildResult(borderWidth, height, borderRadius) {
	if (borderWidth == null && height == null && borderRadius == null) return null;
	const out = {};
	if (borderWidth  != null) out.borderWidth  = borderWidth;
	if (height       != null) out.height        = height;
	if (borderRadius != null) out.borderRadius  = borderRadius;
	return out;
}

// ─── Structural heuristic ─────────────────────────────────────────────────────

/**
 * Identify input fields by visual structure rather than layer names:
 * - FRAME / RECTANGLE / INSTANCE
 * - height ≤ INPUT_MAX_HEIGHT
 * - stroke weight between INPUT_STROKE_MIN and INPUT_STROKE_MAX
 * - contains a TEXT child with placeholder-like text OR reduced opacity
 */
function runInputHeuristic(nodes) {
	const borderWidthCounts  = new Map();
	const heightCounts       = new Map();
	const radiusCounts       = new Map();

	for (const node of nodes) {
		if (!['FRAME', 'RECTANGLE', 'INSTANCE'].includes(node.type)) continue;

		const h = node.absoluteBoundingBox?.height ?? 0;
		if (h <= 0 || h > INPUT_MAX_HEIGHT) continue;

		const stroke = node.strokeWeight;
		if (
			!Array.isArray(node.strokes) ||
			!node.strokes.length ||
			typeof stroke !== 'number' ||
			stroke < INPUT_STROKE_MIN ||
			stroke > INPUT_STROKE_MAX
		) continue;

		const textNode = findFirstTextNode(node);
		if (!textNode) continue;

		const chars = textNode.characters ?? '';
		const isPlaceholderText    = PLACEHOLDER_RE.test(chars);
		const isLowOpacityText     = typeof textNode.opacity === 'number' && textNode.opacity < 0.7;
		if (!isPlaceholderText && !isLowOpacityText) continue;

		const rounded = Math.round(h);
		heightCounts.set(rounded, (heightCounts.get(rounded) ?? 0) + 1);
		borderWidthCounts.set(stroke, (borderWidthCounts.get(stroke) ?? 0) + 1);

		const r = node.cornerRadius;
		if (typeof r === 'number' && r >= 0) {
			radiusCounts.set(r, (radiusCounts.get(r) ?? 0) + 1);
		}
	}

	const borderWidth  = borderWidthCounts.size ? [...borderWidthCounts.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
	const height       = heightCounts.size      ? [...heightCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]      : null;
	const borderRadius = radiusCounts.size      ? [...radiusCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]      : null;

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
	// 1. Keyword-scoped pass — no name filter needed (already in the right frame).
	if (scopedNodes?.length) {
		const result = buildResult(
			extractBorderWidth(scopedNodes, false),
			extractHeight(scopedNodes, false),
			extractBorderRadius(scopedNodes, false),
		);
		if (result) return result;
	}

	// 2. Full-document pass with name filtering (existing behaviour).
	const result = buildResult(
		extractBorderWidth(nodes, true),
		extractHeight(nodes, true),
		extractBorderRadius(nodes, true),
	);
	if (result) return result;

	// 3. Structural heuristic — stroke + placeholder text + height constraint.
	return runInputHeuristic(nodes);
}
