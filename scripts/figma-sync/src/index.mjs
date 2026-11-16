/**
 * AI sync: the AI reads only the pages the user pasted, measures with tools, and decides every value.
 * Output is generated/figma-export.json in the shape figma-apply reads (keyedBySlug + structured sections).
 */


import { buildFigmaNodeUrl } from '../lib/figma-api.mjs';
import { hexLuminance } from '../lib/color-utils.mjs';
import { parseAiJson } from './parse-ai.mjs';
import { getUsageTotals, runAiWithTools } from './provider.mjs';
import { createSpinner } from '../lib/spinner.mjs';
import { color, detail, step, warn } from '../lib/ui.mjs';
import { buildSystemPrompt, buildUserMessage, readTargets } from './prompt.mjs';
import { createFigmaTools } from './tools.mjs';

const MAX_TOOL_CALLS = 45;

function short(text, max = 90) {
	const s = String(text ?? '').replace(/\s+/g, ' ').trim();
	return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function toNumber(value) {
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : null;
	}
	const m = String(value ?? '').trim().match(/^(-?\d*\.?\d+)\s*(px|em|%)?$/i);
	return m ? Number.parseFloat(m[1]) : null;
}

/**
 * Check and clean one value. Returns { value } or { problem }.
 *
 * @param {unknown} raw
 * @param {{ kind: string }} format
 */
