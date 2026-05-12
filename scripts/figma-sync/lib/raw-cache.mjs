/**
 * Persist raw Figma GET /v1/files/:key JSON under scripts/figma-sync/fetched/ (gitignored).
 */

import fs from 'node:fs/promises';
import path from 'node:path';

/** Directory under scripts/figma-sync (gitignored). */
export const FETCHED_DIR_NAME = 'fetched';

/**
 * @param {string} cwd Repo / process cwd
 * @returns {string} Absolute path to fetched/ directory
 */
export function getFetchedDir(cwd) {
	return path.resolve(cwd, 'scripts', 'figma-sync', FETCHED_DIR_NAME);
}

function escapeRe(str) {
	return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Newest raw JSON for this Figma file key: raw-{fileKey}-*.json by mtime.
 *
 * @param {string} cwd
 * @param {string} fileKey
 * @returns {Promise<string | null>} Absolute path or null
 */
export async function findLatestFetchedForFileKey(cwd, fileKey) {
	const dir = getFetchedDir(cwd);
	const rawRe = new RegExp(`^raw-${escapeRe(fileKey)}-.+\\.json$`);
	const candidates = [];

	let entries;
	try {
		entries = await fs.readdir(dir);
	} catch {
		return null;
	}

	for (const name of entries) {
		if (!rawRe.test(name)) {
			continue;
		}
		candidates.push(path.join(dir, name));
	}

	if (!candidates.length) {
		return null;
	}

	let bestPath = candidates[0];
	let bestMtime = 0;
	for (const p of candidates) {
		try {
			const st = await fs.stat(p);
			if (st.mtimeMs >= bestMtime) {
				bestMtime = st.mtimeMs;
				bestPath = p;
			}
		} catch {
			// skip missing
		}
	}
	return bestPath;
}

/**
 * Write timestamped raw file from API response.
 *
 * @param {object} payload Parsed Figma file JSON
 * @param {{ cwd: string, fileKey: string, url: string }} opts
 * @param {(msg?: string) => void} [log]
 * @returns {Promise<{ autoPath: string }>}
 */
export async function saveRawFigmaResponse(payload, opts, log = () => {}) {
	const { cwd, fileKey } = opts;
	const dir = getFetchedDir(cwd);
	await fs.mkdir(dir, { recursive: true });

	const ts = new Date().toISOString().replace(/[:.]/g, '-');
	const autoName = `raw-${fileKey}-${ts}.json`;
	const autoPath = path.join(dir, autoName);
	const json = `${JSON.stringify(payload)}\n`;
	await fs.writeFile(autoPath, json, 'utf8');
	log(`Saved raw Figma API JSON: ${autoPath}`);

	return { autoPath };
}

/**
 * @param {string} resolvedJsonPath Absolute path to raw *.json
 * @returns {Promise<{ payload: object, sourceInfo: { url: string, fileKey: string } }>}
 */
export async function loadRawFigmaFile(resolvedJsonPath) {
	const raw = await fs.readFile(resolvedJsonPath, 'utf8');
	const payload = JSON.parse(raw);
	const base = path.basename(resolvedJsonPath);
	let fileKey = 'local';
	let url = `file:${resolvedJsonPath}`;

	const metaPath = resolvedJsonPath.replace(/\.json$/i, '.meta.json');
	try {
		const metaRaw = await fs.readFile(metaPath, 'utf8');
		const meta = JSON.parse(metaRaw);
		if (typeof meta.fileKey === 'string' && meta.fileKey.trim()) {
			fileKey = meta.fileKey.trim();
		}
		if (typeof meta.url === 'string' && meta.url.trim()) {
			url = meta.url.trim();
		}
	} catch {
		// optional meta
	}

	const m = /^raw-([A-Za-z0-9]+)-/.exec(base);
	if (m && fileKey === 'local') {
		fileKey = m[1];
	}

	return { payload, sourceInfo: { url, fileKey } };
}
