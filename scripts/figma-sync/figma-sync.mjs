#!/usr/bin/env node

/**
 * figma-sync
 *
 * You paste links to the Figma pages that hold the final design and styles.
 * Only those pages are loaded (not the whole file). The AI measures them with tools (src/tools.mjs)
 * and decides every value. See src/README.md.
 *
 * --fetch-fresh always downloads the pasted pages from the Figma API and updates fetched/.
 *
 * Writes scripts/figma-sync/generated/figma-export.json.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

import { readAiConfig, runWpCli } from './src/connectors.mjs';
import { askForPages, loadPages, parsePageUrls, savePages } from './src/figma-links.mjs';
import { runAiSync } from './src/index.mjs';
import { runStyleSync } from './src/additional-styling.mjs';
import { getUsageTotals } from './src/provider.mjs';
import { color, fail, note, ok, step, title, warn } from './lib/ui.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT_ENV = path.resolve(__dirname, '..', '..', '.env');
const FIGMA_SYNC_ENV = path.resolve(__dirname, '.env');

/** Root .env first, then scripts/figma-sync/.env overrides for the same keys. */
function loadFigmaEnv() {
	dotenv.config({ path: REPO_ROOT_ENV, quiet: true });
	dotenv.config({ path: FIGMA_SYNC_ENV, override: true, quiet: true });
}

loadFigmaEnv();

const GENERATED_DIR = path.resolve(__dirname, 'generated');
const EXPORT_FILE_PATH = path.join(GENERATED_DIR, 'figma-export.json');
const LOG_FILE_PATH = path.join(GENERATED_DIR, 'figma-sync.log');
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const FETCH_FRESH = args.includes('--fetch-fresh');
const REUSE_PAGES = args.includes('--yes');
const NO_STYLES = args.includes('--no-styles');
const AI_REPORT_PATH = path.join(GENERATED_DIR, 'ai-report.md');
/** Figma links for the Preview page; figma-apply copies it into the theme. */
const SOURCES_PATH = path.join(GENERATED_DIR, 'figma-sources.json');
/** Local site URL for the Preview link (npm run setup replaces the domain with the project's local URL). */
const LOCAL_SITE_URL = 'https://rv-starter.local';

/** Value after a flag: --model gpt-4.1 or --model=gpt-4.1 */
function flagValue(name) {
	const i = args.findIndex((a) => a === name || a.startsWith(`${name}=`));
	if (i === -1) {
		return '';
	}
	return args[i].includes('=') ? args[i].split('=').slice(1).join('=') : (args[i + 1] ?? '');
}
const logLines = [];
const FIGMA_TOKEN_ENV_KEY = 'FIGMA_ACCESS_TOKEN';

function log(message = '') {
	logLines.push(message);
	if (VERBOSE) {
		console.log(message);
	}
}

function getFigmaTokenFromEnv() {
	loadFigmaEnv();
	return process.env[FIGMA_TOKEN_ENV_KEY]?.trim() || '';
}

async function writeSyncLog() {
	await fs.mkdir(path.dirname(LOG_FILE_PATH), { recursive: true });
	await fs.writeFile(LOG_FILE_PATH, `${logLines.join('\n')}\n`, 'utf8');
}

