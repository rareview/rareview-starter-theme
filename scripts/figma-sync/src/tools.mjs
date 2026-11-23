/**
 * Tools the AI uses to look at the pasted Figma pages: browse, inspect, search, count, measure, and view.
 * The tools only measure and list. They never decide; the AI decides.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { hexLuminance, isMonoColor, rgbToHex } from '../lib/color-utils.mjs';
import { textCaseToCss, textDecorationToCss } from '../lib/typography-css.mjs';
import { downloadFigmaImage, fetchFigmaImageUrls } from '../lib/figma-api.mjs';

const MAX_TOOL_TEXT = 14000;
const REGION_RE = /\b(header|nav|navigation|menu|navbar|top ?bar|footer|breadcrumb)/i;

function clip(text, max = MAX_TOOL_TEXT) {
	const s = String(text);
	return s.length > max ? `${s.slice(0, max)}\n… (cut at ${max} characters; narrow the scope or lower the limit)` : s;
}

function round(value, digits = 2) {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return null;
	}
	const f = 10 ** digits;
	return Math.round(value * f) / f;
}

function short(text, max = 40) {
	const s = String(text ?? '').replace(/\s+/g, ' ').trim();
	return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function visiblePaints(paints) {
	return Array.isArray(paints) ? paints.filter((p) => p && p.visible !== false && (p.opacity ?? 1) > 0) : [];
}

/**
 * A Figma effect as CSS-like text, e.g. "DROP_SHADOW 0px 2px 4px 0px #000000@12%" (x y blur spread color) or "LAYER_BLUR 8px".
 *
 * @param {{ type: string, offset?: { x: number, y: number }, radius?: number, spread?: number, color?: { r: number, g: number, b: number, a?: number } }} e
 */
function effectText(e) {
	if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
		const alpha = e.color?.a ?? 1;
		const color = e.color ? `${rgbToHex(e.color)}${alpha < 0.99 ? `@${Math.round(alpha * 100)}%` : ''}` : '';
		return `${e.type} ${e.offset?.x ?? 0}px ${e.offset?.y ?? 0}px ${e.radius ?? 0}px ${e.spread ?? 0}px ${color}`.trim();
	}
	return e.radius != null ? `${e.type} ${e.radius}px` : e.type;
}

/** First visible paint as text: #RRGGBB, #RRGGBB@60%, gradient, image. */
function paintText(paints) {
	const p = visiblePaints(paints)[0];
	if (!p) {
		return null;
	}
	if (p.type === 'SOLID') {
		const hex = rgbToHex(p.color);
		const alpha = (p.opacity ?? 1) * (p.color?.a ?? 1);
		return alpha < 0.99 ? `${hex}@${Math.round(alpha * 100)}%` : hex;
	}
	if (p.type?.startsWith('GRADIENT')) {
		return 'gradient';
	}
	return p.type?.toLowerCase() ?? null;
}

function solidHex(paints) {
	const p = visiblePaints(paints).find((paint) => paint.type === 'SOLID');
	return p ? rgbToHex(p.color) : null;
}

function size(node) {
	const b = node.absoluteBoundingBox;
	return b ? { x: b.x, y: b.y, w: Math.round(b.width), h: Math.round(b.height) } : null;
}

function radiusText(node) {
	if (Array.isArray(node.rectangleCornerRadii) && new Set(node.rectangleCornerRadii).size > 1) {
		return node.rectangleCornerRadii.map((r) => round(r)).join('/');
	}
	return typeof node.cornerRadius === 'number' && node.cornerRadius > 0 ? String(round(node.cornerRadius)) : null;
}

function strokeText(node) {
	const color = paintText(node.strokes);
	if (!color) {
		return null;
	}
	const w = node.individualStrokeWeights
		? ['top', 'right', 'bottom', 'left'].map((k) => round(node.individualStrokeWeights[k] ?? 0)).join('/')
		: round(node.strokeWeight ?? 1);
	return `${color}/${w}`;
}

function paddingText(node) {
	const p = [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft];
	if (p.every((v) => v == null || v === 0)) {
		return null;
	}
	return p.map((v) => round(v ?? 0)).join(',');
}

function lineHeightText(style) {
	if (!style) {
		return null;
	}
	if (style.lineHeightUnit === 'INTRINSIC_%') {
		return 'auto';
	}
	if (typeof style.lineHeightPx === 'number' && style.fontSize) {
		return `${round(style.lineHeightPx / style.fontSize)} (${round(style.lineHeightPx)}px)`;
	}
	return null;
}

