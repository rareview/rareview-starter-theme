/**
 * Style step of the AI sync: after the variables are applied, the AI looks at the design again and edits the theme's
 * SCSS directly for details that variables cannot express (shadows, an arrow on buttons, underline style, hover look…).
 *
 * The sync is the first step of a project, so every sync starts from the clean styles: the AI's edits from the last
 * sync are undone first. generated/style-state.json remembers, per edited file, the text before the AI edited it and a
 * hash of the text the AI left. A file still exactly as the AI left it goes back to its text from before; a file that
 * changed since (you edited it, or reset it with git) is left alone and counts as clean.
 * After the AI's edits the theme CSS is compiled; when it does not compile, the edits are undone.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSpinner } from '../lib/spinner.mjs';
import { DETAILS, color, detail, fail, note, ok, step, warn } from '../lib/ui.mjs';
import { parseAiJson } from './parse-ai.mjs';
import { runAiWithTools } from './provider.mjs';
import { createFigmaTools } from './tools.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const THEME_DIR = path.join(REPO_ROOT, 'wp-content', 'themes', 'rv-starter');
const CSS_DIR = path.join(THEME_DIR, 'assets', 'css');
const STATE_PATH = path.join(__dirname, '..', 'generated', 'style-state.json');
const MAX_TOOL_CALLS = 40;

/** Files the AI may edit (paths in assets/css/), with what they style. */
const EDITABLE = {
	'abstracts/mixins/buttons/primary.scss': 'Primary button (mixin used by .rv-button--primary, core Button block, submit buttons)',
	'abstracts/mixins/buttons/secondary.scss': 'Secondary button (mixin)',
	'abstracts/mixins/links.scss': 'Links in text (mixin)',
	'abstracts/mixins/headings.scss': 'Headings H1-H6 (mixins)',
	'abstracts/mixins/quotes.scss': 'Quotes (mixin)',
	'abstracts/mixins/input-fields/input-text.scss': 'Text inputs and textareas (mixin)',
	'abstracts/mixins/input-fields/input-select.scss': 'Select fields (mixin)',
	'abstracts/mixins/input-fields/input-checkbox.scss': 'Checkboxes (mixin)',
	'abstracts/mixins/input-fields/input-radio.scss': 'Radio buttons (mixin)',
	'abstracts/mixins/input-fields/input-label.scss': 'Form labels (mixin)',
	'blocks/button.scss': 'Core Button block',
	'blocks/quote.scss': 'Core Quote block',
	'blocks/image.scss': 'Core Image block',
};

/** Files the AI may read but not edit (the sync writes the variables). */
const READ_ONLY = {
	'abstracts/variables/variables.scss': 'All SCSS variables (set by the sync; read only)',
	'global/global.scss': 'Global element styles (read only)',
};

/** Entry files compiled to check the edits. */
const ENTRIES = ['frontend.scss', 'editor-content-overrides.scss'];

const hash = (text) => createHash('sha256').update(text).digest('hex');

/** @returns {Promise<Record<string, { clean: string, edited: string }>>} */
async function readState() {
	try {
		return JSON.parse(await fs.readFile(STATE_PATH, 'utf8'));
	} catch {
		return {};
	}
}

async function writeState(state) {
	await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
	await fs.writeFile(STATE_PATH, `${JSON.stringify(state, null, '\t')}\n`, 'utf8');
}

/**
 * Undo the AI's edits from the last sync, only in files still exactly as the AI left them.
 *
 * @returns {Promise<string[]>} The files put back.
 */
export async function resetStyles() {
	const state = await readState();
	const restored = [];
	for (const [file, entry] of Object.entries(state)) {
		const full = path.join(CSS_DIR, file);
		const current = await fs.readFile(full, 'utf8').catch(() => null);
		if (current != null && hash(current) === entry.edited) {
			await fs.writeFile(full, entry.clean, 'utf8');
			restored.push(file);
		}
	}
	await writeState({});
	return restored;
}

/** Text of every editable file, to undo this run's edits. */
async function snapshot() {
	const texts = {};
	for (const file of Object.keys(EDITABLE)) {
		texts[file] = await fs.readFile(path.join(CSS_DIR, file), 'utf8');
	}
	return texts;
}

