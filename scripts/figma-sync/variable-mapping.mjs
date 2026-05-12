import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildButtonEntry } from './elements/button.mjs';
import { lineHeightRatioFromStyle } from './elements/body.mjs';
import { findFirstTextNode, getNodeFillHex } from './lib/node-utils.mjs';
import { firstSolidHex } from './lib/color-utils.mjs';

/**
 * @param {import('node:fs').PathOrFileDescriptor} [csvPath]
 */
export function parseVariableMappingCsvForKeyed(csvPath) {
	const raw = readFileSync(
		csvPath ?? path.resolve(process.cwd(), 'scripts', 'figma-sync', 'variable_mapping_figma_sync.csv'),
		'utf-8',
	);
	const lines = raw.split('\n');
	const first = lines.find((l) => l.trim() && l.includes('figma_path'));
	if (!first) {
		return [];
	}
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

export function extractByKey(allNodes, key) {
	if (!key) {
		return null;
	}
	const k = key.toLowerCase();
	return allNodes.find((n) => (n.name ?? '').toString().toLowerCase().includes(k)) ?? null;
}

export function extractAllByKey(allNodes, key) {
	if (!key) return [];
	const k = key.toLowerCase();
	const exact = allNodes.filter((n) => {
		const name = (n.name ?? '').toLowerCase();
		return name === k || name === `(${k})` || name === `[${k}]`;
	});
	if (exact.length > 0) return exact;
	return allNodes.filter((n) => (n.name ?? '').toString().toLowerCase().includes(k));
}

/**
 * Extract a value from a Figma node to align with a figma_path from variable_mapping.
 */
export function extractFigmaValueForKeyNode(node, figmaPath) {
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
	if (p === 'body.backgroundColor' || p === 'bodyBackgroundColor') {
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
	const isInputFieldBorderWidth = p === 'inputField.borderWidth' || (last === 'borderWidth' && p.includes('inputField'));
	if (isInputFieldBorderWidth) {
		if (node.type === 'TEXT' && p.includes('body')) {
			return null;
		}
		if (!Array.isArray(node.strokes) || !node.strokes.length || !(node.strokeWeight > 0)) {
			return null;
		}
		return node.strokeWeight;
	}
	const isLayoutButtonRadius =
		p === 'layout.buttonBorderRadius' ||
		p === 'borderRadius' ||
		(last === 'buttonBorderRadius' && p.includes('layout'));
	if (isLayoutButtonRadius && !p.includes('inputField')) {
		return node.cornerRadius ?? null;
	}
	const isInputFieldRadius = p === 'inputField.borderRadius' || p === 'inputBorderRadius';
	if (isInputFieldRadius) {
		return node.cornerRadius ?? null;
	}
	if ((last === 'borderRadius' || p.includes('borderRadius')) && !p.includes('buttons')) {
		return node.cornerRadius ?? null;
	}
	if (last === 'containerWidth' || p === 'containerWidth' || p === 'layout.containerWidth') {
		return node.absoluteBoundingBox?.width != null ? Math.round(node.absoluteBoundingBox.width) : null;
	}
	if (p.includes('body.') && p.includes('fontSize') && !p.includes('paragraphSizes')) {
		if (node.type === 'TEXT' && node.style?.fontSize != null) {
			return node.style.fontSize;
		}
		return findFirstTextNode(node)?.style?.fontSize ?? null;
	}
	if (p.includes('body.') && p.includes('fontWeight') && !p.includes('paragraphSizes')) {
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
	const isInputHeight = p === 'inputField.height' || p === 'inputHeight' || (last === 'height' && p.includes('inputField'));
	if (isInputHeight) {
		return node.absoluteBoundingBox?.height != null ? Math.round(node.absoluteBoundingBox.height) : null;
	}
	if (last === 'height' || p.includes('Height')) {
		return node.absoluteBoundingBox?.height != null ? Math.round(node.absoluteBoundingBox.height) : null;
	}
	if (node.type === 'TEXT' && last === 'fontSize') {
		return node.style?.fontSize ?? null;
	}
	return null;
}

/**
 * @returns {Record<string, string | number | null | undefined>|null}
 */
export function buildKeyedBySlug(allNodes) {
	const spec = parseVariableMappingCsvForKeyed();
	if (spec.length === 0) {
		return null;
	}
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
 * @returns {Record<string, Record<string, string|number>> | null}
 */
export function buildTaggedNodes(allNodes) {
	const spec = parseVariableMappingCsvForKeyed();
	if (spec.length === 0) return null;

	const pathsByTag = new Map();
	for (const { figmaKey, figmaPath } of spec) {
		if (!figmaKey || !figmaPath) continue;
		if (!pathsByTag.has(figmaKey)) pathsByTag.set(figmaKey, []);
		pathsByTag.get(figmaKey).push(figmaPath);
	}

	const nodeTypePriority = (type) => {
		if (['FRAME', 'SECTION', 'RECTANGLE', 'ELLIPSE', 'VECTOR', 'POLYGON', 'STAR'].includes(type)) return 0;
		if (['COMPONENT', 'INSTANCE', 'COMPONENT_SET'].includes(type)) return 1;
		if (['GROUP'].includes(type)) return 2;
		if (type === 'TEXT') return 10;
		return 5;
	};

	const out = {};
	for (const [tag, paths] of pathsByTag) {
		const allMatches = extractAllByKey(allNodes, tag);
		if (allMatches.length === 0) continue;

		const tagLower = tag.toLowerCase();
		const candidateNodes = [...allMatches].sort((a, b) => {
			const aName = (a.name ?? '').toLowerCase();
			const bName = (b.name ?? '').toLowerCase();
			const aExact = aName === tagLower || aName === `(${tagLower})` || aName === `[${tagLower}]`;
			const bExact = bName === tagLower || bName === `(${tagLower})` || bName === `[${tagLower}]`;
			if (aExact !== bExact) return aExact ? -1 : 1;
			return nodeTypePriority(a.type) - nodeTypePriority(b.type);
		});

		const props = {};
		for (const figmaPath of paths) {
			const v = candidateNodes
				.map((n) => extractFigmaValueForKeyNode(n, figmaPath))
				.find((val) => val != null);
			if (v != null) props[figmaPath] = v;
		}
		if (Object.keys(props).length > 0) out[tag] = props;
	}
	return Object.keys(out).length ? out : null;
}
