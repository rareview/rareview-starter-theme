/**
 * The pages the user pastes, and loading only those pages from Figma.
 *
 * Order of sources for the page data:
 *   1. fetched/nodes-{fileKey}-{ids}.json  (saved from an earlier run)
 *   2. the newest full-file download fetched/raw-{fileKey}-*.json (no API call)
 *   3. Figma API GET /v1/files/:key/nodes?ids=…  (only the pasted pages, not the whole file)
 * --fetch-fresh skips 1 and 2.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { fetchFigmaNodes, normalizeFigmaNodeId, parseFigmaUrl } from '../lib/figma-api.mjs';
import { findLatestFetchedForFileKey, getFetchedDir } from '../lib/raw-cache.mjs';
import { walkNodes } from '../lib/node-utils.mjs';
import { color, step, warn } from '../lib/ui.mjs';

function pagesFilePath(cwd, fileKey) {
	return path.join(getFetchedDir(cwd), `pages-${fileKey}.json`);
}

function nodesCachePath(cwd, fileKey, nodeIds) {
	const idsPart = [...nodeIds].sort().join('_').replace(/[^0-9A-Za-z_]+/g, '-');
	return path.join(getFetchedDir(cwd), `nodes-${fileKey}-${idsPart}.json`);
}

/**
 * @param {string} cwd
 * @param {string} fileKey
 * @returns {Promise<string[]>} saved page links for this file, or []
 */
export async function readSavedPages(cwd, fileKey) {
	try {
		const saved = JSON.parse(await fs.readFile(pagesFilePath(cwd, fileKey), 'utf8'));
		return Array.isArray(saved?.urls) ? saved.urls.filter((url) => typeof url === 'string') : [];
	} catch {
		return [];
	}
}

/**
 * @param {string} cwd
 * @param {string} fileKey
 * @param {string[]} urls
 */
export async function savePages(cwd, fileKey, urls) {
	await fs.mkdir(getFetchedDir(cwd), { recursive: true });
	await fs.writeFile(
		pagesFilePath(cwd, fileKey),
		`${JSON.stringify({ urls, savedAt: new Date().toISOString() }, null, 2)}\n`,
		'utf8',
	);
}

/**
 * Check the pasted links: all from one file, each pointing at a page or frame.
 *
 * @param {string[]} urls
 * @returns {{ fileKey: string, nodeIds: string[], urls: string[] }}
 */
