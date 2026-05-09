import { walkNodes, getScopedNodes } from './lib/node-utils.mjs';
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

	log('Walking all nodes...');
	const allNodes = [];
	walkNodes(figmaPayload?.document, (n) => allNodes.push(n));
	log(`  Found ${allNodes.length.toLocaleString()} nodes.`);

	// Pre-compute keyword-scoped node sets for the three domains that support it.
	// Each is null when no matching top-level frame is found, causing extractors
	// to fall through to their full-document pass automatically.
	const buttonScopedNodes = getScopedNodes(figmaPayload?.document, ['Buttons', 'UI Components', 'CTAs', 'Elements']);
	const colorScopedNodes  = getScopedNodes(figmaPayload?.document, ['Colors', 'Palette', 'Global Styles', 'Brand', 'Foundations']);
	const inputScopedNodes  = getScopedNodes(figmaPayload?.document, ['Inputs', 'Forms', 'Text Fields', 'Interactions']);
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