function textStyleText(node) {
	const s = node.style ?? {};
	const parts = [
		`${s.fontFamily ?? '?'} ${round(s.fontSize)}/${s.fontWeight ?? '?'}`,
		`lh=${lineHeightText(s) ?? '?'}`,
		`ls=${round(s.letterSpacing ?? 0)}px`,
	];
	if (s.textCase && s.textCase !== 'ORIGINAL') {
		parts.push(`case=${textCaseToCss(s.textCase)}`);
	}
	if (s.textDecoration && s.textDecoration !== 'NONE') {
		parts.push(`deco=${textDecorationToCss(s.textDecoration)}`);
	}
	parts.push(`color=${paintText(node.fills) ?? 'none'}`);
	return parts.join(' ');
}

/**
 * @param {object} opts
 * @param {object[]} opts.roots pasted page / frame nodes
 * @param {Record<string, { name?: string, styleType?: string }>} opts.styles
 * @param {Record<string, { name?: string, componentSetId?: string }>} opts.components
 * @param {Record<string, { name?: string }>} opts.componentSets
 * @param {string} opts.fileKey
 * @param {string} opts.fileName
 * @param {string} opts.figmaToken
 * @param {string} opts.imageDir
 */
export function createFigmaTools(opts) {
	const { roots, styles, components, componentSets, fileKey, fileName, figmaToken, imageDir } = opts;

	/** @type {Map<string, { node: object, parentId: string | null, rootId: string, screenId: string | null, depth: number }>} */
	const index = new Map();
	const allNodes = [];

	for (const root of roots) {
		const walk = (node, parentId, depth, screenId) => {
			if (!node || node.visible === false) {
				return;
			}
			let screen = screenId;
			if (!screen && node.type !== 'CANVAS' && node.type !== 'SECTION') {
				// The first frame below the page (or below a section) is a "screen".
				screen = node.id;
			}
			index.set(node.id, { node, parentId, rootId: root.id, screenId: screen, depth });
			allNodes.push(node);
			for (const child of node.children ?? []) {
				walk(child, node.id, depth + 1, screen);
			}
		};
		walk(root, null, 0, null);
	}

	const styleName = (id) => (id && styles[id]?.name) || null;
	const styleNamesOf = (node) => {
		const out = [];
		for (const [kind, id] of Object.entries(node.styles ?? {})) {
			const name = styleName(id);
			if (name) {
				out.push(`${kind}:"${name}"`);
			}
		}
		return out;
	};
	const componentNameOf = (node) => {
		const comp = node.componentId ? components[node.componentId] : null;
		if (!comp) {
			return null;
		}
		const set = comp.componentSetId ? componentSets[comp.componentSetId]?.name : null;
		return set ? `${set} / ${comp.name}` : comp.name;
	};

	const screenOf = (id) => {
		const entry = index.get(id);
		return entry?.screenId ? index.get(entry.screenId)?.node : null;
	};
	const viewportOf = (id) => {
		const screen = screenOf(id);
		const w = screen ? size(screen)?.w : null;
		if (!w) {
			return 'unknown';
		}
		if (w <= 520) {
			return 'mobile';
		}
		return w < 1000 ? 'tablet' : 'desktop';
	};
	const pathOf = (id, max = 5) => {
		const names = [];
		let cur = index.get(id);
		while (cur && cur.parentId) {
			cur = index.get(cur.parentId);
			if (cur && cur.node.type !== 'CANVAS') {
				names.unshift(short(cur.node.name, 28));
			}
		}
		return (names.length > max ? ['…', ...names.slice(-max)] : names).join(' / ');
	};
	const inRegion = (id) => {
		let cur = index.get(id);
		while (cur) {
			if (REGION_RE.test(cur.node.name ?? '')) {
				return (cur.node.name.match(REGION_RE)?.[1] ?? 'header').toLowerCase();
			}
			cur = cur.parentId ? index.get(cur.parentId) : null;
		}
		return null;
	};

	const scopeNodes = (scopeId) => {
		if (!scopeId) {
			return allNodes;
		}
		const start = index.get(scopeId)?.node;
		if (!start) {
			throw new Error(`Unknown node id ${scopeId}. Use ids from the overview, outline or search.`);
		}
		const out = [];
		const walk = (node) => {
			if (!node || node.visible === false) {
				return;
			}
			out.push(node);
			(node.children ?? []).forEach(walk);
		};
		walk(start);
		return out;
	};

	const textsUnder = (node, limit = 4) => {
		const out = [];
		const walk = (n) => {
			if (!n || n.visible === false || out.length > limit) {
				return;
			}
			if (n.type === 'TEXT') {
				out.push(n);
				return;
			}
			(n.children ?? []).forEach(walk);
		};
		walk(node);
		return out;
	};

	/** One line that describes a node. */
	const line = (node) => {
		const parts = [`${node.id} ${node.type} "${short(node.name, 40)}"`];
		const s = size(node);
		if (s) {
			parts.push(`${s.w}×${s.h}`);
		}
		if (node.type === 'TEXT') {
			parts.push(`"${short(node.characters, 50)}"`, textStyleText(node));
		} else {
			const fill = paintText(node.fills) ?? (node.backgroundColor && node.type === 'CANVAS' ? rgbToHex(node.backgroundColor) : null);
			if (fill) {
				parts.push(`fill=${fill}`);
			}
			const stroke = strokeText(node);
			if (stroke) {
				parts.push(`stroke=${stroke}`);
			}
			const r = radiusText(node);
			if (r) {
				parts.push(`r=${r}`);
			}
			const pad = paddingText(node);
			if (pad) {
				parts.push(`pad=${pad}`);
			}
			if (node.layoutMode && node.layoutMode !== 'NONE') {
				parts.push(`layout=${node.layoutMode === 'HORIZONTAL' ? 'row' : 'column'} gap=${round(node.itemSpacing ?? 0)}`);
			}
			const comp = componentNameOf(node);
			if (comp) {
				parts.push(`component="${short(comp, 50)}"`);
			}
		}
		const styleNames = styleNamesOf(node);
		if (styleNames.length) {
			parts.push(`styles=${styleNames.join(',')}`);
		}
		if (node.opacity != null && node.opacity < 1) {
			parts.push(`opacity=${round(node.opacity)}`);
		}
		if (node.children?.length) {
			parts.push(`children=${node.children.length}`);
		}
		return parts.join(' ');
	};

	// ── Tools ────────────────────────────────────────────────────────────────

	function outline({ node_id: nodeId, depth = 2, max_children: maxChildren = 30 }) {
		const start = index.get(nodeId)?.node;
		if (!start) {
			throw new Error(`Unknown node id ${nodeId}.`);
		}
		const maxDepth = Math.max(0, Math.min(5, Number(depth) || 2));
		const lines = [];
		const walk = (node, d) => {
			lines.push(`${'  '.repeat(d)}${line(node)}`);
			if (d >= maxDepth) {
				return;
			}
			const kids = (node.children ?? []).filter((c) => c.visible !== false);
			kids.slice(0, maxChildren).forEach((child) => walk(child, d + 1));
			if (kids.length > maxChildren) {
				lines.push(`${'  '.repeat(d + 1)}… ${kids.length - maxChildren} more children`);
			}
		};
		walk(start, 0);
		return `Path: ${pathOf(nodeId) || '(top)'}  viewport=${viewportOf(nodeId)}\n${lines.join('\n')}`;
	}

	function inspect({ node_ids: nodeIds = [] }) {
		const out = [];
		for (const id of nodeIds.slice(0, 8)) {
			const node = index.get(id)?.node;
			if (!node) {
				out.push(`${id}: unknown node id`);
				continue;
			}
			const detail = {
				id: node.id,
				type: node.type,
				name: node.name,
				path: pathOf(id),
				viewport: viewportOf(id),
				region: inRegion(id),
				size: size(node),
				fills: visiblePaints(node.fills).map((p) => (p.type === 'SOLID' ? paintText([p]) : p.type)),
				strokes: strokeText(node),
				strokeAlign: node.strokeAlign,
				radius: radiusText(node),
				padding: paddingText(node),
				layout: node.layoutMode && node.layoutMode !== 'NONE' ? { mode: node.layoutMode, gap: node.itemSpacing } : null,
				opacity: node.opacity,
				effects: (node.effects ?? []).filter((e) => e.visible !== false).map(effectText),
				styles: styleNamesOf(node),
				component: componentNameOf(node),
			};
			if (node.type === 'TEXT') {
				const s = node.style ?? {};
				detail.text = node.characters;
				detail.textStyle = {
					fontFamily: s.fontFamily,
					fontWeight: s.fontWeight,
					fontSize: s.fontSize,
					lineHeight: lineHeightText(s),
					letterSpacingPx: round(s.letterSpacing ?? 0, 3),
					textCase: textCaseToCss(s.textCase),
					textDecoration: textDecorationToCss(s.textDecoration),
					textAlign: s.textAlignHorizontal,
					color: paintText(node.fills),
				};
				if (node.styleOverrideTable && Object.keys(node.styleOverrideTable).length) {
					detail.mixedStyles = Object.values(node.styleOverrideTable)
						.slice(0, 4)
						.map((o) => ({
							fontFamily: o.fontFamily,
							fontWeight: o.fontWeight,
							fontSize: o.fontSize,
							textDecoration: o.textDecoration ? textDecorationToCss(o.textDecoration) : undefined,
							color: o.fills ? paintText(o.fills) : undefined,
						}));
				}
			} else {
				detail.texts = textsUnder(node, 6).map((t) => `${t.id} "${short(t.characters, 40)}" ${textStyleText(t)}`);
				detail.children = (node.children ?? []).slice(0, 15).map((c) => line(c));
			}
			for (const [k, v] of Object.entries(detail)) {
				if (v == null || (Array.isArray(v) && !v.length)) {
					delete detail[k];
				}
			}
			out.push(JSON.stringify(detail, null, 1));
		}
		return out.join('\n');
	}

	function search({ name, text, type, scope_id: scopeId, limit = 40 }) {
		const nameRe = name ? new RegExp(name, 'i') : null;
		const textRe = text ? new RegExp(text, 'i') : null;
		const types = type ? String(type).toUpperCase().split(/[,| ]+/) : null;
		const hits = [];
		for (const node of scopeNodes(scopeId)) {
			if (types && !types.includes(node.type)) {
				continue;
			}
			if (nameRe && !nameRe.test(node.name ?? '') && !nameRe.test(componentNameOf(node) ?? '')) {
				continue;
			}
			if (textRe && !(node.type === 'TEXT' && textRe.test(node.characters ?? ''))) {
				continue;
			}
			hits.push(node);
		}
		const shown = hits.slice(0, Math.min(150, Number(limit) || 40));
		return [
			`${hits.length} match(es)${hits.length > shown.length ? `, showing ${shown.length}` : ''}:`,
			...shown.map((n) => `${line(n)}  [in: ${pathOf(n.id, 3)}; ${viewportOf(n.id)}]`),
		].join('\n');
	}

	function textStyles({ scope_id: scopeId, viewport = 'any', min_chars: minChars = 0, sort = 'chars', limit = 40 }) {
		const groups = new Map();
		for (const node of scopeNodes(scopeId)) {
			if (node.type !== 'TEXT' || !node.style) {
				continue;
			}
			const chars = (node.characters ?? '').trim().length;
			if (chars < minChars) {
				continue;
			}
			const vp = viewportOf(node.id);
			if (viewport !== 'any' && vp !== viewport) {
				continue;
			}
			const key = textStyleText(node);
			if (!groups.has(key)) {
				groups.set(key, { key, nodes: 0, chars: 0, samples: [], styleNames: new Set(), screens: new Map(), regions: new Map(), viewports: new Map(), size: node.style.fontSize ?? 0 });
			}
			const g = groups.get(key);
			g.nodes += 1;
			g.chars += chars;
			if (g.samples.length < 3) {
				g.samples.push(`"${short(node.characters, 36)}" (${node.id})`);
			}
			styleNamesOf(node).forEach((s) => g.styleNames.add(s));
			const screen = screenOf(node.id);
			if (screen) {
				g.screens.set(screen.name, (g.screens.get(screen.name) ?? 0) + 1);
			}
			const region = inRegion(node.id) ?? 'content';
			g.regions.set(region, (g.regions.get(region) ?? 0) + 1);
			g.viewports.set(vp, (g.viewports.get(vp) ?? 0) + 1);
		}
		const sorters = {
			chars: (a, b) => b.chars - a.chars,
			count: (a, b) => b.nodes - a.nodes,
			size: (a, b) => b.size - a.size || b.chars - a.chars,
		};
		const list = [...groups.values()].sort(sorters[sort] ?? sorters.chars);
		const shown = list.slice(0, Math.min(120, Number(limit) || 40));
		const fmtMap = (m, n = 3) =>
			[...m.entries()]
				.sort((a, b) => b[1] - a[1])
				.slice(0, n)
				.map(([k, v]) => `${short(k, 24)}×${v}`)
				.join(', ');
		return [
			`${list.length} distinct text looks (family size/weight, line height, letter spacing, case, color). Sorted by ${sort}.`,
			...shown.map(
				(g, i) =>
					`${i + 1}. ${g.key} | nodes=${g.nodes} chars=${g.chars} | ${fmtMap(g.viewports)} | where: ${fmtMap(g.regions)} | screens: ${fmtMap(g.screens)}${g.styleNames.size ? ` | ${[...g.styleNames].slice(0, 3).join(' ')}` : ''}\n   e.g. ${g.samples.join(', ')}`,
			),
		].join('\n');
	}

	function colors({ scope_id: scopeId, limit = 40 }) {
		const byHex = new Map();
		const get = (hex) => {
			if (!byHex.has(hex)) {
				byHex.set(hex, { hex, text: 0, textChars: 0, fill: 0, area: 0, stroke: 0, largest: null, largestArea: 0, styleNames: new Set() });
			}
			return byHex.get(hex);
		};
		for (const node of scopeNodes(scopeId)) {
			const fillStyle = styleName(node.styles?.fill);
			for (const p of visiblePaints(node.fills)) {
				if (p.type !== 'SOLID') {
					continue;
				}
				const c = get(rgbToHex(p.color));
				if (fillStyle) {
					c.styleNames.add(fillStyle);
				}
				if (node.type === 'TEXT') {
					c.text += 1;
					c.textChars += (node.characters ?? '').length;
				} else {
					const s = size(node);
					const area = s ? s.w * s.h : 0;
					c.fill += 1;
					c.area += area;
					if (area > c.largestArea) {
						c.largestArea = area;
						c.largest = node;
					}
				}
			}
			for (const p of visiblePaints(node.strokes)) {
				if (p.type === 'SOLID') {
					get(rgbToHex(p.color)).stroke += 1;
				}
			}
		}
		const list = [...byHex.values()].sort((a, b) => b.text + b.fill + b.stroke - (a.text + a.fill + a.stroke));
		return [
			`${list.length} solid colors. Sorted by number of uses. area = total px² of shapes filled with it.`,
			...list.slice(0, Math.min(100, Number(limit) || 40)).map((c) => {
				const kind = isMonoColor(c.hex) ? 'mono' : 'color';
				const largest = c.largest ? ` largest=${c.largest.id} "${short(c.largest.name, 24)}" ${size(c.largest)?.w}×${size(c.largest)?.h}` : '';
				return `${c.hex} ${kind} lum=${round(hexLuminance(c.hex))} | text=${c.text} (${c.textChars} chars) shapes=${c.fill} area=${Math.round(c.area)} strokes=${c.stroke}${largest}${c.styleNames.size ? ` | styles: ${[...c.styleNames].slice(0, 3).map((s) => `"${s}"`).join(', ')}` : ''}`;
			}),
		].join('\n');
	}

	/** Group by look, count, and list examples. Used for button and input candidates. */
	function groupByLook(nodes, fingerprint, limit) {
		const groups = new Map();
		for (const node of nodes) {
			const key = fingerprint(node);
			if (!groups.has(key)) {
				groups.set(key, { key, count: 0, instances: 0, samples: [], names: new Map(), regions: new Map(), viewports: new Map(), screens: new Set() });
			}
			const g = groups.get(key);
			g.count += 1;
			if (node.type === 'INSTANCE') {
				g.instances += 1;
			}
			const label = textsUnder(node, 2)[0]?.characters ?? '';
			if (g.samples.length < 4) {
				g.samples.push(`"${short(label, 24)}" (${node.id})`);
			}
			const nm = componentNameOf(node) ?? node.name;
			g.names.set(nm, (g.names.get(nm) ?? 0) + 1);
			const region = inRegion(node.id) ?? 'content';
			g.regions.set(region, (g.regions.get(region) ?? 0) + 1);
			const vp = viewportOf(node.id);
			g.viewports.set(vp, (g.viewports.get(vp) ?? 0) + 1);
			const screen = screenOf(node.id);
			if (screen) {
				g.screens.add(screen.name);
			}
		}
		const fmt = (m) =>
			[...m.entries()]
				.sort((a, b) => b[1] - a[1])
				.slice(0, 3)
				.map(([k, v]) => `${short(k, 30)}×${v}`)
				.join(', ');
		return [...groups.values()]
			.sort((a, b) => b.count - a.count)
			.slice(0, limit)
			.map(
				(g, i) =>
					`${i + 1}. ${g.key}\n   count=${g.count} (instances ${g.instances}) on ${g.screens.size} screen(s) | ${fmt(g.viewports)} | where: ${fmt(g.regions)} | names: ${fmt(g.names)}\n   e.g. ${g.samples.join(', ')}`,
			);
	}

	function buttonCandidates({ scope_id: scopeId, limit = 25 }) {
		const found = [];
		/** The node that draws the button box: the node itself, or (in a group) a shape behind the label that fills it. */
		const boxOf = new Map();
		for (const node of scopeNodes(scopeId)) {
			if (!['FRAME', 'INSTANCE', 'COMPONENT', 'GROUP'].includes(node.type)) {
				continue;
			}
			const s = size(node);
			if (!s || s.h < 20 || s.h > 100 || s.w < 40 || s.w > 500) {
				continue;
			}
			const texts = textsUnder(node, 3);
			if (!texts.length || texts.length > 2) {
				continue;
			}
			const label = (texts[0].characters ?? '').trim();
			if (!label || label.length > 40) {
				continue;
			}
			let box = paintText(node.fills) || strokeText(node) ? node : null;
			if (!box) {
				// Many designs draw a button as a group: a rectangle or vector shape with the label on top.
				box =
					(node.children ?? []).find((c) => {
						const cs = size(c);
						return (
							c.visible !== false &&
							['RECTANGLE', 'VECTOR', 'BOOLEAN_OPERATION', 'FRAME'].includes(c.type) &&
							cs &&
							cs.w >= s.w * 0.85 &&
							cs.h >= s.h * 0.85 &&
							(paintText(c.fills) || strokeText(c))
						);
					}) ?? null;
			}
			if (!box) {
				continue;
			}
			boxOf.set(node.id, box);
			found.push(node);
		}
		const fp = (node) => {
			const box = boxOf.get(node.id) ?? node;
			const t = textsUnder(node, 1)[0];
			const s = size(node);
			const shape = box === node ? '' : ` shape=${box.id} ${box.type}`;
			return `bg=${paintText(box.fills) ?? 'none'} border=${strokeText(box) ?? 'none'} r=${radiusText(box) ?? 0} h=${s.h} pad=${paddingText(node) ?? 'none'}${shape} | text: ${t ? textStyleText(t) : '?'}`;
		};
		const lines = groupByLook(found, fp, Math.min(60, Number(limit) || 25));
		return [
			`${found.length} button-like nodes (frame/instance/group 20–100px high, ≤500px wide, 1–2 short texts, a fill or border on the node or on a shape behind the label), grouped by look:`,
			...lines,
		].join('\n');
	}

	function inputCandidates({ scope_id: scopeId, limit = 20 }) {
		const found = [];
		for (const node of scopeNodes(scopeId)) {
			if (!['FRAME', 'INSTANCE', 'COMPONENT'].includes(node.type)) {
				continue;
			}
			const s = size(node);
			if (!s || s.h < 28 || s.h > 80 || s.w < 80 || s.w > 900) {
				continue;
			}
			if (/\b(icon|arrow|chevron|caret)\b/i.test(node.name ?? '')) {
				continue;
			}
			const stroke = strokeText(node);
			const children = (node.children ?? []).filter((c) => c.visible !== false);
			const borderChild = children.find((c) => ['RECTANGLE', 'LINE', 'VECTOR'].includes(c.type) && (strokeText(c) || size(c)?.h <= 2));
			if (!stroke && !borderChild) {
				continue;
			}
			if (!textsUnder(node, 3).length) {
				continue;
			}
			found.push(node);
		}
		const fp = (node) => {
			const t = textsUnder(node, 1)[0];
			const s = size(node);
			return `border=${strokeText(node) ?? 'child line'} bg=${paintText(node.fills) ?? 'none'} r=${radiusText(node) ?? 0} h=${s.h} pad=${paddingText(node) ?? 'none'} | text: ${t ? textStyleText(t) : '?'}`;
		};
		return [
			`${found.length} input-like nodes (28–80px high, 80–900px wide, has a border or bottom line, has text), grouped by look:`,
			...groupByLook(found, fp, Math.min(60, Number(limit) || 20)),
		].join('\n');
	}

	function frameWidths({ scope_id: scopeId }) {
		const all = new Map();
		const centered = new Map();
		const screens = new Map();
		for (const node of scopeNodes(scopeId)) {
			if (!['FRAME', 'SECTION', 'GROUP', 'INSTANCE', 'COMPONENT'].includes(node.type)) {
				continue;
			}
			const s = size(node);
			if (!s || s.w < 300) {
				continue;
			}
			const entry = index.get(node.id);
			if (entry?.screenId === node.id) {
				screens.set(s.w, (screens.get(s.w) ?? 0) + 1);
				continue;
			}
			if (s.w > 2000) {
				continue;
			}
			all.set(s.w, (all.get(s.w) ?? 0) + 1);
			const screen = screenOf(node.id);
			const ss = screen ? size(screen) : null;
			if (ss && s.w <= ss.w - 40) {
				const left = s.x - ss.x;
				const right = ss.x + ss.w - (s.x + s.w);
				if (Math.abs(left - right) <= 4) {
					centered.set(s.w, (centered.get(s.w) ?? 0) + 1);
				}
			}
		}
		const fmt = (m, n) =>
			[...m.entries()]
				.sort((a, b) => b[1] - a[1])
				.slice(0, n)
				.map(([w, c]) => `${w}px×${c}`)
				.join(', ');
		return [
			`Screen (top frame) widths: ${fmt(screens, 12) || 'none'}`,
			`Centered content widths (narrower than their screen, same margin left and right): ${fmt(centered, 15) || 'none'}`,
			`All frame widths 300–2000px: ${fmt(all, 25) || 'none'}`,
		].join('\n');
	}

	async function view({ node_id: nodeId }) {
		const node = index.get(nodeId)?.node;
		if (!node) {
			throw new Error(`Unknown node id ${nodeId}.`);
		}
		if (node.type === 'CANVAS') {
			throw new Error('A whole page cannot be rendered. View one of its frames instead.');
		}
		if (!figmaToken) {
			throw new Error('No FIGMA_ACCESS_TOKEN, so images are not available. Use the other tools.');
		}
		const s = size(node);
		const longest = Math.max(s?.w ?? 1000, s?.h ?? 1000);
		// About 1500px on the long side; very tall pages get a smaller scale (view their sections for detail).
		const scale = round(Math.max(0.05, Math.min(2, 1500 / longest)), 3);
		const file = path.join(imageDir, `${fileKey}-${nodeId.replace(/[^0-9A-Za-z]+/g, '-')}-${scale}.png`);
		let buffer;
		try {
			buffer = await fs.readFile(file);
		} catch {
			const urls = await fetchFigmaImageUrls(fileKey, figmaToken, [nodeId], { scale });
			if (!urls[nodeId]) {
				throw new Error('Figma could not render this node.');
			}
			buffer = await downloadFigmaImage(urls[nodeId]);
			await fs.mkdir(imageDir, { recursive: true });
			await fs.writeFile(file, buffer);
		}
		return {
			text: `Image of ${line(node)} at scale ${scale}${longest * scale < longest / 2 ? ' (tall node: shrunk a lot, view its sections for detail)' : ''}.`,
			images: [{ mediaType: 'image/png', base64: buffer.toString('base64') }],
		};
	}

	const scopeParam = { type: 'string', description: 'Optional node id: only look inside this node. Leave out for all pasted pages.' };
	const tools = [
		{
			name: 'outline',
			description: 'Show the layer tree under a node: id, type, name, size, fill, border, radius, padding, text style. Use it to explore a page or a section.',
			inputSchema: {
				type: 'object',
				properties: {
					node_id: { type: 'string' },
					depth: { type: 'integer', description: 'Levels to show, 1-5. Default 2.' },
					max_children: { type: 'integer', description: 'Children per node. Default 30.' },
				},
				required: ['node_id'],
			},
		},
		{
			name: 'inspect',
			description: 'Full details of up to 8 nodes: all fills, borders, radius, padding, layout, text style (family, size, weight, line height, letter spacing, case, decoration, color), style and component names, the texts inside.',
			inputSchema: {
				type: 'object',
				properties: { node_ids: { type: 'array', items: { type: 'string' } } },
				required: ['node_ids'],
			},
		},
		{
			name: 'search',
			description: 'Find nodes by layer/component name (regex), by text content (regex), and/or by type (TEXT, FRAME, INSTANCE, ...).',
			inputSchema: {
				type: 'object',
				properties: {
					name: { type: 'string', description: 'Regex for the layer or component name, e.g. "button|btn|cta".' },
					text: { type: 'string', description: 'Regex for the text content.' },
					type: { type: 'string' },
					scope_id: scopeParam,
					limit: { type: 'integer' },
				},
			},
		},
		{
			name: 'text_styles',
			description: 'Count every text look (family, size, weight, line height, letter spacing, case, color): number of nodes, number of characters, viewport, region (header/nav/footer/content), screens, style names, examples. The main tool for body text, headings and links.',
			inputSchema: {
				type: 'object',
				properties: {
					scope_id: scopeParam,
					viewport: { type: 'string', enum: ['any', 'desktop', 'tablet', 'mobile'] },
					min_chars: { type: 'integer', description: 'Skip texts shorter than this. Use 20+ for paragraphs.' },
					sort: { type: 'string', enum: ['chars', 'count', 'size'] },
					limit: { type: 'integer' },
				},
			},
		},
		{
			name: 'colors',
			description: 'Count every solid color: uses as text color (and characters), as shape fill (and total area, largest shape), as border; fill style names. For the palette, background and text colors.',
			inputSchema: { type: 'object', properties: { scope_id: scopeParam, limit: { type: 'integer' } } },
		},
		{
			name: 'button_candidates',
			description: 'Find button-like nodes and group them by look (background, border, radius, height, padding, label style). Shows count, instances, region (nav/header/footer/content), viewport, names, examples.',
			inputSchema: { type: 'object', properties: { scope_id: scopeParam, limit: { type: 'integer' } } },
		},
		{
			name: 'input_candidates',
			description: 'Find form-field-like nodes (border or bottom line, text inside) and group them by look.',
			inputSchema: { type: 'object', properties: { scope_id: scopeParam, limit: { type: 'integer' } } },
		},
		{
			name: 'frame_widths',
			description: 'Count frame widths: screen widths, centered content widths, all widths. For the container (content) width.',
			inputSchema: { type: 'object', properties: { scope_id: scopeParam } },
		},
		{
			name: 'view',
			description: 'See a frame as an image, like a designer looking at the screen. Use it to understand what is a button, which button is primary, what the page background is, and to check your answers.',
			inputSchema: { type: 'object', properties: { node_id: { type: 'string' } }, required: ['node_id'] },
		},
	];

	const handlers = {
		outline,
		inspect,
		search,
		text_styles: textStyles,
		colors,
		button_candidates: buttonCandidates,
		input_candidates: inputCandidates,
		frame_widths: frameWidths,
		view,
	};

	async function onTool(name, input) {
		const handler = handlers[name];
		if (!handler) {
			return { text: `Unknown tool ${name}.` };
		}
		const result = await handler(input ?? {});
		return typeof result === 'string' ? { text: clip(result) } : { ...result, text: clip(result.text) };
	}

	function overview() {
		const lines = [`Figma file: ${fileName || fileKey}`, '', 'Pasted pages / frames:'];
		for (const root of roots) {
			const count = allNodes.filter((n) => index.get(n.id)?.rootId === root.id).length;
			lines.push(`- ${line(root)}  (${count} visible nodes)`);
			if (root.type === 'CANVAS' || root.type === 'SECTION') {
				const kids = (root.children ?? []).filter((c) => c.visible !== false);
				for (const child of kids.slice(0, 60)) {
					lines.push(`    ${line(child)}  viewport=${viewportOf(child.id)}`);
				}
				if (kids.length > 60) {
					lines.push(`    … ${kids.length - 60} more`);
				}
			}
		}

		const used = new Map();
		for (const node of allNodes) {
			for (const [kind, id] of Object.entries(node.styles ?? {})) {
				const name = styleName(id);
				if (!name) {
					continue;
				}
				const key = `${styles[id]?.styleType ?? kind}: "${name}"`;
				if (!used.has(key)) {
					used.set(key, { count: 0, sample: node, kind });
				}
				used.get(key).count += 1;
			}
		}
		if (used.size) {
			lines.push('', 'Named styles used in these pages (name: uses, example):');
			for (const [key, u] of [...used.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 80)) {
				const sample =
					u.kind === 'text' && u.sample.type === 'TEXT'
						? textStyleText(u.sample)
						: u.kind === 'fill'
							? (paintText(u.sample.fills) ?? '')
							: '';
				lines.push(`- ${key} ×${u.count}  ${sample}`);
			}
		} else {
			lines.push('', 'No named styles are used in these pages.');
		}
		return lines.join('\n');
	}

	/** Names of a node and its two parents, e.g. ["BUTTON HOVER", "Forms"] (variant names like "State=Hover" included). */
	const namesOf = (id) => {
		const names = [];
		for (let at = index.get(id), i = 0; at && i < 3; at = index.get(at.parentId), i += 1) {
			names.push(at.node.name ?? '');
		}
		return names;
	};

	return { tools, onTool, overview, allNodes, has: (id) => index.has(id), namesOf };
}
