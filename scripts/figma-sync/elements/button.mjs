import { countCornerRadiusByNamePattern } from '../lib/corner-radius.mjs';
import { firstSolidHex, hexHue, hexLuminance } from '../lib/color-utils.mjs';
import { walkNodes } from '../lib/node-utils.mjs';
import { textCaseToCss } from '../lib/typography-css.mjs';

/**
 * Circular hue distance (0-180) between two hue angles.
 * Lower = closer in color.
 */
function hueDistance(h1, h2) {
	const d = Math.abs(h1 - h2) % 360;
	return d > 180 ? 360 - d : d;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BUTTON_MAX_LUMINANCE = 0.72;

const PRIMARY_BUTTON_RE = /(^|\b|=|\(|\s)(primary)(\b|\)|\s|,|$)/i;
const SECONDARY_BUTTON_RE = /(^|\b|=|\(|\s)(secondary)(\b|\)|\s|,|$)/i;
const SKIP_STATE_RE = /(hover|hovered|focus|active|pressed|disabled)/i;

/** Layer names that are reliably the visible button label. */
const LABEL_NAME_RE = /^(label|text|caption|button[_\s-]?text|title|copy)$/i;

/**
 * Structural-heuristic size limits.
 * Nodes larger than these are almost certainly not standalone button components.
 */
const BUTTON_MAX_HEIGHT = 80;  // px — typical buttons are 32–64 px tall
const BUTTON_MAX_WIDTH  = 500; // px — wide CTAs can be ~300 px; component frames are rarely >500 px

// ─── Text node helpers ────────────────────────────────────────────────────────

/**
 * Return the best TEXT node to use as the button label.
 *
 * Preference order:
 *   1. A node whose layer name looks like a label ("Label", "Text", …)
 *   2. The longest non-empty text string (avoids single-glyph icon fonts)
 *   3. The first TEXT node in DFS order
 */
function findButtonTextNode(node) {
	const textNodes = [];
	walkNodes(node, (n) => {
		if (n !== node && n.type === 'TEXT') {
			textNodes.push(n);
		}
	});
	if (textNodes.length === 0) return null;
	if (textNodes.length === 1) return textNodes[0];

	const namedLabel = textNodes.find((n) => LABEL_NAME_RE.test(n.name ?? ''));
	if (namedLabel) return namedLabel;

	// Prefer multi-character nodes; single glyphs are usually icon fonts.
	const multiChar = textNodes.filter((n) => (n.characters ?? '').length > 1);
	if (multiChar.length > 0) {
		return multiChar.reduce((best, n) =>
			(n.characters ?? '').length > (best.characters ?? '').length ? n : best,
		);
	}
	return textNodes[0];
}

// ─── Entry builder ────────────────────────────────────────────────────────────

/**
 * @param {object} node
 * @param {string|null} [fallbackFontColor]    Used when the text node has no fills —
 *   happens with INSTANCE nodes whose label hasn't been overridden (Figma stores
 *   the fill only on the master COMPONENT variant).
 * @param {number|null} [fallbackBorderRadius] Used when node.cornerRadius is undefined —
 *   same reason: INSTANCE nodes inherit the value from the master COMPONENT.
 */
export function buildButtonEntry(node, fallbackFontColor = null, fallbackBorderRadius = null) {
	const textChild = findButtonTextNode(node);
	const s = textChild?.style ?? {};
	return {
		name: node.name,
		backgroundColor: firstSolidHex(node.fills),
		borderColor: firstSolidHex(node.strokes),
		borderWidth: Array.isArray(node.strokes) && node.strokes.length > 0 && (node.strokeWeight ?? 0) > 0
			? node.strokeWeight
			: null,
		borderRadius: node.cornerRadius ?? fallbackBorderRadius,
		paddingX: node.paddingLeft ?? null,
		paddingY: node.paddingTop ?? null,
		height: node.absoluteBoundingBox?.height ?? null,
		fontFamily: s.fontFamily ?? null,
		fontWeight: s.fontWeight ?? null,
		fontSize: s.fontSize ?? null,
		letterSpacing: s.letterSpacing ?? null,
		textTransform: textCaseToCss(s.textCase),
		fontColor: firstSolidHex(textChild?.fills) ?? fallbackFontColor,
	};
}

function isValidButtonBg(hex) {
	return !!hex && hexLuminance(hex) <= BUTTON_MAX_LUMINANCE;
}

// ─── Pre-pass: build component recognition maps ───────────────────────────────

/**
 * Walk all nodes once to build:
 * - buttonVariantIds: COMPONENT IDs that belong to button COMPONENT_SETs
 * - componentTextColor: per-variant text fill colour (fallback for INSTANCE nodes)
 * - componentRadius: per-variant corner radius (fallback for INSTANCE nodes)
 */
function buildButtonMaps(nodes) {
	const buttonVariantIds = new Set();
	const componentTextColor = new Map();
	const componentRadius    = new Map();

	for (const node of nodes) {
		if (node.type !== 'COMPONENT_SET' || !/button/i.test(node.name ?? '')) {
			continue;
		}
		for (const child of (Array.isArray(node.children) ? node.children : [])) {
			if (child.type !== 'COMPONENT' || SKIP_STATE_RE.test(child.name ?? '')) {
				continue;
			}
			buttonVariantIds.add(child.id);

			const textNode = findButtonTextNode(child);
			const color = firstSolidHex(textNode?.fills);
			if (color) componentTextColor.set(child.id, color);

			const r = child.cornerRadius;
			if (typeof r === 'number' && r >= 0) componentRadius.set(child.id, r);
		}
	}
	return { buttonVariantIds, componentTextColor, componentRadius };
}

// ─── Main counting pass ───────────────────────────────────────────────────────

/**
 * Run the frequency-based button detection on the given node list.
 * Returns a (possibly empty) array of up to 2 button entries, WITHOUT the
 * link-colour sort applied (caller handles that).
 */
function collectButtonCandidates(searchNodes, buttonVariantIds, componentTextColor, componentRadius) {
	const primaryCandidates   = new Map();
	const secondaryCandidates = new Map();
	const generalFingerprints = new Map();

	for (const node of searchNodes) {
		if (!['FRAME', 'INSTANCE'].includes(node.type)) continue;
		const name = node.name ?? '';
		if (SKIP_STATE_RE.test(name)) continue;

		const isButtonNode =
			/button/i.test(name) ||
			(node.type === 'INSTANCE' && buttonVariantIds.has(node.componentId ?? ''));
		if (!isButtonNode) continue;

		const bg = firstSolidHex(node.fills);
		if (!bg || !isValidButtonBg(bg)) continue;

		const componentId = node.componentId ?? '';
		const fallbackFontColor    = node.type === 'INSTANCE' ? (componentTextColor.get(componentId) ?? null) : null;
		const fallbackBorderRadius = node.type === 'INSTANCE' ? (componentRadius.get(componentId)    ?? null) : null;
		const entry = buildButtonEntry(node, fallbackFontColor, fallbackBorderRadius);
		const key = [bg, node.cornerRadius, node.paddingLeft, node.paddingTop, entry.fontSize, entry.fontWeight].join('|');

		const isPrimary   = PRIMARY_BUTTON_RE.test(name);
		const isSecondary = SECONDARY_BUTTON_RE.test(name);
		const pool = isPrimary ? primaryCandidates : isSecondary ? secondaryCandidates : generalFingerprints;

		const weight = node.type === 'INSTANCE' ? 2 : 1;
		if (pool.has(key)) {
			pool.get(key).count += weight;
		} else {
			pool.set(key, { count: weight, entry });
		}
	}

	return resolveButtonPools(primaryCandidates, secondaryCandidates, generalFingerprints);
}

function resolveButtonPools(primaryCandidates, secondaryCandidates, generalFingerprints) {
	const byCount = (a, b) => b.count - a.count;

	const bestPrimary   = [...primaryCandidates.values()].sort(byCount)[0]?.entry ?? null;
	const bestSecondary = [...secondaryCandidates.values()].sort(byCount)[0]?.entry ?? null;

	if (bestPrimary && bestSecondary) return [bestPrimary, bestSecondary];

	const usedKeys = new Set();
	const entryKey = (e) => [e.backgroundColor, e.borderRadius, e.paddingX, e.paddingY, e.fontSize, e.fontWeight].join('|');
	if (bestPrimary)   usedKeys.add(entryKey(bestPrimary));
	if (bestSecondary) usedKeys.add(entryKey(bestSecondary));

	const remaining = [...generalFingerprints.values()]
		.sort(byCount)
		.filter((c) => !usedKeys.has(entryKey(c.entry)))
		.map((c) => c.entry);

	const result = [];
	if (bestPrimary)   result.push(bestPrimary);
	if (bestSecondary) result.push(bestSecondary);

	const usedColors = new Set(result.map((b) => b.backgroundColor));
	for (const entry of remaining) {
		if (result.length >= 2) break;
		if (usedColors.has(entry.backgroundColor)) continue;
		result.push(entry);
		usedColors.add(entry.backgroundColor);
	}
	return result;
}

// ─── Structural heuristic ─────────────────────────────────────────────────────

/**
 * Find button-like shapes without relying on layer names.
 * Criteria: FRAME/INSTANCE with solid non-white fill + padding + short centred
 * text label, constrained to BUTTON_MAX_HEIGHT × BUTTON_MAX_WIDTH.
 */
function collectHeuristicButtons(nodes) {
	const candidates = new Map();

	for (const node of nodes) {
		if (!['FRAME', 'INSTANCE'].includes(node.type)) continue;

		const h = node.absoluteBoundingBox?.height ?? 0;
		const w = node.absoluteBoundingBox?.width  ?? 0;
		if (h <= 0 || h > BUTTON_MAX_HEIGHT || w <= 0 || w > BUTTON_MAX_WIDTH) continue;

		const bg = firstSolidHex(node.fills);
		if (!bg || !isValidButtonBg(bg)) continue;

		if (typeof node.paddingLeft !== 'number' || node.paddingLeft <= 0) continue;

		const textNode = findButtonTextNode(node);
		if (!textNode) continue;
		if ((textNode.characters ?? '').length > 30) continue;
		if (textNode.style?.textAlignHorizontal !== 'CENTER') continue;

		const entry = buildButtonEntry(node);
		const key = [bg, node.cornerRadius, node.paddingLeft, node.paddingTop, entry.fontSize, entry.fontWeight].join('|');
		if (candidates.has(key)) {
			candidates.get(key).count += 1;
		} else {
			candidates.set(key, { count: 1, entry });
		}
	}

	const result = [];
	const usedColors = new Set();
	for (const { entry } of [...candidates.values()].sort((a, b) => b.count - a.count)) {
		if (result.length >= 2) break;
		if (usedColors.has(entry.backgroundColor)) continue;
		result.push(entry);
		usedColors.add(entry.backgroundColor);
	}
	return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {object[]} nodes        Flat list of ALL Figma document nodes.
 * @param {string|null} [linkColor]  Dominant link hex colour (tie-breaker for primary).
 * @param {object[]|null} [scopedNodes] Pre-filtered descendants of keyword-matched
 *   frames (e.g. "Buttons", "UI Components"). Tried first before falling back to nodes.
 */
export function extractButtons(nodes, linkColor = null, scopedNodes = null) {
	// Pre-pass always runs on ALL nodes so COMPONENT_SET definitions in library
	// sections are picked up regardless of which frame scope is active.
	const { buttonVariantIds, componentTextColor, componentRadius } = buildButtonMaps(nodes);

	// 1. Keyword-scoped pass — highest confidence.
	if (scopedNodes?.length) {
		const result = collectButtonCandidates(scopedNodes, buttonVariantIds, componentTextColor, componentRadius);
		if (result.length) return sortByLinkColor(result, linkColor);
	}

	// 2. Full-document pass — existing behaviour.
	const result = collectButtonCandidates(nodes, buttonVariantIds, componentTextColor, componentRadius);
	if (result.length) return sortByLinkColor(result, linkColor);

	// 3. Structural heuristic — last resort for designs with no "button" naming.
	return sortByLinkColor(collectHeuristicButtons(nodes), linkColor);
}

/**
 * If a link color is available, ensure the button whose background is closest
 * in hue to that link color occupies position 0 (primary).
 * Links and primary buttons nearly always share the brand color, making this a
 * reliable tie-breaker when explicit "primary" / "secondary" labels are absent.
 */
function sortByLinkColor(result, linkColor) {
	if (!linkColor || result.length < 2) return result;
	const linkHue = hexHue(linkColor);
	const d0 = hueDistance(hexHue(result[0].backgroundColor ?? ''), linkHue);
	const d1 = hueDistance(hexHue(result[1].backgroundColor ?? ''), linkHue);
	return d1 < d0 ? [result[1], result[0]] : result;
}

export function extractButtonBorderRadius(nodes) {
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
