import { firstSolidHex } from '../lib/color-utils.mjs';
import { walkNodes } from '../lib/node-utils.mjs';
import { textCaseToCss } from '../lib/typography-css.mjs';

// ─── Pattern constants ────────────────────────────────────────────────────────

/** Strict h1-h6 match: "H1", "H1/Desktop", "Desktop/H1", "h-3" */
export const HEADING_LEVEL_RE = /(^|\b|\/)(h[1-6])(\b|\/|-|$)/i;

/**
 * Extended match: "Heading 1", "Heading-2", "Title 3", "Display 1", "Headline 2"
 * Captures the numeric level in group 2.
 */
const HEADING_EXTENDED_RE = /\b(heading|title|display|headline)[\s\-_]?([1-6])\b/i;

/**
 * Containers (pages, frames, sections) worth deep-scanning for typography specs.
 * Matched case-insensitively against node names.
 */
const TYPOGRAPHY_CONTAINER_RE =
	/\b(heading|headings|typography|type[\s\-_]?scale|style[\s\-_]?guide|design[\s\-_]?system|foundations?|ui[\s\-_]?kit)\b/i;

/** Mobile context indicator. */
const MOBILE_RE = /mobile|phone|\bsm\b/i;

/**
 * UI / decorative labels that should not be promoted as heading specimens.
 * A node matching this is skipped unless it ALSO has an explicit h1-h6 style name.
 */
const UI_SKIP_RE =
	/\b(button|cta|label|nav|menu|tab|chip|badge|tag|input|field|helper|hint|caption|eyebrow|meta|breadcrumb|footer|header|icon|logo|search|filter|sort|tooltip|popover|annotation|note|comment|overline|kicker|divider)\b/i;

// ─── Shared helpers ───────────────────────────────────────────────────────────

export function isMobileContext(name) {
	return MOBILE_RE.test(name ?? '');
}

/**
 * Resolve heading level (1-6) from any label string.
 * Returns 99 when no level can be determined.
 */
export function headingLevel(name) {
	const s = name ?? '';
	// Strict: H1, h1, h-1
	let m = /h([1-6])/i.exec(s);
	if (m) return parseInt(m[1], 10);
	// Extended: "Heading 2", "Title 3", "Display 1", "Headline 4"
	m = /\b(heading|title|display|headline)[\s\-_]?([1-6])\b/i.exec(s);
	if (m) return parseInt(m[2], 10);
	return 99;
}

function getStyleName(node, styleRegistry) {
	const styleId = node.styles?.text ?? null;
	return styleId ? styleRegistry[styleId]?.name ?? '' : '';
}

function buildCandidate(node, label) {
	const s = node.style;
	return {
		name: label || node.name || '',
		fontFamily: s.fontFamily ?? null,
		fontWeight: s.fontWeight ?? null,
		fontSize: s.fontSize ?? null,
		lineHeightPx: s.lineHeightPx ?? null,
		letterSpacing: s.letterSpacing ?? null,
		textTransform: textCaseToCss(s.textCase),
		color: firstSolidHex(node.fills),
	};
}

function addToSlot(slots, slotKey, candidate) {
	if (!slots.has(slotKey)) slots.set(slotKey, []);
	const existing = slots.get(slotKey);
	const dup = existing.some(
		(c) => c.fontFamily === candidate.fontFamily && c.fontSize === candidate.fontSize,
	);
	if (!dup) existing.push(candidate);
}

/**
 * Pick the best candidate for each slot; resolve desktop/mobile arrays sorted H1→H6.
 * The dominant font family across all candidates is preferred within each slot.
 */
