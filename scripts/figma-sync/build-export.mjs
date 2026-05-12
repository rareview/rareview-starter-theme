import { walkProductionDocument, getScopedNodes, findFirstTextNode, getNodeFillHex } from './lib/node-utils.mjs';
import { buildStyleRegistry } from './lib/style-registry.mjs';
import { extractColors } from './elements/colors.mjs';
import { extractHeadings } from './elements/headings.mjs';
import {
	extractBody,
	extractBodyBackgroundColor,
	extractParagraphSizes,
} from './elements/body.mjs';
import { extractInputField } from './elements/input-field.mjs';
import { extractButtons, extractButtonBorderRadius } from './elements/button.mjs';
import { extractLinks } from './elements/link.mjs';
import { buildLayout, extractContainerWidth } from './elements/layout.mjs';
import { buildKeyedBySlug, buildTaggedNodes } from './variable-mapping.mjs';
import { firstSolidHex } from './lib/color-utils.mjs';

function nodeLabel(node) {
	if (!node) return 'n/a';
	const name = String(node.name ?? '').replace(/\s+/g, ' ').trim();
	return `${node.type} ${node.id}${name ? ` "${name}"` : ''}`;
}

function shortText(text, max = 48) {
	const s = String(text ?? '').replace(/\s+/g, ' ').trim();
	if (!s) return '';
	return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function approxEq(a, b, eps = 1) {
	return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= eps;
}

function findBestBodyTextNode(nodes, body) {
	if (!body?.fontFamilyPrimary) return null;
	let best = null;
	let bestScore = -1;
	for (const n of nodes) {
		if (n.type !== 'TEXT' || !n.style) continue;
		let score = 0;
		if (n.style.fontFamily === body.fontFamilyPrimary) score += 5;
		if (body.fontSize != null && approxEq(n.style.fontSize, body.fontSize, 0.25)) score += 3;
		if (body.fontWeight != null && n.style.fontWeight === body.fontWeight) score += 2;
		if (body.color && firstSolidHex(n.fills) === body.color) score += 2;
		score += Math.min((n.characters ?? '').length, 120) / 120;
		if (score > bestScore) {
			best = n;
			bestScore = score;
		}
	}
	return best;
}

function findBestButtonNode(nodes, button) {
	if (!button?.backgroundColor) return null;
	let best = null;
	let bestScore = -1;
	for (const n of nodes) {
		if (!['FRAME', 'INSTANCE', 'COMPONENT'].includes(n.type)) continue;
		if (firstSolidHex(n.fills) !== button.backgroundColor) continue;
		const t = findFirstTextNode(n);
		if (!t) continue;
		let score = 3; // background match already guaranteed
		if (button.borderRadius != null && approxEq(n.cornerRadius, button.borderRadius, 0.5)) score += 2;
		if (button.height != null && approxEq(n.absoluteBoundingBox?.height, button.height, 1.5)) score += 2;
		if (button.fontColor && firstSolidHex(t.fills) === button.fontColor) score += 4;
		if (button.fontSize != null && approxEq(t.style?.fontSize, button.fontSize, 0.25)) score += 1;
		if (button.fontWeight != null && t.style?.fontWeight === button.fontWeight) score += 1;
		if ((t.characters ?? '').length > 0 && (t.characters ?? '').length < 40) score += 0.5;
		if (score > bestScore) {
			best = { node: n, textNode: t, score };
			bestScore = score;
		}
	}
	return best;
}

function findBestInputNode(nodes, inputField) {
	if (!inputField) return null;
	let best = null;
	let bestScore = -1;
	for (const n of nodes) {
		if (!['FRAME', 'INSTANCE', 'RECTANGLE'].includes(n.type)) continue;
		let score = 0;
		if (inputField.height != null && approxEq(n.absoluteBoundingBox?.height, inputField.height, 1.5)) score += 3;
		if (inputField.borderWidth != null && approxEq(n.strokeWeight, inputField.borderWidth, 0.25)) score += 3;
		if (inputField.borderRadius != null && approxEq(n.cornerRadius, inputField.borderRadius, 0.5)) score += 2;
		if (/input|field|search|form/i.test(n.name ?? '')) score += 1;
		if (score > bestScore) {
			best = n;
			bestScore = score;
		}
	}
	return best;
}

function findFrameByWidth(nodes, width) {
	if (width == null) return null;
	return nodes.find((n) => n.type === 'FRAME' && approxEq(n.absoluteBoundingBox?.width, width, 1)) ?? null;
}

function findLargestBackgroundNode(nodes, hex) {
	if (!hex) return null;
	let best = null;
	let bestArea = -1;
	for (const n of nodes) {
		if (!['FRAME', 'SECTION', 'RECTANGLE'].includes(n.type)) continue;
		if (getNodeFillHex(n) !== hex) continue;
		const w = n.absoluteBoundingBox?.width ?? 0;
		const h = n.absoluteBoundingBox?.height ?? 0;
		const a = w * h;
		if (a > bestArea) {
			best = n;
			bestArea = a;
		}
	}
	return best;
}

function findBestHeadingNode(nodes, heading) {
	if (!heading) return null;
	let best = null;
	let bestScore = -1;
	for (const n of nodes) {
		if (n.type !== 'TEXT' || !n.style) continue;
		let score = 0;
		if (heading.fontFamily && n.style.fontFamily === heading.fontFamily) score += 3;
		if (heading.fontSize != null && approxEq(n.style.fontSize, heading.fontSize, 0.25)) score += 4;
		if (heading.fontWeight != null && n.style.fontWeight === heading.fontWeight) score += 1;
		if (heading.color && firstSolidHex(n.fills) === heading.color) score += 1;
		if (score > bestScore) {
			best = n;
			bestScore = score;
		}
	}
	return best;
}

function findBestLinkNode(nodes, links) {
	if (!links) return null;
	let best = null;
	let bestScore = -1;
	for (const n of nodes) {
		if (n.type !== 'TEXT' || !n.style) continue;
		let score = 0;
		if (/link/i.test(n.name ?? '')) score += 2;
		if (links.color && firstSolidHex(n.fills) === links.color) score += 4;
		if (links.fontWeight != null && n.style.fontWeight === links.fontWeight) score += 1;
		if (links.letterSpacing != null && approxEq(n.style.letterSpacing, links.letterSpacing, 0.05)) score += 1;
		if (score > bestScore) {
			best = n;
			bestScore = score;
		}
	}
	return best;
}

function logManualFindClues(log, nodes, data) {
	log('');
	log('Manual find clues (Figma node hints):');

	const bodyNode = findBestBodyTextNode(nodes, data.body);
	if (bodyNode) {
		log(`  Body text source: ${nodeLabel(bodyNode)} text="${shortText(bodyNode.characters)}"`);
	}

	const bgNode = findLargestBackgroundNode(nodes, data.body?.backgroundColor ?? null);
	if (bgNode) {
		log(`  Body background source: ${nodeLabel(bgNode)} fill=${getNodeFillHex(bgNode)}`);
	}

	const h1Desktop = findBestHeadingNode(nodes, data.headings?.desktop?.[0]);
	if (h1Desktop) {
		log(`  Heading desktop H1 clue: ${nodeLabel(h1Desktop)} text="${shortText(h1Desktop.characters)}"`);
	}
	const h1Mobile = findBestHeadingNode(nodes, data.headings?.mobile?.[0]);
	if (h1Mobile) {
		log(`  Heading mobile H1 clue: ${nodeLabel(h1Mobile)} text="${shortText(h1Mobile.characters)}"`);
	}

	const linkNode = findBestLinkNode(nodes, data.links);
	if (linkNode) {
		log(`  Link source: ${nodeLabel(linkNode)} text="${shortText(linkNode.characters)}" color=${firstSolidHex(linkNode.fills) ?? 'n/a'}`);
	}

	for (const [idx, btn] of (data.buttons ?? []).entries()) {
		const clue = findBestButtonNode(nodes, btn);
		if (!clue) continue;
		log(
			`  Button ${idx === 0 ? 'primary' : 'secondary'} source: ${nodeLabel(clue.node)} bg=${firstSolidHex(clue.node.fills) ?? 'n/a'}; text node: ${nodeLabel(clue.textNode)} text="${shortText(clue.textNode.characters)}" textColor=${firstSolidHex(clue.textNode.fills) ?? 'n/a'}`,
		);
	}

	const inputNode = findBestInputNode(nodes, data.inputField);
	if (inputNode) {
		log(`  Input field source: ${nodeLabel(inputNode)} h=${Math.round(inputNode.absoluteBoundingBox?.height ?? 0)} stroke=${inputNode.strokeWeight ?? 'n/a'} radius=${inputNode.cornerRadius ?? 'n/a'}`);
	}

	const containerNode = findFrameByWidth(nodes, data.layout?.containerWidth ?? null);
	if (containerNode) {
		log(`  Container width source: ${nodeLabel(containerNode)} width=${Math.round(containerNode.absoluteBoundingBox?.width ?? 0)}`);
	}

	const swatch = Array.isArray(data.colors?.swatches) && data.colors.swatches.length ? data.colors.swatches[0] : null;
	if (swatch?.hex) {
		const swatchNode = nodes.find((n) => firstSolidHex(n.fills) === swatch.hex);
		if (swatchNode) {
			log(`  Color swatch clue: ${nodeLabel(swatchNode)} fill=${swatch.hex}`);
		}
	}

	log('  Tip: copy any node ID above and use Cmd/Ctrl+P in Figma -> paste ID to jump.');
}

/**
 * @param {object} figmaPayload
 * @param {{ url: string, fileKey: string }} sourceInfo
 * @param {{ log: (msg?: string) => void, progressBar: (label: string, current: number, total: number) => void }} deps
 */
export function buildCssStyleExport(figmaPayload, sourceInfo, deps) {
	const { log, progressBar } = deps;
	const extractionSteps = 9;
	let extractionStep = 0;
	const tick = () => {
		extractionStep += 1;
		progressBar('Extracting', extractionStep, extractionSteps);
	};

	log('Building style registry...');
	const styleRegistry = buildStyleRegistry(figmaPayload?.styles);

	log('Walking all nodes (production pages only)...');
	const allNodes = [];
	walkProductionDocument(figmaPayload?.document, (n) => allNodes.push(n), log);
	log(`  Found ${allNodes.length.toLocaleString()} nodes.`);

	// Pre-compute keyword-scoped node sets for the three domains that support it.
	// Each is null when no matching top-level frame is found, causing extractors
	// to fall through to their full-document pass automatically.
	const buttonScopedNodes = getScopedNodes(figmaPayload?.document, ['Buttons', 'UI Components', 'CTAs', 'Elements'], log);
	const colorScopedNodes  = getScopedNodes(figmaPayload?.document, ['Colors', 'Palette', 'Global Styles', 'Brand', 'Foundations'], log);
	const inputScopedNodes  = getScopedNodes(figmaPayload?.document, ['Inputs', 'Forms', 'Text Fields', 'Interactions'], log);
	log(`  Scoped nodes — buttons: ${buttonScopedNodes?.length ?? 'none'}, colors: ${colorScopedNodes?.length ?? 'none'}, inputs: ${inputScopedNodes?.length ?? 'none'}.`);

	log('Extracting colors...');
	const colors = extractColors(allNodes, styleRegistry, colorScopedNodes);
	tick();

	// Body runs before headings so the heuristic fallback has the baseline font size.
	log('Extracting body font properties...');
	const bodyCore = extractBody(allNodes, styleRegistry);
	tick();

	log('Extracting headings (H1-H6, desktop then mobile)...');
	const headings = extractHeadings(allNodes, styleRegistry, bodyCore?.fontSize ?? null);
	tick();

	log('Extracting paragraph sizes...');
	const paragraphSizes = extractParagraphSizes(allNodes, styleRegistry, bodyCore);
	tick();

	log('Extracting input field styles...');
	const inputField = extractInputField(allNodes, inputScopedNodes);
	tick();

	log('Extracting container width...');
	const containerWidth = extractContainerWidth(allNodes);
	tick();

	log('Extracting body background color...');
	const backgroundColor = extractBodyBackgroundColor(allNodes, colors);
	tick();

	// Links run before buttons: the dominant link color is the most reliable
	// signal for the brand/primary color and is used to break ties when button
	// labels ("primary", "secondary") are absent or ambiguous.
	log('Extracting link style...');
	const links = extractLinks(allNodes, styleRegistry);
	tick();

	log('Extracting buttons...');
	const buttons = extractButtons(allNodes, links?.color ?? null, buttonScopedNodes);
	tick();

	// Derive button border radius from the primary button entry — it already has
	// the correct value (with the INSTANCE→COMPONENT fallback applied). Only fall
	// back to the independent name-pattern scan when no button was found at all.
	const buttonBorderRadius =
		buttons[0]?.borderRadius ?? extractButtonBorderRadius(allNodes);
	const layout = buildLayout(containerWidth, buttonBorderRadius);

	let body = null;
	if (bodyCore || paragraphSizes || backgroundColor) {
		body = { ...(bodyCore ?? {}) };
		if (paragraphSizes) {
			body.paragraphSizes = paragraphSizes;
		}
		if (backgroundColor) {
			body.backgroundColor = backgroundColor;
		}
	}

	if (bodyCore && body) {
		const hFonts = [...(headings.desktop ?? []), ...(headings.mobile ?? [])]
			.map((h) => h.fontFamily)
			.filter(Boolean);
		const hCounts = hFonts.reduce((m, f) => m.set(f, (m.get(f) ?? 0) + 1), new Map());
		const dominantHeadingFont = [...hCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

		if (dominantHeadingFont && dominantHeadingFont !== body.fontFamilyPrimary) {
			body.fontFamilySecondary = dominantHeadingFont;
			log(`  Secondary font resolved from headings: ${dominantHeadingFont}`);
		} else {
			const btnFont = buttons[0]?.fontFamily ?? null;
			if (btnFont && btnFont !== body.fontFamilyPrimary) {
				body.fontFamilySecondary = btnFont;
				log(`  Secondary font resolved from buttons: ${btnFont}`);
			} else if (body.fontFamilySecondary) {
				log(`  Secondary font kept from body detection: ${body.fontFamilySecondary}`);
			}
		}
	}

	const sections = ['colors', 'headings'];
	if (body) {
		sections.push('body');
	}
	if (inputField) {
		sections.push('inputField');
	}
	if (layout) {
		sections.push('layout');
	}
	sections.push('buttons');
	if (links) {
		sections.push('links');
	}

	const keyedBySlug = buildKeyedBySlug(allNodes);
	if (keyedBySlug) {
		sections.push('keyedBySlug');
	}

	const taggedNodes = buildTaggedNodes(allNodes);
	if (taggedNodes) {
		sections.push('taggedNodes');
	}

	logManualFindClues(log, allNodes, {
		colors,
		headings,
		body,
		inputField,
		layout,
		buttons,
		links,
	});

	const result = {
		meta: {
			generatedAt: new Date().toISOString(),
			source: sourceInfo,
			totalNodesScanned: allNodes.length,
			sections,
		},
		colors,
		headings,
	};

	if (body) {
		result.body = body;
	}
	if (inputField) {
		result.inputField = inputField;
	}
	if (layout) {
		result.layout = layout;
	}
	result.buttons = buttons;
	if (links) {
		result.links = links;
	}
	if (keyedBySlug) {
		result.keyedBySlug = keyedBySlug;
	}
	if (taggedNodes) {
		result.taggedNodes = taggedNodes;
	}

	return result;
}
