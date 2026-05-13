import { firstSolidHex } from '../lib/color-utils.mjs';
import { getNodeFillHex, walkNodes } from '../lib/node-utils.mjs';
import { textCaseToCss } from '../lib/typography-css.mjs';
import { HEADING_LEVEL_RE } from './headings.mjs';

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

function paraSlotKey(label) {
	const isMobile = MOBILE_PARA_RE.test(label);
	const context = isMobile ? 'mobile' : 'desktop';
	const isSmall = SIZE_SMALL_RE.test(label);
	const isLarge = SIZE_LARGE_RE.test(label);
	const size = isSmall ? 'small' : isLarge ? 'large' : 'medium';
	return `${context}:${size}`;
}

function paraSizeValue(entry) {
	return typeof entry?.fontSize === 'number' && Number.isFinite(entry.fontSize) ? entry.fontSize : null;
}

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

	if (unique.length >= 3) {
		return {
			small: buildParaEntry({ ...bodyStyle, fontSize: unique[0] }),
			medium: buildParaEntry({ ...bodyStyle, fontSize: unique[1] }),
			large: buildParaEntry({ ...bodyStyle, fontSize: unique[2] }),
		};
	}

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
 */
export function extractParagraphSizes(nodes, _styleRegistry, body) {
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

	const bodyPrimary = body?.fontFamilyPrimary ?? null;

	const desktop = { small: null, medium: null, large: null };
	const mobile = { small: null, medium: null, large: null };

	for (const [key, candidates] of slots.entries()) {
		const [context, size] = key.split(':');
		const withPreferred = bodyPrimary
			? candidates.filter((c) => c.fontFamily === bodyPrimary)
			: [];
		const best = (withPreferred.length > 0 ? withPreferred : candidates)[0];
		if (!best) {
			continue;
		}
		if (context === 'desktop') {
			desktop[size] = best.entry;
		} else {
			mobile[size] = best.entry;
		}
	}

	const hasAllSixExplicit = [desktop.small, desktop.medium, desktop.large, mobile.small, mobile.medium, mobile.large].every(
		(v) => paraSizeValue(v) != null,
	);

	const bfs = typeof body?.fontSize === 'number' && Number.isFinite(body.fontSize) ? body.fontSize : null;
	let desktopBase = bfs ?? DEFAULT_DESKTOP_MEDIUM;
	if (!Number.isFinite(desktopBase)) {
		desktopBase = DEFAULT_DESKTOP_MEDIUM;
	}

	const mediumDelta = DEFAULT_DESKTOP_MEDIUM - DEFAULT_MOBILE_MEDIUM;
	let mobileBase = desktopBase - mediumDelta;
	if (!Number.isFinite(mobileBase)) {
		mobileBase = DEFAULT_MOBILE_MEDIUM;
	}

	const desktopSmallDelta = DEFAULT_DESKTOP_MEDIUM - DEFAULT_DESKTOP_SMALL;
	const desktopLargeDelta = DEFAULT_DESKTOP_LARGE - DEFAULT_DESKTOP_MEDIUM;
	const mobileSmallDelta = DEFAULT_MOBILE_MEDIUM - DEFAULT_MOBILE_SMALL;
	const mobileLargeDelta = DEFAULT_MOBILE_LARGE - DEFAULT_MOBILE_MEDIUM;

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
		Object.assign(desktop, normalizeParaTriplet(desktop, desktopStyle, GAP));
		Object.assign(mobile, normalizeParaTriplet(mobile, mobileStyle, GAP));
	}

	Object.assign(desktop, normalizeParaTriplet(desktop, desktopStyle, GAP));
	Object.assign(mobile, normalizeParaTriplet(mobile, mobileStyle, GAP));

	if (Object.values(desktop).every((v) => !v) && Object.values(mobile).every((v) => !v)) {
		return null;
	}

	const result = {};
	if (bodyPrimary) {
		result.fontFamily = bodyPrimary;
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

export function lineHeightRatioFromStyle(s) {
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

export function extractBody(nodes, styleRegistry) {
	const BODY_MIN_CHARS = 20;
	const UI_TEXT_RE =
		/\b(button|cta|label|nav|menu|tab|chip|badge|tag|input|field|helper|hint|caption|eyebrow|meta|breadcrumb|footer|header|icon|logo|search|filter|sort)\b/i;

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

	const paragraphLike = nonHeading.filter(
		(r) => r.len >= BODY_MIN_CHARS && !UI_TEXT_RE.test(r.styleName) && !UI_TEXT_RE.test(r.nodeName),
	);
	const pool = paragraphLike.length > 0 ? paragraphLike : nonHeading;
	if (pool.length === 0) {
		return null;
	}

	const charByFont = new Map();
	const charBySize = new Map();
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

	const dominantSize = [...charBySize.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
	if (dominantSize != null) {
		result.fontSize = dominantSize;
	}

	let metricNode = dominantSize != null ? repNodeBySize.get(dominantSize) ?? null : null;
	if (!metricNode) {
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

const BACKGROUND_NAME_RE = /\b(background|bg|body|page|site|canvas|base|main)\b/i;
const BACKGROUND_SKIP_RE = /\b(button|card|badge|chip|icon|input|field|nav|header|footer|cta|modal|tooltip|popover|menu|logo|image|img|avatar|divider|line|text|heading|title)\b/i;

/** Exclude full-file pasteboard mats; real artboards stay under this width. */
const BACKGROUND_MAX_WIDTH = 2000;

export function extractBodyBackgroundColor(nodes, colors) {
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
		if (width >= BACKGROUND_MAX_WIDTH) {
			continue;
		}

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

	const mono = Array.isArray(colors?.mono) ? colors.mono : [];
	return mono.length ? mono[mono.length - 1].hex : null;
}