function pickBestCandidates(slots) {
	const fontCounts = new Map();
	for (const candidates of slots.values()) {
		for (const c of candidates) {
			if (c.fontFamily) {
				fontCounts.set(c.fontFamily, (fontCounts.get(c.fontFamily) ?? 0) + 1);
			}
		}
	}
	const dominantFont = [...fontCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

	const desktop = [];
	const mobile = [];

	for (const [slotKey, candidates] of slots.entries()) {
		const [levelStr, context] = slotKey.split(':');
		const level = parseInt(levelStr, 10);
		const withDominant = dominantFont
			? candidates.filter((c) => c.fontFamily === dominantFont)
			: [];
		const pool = withDominant.length > 0 ? withDominant : candidates;
		const best = pool.sort((a, b) => (b.fontSize ?? 0) - (a.fontSize ?? 0))[0];
		if (!best) continue;
		if (context === 'desktop') {
			desktop.push({ _level: level, ...best });
		} else {
			mobile.push({ _level: level, ...best });
		}
	}

	const sortAndClean = (arr) =>
		arr.sort((a, b) => a._level - b._level).map(({ _level, ...rest }) => rest);

	return { desktop: sortAndClean(desktop), mobile: sortAndClean(mobile) };
}

// ─── Pass 1 + 2: Targeted named discovery ─────────────────────────────────────

/**
 * Collects heading slots via explicit naming.
 *
 * Sources checked in priority order for each TEXT node:
 *   1. Shared text-style name from the Figma style registry (h1-h6 or extended).
 *   2. Layer name matching h1-h6 or extended patterns.
 *   3. Characters content used as an annotation label (only within detected
 *      typography container frames, and only when ≤15 chars long).
 *
 * Typography containers — CANVAS pages, FRAMEs, SECTIONs, or GROUPs whose name
 * matches TYPOGRAPHY_CONTAINER_RE — are detected first so that annotation-style
 * style guides ("H1 / Heading 1" written as actual text) are captured too.
 */
function collectTargeted(allNodes, styleRegistry) {
	const slots = new Map();

	// Identify typography containers so we can enable characters-based matching inside them.
	const containerTextNodes = new Set();
	for (const node of allNodes) {
		if (
			['CANVAS', 'FRAME', 'SECTION', 'GROUP'].includes(node.type) &&
			TYPOGRAPHY_CONTAINER_RE.test(node.name ?? '')
		) {
			walkNodes(node, (n) => {
				if (n.type === 'TEXT') containerTextNodes.add(n);
			});
		}
	}

	for (const node of allNodes) {
		if (node.type !== 'TEXT' || !node.style?.fontSize) continue;

		const styleName = getStyleName(node, styleRegistry);
		const nodeName = node.name ?? '';
		const chars = typeof node.characters === 'string' ? node.characters.trim() : '';

		// Nodes obviously labelled as UI chrome: skip unless an explicit h1-h6
		// style name overrides (e.g. a button with a heading text-style applied).
		if (UI_SKIP_RE.test(nodeName) && !HEADING_LEVEL_RE.test(styleName) && !HEADING_EXTENDED_RE.test(styleName)) {
			continue;
		}

		let label = '';

		if (HEADING_LEVEL_RE.test(styleName) || HEADING_EXTENDED_RE.test(styleName)) {
			// Priority 1: shared text-style name
			label = styleName;
		} else if (HEADING_LEVEL_RE.test(nodeName) || HEADING_EXTENDED_RE.test(nodeName)) {
			// Priority 2: layer name
			label = nodeName;
		} else if (
			containerTextNodes.has(node) &&
			chars.length > 0 &&
			chars.length <= 15 &&
			(HEADING_LEVEL_RE.test(chars) || HEADING_EXTENDED_RE.test(chars))
		) {
			// Priority 3: annotation text inside a typography container
			// e.g. a text layer whose content is literally "H1" or "Heading 2"
			label = chars;
		} else {
			continue;
		}

		const level = headingLevel(label);
		if (level === 99) continue;

		const context = isMobileContext(label) ? 'mobile' : 'desktop';
		addToSlot(slots, `${level}:${context}`, buildCandidate(node, label));
	}

	return slots;
}

// ─── Pass 3: Heuristic fallback ───────────────────────────────────────────────

/**
 * Derives body baseline font size from the file when no external value is provided.
 * Uses the most character-heavy font size across all TEXT nodes (same signal as
 * extractBody uses internally).
 */
function guessBodyFontSize(allNodes) {
	const charsBySize = new Map();
	for (const node of allNodes) {
		if (node.type !== 'TEXT' || !node.style?.fontSize) continue;
		const len = typeof node.characters === 'string' ? node.characters.length : 1;
		const size = node.style.fontSize;
		charsBySize.set(size, (charsBySize.get(size) ?? 0) + len);
	}
	if (!charsBySize.size) return 16;
	return [...charsBySize.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Statistically assigns heading levels based on font size distribution.
 * Only called when targeted discovery yields no results.
 *
 * Step A — Baseline: use the supplied body font size (or derive it).
 * Step B — Candidates: large (>= 1.20× body), short (≤ 120 chars) text nodes
 *           that are not UI elements. Nodes are scored to prefer short, prominent
 *           text (hero titles, section headings) over incidental large text.
 * Step C — Rank: unique font sizes sorted descending → H1, H2, … H6.
 *           Font weight is intentionally ignored so weight variations of the
 *           same heading level don't fragment the hierarchy.
 */
function collectHeuristic(allNodes, bodyFontSize) {
	const BODY_SIZE =
		typeof bodyFontSize === 'number' && bodyFontSize > 0
			? bodyFontSize
			: guessBodyFontSize(allNodes);

	const MIN_RATIO = 1.2; // must be at least 20 % larger than body
	const MAX_CHARS = 120; // genuine headings are brief

	/** @type {Map<number, { count: number, representative: object, minChars: number, score: number }>} */
	const desktopSizes = new Map();
	const mobileSizes = new Map();

	for (const node of allNodes) {
		if (node.type !== 'TEXT' || !node.style?.fontSize) continue;

		const s = node.style;
		const nodeName = node.name ?? '';

		if (s.fontSize < BODY_SIZE * MIN_RATIO) continue;
		if (UI_SKIP_RE.test(nodeName)) continue;

		const chars = typeof node.characters === 'string' ? node.characters.length : 0;
		if (chars > MAX_CHARS) continue;

		// Score: short + large = more heading-like
		const ratio = s.fontSize / BODY_SIZE;
		const brevityScore = chars > 0 ? Math.max(0, (MAX_CHARS - chars) / MAX_CHARS) : 0.5;
		const sizeScore = Math.min(ratio, 4) / 4; // cap contribution at 4× body
		const score = brevityScore * 0.6 + sizeScore * 0.4;

		// Group by fontSize only — fontWeight is intentionally ignored per spec
		const size = s.fontSize;
		const sizeMap = isMobileContext(nodeName) ? mobileSizes : desktopSizes;

		const prev = sizeMap.get(size);
		if (!prev) {
			sizeMap.set(size, { count: 1, representative: node, minChars: chars, score });
		} else {
			prev.count += 1;
			// Upgrade representative when this node scores better (or equally good but shorter)
			if (score > prev.score || (score === prev.score && chars < prev.minChars)) {
				prev.representative = node;
				prev.minChars = chars;
				prev.score = score;
			}
		}
	}

	function sizeMapToSlots(sizeMap, context) {
		const slots = new Map();
		const sortedSizes = [...sizeMap.keys()].sort((a, b) => b - a).slice(0, 6);
		sortedSizes.forEach((size, i) => {
			const { representative } = sizeMap.get(size);
			const candidate = buildCandidate(representative, representative.name || '');
			addToSlot(slots, `${i + 1}:${context}`, candidate);
		});
		return slots;
	}

	const merged = new Map([
		...sizeMapToSlots(desktopSizes, 'desktop'),
		...sizeMapToSlots(mobileSizes, 'mobile'),
	]);
	return merged;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Extract H1-H6 heading styles for desktop and mobile contexts.
 *
 * Discovery hierarchy:
 *   1. Shared text-style names (Figma style registry)  — highest confidence
 *   2. Layer names matching h1-h6 / heading-1-6
 *   3. Annotation text inside Typography/Style-Guide frames
 *   ── if none of the above yield any result ──
 *   4. Statistical heuristic: largest distinct font sizes above body baseline
 *
 * @param {object[]} allNodes       Flat list of all Figma document nodes.
 * @param {object}   styleRegistry  Built by buildStyleRegistry().
 * @param {number|null} [bodyFontSize]  Body baseline size; used by the heuristic
 *                                   to establish the "above body" threshold.
 *                                   Pass null to derive from the file automatically.
 */
export function extractHeadings(allNodes, styleRegistry, bodyFontSize = null) {
	const targetedSlots = collectTargeted(allNodes, styleRegistry);

	const slots = targetedSlots.size > 0
		? targetedSlots
		: collectHeuristic(allNodes, bodyFontSize);

	return pickBestCandidates(slots);
}