function cleanValue(raw, format) {
	if (raw == null || raw === '') {
		return { problem: 'empty' };
	}
	switch (format.kind) {
		case 'hex': {
			const m = String(raw).trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/i);
			if (!m) {
				return { problem: `not a #RRGGBB color: ${raw}` };
			}
			const hex = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
			return { value: `#${hex.toUpperCase()}` };
		}
		case 'family': {
			const family = String(raw).replace(/["']/g, '').split(',')[0].trim();
			return family ? { value: family } : { problem: 'empty font family' };
		}
		case 'weight': {
			const n = toNumber(raw);
			return n != null && n >= 100 && n <= 1000 ? { value: Math.round(n) } : { problem: `not a font weight: ${raw}` };
		}
		case 'ratio': {
			const n = toNumber(raw);
			return n != null && n >= 0.5 && n <= 3 ? { value: Math.round(n * 100) / 100 } : { problem: `line height should be a ratio like 1.4: ${raw}` };
		}
		case 'em': {
			const n = toNumber(raw);
			return n != null && Math.abs(n) <= 0.5 ? { value: Math.round(n * 1000) / 1000 } : { problem: `letter spacing should be in em: ${raw}` };
		}
		case 'ls-css': {
			if (typeof raw === 'string' && /^(normal|0)$/i.test(raw.trim())) {
				return { value: '0' };
			}
			const n = toNumber(raw);
			if (n == null) {
				return { problem: `not a letter spacing: ${raw}` };
			}
			const unit = /em$/i.test(String(raw).trim()) ? 'em' : 'px';
			return { value: n === 0 ? '0' : `${Math.round(n * 1000) / 1000}${unit}` };
		}
		case 'transform': {
			const v = String(raw).trim().toLowerCase();
			return ['none', 'uppercase', 'lowercase', 'capitalize'].includes(v) ? { value: v } : { problem: `not a text transform: ${raw}` };
		}
		case 'decoration': {
			const v = String(raw).trim().toLowerCase();
			return ['none', 'underline', 'line-through'].includes(v) ? { value: v } : { problem: `not a text decoration: ${raw}` };
		}
		default: {
			const n = toNumber(raw);
			return n != null && n >= 0 && n <= 4000 ? { value: Math.round(n * 100) / 100 } : { problem: `not a px number: ${raw}` };
		}
	}
}

/** Contrast ratio between two hex colors (WCAG). */
function contrast(a, b) {
	const la = hexLuminance(a);
	const lb = hexLuminance(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Plain checks on the final values. They only warn; they do not change values.
 *
 * @param {Record<string, unknown>} v
 * @returns {string[]}
 */
function checkValues(v) {
	const warnings = [];
	for (const vp of ['desktop', 'mobile']) {
		const sizes = [1, 2, 3, 4, 5, 6].map((n) => v[`heading-${n}-font-size-${vp}`]);
		for (let i = 1; i < sizes.length; i += 1) {
			if (sizes[i] != null && sizes[i - 1] != null && sizes[i] >= sizes[i - 1]) {
				const word = sizes[i] === sizes[i - 1] ? 'the same size as' : 'bigger than';
				warnings.push(`Heading ${i + 1} ${vp} (${sizes[i]}px) is ${word} heading ${i} (${sizes[i - 1]}px). Each level must be smaller than the one above: choose in-between sizes.`);
			}
		}
		const body = ['small', 'medium', 'large'].map((s) => v[`body-size-${vp}-${s}`]);
		if (body[0] != null && body[1] != null && body[0] > body[1]) {
			warnings.push(`Body ${vp} small (${body[0]}px) is bigger than medium (${body[1]}px).`);
		}
		if (body[1] != null && body[2] != null && body[1] > body[2]) {
			warnings.push(`Body ${vp} medium (${body[1]}px) is bigger than large (${body[2]}px).`);
		}
	}
	for (let n = 1; n <= 6; n += 1) {
		const d = v[`heading-${n}-font-size-desktop`];
		const m = v[`heading-${n}-font-size-mobile`];
		if (d != null && m != null && m > d) {
			warnings.push(`Heading ${n} mobile (${m}px) is bigger than desktop (${d}px).`);
		}
	}
	for (const role of ['primary', 'secondary']) {
		const bg = v[`button-${role}-background-color`];
		const fg = v[`button-${role}-font-color`];
		if (bg && fg && contrast(bg, fg) < 3) {
			warnings.push(`Button ${role}: label ${fg} on ${bg} is hard to read (contrast ${contrast(bg, fg).toFixed(1)}).`);
		}
	}
	if (v['color-body'] && v['color-background'] && contrast(v['color-body'], v['color-background']) < 3) {
		warnings.push(`Body text ${v['color-body']} on background ${v['color-background']} is hard to read.`);
	}
	// Can it be seen on the page at all?
	const page = v['color-background'];
	if (page) {
		for (const role of ['primary', 'secondary']) {
			const bg = v[`button-${role}-background-color`];
			const border = v[`button-${role}-border-color`];
			const width = Number(v[`button-${role}-border-width`] ?? 0);
			if (!bg) {
				continue;
			}
			const shapeVisible = contrast(bg, page) >= 1.25 || (width > 0 && border && contrast(border, page) >= 1.5);
			if (!shapeVisible) {
				warnings.push(`Button ${role}: background ${bg}${width > 0 && border ? ` and border ${border}` : ''} almost disappear on the page background ${page}. Check it is the real button.`);
			}
		}
		for (const slug of ['color-link', 'color-link-hover']) {
			if (v[slug] && contrast(v[slug], page) < 3) {
				warnings.push(`${slug} ${v[slug]} on the page background ${page} is hard to read (contrast ${contrast(v[slug], page).toFixed(1)}).`);
			}
		}
	}
	return warnings;
}

/**
 * Outline buttons (transparent, colored border and label) are not drawn in most designs, so code picks their color:
 * the first of the button's own colors (background, border, label) that is easy to see on the page background,
 * else the one with the most contrast. A light button on a light page then gets an outline in its dark border or label color.
 *
 * @param {Record<string, unknown>} v
 * @returns {Record<string, string>}
 */
function pickOutlineColors(v) {
	const out = {};
	const page = typeof v['color-background'] === 'string' ? v['color-background'] : '#FFFFFF';
	for (const role of ['primary', 'secondary']) {
		const options = [v[`button-${role}-background-color`], v[`button-${role}-border-color`], v[`button-${role}-font-color`]].filter(
			(c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c),
		);
		if (!options.length) {
			continue;
		}
		out[`button-${role}-outline-color`] =
			options.find((c) => contrast(c, page) >= 3) ?? [...options].sort((a, b) => contrast(b, page) - contrast(a, page))[0];
	}
	return out;
}

/**
 * Build figma-export.json from the flat values.
 *
 * @param {Record<string, unknown>} v cleaned values by slug
 */
function buildSections(v) {
	const pick = (obj) => Object.fromEntries(Object.entries(obj).filter(([, value]) => value != null));
	const sizes = (vp) =>
		pick({
			small: v[`body-size-${vp}-small`] != null ? { fontSize: v[`body-size-${vp}-small`] } : null,
			medium: v[`body-size-${vp}-medium`] != null ? { fontSize: v[`body-size-${vp}-medium`] } : null,
			large: v[`body-size-${vp}-large`] != null ? { fontSize: v[`body-size-${vp}-large`] } : null,
		});
	const paragraphSizes = { desktop: sizes('desktop'), mobile: sizes('mobile') };

	const body = pick({
		fontFamilyPrimary: v['body-font-family'],
		fontFamilySecondary: v['font-family-secondary'],
		fontWeight: v['body-font-weight'],
		bodyLineHeightRatio: v['body-line-height'],
		letterSpacing: v['body-letter-spacing'],
		color: v['color-body'],
		backgroundColor: v['color-background'],
		paragraphSizes,
	});

	const headings = { desktop: [], mobile: [] };
	for (let n = 1; n <= 6; n += 1) {
		headings.desktop.push(
			pick({
				fontFamily: v[`heading-${n}-font-family`],
				fontWeight: v[`heading-${n}-font-weight`],
				fontSize: v[`heading-${n}-font-size-desktop`],
				lineHeight: v[`heading-${n}-line-height`],
				letterSpacing: v[`heading-${n}-letter-spacing`],
				textTransform: v[`heading-${n}-text-transform`],
			}),
		);
		headings.mobile.push(pick({ fontFamily: v[`heading-${n}-font-family`], fontSize: v[`heading-${n}-font-size-mobile`] }));
	}

	const button = (role) =>
		pick({
			backgroundColor: v[`button-${role}-background-color`],
			fontColor: v[`button-${role}-font-color`],
			height: v[`button-${role}-height`],
			borderRadius: v[`button-${role}-border-radius`],
			borderWidth: v[`button-${role}-border-width`],
			borderColor: v[`button-${role}-border-color`],
			paddingX: v[`button-${role}-padding-x`],
			paddingY: v[`button-${role}-padding-y`],
			fontFamily: v[`button-${role}-font-family`],
			fontSize: v[`button-${role}-font-size`],
			fontWeight: v[`button-${role}-font-weight`],
			letterSpacing: v[`button-${role}-letter-spacing`],
			textTransform: v[`button-${role}-text-transform`],
		});

	const mono = ['color-dark', 'color-dark-grey', 'color-grey', 'color-grey-light'].map((slug) => (v[slug] ? { hex: v[slug], slug } : null));
	const colored = [];
	for (let n = 1; n <= 10; n += 1) {
		if (v[`brand-${n}`]) {
			colored.push({ hex: v[`brand-${n}`] });
		}
	}

	return {
		colors: { mono: mono.filter(Boolean), colored },
		headings,
		body,
		paragraphSizes,
		buttons: [button('primary'), button('secondary')],
		links: pick({
			color: v['color-link'],
			hoverColor: v['color-link-hover'],
			fontWeight: v['link-font-weight'],
			letterSpacing: v['link-letter-spacing'],
			textDecoration: v['link-text-decoration'],
			textDecorationHover: v['link-text-decoration-hover'],
		}),
		inputHeight: v['input-field-height'],
		inputBorderRadius: v['input-field-border-radius'],
		borderWidth: v['input-field-border-width'],
		containerWidth: v['container-width'],
		layout: pick({ containerWidth: v['container-width'], buttonBorderRadius: v['button-primary-border-radius'] }),
	};
}

/**
 * keyedBySlug is what figma-apply reads first. Heading font rows are SCSS references,
 * so a family name becomes $body-font-family or $font-family-secondary.
 *
 * @param {Record<string, unknown>} v
 */
function buildKeyedBySlug(v) {
	const keyed = { ...v };
	delete keyed['button-primary-font-family'];
	delete keyed['button-secondary-font-family'];
	for (let n = 1; n <= 6; n += 1) {
		const slug = `heading-${n}-font-family`;
		if (!keyed[slug]) {
			continue;
		}
		keyed[slug] = keyed[slug] === v['body-font-family'] ? '$body-font-family' : '$font-family-secondary';
	}
	if (typeof keyed['link-font-weight'] === 'number') {
		keyed['link-font-weight'] = String(keyed['link-font-weight']);
	}
	return keyed;
}

function formatValue(value) {
	return typeof value === 'string' ? value : JSON.stringify(value);
}


/** Slugs a design often does not have; missing ones are not sent to review. */
const OPTIONAL_SLUGS = new Set(['button-outline-border-width', 'brand-3', 'brand-4', 'brand-5', 'brand-6', 'brand-7', 'brand-8', 'brand-9', 'brand-10']);
const REVIEW_TOOL_CALLS = 25;

/**
 * @param {string} text
 * @param {{ provider: string, apiKey: string, model: string }} settings
 */
async function parseAnswer(text, settings) {
	try {
		return parseAiJson(text);
	} catch {
		warn('The answer was not clean JSON. Asking the AI to fix the format...');
		const repair = await runAiWithTools({
			settings,
			system: 'Convert the text to the JSON object it describes. Answer with only the JSON.',
			userText: text,
		});
		return parseAiJson(repair.text);
	}
}

/**
 * Clean every value and note what is wrong.
 *
 * @param {object} answer
 * @param {ReturnType<typeof readTargets>} targets
 * @param {(id: string) => boolean} hasNode
 */
function interpret(answer, targets, hasNode) {
	const raw = answer?.values && typeof answer.values === 'object' ? answer.values : {};
	const values = {};
	const rows = [];
	const problems = [];
	const badNodes = [];
	for (const target of targets) {
		const entry = raw[target.slug];
		const given = entry && typeof entry === 'object' && 'value' in entry ? entry : entry != null ? { value: entry } : null;
		if (!given || given.value == null || given.value === '') {
			rows.push({ target, missing: true, given });
			continue;
		}
		const cleaned = cleanValue(given.value, target.format);
		if ('problem' in cleaned) {
			problems.push(`${target.slug}: ${cleaned.problem}`);
			rows.push({ target, missing: true, given });
			continue;
		}
		if (!given.node || !hasNode(String(given.node))) {
			badNodes.push(target.slug);
		}
		values[target.slug] = cleaned.value;
		rows.push({ target, value: cleaned.value, given });
	}
	return { raw, values, rows, problems, badNodes };
}

/**
 * @param {ReturnType<typeof interpret>} state
 * @param {ReturnType<typeof readTargets>} targets
 * @returns {string[]}
 */
/**
 * Clean a color name from the AI: last part of a Figma style path ("Brand/Forest Green" → "Forest Green"),
 * letters, digits and spaces only, Title Case, at most 3 words.
 *
 * @param {unknown} name
 * @returns {string}
 */
function cleanColorName(name) {
	const last = (String(name ?? '').split('/').pop() ?? '').trim();
	// A hex code or a number is not a name ("#1F513F", "500").
	if (/^#[0-9a-f]{3,8}$/i.test(last) || (/^[0-9a-f]{6}$/i.test(last) && /\d/.test(last)) || !/\p{L}/u.test(last)) {
		return '';
	}
	const words = last
		.replace(/[^\p{L}\p{N} -]+/gu, ' ')
		.split(/[\s_-]+/)
		.filter(Boolean)
		.slice(0, 3);
	return words.map((w) => (/\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join(' ');
}

/**
 * Names for the brand colors (shown in the WordPress color picker). Two colors never get the same name.
 *
 * @param {Record<string, any>} raw The AI answer values.
 * @param {Record<string, unknown>} values The checked values.
 * @returns {Record<string, string>} e.g. { "brand-1": "Green", "brand-2": "Sand" }
 */
function buildColorNames(raw, values) {
	const names = {};
	const used = new Set();
	for (let i = 1; i <= 10; i += 1) {
		const slug = `brand-${i}`;
		if (values[slug] == null) {
			continue;
		}
		let name = cleanColorName(raw[slug]?.name);
		if (!name) {
			continue;
		}
		for (let n = 2; used.has(name.toLowerCase()); n += 1) {
			name = `${cleanColorName(raw[slug]?.name)} ${n}`;
		}
		used.add(name.toLowerCase());
		names[slug] = name;
	}
	return names;
}

/** Layer names that mean "a state of a button", not a button style of its own. */
const STATE_NAME = /\b(hover(ed)?|press(ed)?|active|focus(ed)?|disabled|selected|visited|loading)\b/i;

/**
 * @param {object} state
 * @param {Array<{ slug: string }>} targets
 * @param {(id: string) => string[]} namesOf
 */
function listIssues(state, targets, namesOf) {
	const issues = [];
	for (const role of ['primary', 'secondary']) {
		const node = state.raw[`button-${role}-background-color`]?.node;
		const stateName = node ? namesOf(String(node)).find((n) => STATE_NAME.test(n)) : null;
		if (stateName) {
			issues.push(
				`The ${role} button values come from "${stateName}", which is a state (hover, pressed, disabled…) of a button, not a button style. ` +
					`Use the normal state. If the design has no second button style, give the secondary button the same values as the primary button (low).`,
			);
		}
	}
	const missing = targets.filter((t) => !(t.slug in state.values) && !OPTIONAL_SLUGS.has(t.slug)).map((t) => t.slug);
	if (missing.length) {
		issues.push(`Missing values: ${missing.join(', ')}. Find them, or derive them like a developer would (see the rules) and mark them low. Leave one out only if it truly cannot exist.`);
	}
	for (const p of state.problems) {
		issues.push(`Rejected ${p}. Give it in the right format.`);
	}
	for (const w of checkValues(state.values)) {
		issues.push(`Check: ${w} Fix it, or confirm it is really like this in the design.`);
	}
	if (state.badNodes.length) {
		issues.push(`These values do not point at a real node id from the tools: ${state.badNodes.join(', ')}. Inspect a real node and give its id.`);
	}
	const same = (a, b) => state.values[a] != null && state.values[a] === state.values[b];
	if (same('input-field-height', 'button-secondary-height') && state.raw['input-field-height']?.node === state.raw['button-secondary-height']?.node) {
		issues.push('The form field values come from the same node as the secondary button. Find a real form field (input_candidates, search for "input|field|form|email|search"), or mark the values low.');
	}
	return issues;
}

/**
 * @param {string} firstMessage
 * @param {object} answer
 * @param {string[]} issues
 */
function buildReviewMessage(firstMessage, answer, issues) {
	return `${firstMessage}

## Your first answer
${JSON.stringify(answer, null, 1)}

## Review
A code check found these things. Use the tools to fix them. Keep values that are right.
${issues.map((i) => `- ${i}`).join('\n')}

Answer with the same JSON format. Include only the slugs you add or change; the others stay as they are.`;
}

/**
 * Figma links for the Preview page: one entry per slug with value, node and reason.
 * figma-apply copies this file into the theme (generated/figma-sources.json).
 */
function buildThemeSources({ rows, values, warnings, problems, fileKey, url }) {
	const sources = {};
	for (const row of rows) {
		if (row.missing) {
			continue;
		}
		const nodeId = row.given?.node ? String(row.given.node) : null;
		sources[row.target.slug] = {
			value: row.value,
			nodeId,
			url: nodeId ? buildFigmaNodeUrl(fileKey, nodeId) : null,
			note: [row.given?.confidence, row.given?.why].filter(Boolean).join(': ') || null,
			label: row.target.label,
		};
	}
	const background = values['color-background'] ?? null;
	const body = values['color-body'] ?? null;
	return {
		generatedAt: new Date().toISOString(),
		fileKey,
		fileUrl: url,
		surface: {
			background,
			body,
			isDark: background ? hexLuminance(background) < 0.45 : false,
			contrastRatio: background && body ? Number(contrast(background, body).toFixed(2)) : null,
		},
		warnings: [...warnings, ...problems.map((p) => `Rejected ${p}`)].map((message) => ({ code: 'check', slug: '', message, value: null, url: null })),
		sources,
	};
}

/**
 * @param {object} opts
 * @param {{ fileName: string, roots: object[], styles: object, components: object, componentSets: object, source: string }} opts.pages
 * @param {string} opts.fileKey
 * @param {string} opts.url
 * @param {{ provider: string, apiKey: string, model: string }} opts.settings
 * @param {string} opts.figmaToken
 * @param {string} opts.imageDir
 * @param {(msg?: string) => void} opts.log
 * @returns {Promise<{ exportPayload: object, report: string, summary: string[] }>}
 */
export async function runAiSync(opts) {
	const { pages, fileKey, url, settings, figmaToken, imageDir, log } = opts;
	const figmaTools = createFigmaTools({ ...pages, fileKey, figmaToken, imageDir });
	const targets = readTargets();
	const system = buildSystemPrompt(MAX_TOOL_CALLS);
	const userText = buildUserMessage(figmaTools.overview(), targets);

	const toolLog = [];
	// A loader with a timer and a step count, so a long wait does not look stuck. Each tool call only with --details.
	const spinner = createSpinner('AI is working');
	const onTool = async (name, input) => {
		const n = toolLog.length + 1;
		const args = short(JSON.stringify(input ?? {}), 70);
		spinner.stop();
		detail(`${String(n).padStart(2)}. ${name} ${args}`);
		spinner.setExtra(`${n} step${n === 1 ? '' : 's'}`);
		const started = Date.now();
		try {
			const result = await figmaTools.onTool(name, input);
			toolLog.push({ name, input, ms: Date.now() - started, chars: result.text.length, images: result.images?.length ?? 0 });
			log(`[tool ${n}] ${name} ${JSON.stringify(input)}\n${result.text}\n`);
			return result;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			toolLog.push({ name, input, error: message });
			log(`[tool ${n}] ${name} ${JSON.stringify(input)}\nERROR ${message}\n`);
			return { text: `Error: ${message}` };
		} finally {
			spinner.start();
		}
	};
	const withSpinner = async (run) => {
		spinner.start();
		try {
			return await run();
		} finally {
			spinner.stop();
		}
	};

	step(`AI (${settings.provider}, ${settings.model}) is reading the design...`);
	const result = await withSpinner(() =>
		runAiWithTools({
			settings,
			system,
			userText,
			tools: figmaTools.tools,
			onTool,
			maxCalls: MAX_TOOL_CALLS,
			maxInputTokens: 3000000,
		}),
	);
	log(`[AI answer]\n${result.text}\n`);

	let answer = await parseAnswer(result.text, settings);
	let state = interpret(answer, targets, figmaTools.has);
	let reviewed = false;

	const issues = listIssues(state, targets, figmaTools.namesOf);
	if (issues.length) {
		console.log(`  ${color.yellow('↻')} Review: ${issues.length} thing(s) to fix or confirm. The AI checks them again...`);
		const before = toolLog.length;
		const review = await withSpinner(() =>
			runAiWithTools({
				settings,
				system,
				userText: buildReviewMessage(userText, answer, issues),
				tools: figmaTools.tools,
				onTool,
				maxCalls: REVIEW_TOOL_CALLS,
				maxInputTokens: 3000000,
			}),
		);
		log(`[AI review answer]\n${review.text}\n`);
		try {
			const fixed = await parseAnswer(review.text, settings);
			const merged = { ...(answer?.values ?? {}), ...(fixed?.values ?? {}) };
			// A review answer that fixes a brand color but forgets its name keeps the first name.
			for (const [slug, entry] of Object.entries(fixed?.values ?? {})) {
				const before = answer?.values?.[slug];
				if (entry && typeof entry === 'object' && !entry.name && before?.name) {
					merged[slug] = { ...entry, name: before.name };
				}
			}
			answer = {
				values: merged,
				notes: [...(answer?.notes ?? []), ...(fixed?.notes ?? []).map((n) => `Review: ${n}`)],
			};
			state = interpret(answer, targets, figmaTools.has);
			reviewed = true;
		} catch (error) {
			warn(`Review answer could not be read (${error instanceof Error ? error.message : error}). Keeping the first answer.`);
		}
		log(`Review used ${toolLog.length - before} tool calls.`);
	}

	const { raw, values, rows, problems } = state;
	const warnings = checkValues(values);
	const sections = buildSections(values);
	const keyedBySlug = { ...buildKeyedBySlug(values), ...pickOutlineColors(values) };
	const usage = getUsageTotals();
	const colorNames = buildColorNames(raw, values);

	const exportPayload = {
		meta: {
			generatedAt: new Date().toISOString(),
			source: { url, fileKey },
			extractor: 'ai',
			model: `${settings.provider}/${settings.model}`,
			pages: pages.roots.map((r) => ({ id: r.id, name: r.name, type: r.type })),
			totalNodesScanned: figmaTools.allNodes.length,
			sections: ['keyedBySlug', ...Object.keys(sections)],
		},
		keyedBySlug,
		...sections,
		// Names for the brand-N palette entries; figma-apply writes them into theme.json.
		colorNames,
		ai: {
			values: raw,
			notes: Array.isArray(answer?.notes) ? answer.notes : [],
			warnings,
			problems,
			toolCalls: toolLog.length,
			reviewed,
		},
	};

	const count = (c) => rows.filter((r) => !r.missing && r.given?.confidence === c).length;
	const found = rows.filter((r) => !r.missing);
	const missing = rows.filter((r) => r.missing);
	const cost = usage.usd != null ? `about $${usage.usd.toFixed(2)}` : 'unknown cost';

	const md = [
		'# Figma Sync report',
		'',
		`- File: ${pages.fileName || fileKey}`,
		`- Pages: ${pages.roots.map((r) => `"${r.name}" (${buildFigmaNodeUrl(fileKey, r.id)})`).join(', ')}`,
		`- Model: ${settings.provider} ${settings.model}; ${toolLog.length} tool calls; ${usage.inputTokens + usage.cacheReadTokens} input / ${usage.outputTokens} output tokens; ${cost}`,
		`- Found ${found.length} of ${rows.length} values: ${count('high')} high, ${count('medium')} medium, ${count('low')} low confidence.`,
		'',
	];
	if (warnings.length || problems.length) {
		md.push('## Check these', '', ...warnings.map((w) => `- ${w}`), ...problems.map((p) => `- Rejected ${p}`), '');
	}
	if (exportPayload.ai.notes.length) {
		md.push('## AI notes', '', ...exportPayload.ai.notes.map((n) => `- ${n}`), '');
	}
	md.push('## Values', '', '| Value | Result | Confidence | Figma node | Why |', '| --- | --- | --- | --- | --- |');
	let section = '';
	for (const row of rows) {
		if (row.target.section !== section) {
			section = row.target.section;
			md.push(`| **${section}** | | | | |`);
		}
		const nodeUrl = row.given?.node ? buildFigmaNodeUrl(fileKey, String(row.given.node)) : null;
		const node = nodeUrl ? `[${row.given.node}](${nodeUrl})` : String(row.given?.node ?? '').replace(/\|/g, '/');
		const why = String(row.given?.why ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ');
		const colorName = colorNames[row.target.slug] ? ` ${colorNames[row.target.slug]}` : '';
		md.push(`| ${row.target.slug} | ${row.missing ? '—' : `\`${formatValue(row.value)}\`${colorName}`} | ${row.missing ? 'not found' : (row.given?.confidence ?? '')} | ${node} | ${why} |`);
	}
	md.push('', '## Tool calls', '', ...toolLog.map((t, i) => `${i + 1}. ${t.name} ${short(JSON.stringify(t.input), 120)}${t.error ? ` — error: ${t.error}` : ''}`), '');

	const summary = [
		`Found ${found.length} of ${rows.length} values (${count('high')} high, ${count('medium')} medium, ${count('low')} low). ${toolLog.length} tool calls, ${cost}.`,
	];
	if (missing.length) {
		summary.push(`Not found: ${missing.map((r) => r.target.slug).join(', ')}`);
	}
	for (const w of [...warnings, ...problems.map((p) => `Rejected ${p}`)]) {
		summary.push(`! ${w}`);
	}

	const themeSources = buildThemeSources({ rows, values, warnings, problems, fileKey, url });

	return { exportPayload, report: `${md.join('\n')}\n`, summary, themeSources };
}
