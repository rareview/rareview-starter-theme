import { firstSolidHex, rgbToHex } from './color-utils.mjs';

/**
 * Substrings (lowercase). If a Figma page (CANVAS) name contains any of these
 * after trim + lowercase, the page is excluded from production style extraction.
 * Extend this list to add more non-production page patterns.
 */
export const NON_PRODUCTION_PAGE_SUBSTRINGS = [
	'archive',
	'ideas',
	'inspiration',
	'inspo',
	'exploration',
	'concept',
	'draft',
	'backup',
	'old',
	'unused',
	'test',
	'temp',
	'iterations',
	'versions',
	'examples',
	'playground',
	'sandbox',
	'wip',
	'deprecated',
];

/**
 * @param {string | null | undefined} name Figma page (CANVAS) name
 * @returns {boolean} true when this page should be skipped for production sync
 */
export function shouldExcludePage(name) {
	const n = String(name ?? '').trim().toLowerCase();
	if (!n) {
		return false;
	}
	return NON_PRODUCTION_PAGE_SUBSTRINGS.some((kw) => n.includes(kw));
}

/**
 * Walk the file document like {@link walkNodes}, but skip entire pages (CANVAS)
 * matched by {@link shouldExcludePage}. Logs each skipped page when `log` is provided.
 *
 * @param {object} document Figma DOCUMENT node
 * @param {(node: object) => void} visitor
 * @param {(msg?: string) => void} [log]
 */
export function walkProductionDocument(document, visitor, log) {
	if (!document || typeof document !== 'object') {
		return;
	}
	visitor(document);
	for (const child of document.children ?? []) {
		if (child?.type === 'CANVAS' && shouldExcludePage(child.name)) {
			const label = String(child.name ?? '').trim() || '(unnamed page)';
			log?.(`  Skipped non-production page: "${label}"`);
			continue;
		}
		walkNodes(child, visitor);
	}
}

/**
 * Returns all nodes that are descendants of top-level frames/pages whose names
 * contain any of the given keywords (case-insensitive substring match).
 * Checks both page-level nodes and the first layer of frames within each page.
 * Returns null when no matching frames are found so callers can fall back to allNodes.
 *
 * @param {object} document
 * @param {string[]} keywords
 * @param {(msg?: string) => void} [log] when set, skipped non-production pages are logged
 */
export function getScopedNodes(document, keywords, log) {
	if (!keywords?.length || !document) return null;
	const re = new RegExp(
		keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
		'i',
	);
	const result = [];
	for (const page of (document?.children ?? [])) {
		if (page?.type === 'CANVAS' && shouldExcludePage(page.name)) {
			const label = String(page.name ?? '').trim() || '(unnamed page)';
			log?.(`  Skipped non-production page (scoped search): "${label}"`);
			continue;
		}
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
