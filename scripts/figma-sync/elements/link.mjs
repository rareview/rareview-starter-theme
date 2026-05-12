import { firstSolidHex } from '../lib/color-utils.mjs';
import { findFirstTextNode } from '../lib/node-utils.mjs';
import { buildTypographyKey, textDecorationToCss } from '../lib/typography-css.mjs';

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

export function extractLinks(nodes, styleRegistry) {
	const styleCounts = new Map();

	for (const node of nodes) {
		if (node.type !== 'TEXT') {
			continue;
		}
		const styleId = node.styles?.text ?? null;
		if (!styleId) {
			continue;
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
		return null;
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
	result.textDecoration = td;

	const hover = findLinkHoverStyle(nodes);
	if (hover.colorHover) {
		result.colorHover = hover.colorHover;
	}
	if (hover.textDecorationHover != null) {
		result.textDecorationHover = hover.textDecorationHover;
	}

	return result;
}