/**
 * Compile the theme CSS with the theme's own Sass.
 *
 * @returns {{ ok: boolean, error?: string, skipped?: boolean }}
 */
export function compileStyles() {
	const sass = path.join(THEME_DIR, 'node_modules', '.bin', 'sass');
	const outDir = path.join(os.tmpdir(), 'rv-figma-sync-css');
	for (const entry of ENTRIES) {
		const result = spawnSync(
			sass,
			['--no-source-map', '--quiet', `--load-path=${path.join(THEME_DIR, 'node_modules')}`, path.join(CSS_DIR, entry), path.join(outDir, entry.replace(/\.scss$/, '.css'))],
			{ encoding: 'utf8' },
		);
		if (result.error) {
			return { ok: false, skipped: true, error: `Sass not found (${result.error.message}). Run npm install in the theme.` };
		}
		if (result.status !== 0) {
			return { ok: false, error: `${entry}: ${(result.stderr || result.stdout).trim().slice(0, 1500)}` };
		}
	}
	return { ok: true };
}

/** Properties that change an element's size: setting them only in a state (hover, focus…) makes it move. */
const SIZE_PROPS = /^\s*(border(-(top|right|bottom|left))?(-width)?|padding(-[a-z]+)?|font-size|font-weight|letter-spacing|height|width|line-height)\s*:\s*([^;]+);/gm;

/**
 * Rules inside :hover / :focus / :active / :focus-visible blocks that change the element's size.
 * A border with only a new color ("border-color") is fine; "border: 1px solid …" in a state is not.
 *
 * @param {string} file
 * @param {string} text SCSS
 * @returns {string[]}
 */
