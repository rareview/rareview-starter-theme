import { firstSolidHex, rgbToHex } from './color-utils.mjs';

/**
 * Returns all nodes that are descendants of top-level frames/pages whose names
 * contain any of the given keywords (case-insensitive substring match).
 * Checks both page-level nodes and the first layer of frames within each page.
 * Returns null when no matching frames are found so callers can fall back to allNodes.
 */
export function getScopedNodes(document, keywords) {
	if (!keywords?.length || !document) return null;
	const re = new RegExp(
		keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
		'i',
	);
	const result = [];
	for (const page of (document?.children ?? [])) {
		if (re.test(page.name ?? '')) {
			// Whole page matches — collect everything inside it.
			walkNodes(page, (n) => { if (n !== page) result.push(n); });
			continue;
		}
		// Check top-level frames within this page.
		for (const frame of (page?.children ?? [])) {
			if (re.test(frame.name ?? '')) {
				walkNodes(frame, (n) => result.push(n));
			}
		}
	}
	return result.length > 0 ? result : null;
}

export function walkNodes(node, visitor) {
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

export function findFirstTextNode(node) {
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

export function getNodeFillHex(node) {
	return firstSolidHex(node.fills) || rgbToHex(node.backgroundColor);
}