export function parsePageUrls(urls) {
	let fileKey = '';
	const nodeIds = [];
	const kept = [];
	for (const url of urls) {
		const parsed = parseFigmaUrl(url);
		if (!parsed) {
			throw new Error(`Not a Figma link: ${url}`);
		}
		if (!parsed.nodeId) {
			throw new Error(
				`This link has no page or frame in it (no node-id): ${url}\n` +
					'In Figma, right-click the page name and choose "Copy link to page", or select a frame and copy its link.',
			);
		}
		if (fileKey && parsed.fileKey !== fileKey) {
			throw new Error('All links must be from the same Figma file.');
		}
		fileKey = parsed.fileKey;
		if (!nodeIds.includes(parsed.nodeId)) {
			nodeIds.push(parsed.nodeId);
			kept.push(url.trim());
		}
	}
	if (!nodeIds.length) {
		throw new Error('Paste at least one Figma page link.');
	}
	return { fileKey, nodeIds, urls: kept };
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function splitLinks(text) {
	return String(text).split(/[\s,]+/).filter(Boolean);
}

/**
 * Ask for page links in the terminal. Offers the links from the last run first.
 *
 * @param {import('node:readline/promises').Interface} rl
 * @param {{ cwd: string, firstUrl?: string, reuseSaved?: boolean }} opts
 * @returns {Promise<{ fileKey: string, nodeIds: string[], urls: string[] }>}
 */
export async function askForPages(rl, opts) {
	const { cwd } = opts;
	step('Figma pages');
	console.log('  Paste links to the relevant Figma pages or frames containing the final designs and styles');
	console.log(color.dim('  (e.g. “Final”, “Pages”, “Homepage”, “Style Guide”, “Typography”). One link per line.\n'));

	const first = opts.firstUrl?.trim() || (await rl.question(`  ${color.cyan('Link 1')}: `)).trim();
	if (!first) {
		throw new Error('A Figma link is required.');
	}
	// One link per line, or several on one line separated by commas or spaces.
	const firstLinks = splitLinks(first);
	const firstParsed = parseFigmaUrl(firstLinks[0]);
	if (!firstParsed) {
		throw new Error(`Not a Figma link: ${first}`);
	}

	const saved = await readSavedPages(cwd, firstParsed.fileKey);
	if (saved.length && !firstParsed.nodeId) {
		console.log('\n  Last time you used these pages for this file:');
		saved.forEach((url, i) => console.log(color.dim(`    ${i + 1}. ${url}`)));
		const reuse = opts.reuseSaved ? 'y' : (await rl.question('Use them again? (Y/n): ')).trim().toLowerCase();
		if (reuse === '' || reuse === 'y' || reuse === 'yes') {
			return parsePageUrls(saved);
		}
		console.log('');
	}

	const urls = [];
	/** Keep valid page links; explain bad ones right away instead of failing at the end. */
	const add = (text) => {
		for (const link of splitLinks(text)) {
			const parsed = parseFigmaUrl(link);
			if (!parsed) {
				warn(`Skipped, not a Figma link: ${link}`);
			} else if (!parsed.nodeId) {
				warn('Skipped: that link opens the whole file. Copy the link of a page or a frame instead.');
			} else if (parsed.fileKey !== firstParsed.fileKey) {
				warn('Skipped: all links must be from the same Figma file.');
			} else {
				urls.push(link);
			}
		}
	};
	add(first);

	// An empty line starts the sync.
	for (;;) {
		const answer = (await rl.question(`  ${color.cyan(`Link ${urls.length + 1}`)} ${color.dim('(or just Enter when done)')}: `)).trim();
		if (answer) {
			add(answer);
			continue;
		}
		if (!urls.length) {
			warn('Paste at least one page link.');
			continue;
		}
		break;
	}

	const parsed = parsePageUrls(urls);
	await savePages(cwd, parsed.fileKey, parsed.urls);
	return parsed;
}

/**
 * Pull the requested nodes out of a full-file download.
 *
 * @param {object} file Full GET /v1/files/:key JSON
 * @param {string[]} nodeIds
 */
function nodesFromFullFile(file, nodeIds) {
	const wanted = new Set(nodeIds);
	const found = {};
	walkNodes(file?.document, (node) => {
		if (wanted.has(node.id)) {
			found[node.id] = node;
		}
	});
	const nodes = {};
	for (const id of nodeIds) {
		nodes[id] = found[id]
			? {
					document: found[id],
					styles: file.styles ?? {},
					components: file.components ?? {},
					componentSets: file.componentSets ?? {},
				}
			: null;
	}
	return { name: file?.name ?? '', nodes };
}

/**
 * @param {string} dir
 * @param {RegExp} pattern
 * @returns {Promise<string | null>} newest matching file in dir
 */
async function findNewestFile(dir, pattern) {
	let best = null;
	let bestTime = -1;
	let names = [];
	try {
		names = await fs.readdir(dir);
	} catch {
		return null;
	}
	for (const name of names) {
		if (!pattern.test(name)) {
			continue;
		}
		const full = path.join(dir, name);
		const stat = await fs.stat(full).catch(() => null);
		if (stat?.isFile() && stat.mtimeMs > bestTime) {
			best = full;
			bestTime = stat.mtimeMs;
		}
	}
	return best;
}

/**
 * Per-page downloads saved by earlier sync versions: fetched/{fileKey}/nodes/{version}/{12-34}.json
 * (same shape as GET /v1/files/:key/nodes). Newest version folder that has every page wins.
 */
async function nodesFromSavedPageFiles(cwd, fileKey, nodeIds) {
	const base = path.join(getFetchedDir(cwd), fileKey, 'nodes');
	let versions = [];
	try {
		versions = await fs.readdir(base);
	} catch {
		return null;
	}
	const withTime = await Promise.all(
		versions.map(async (v) => ({ v, t: (await fs.stat(path.join(base, v)).catch(() => null))?.mtimeMs ?? 0 })),
	);
	for (const { v } of withTime.sort((a, b) => b.t - a.t)) {
		const merged = { name: '', nodes: {} };
		let complete = true;
		for (const id of nodeIds) {
			try {
				const one = JSON.parse(await fs.readFile(path.join(base, v, `${id.replace(/:/g, '-')}.json`), 'utf8'));
				merged.name = one.name ?? merged.name;
				merged.nodes[id] = one.nodes?.[id] ?? null;
				complete = complete && Boolean(merged.nodes[id]);
			} catch {
				complete = false;
			}
			if (!complete) {
				break;
			}
		}
		if (complete) {
			return merged;
		}
	}
	return null;
}

/**
 * @param {{ cwd: string, fileKey: string, nodeIds: string[], figmaToken: string, fetchFresh: boolean, log: (msg?: string) => void }} opts
 * @returns {Promise<{ fileName: string, roots: object[], styles: Record<string, object>, components: Record<string, object>, componentSets: Record<string, object>, source: string }>}
 */
export async function loadPages(opts) {
	const { cwd, fileKey, figmaToken, fetchFresh, log } = opts;
	const nodeIds = opts.nodeIds.map((id) => normalizeFigmaNodeId(id)).filter(Boolean);
	const cachePath = nodesCachePath(cwd, fileKey, nodeIds);

	let payload = null;
	let source = '';

	if (!fetchFresh) {
		try {
			payload = JSON.parse(await fs.readFile(cachePath, 'utf8'));
			source = `saved pages (${path.basename(cachePath)})`;
		} catch {
			payload = null;
		}
	}

	if (!payload && !fetchFresh) {
		payload = await nodesFromSavedPageFiles(cwd, fileKey, nodeIds);
		if (payload) {
			source = 'saved page downloads';
		}
	}

	if (!payload && !fetchFresh) {
		const fullPath = (await findLatestFetchedForFileKey(cwd, fileKey)) ?? (await findNewestFile(path.join(getFetchedDir(cwd), fileKey), /^raw-.*(?<!\.meta)\.json$/));
		if (fullPath) {
			const fromFull = nodesFromFullFile(JSON.parse(await fs.readFile(fullPath, 'utf8')), nodeIds);
			if (Object.values(fromFull.nodes).every(Boolean)) {
				payload = fromFull;
				source = `saved full file (${path.basename(fullPath)})`;
			}
		}
	}

	if (!payload) {
		if (!figmaToken) {
			throw new Error('FIGMA_ACCESS_TOKEN is not set, and these pages are not saved locally yet.');
		}
		payload = await fetchFigmaNodes(fileKey, figmaToken, nodeIds, log);
		await fs.mkdir(path.dirname(cachePath), { recursive: true });
		await fs.writeFile(cachePath, `${JSON.stringify(payload)}\n`, 'utf8');
		source = 'Figma API (only the pasted pages)';
	}

	const roots = [];
	const styles = {};
	const components = {};
	const componentSets = {};
	for (const id of nodeIds) {
		const entry = payload.nodes?.[id];
		if (!entry?.document) {
			throw new Error(`Figma did not return node ${id}. Check that the link is correct and you can open it.`);
		}
		roots.push(entry.document);
		Object.assign(styles, entry.styles ?? {});
		Object.assign(components, entry.components ?? {});
		Object.assign(componentSets, entry.componentSets ?? {});
	}

	return { fileName: payload.name ?? '', roots, styles, components, componentSets, source };
}