export function findLayoutShifts(file, text) {
	const out = [];
	const state = /:(hover|focus-visible|focus|active)\b[^{;]*\{/g;
	let match;
	while ((match = state.exec(text))) {
		// The block of this selector, braces balanced.
		let depth = 1;
		let i = match.index + match[0].length;
		const start = i;
		while (i < text.length && depth > 0) {
			depth += text[i] === '{' ? 1 : text[i] === '}' ? -1 : 0;
			i += 1;
		}
		const block = text.slice(start, i - 1);
		for (const prop of block.matchAll(SIZE_PROPS)) {
			const line = text.slice(0, start + prop.index).split('\n').length + (prop[0].startsWith('\n') ? 1 : 0);
			out.push(`${file}:${line} "${prop[0].trim()}" in a :${match[1]} rule`);
		}
	}
	return [...new Set(out)];
}

/** Fix formatting the theme's stylelint can fix (hex length, spacing…). Best effort. */
function formatStyles(files) {
	const stylelint = path.join(THEME_DIR, 'node_modules', '.bin', 'stylelint');
	spawnSync(stylelint, ['--fix', ...files.map((f) => path.join(CSS_DIR, f))], { cwd: THEME_DIR, encoding: 'utf8' });
}

/** @param {string} file */
function allowed(file, forEdit) {
	const clean = String(file ?? '').replace(/^\/+/, '').replace(/^assets\/css\//, '');
	return clean in EDITABLE || (!forEdit && clean in READ_ONLY) ? clean : null;
}

export function createStyleTools() {
	const changed = new Set();
	const tools = [
		{
			name: 'style_files',
			description: 'List the theme style files you can read and edit, with what they style.',
			inputSchema: { type: 'object', properties: {} },
		},
		{
			name: 'read_style',
			description: 'Read a theme style file (path from style_files).',
			inputSchema: { type: 'object', properties: { file: { type: 'string' } }, required: ['file'] },
		},
		{
			name: 'edit_style',
			description:
				'Edit an editable style file: replace old_text (copied exactly from read_style, must appear once) with new_text. Keep the code style: tabs, single quotes, full BEM class names, existing SCSS variables.',
			inputSchema: {
				type: 'object',
				properties: { file: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' } },
				required: ['file', 'old_text', 'new_text'],
			},
		},
		{
			name: 'check_styles',
			description: 'Compile the theme CSS. Run it after your edits; fix any error it shows.',
			inputSchema: { type: 'object', properties: {} },
		},
	];

	async function onTool(name, input = {}) {
		if (name === 'style_files') {
			const list = [
				...Object.entries(EDITABLE).map(([f, d]) => `${f} — ${d}`),
				...Object.entries(READ_ONLY).map(([f, d]) => `${f} — ${d}`),
			];
			return { text: list.join('\n') };
		}
		if (name === 'read_style') {
			const file = allowed(input.file, false);
			if (!file) {
				return { text: `Not a style file you can read: ${input.file}. Use style_files.` };
			}
			return { text: await fs.readFile(path.join(CSS_DIR, file), 'utf8') };
		}
		if (name === 'edit_style') {
			const file = allowed(input.file, true);
			if (!file) {
				return { text: `Not an editable file: ${input.file}. Use style_files.` };
			}
			const full = path.join(CSS_DIR, file);
			const text = await fs.readFile(full, 'utf8');
			const oldText = String(input.old_text ?? '');
			const count = oldText ? text.split(oldText).length - 1 : 0;
			if (count !== 1) {
				return { text: `old_text must appear exactly once in ${file} (found ${count} times). Read the file and copy it exactly.` };
			}
			await fs.writeFile(full, text.replace(oldText, () => String(input.new_text ?? '')), 'utf8');
			changed.add(file);
			return { text: `Edited ${file}.` };
		}
		if (name === 'check_styles') {
			const result = compileStyles();
			if (!result.ok) {
				return { text: `Does not compile:\n${result.error}` };
			}
			const shifts = [];
			for (const file of changed) {
				shifts.push(...findLayoutShifts(file, await fs.readFile(path.join(CSS_DIR, file), 'utf8')));
			}
			return {
				text: shifts.length
					? `The theme CSS compiles, but these state rules change the size of the element (layout shift). Keep border width, padding, font size/weight and size the same in every state and change only colors:\n${shifts.join('\n')}`
					: 'The theme CSS compiles.',
			};
		}
		return null;
	}

	return { tools, onTool, changed };
}

function buildSystemPrompt(values) {
	return `You are a senior front-end developer starting a WordPress theme from a Figma design. The design tokens (colors, fonts, sizes, button colors, radius, padding, borders, link color, input sizes) are already set as SCSS variables from the design: do not change those.

Your job: look at the design and add the visible details that variables cannot express, by editing the theme's SCSS directly. For example:
- a shadow on buttons, cards, inputs (box-shadow);
- an icon on buttons, like an arrow or chevron after the label (::after; draw it with CSS borders or an inline SVG mask using currentColor, so it takes the label color);
- the real hover look of buttons and links when the design shows a hover state (colors from the design instead of the starter's brightness filter);
- underline style of links (text-underline-offset, text-decoration-thickness);
- focus look of inputs (border color, outline), placeholder color;
- if the real text field is only a bottom line (not a full box), set border: 0 and border-bottom in the text and select mixins; leave checkboxes and radios as a full box (this is not a layout change);
- transitions, letter case or other small finishing touches that are clearly in the design.

Rules:
- Only what is clearly and consistently in the real designed screens (not wireframes, notes or one-off exceptions). Inspect the nodes to read exact values (effects show shadows as x y blur spread color). When unsure, do not change it.
- Small, focused edits in the right file. Do not change layout (display, position, width, margin, grid) or remove existing features.
- No layout shift between states (hover, focus, active, disabled): an element keeps exactly the same size in every state. A button always has its border, also when the design shows none in the normal state (then the border color is the same as the background, or transparent); a state only changes colors (border-color, background-color, color), shadows, opacity or transforms, never border width, padding, font size or weight. The same goes for links and inputs (e.g. a focus border that is thicker: use box-shadow or outline instead). check_styles points out state rules that break this.
- Use the existing SCSS variables (read variables.scss) instead of hard-coded colors when one matches; otherwise use the exact hex from Figma.
- Keep the code style: tabs, full BEM class names, comments in plain English, media queries only at the end of a file.
- Before editing a file, read it. After your edits, run check_styles and fix any error.
- If nothing needs to change, change nothing.

Values already set from the design (for reference):
${values}

When you are done, answer with only this JSON (no other text):
{ "changes": ["<one short line per change, e.g. 'Primary button: arrow after the label'>"] }`;
}

/**
 * @param {object} opts
 * @param {object} opts.pages From loadPages().
 * @param {string} opts.fileKey
 * @param {{ provider: string, apiKey: string, model: string }} opts.settings
 * @param {string} opts.figmaToken
 * @param {string} opts.imageDir
 * @param {Record<string, unknown>} opts.values keyedBySlug from the export.
 * @param {(msg?: string) => void} opts.log
 */
export async function runStyleSync(opts) {
	const { pages, fileKey, settings, figmaToken, imageDir, values, log } = opts;

	step('Style details (shadows, icons, hover looks…)');
	const restored = await resetStyles();
	if (restored.length) {
		note(`Undid the AI style edits of the last sync in ${restored.length} file(s); starting from the clean styles.`);
	}
	const before = compileStyles();
	if (!before.ok) {
		warn('Skipped: the theme CSS does not compile even before the AI edits it:');
		note(before.error?.split('\n').slice(0, 3).join('\n    ') ?? '');
		return;
	}
	const clean = await snapshot();

	const figmaTools = createFigmaTools({ ...pages, fileKey, figmaToken, imageDir });
	const styleTools = createStyleTools();
	const spinner = createSpinner('AI is styling');
	let calls = 0;
	const onTool = async (name, input) => {
		calls += 1;
		spinner.stop();
		detail(`${String(calls).padStart(2)}. ${name}${input?.file ? ` ${input.file}` : ''}`);
		spinner.setExtra(`${calls} step${calls === 1 ? '' : 's'}`);
		try {
			const own = await styleTools.onTool(name, input);
			const result = own ?? (await figmaTools.onTool(name, input));
			log(`[style tool ${calls}] ${name} ${JSON.stringify(input)}\n${result.text}\n`);
			return result;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			log(`[style tool ${calls}] ${name} ERROR ${message}\n`);
			return { text: `Error: ${message}` };
		} finally {
			spinner.start();
		}
	};

	const valueLines = Object.entries(values ?? {})
		.filter(([slug]) => /^(button|color-link|link|input|color-background|color-body)/.test(slug))
		.map(([slug, value]) => `${slug}: ${value}`)
		.join('\n');

	let answer = null;
	spinner.start();
	try {
		const result = await runAiWithTools({
			settings,
			system: buildSystemPrompt(valueLines),
			userText: `${figmaTools.overview()}\n\nStart by viewing the main screens and the buttons, links and form fields. Then read the style files and make your edits.`,
			tools: [...figmaTools.tools, ...styleTools.tools],
			onTool,
			maxCalls: MAX_TOOL_CALLS,
			maxInputTokens: 3000000,
		});
		log(`[AI style answer]\n${result.text}\n`);
		answer = parseAiJson(result.text);
	} catch (error) {
		log(`[AI style error] ${error instanceof Error ? error.message : error}`);
	} finally {
		spinner.stop();
	}

	const changed = [...styleTools.changed];
	if (!changed.length) {
		ok('No style changes needed.');
		return;
	}
	formatStyles(changed);
	const after = compileStyles();
	if (!after.ok) {
		for (const file of changed) {
			await fs.writeFile(path.join(CSS_DIR, file), clean[file], 'utf8');
		}
		fail('The edited styles did not compile, so the edits were undone (clean styles kept).');
		log(`[style compile error]\n${after.error}`);
		return;
	}
	const state = {};
	for (const file of changed) {
		state[file] = { clean: clean[file], edited: hash(await fs.readFile(path.join(CSS_DIR, file), 'utf8')) };
	}
	await writeState(state);
	const lines = Array.isArray(answer?.changes) && answer.changes.length ? answer.changes : changed.map((f) => `Edited ${f}`);
	ok(`${lines.length} style change${lines.length === 1 ? '' : 's'} ${color.dim(`in ${changed.map((f) => path.basename(f)).join(', ')}`)}`);
	// The AI was told about these by check_styles; if some are still there, say so.
	const shifts = [];
	for (const file of changed) {
		shifts.push(...findLayoutShifts(file, await fs.readFile(path.join(CSS_DIR, file), 'utf8')));
	}
	if (shifts.length) {
		warn(`${shifts.length} hover/focus rule(s) may change the element size (layout shift):`);
		shifts.forEach((s) => note(s));
	}
	if (DETAILS) {
		for (const line of lines) {
			detail(`· ${line}`);
		}
		detail(`Files: ${changed.map((f) => `assets/css/${f}`).join(', ')}`);
	}
}
