#!/usr/bin/env node

/**
 * figma-ai-sync
 *
 * Fetches the full Figma file and strips it down to only CSS-relevant style
 * data. Output: scripts/figma-sync/figma-export.json
 *
 * Modular extractors live under scripts/figma-sync/.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import dotenv from 'dotenv';

import { fetchFigmaFile, hasMissingScope, parseFigmaUrl } from './figma-sync/lib/figma-api.mjs';
import { buildCssStyleExport } from './figma-sync/build-export.mjs';

dotenv.config({ quiet: true });

const EXPORT_FILE_PATH = path.resolve(process.cwd(), 'scripts/figma-sync/figma-export.json');
const LOG_FILE_PATH = path.resolve(process.cwd(), 'scripts/figma-sync/figma-sync.log');
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const logLines = [];
const FIGMA_TOKEN_ENV_KEY = 'FIGMA_ACCESS_TOKEN';

function log(message = '') {
	logLines.push(message);
	if (VERBOSE) {
		console.log(message);
	}
}

function getFigmaTokenFromEnv() {
	dotenv.config({ override: true, quiet: true });
	return process.env[FIGMA_TOKEN_ENV_KEY]?.trim() || '';
}

async function waitForFigmaToken(rl, message) {
	let figmaToken = getFigmaTokenFromEnv();

	while (!figmaToken) {
		const answer = await rl.question(`${message}\nPress Enter after updating .env, or type "exit" to stop: `);

		if (answer.trim().toLowerCase() === 'exit') {
			throw new Error('Figma sync cancelled. Define FIGMA_ACCESS_TOKEN in .env and run again.');
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

async function main() {
	const rl = readline.createInterface({ input, output });

	try {
		const tokenCheck = getFigmaTokenFromEnv();
		if (!tokenCheck) {
			console.error(`\n  ✖  FIGMA_ACCESS_TOKEN is not set in .env`);
			console.error(`  Add the following to your .env file and re-run:\n`);
			console.error(`  FIGMA_ACCESS_TOKEN=your_personal_access_token\n`);
			console.error(`  Get a token at: https://www.figma.com/developers/api#access-tokens\n`);
			process.exit(1);
		}

		const figmaUrlInput = await rl.question('Figma URL: ');
		let figmaToken = await waitForFigmaToken(
			rl,
			`Figma access token not found. Define ${FIGMA_TOKEN_ENV_KEY} in .env.`,
		);

		if (!figmaUrlInput.trim()) {
			throw new Error('Figma URL is required.');
		}

		const parsed = parseFigmaUrl(figmaUrlInput);
		if (!parsed) {
			throw new Error('Could not parse file key from Figma URL.');
		}

		const sourceInfo = { url: figmaUrlInput.trim(), fileKey: parsed.fileKey };

		for (let attempt = 1; attempt <= 3; attempt += 1) {
			try {
				console.log(`\nFetching Figma file: ${parsed.fileKey}`);
				log(`Rareview Starter Theme - Figma Sync`);
				log(`Generated at: ${new Date().toISOString()}`);
				log(`Source URL: ${sourceInfo.url}`);
				log(`File key: ${sourceInfo.fileKey}`);
				log('');
				const figmaPayload = await fetchFigmaFile(parsed.fileKey, figmaToken, log);
				const exportPayload = buildCssStyleExport(figmaPayload, sourceInfo, { log, progressBar });

				log('Writing figma-export.json...');
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
				await writeSyncLog();
				if (!VERBOSE) {
					console.log(`Saved figma-export.json (${Math.round(stats.size / 1024)} KB)`);
				}
				break;
			} catch (error) {
				if (hasMissingScope(error) && attempt < 3) {
					figmaToken = await waitForFigmaToken(
						rl,
						`\nToken missing required scopes. Update ${FIGMA_TOKEN_ENV_KEY} in .env.`,
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
