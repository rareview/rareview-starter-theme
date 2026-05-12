#!/usr/bin/env node

/**
 * figma-sync
 *
 * After you enter a Figma URL: uses the newest saved raw JSON in
 * scripts/figma-sync/fetched/ for that file key when available (no API call).
 * Pass --fetch-fresh to always download from the Figma API and update fetched/.
 *
 * Writes scripts/figma-sync/generated/figma-export.json. Modular extractors under scripts/figma-sync/.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

import { fetchFigmaFile, hasMissingScope, parseFigmaUrl } from './lib/figma-api.mjs';
import { buildCssStyleExport } from './build-export.mjs';
import {
	findLatestFetchedForFileKey,
	loadRawFigmaFile,
	saveRawFigmaResponse,
} from './lib/raw-cache.mjs';

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

async function waitForFigmaToken(rl, message) {
	let figmaToken = getFigmaTokenFromEnv();

	while (!figmaToken) {
		const answer = await rl.question(
			`${message}\nPress Enter after updating scripts/figma-sync/.env or root .env, or type "exit" to stop: `,
		);

		if (answer.trim().toLowerCase() === 'exit') {
			throw new Error(
				'Figma sync cancelled. Define FIGMA_ACCESS_TOKEN in scripts/figma-sync/.env or project root .env and run again.',
			);
		}

		figmaToken = getFigmaTokenFromEnv();
	}

	return figmaToken;
}

function progressBar(label, current, total) {
	if (VERBOSE) {
		return;
	}
	const percent = Math.round((current / total) * 100);
	const width = 28;
	const filled = Math.min(width, Math.round((percent / 100) * width));
	process.stdout.write(
		`\r  ${label} [${'#'.repeat(filled)}${'.'.repeat(width - filled)}] ${String(percent).padStart(3)}%`,
	);
	if (current >= total) {
		process.stdout.write('\n');
	}
}

async function writeSyncLog() {
	await fs.mkdir(path.dirname(LOG_FILE_PATH), { recursive: true });
	await fs.writeFile(LOG_FILE_PATH, `${logLines.join('\n')}\n`, 'utf8');
}

async function runExportPipeline(figmaPayload, sourceInfo) {
	const exportPayload = buildCssStyleExport(figmaPayload, sourceInfo, { log, progressBar });

	log('Writing generated/figma-export.json...');
	await fs.mkdir(path.dirname(EXPORT_FILE_PATH), { recursive: true });
	await fs.writeFile(EXPORT_FILE_PATH, `${JSON.stringify(exportPayload, null, 2)}\n`, 'utf8');

	const stats = await fs.stat(EXPORT_FILE_PATH);
	log('');
	log(`Saved: ${EXPORT_FILE_PATH} (${Math.round(stats.size / 1024)} KB)`);
	log(`  Colors (chromatic/mono): ${exportPayload.colors.colored.length} / ${exportPayload.colors.mono.length}`);
	log(`  Headings (desktop/mobile): ${exportPayload.headings.desktop.length} / ${exportPayload.headings.mobile.length}`);
	if (exportPayload.body?.paragraphSizes) {
		log(
			`  Paragraph sizes: desktop(${Object.keys(exportPayload.body.paragraphSizes.desktop ?? {}).join(',')}) mobile(${Object.keys(exportPayload.body.paragraphSizes.mobile ?? {}).join(',')})`,
		);
	}
	if (exportPayload.body?.fontFamilyPrimary) {
		log(`  Body font: ${exportPayload.body.fontFamilyPrimary}`);
	}
	if (exportPayload.body?.backgroundColor) {
		log(`  Body background color: ${exportPayload.body.backgroundColor}`);
	}
	log(
		`  Input field: borderWidth=${exportPayload.inputField?.borderWidth ?? 'n/a'} height=${exportPayload.inputField?.height ?? 'n/a'} borderRadius=${exportPayload.inputField?.borderRadius ?? 'n/a'}`,
	);
	log(
		`  Layout: containerWidth=${exportPayload.layout?.containerWidth ?? 'n/a'} buttonBorderRadius=${exportPayload.layout?.buttonBorderRadius ?? 'n/a'}`,
	);
	log(`  Buttons: ${exportPayload.buttons.length}  Links: ${exportPayload.links ? 1 : 0}`);
	return stats;
}

async function runFromLocalFetched(resolvedPath) {
	console.log('\nLoading local fetched snapshot…');
	console.log(`  (${path.basename(resolvedPath)})`);
	console.log('  To download the latest from Figma (uses the API), run again with --fetch-fresh.\n');

	log(`Rareview Starter Theme - Figma Sync (local fetched)`);
	log(`Generated at: ${new Date().toISOString()}`);
	log(`Source file: ${resolvedPath}`);
	log('');

	const { payload, sourceInfo } = await loadRawFigmaFile(resolvedPath);
	log(`File key (meta / filename): ${sourceInfo.fileKey}`);
	log('');

	const stats = await runExportPipeline(payload, sourceInfo);
	await writeSyncLog();
	if (!VERBOSE) {
		console.log(`Saved generated/figma-export.json (${Math.round(stats.size / 1024)} KB)`);
	}
}

async function main() {
	const rl = readline.createInterface({ input, output });

	try {
		const figmaUrlInput = await rl.question('Figma URL: ');

		if (!figmaUrlInput.trim()) {
			throw new Error('Figma URL is required.');
		}

		const parsed = parseFigmaUrl(figmaUrlInput);
		if (!parsed) {
			throw new Error('Could not parse file key from Figma URL.');
		}

		const cwd = process.cwd();
		const sourceInfo = { url: figmaUrlInput.trim(), fileKey: parsed.fileKey };

		if (!FETCH_FRESH) {
			const latest = await findLatestFetchedForFileKey(cwd, parsed.fileKey);
			if (latest) {
				await runFromLocalFetched(latest);
				return;
			}
		}

		const tokenCheck = getFigmaTokenFromEnv();
		if (!tokenCheck) {
			console.error(`\n  ✖  FIGMA_ACCESS_TOKEN is not set`);
			console.error(`  Add it to scripts/figma-sync/.env or the project root .env, then re-run:\n`);
			console.error(`  FIGMA_ACCESS_TOKEN=your_personal_access_token\n`);
			console.error(`  Get a token at: https://www.figma.com/developers/api#access-tokens\n`);
			if (!FETCH_FRESH) {
				console.error(
					'  (No local copy was found for this file in scripts/figma-sync/fetched/. ' +
						'After a successful fetch, re-run without a token to use the saved file.)\n',
				);
			}
			process.exit(1);
		}

		let figmaToken = await waitForFigmaToken(
			rl,
			`Figma access token not found. Define ${FIGMA_TOKEN_ENV_KEY} in scripts/figma-sync/.env or project root .env.`,
		);

		console.log('\nFetching from Figma API…');

		for (let attempt = 1; attempt <= 3; attempt += 1) {
			try {
				log(`Rareview Starter Theme - Figma Sync`);
				log(`Generated at: ${new Date().toISOString()}`);
				log(`Source URL: ${sourceInfo.url}`);
				log(`File key: ${sourceInfo.fileKey}`);
				log('');
				const figmaPayload = await fetchFigmaFile(parsed.fileKey, figmaToken, log);

				await saveRawFigmaResponse(figmaPayload, { cwd, fileKey: parsed.fileKey, url: sourceInfo.url }, log);
				log('');

				const stats = await runExportPipeline(figmaPayload, sourceInfo);

				await writeSyncLog();
				if (!VERBOSE) {
					console.log(`Saved generated/figma-export.json (${Math.round(stats.size / 1024)} KB)`);
				}
				break;
			} catch (error) {
				if (hasMissingScope(error) && attempt < 3) {
					figmaToken = await waitForFigmaToken(
						rl,
						`\nToken missing required scopes. Update ${FIGMA_TOKEN_ENV_KEY} in scripts/figma-sync/.env or project root .env.`,
					);
					continue;
				}
				throw error;
			}
		}
	} finally {
		rl.close();
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