async function runAi(rl) {
	let aiConfig;
	console.log(color.dim('  Reading the AI key from WordPress Connectors...'));
	try {
		aiConfig = readAiConfig({ providerFlag: flagValue('--provider'), modelFlag: flagValue('--model') });
	} catch (error) {
		console.log('');
		fail(error instanceof Error ? error.message : String(error));
		console.log('');
		process.exit(1);
	}
	ok(`AI: ${aiConfig.providerName} (${aiConfig.model}) ${color.dim(`· key from WordPress Connectors (${aiConfig.source})`)}`);
	const settings = {
		provider: aiConfig.provider,
		apiKey: aiConfig.apiKey,
		model: aiConfig.model,
	};

	const cwd = process.cwd();
	// Page links right after the command skip the questions:
	//   npm run figma-sync "link1" "link2"   or   npm run figma-sync "link1,link2"
	// (--pages "link1,link2" still works.)
	const pageLinks = [flagValue('--pages'), ...args.filter((a) => /figma\.com\//.test(a) && !a.startsWith('--'))]
		.join(',')
		.split(/[\s,]+/)
		.filter((a) => /figma\.com\//.test(a));
	let selection;
	if (pageLinks.length) {
		selection = parsePageUrls([...new Set(pageLinks)]);
		await savePages(cwd, selection.fileKey, selection.urls);
	} else {
		selection = await askForPages(rl, { cwd, reuseSaved: REUSE_PAGES });
	}
	const figmaToken = getFigmaTokenFromEnv();

	log('Rareview Starter Theme - Figma Sync');
	log(`Generated at: ${new Date().toISOString()}`);
	log(`File key: ${selection.fileKey}`);
	log(`Pages: ${selection.urls.join(' ')}`);
	log('');

	const pages = await loadPages({
		cwd,
		fileKey: selection.fileKey,
		nodeIds: selection.nodeIds,
		figmaToken,
		fetchFresh: FETCH_FRESH,
		log: (msg) => note(msg),
	});
	console.log('');
	ok(`Loaded ${pages.roots.map((r) => `"${r.name}"`).join(', ')} ${color.dim(`from ${pages.source}`)}`);

	try {
		const { exportPayload, report, summary, themeSources } = await runAiSync({
			pages,
			fileKey: selection.fileKey,
			url: selection.urls[0],
			settings,
			figmaToken,
			imageDir: path.join(cwd, 'scripts', 'figma-sync', 'fetched', selection.fileKey, 'images'),
			log,
		});

		await fs.mkdir(GENERATED_DIR, { recursive: true });
		await fs.writeFile(EXPORT_FILE_PATH, `${JSON.stringify(exportPayload, null, 2)}\n`, 'utf8');
		await fs.writeFile(AI_REPORT_PATH, report, 'utf8');
		await fs.writeFile(SOURCES_PATH, `${JSON.stringify(themeSources, null, 2)}\n`, 'utf8');

		for (const line of summary) {
			if (line.startsWith('! ')) {
				warn(line.slice(2));
			} else if (line.startsWith('Not found: ')) {
				note(line);
			} else {
				ok(line);
			}
		}
		note('Report (every value, its Figma node and why): scripts/figma-sync/generated/ai-report.md');
		// What the style step needs after the theme is updated.
		return {
			pages,
			fileKey: selection.fileKey,
			settings,
			figmaToken,
			imageDir: path.join(cwd, 'scripts', 'figma-sync', 'fetched', selection.fileKey, 'images'),
			values: exportPayload.keyedBySlug,
		};
	} finally {
		await writeSyncLog();
	}
}

/** Update the theme from the new export (figma-apply.mjs, same flags). */
function runApply() {
	step('Updating the theme');
	// RV_FIGMA_SYNC_STEP: figma-apply prints only its results (no own title or "complete" lines).
	const result = spawnSync(process.execPath, [path.join(__dirname, 'figma-apply.mjs'), ...args], {
		stdio: 'inherit',
		env: { ...process.env, RV_FIGMA_SYNC_STEP: '1' },
	});
	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

/**
 * Rewrite the Preview page from the new design (wp create-preview --rewrite; edits are replaced).
 *
 * @returns {string} Preview page URL on the local site, or '' when there is no page.
 */
function refreshPreviewPage() {
	const result = runWpCli(['create-preview', '--rewrite']);
	const line = result.output.split('\n').filter(Boolean).pop() || '';
	if (!result.ok) {
		warn(`Could not update the Preview page (${line || 'WP-CLI failed'}). Run \`lando wp create-preview --rewrite\` later.`);
		return '';
	}
	// WordPress gives its own (http) permalink: keep the page path, use the local site URL.
	const permalink = line.match(/https?:\/\/\S+/)?.[0] || '';
	ok(line.replace(/^Success:\s*/, '').replace(/:?\s*https?:\/\/\S+$/, ''));
	return permalink ? LOCAL_SITE_URL + new URL(permalink).pathname : '';
}

async function main() {
	title('Figma Sync');
	let styleContext = null;
	const rl = readline.createInterface({ input, output });
	try {
		styleContext = await runAi(rl);
	} finally {
		rl.close();
	}
	runApply();
	const previewUrl = refreshPreviewPage();
	if (styleContext && !NO_STYLES) {
		try {
			await runStyleSync({ ...styleContext, log });
		} finally {
			await writeSyncLog();
		}
	}
	if (styleContext) {
		const usage = getUsageTotals();
		console.log('');
		ok(color.bold(color.green(`Figma Sync complete${usage.usd != null ? color.dim(` · AI cost about $${usage.usd.toFixed(2)}`) : ''}`)));
		note('Run `npm run build` (or keep `npm run start` running) to see the changes.');
	}
	if (previewUrl) {
		console.log('');
		console.log(`  Preview link: ${color.cyan(previewUrl)}`);
	}
	console.log('');
}

main().catch((error) => {
	console.log('');
	fail(error instanceof Error ? error.message : String(error));
	console.log('');
	process.exit(1);
});
