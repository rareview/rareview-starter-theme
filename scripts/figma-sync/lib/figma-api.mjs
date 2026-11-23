export class FigmaApiError extends Error {
	constructor(status, bodyText) {
		super(`Figma API request failed (${status}): ${bodyText}`);
		this.name = 'FigmaApiError';
		this.status = status;
		this.bodyText = bodyText;
	}
}

/**
 * File key, plus the selected node when the link has `?node-id=12-34`.
 * Branch links (`/design/{key}/branch/{branchKey}/…`) use the branch key, because that is the file the API serves.
 *
 * @param {string} figmaUrl
 * @returns {{ fileKey: string, nodeId: string | null } | null}
 */
export function parseFigmaUrl(figmaUrl) {
	const text = String(figmaUrl ?? '').trim();
	const m = text.match(/figma\.com\/(?:file|design|proto)\/([a-zA-Z0-9]+)(?:\/branch\/([a-zA-Z0-9]+))?/);
	if (!m) {
		return null;
	}
	let nodeId = null;
	const nodeParam = text.match(/[?&]node-id=([^&#\s]+)/);
	if (nodeParam) {
		nodeId = normalizeFigmaNodeId(decodeURIComponent(nodeParam[1]).replace(/-/g, ':'));
	}
	return { fileKey: m[2] || m[1], nodeId };
}

/**
 * Normalize node ids to `12:34` or instance ids like `I12:34;56:78`.
 *
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizeFigmaNodeId(raw) {
	if (typeof raw !== 'string') {
		return null;
	}
	const match = raw.trim().match(/I?\d+:\d+(?:;\d+:\d+)*/);
	return match ? match[0] : null;
}

/**
 * Link that opens a node in Figma (node-id uses hyphens: 12:34 → 12-34).
 *
 * @param {string} fileKey
 * @param {string | null | undefined} nodeId
 * @returns {string | null}
 */
export function buildFigmaNodeUrl(fileKey, nodeId) {
	const id = normalizeFigmaNodeId(nodeId ?? '');
	if (!id || !fileKey) {
		return null;
	}
	return `https://www.figma.com/design/${fileKey}?node-id=${encodeURIComponent(id.replace(/:/g, '-'))}`;
}

export function hasMissingScope(error) {
	if (!(error instanceof FigmaApiError) || error.status !== 403) {
		return false;
	}
	const body = error.bodyText.toLowerCase();
	return body.includes('invalid scope') || body.includes('requires');
}

/**
 * @param {string} fileKey
 * @param {string} figmaToken
 * @param {(msg?: string) => void} [log]
 */
export async function fetchFigmaFile(fileKey, figmaToken, log = () => {}) {
	const endpoint = new URL(`https://api.figma.com/v1/files/${fileKey}`);

	const response = await fetch(endpoint, {
		headers: { 'X-Figma-Token': figmaToken.trim() },
	});

	if (!response.ok) {
		throw new FigmaApiError(response.status, await response.text());
	}

	const contentLength = Number(response.headers.get('content-length') || 0);
	const reader = response.body?.getReader();
	if (!reader) {
		return response.json();
	}

	let received = 0;
	let lastPercent = -1;
	let lastMbShown = -1;
	const chunks = [];

	log('Downloading Figma JSON...');

	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		received += value.byteLength;

		if (contentLength > 0) {
			const percent = Math.floor((received / contentLength) * 100);
			if (percent >= lastPercent + 2 || percent === 100) {
				lastPercent = percent;
				const bw = 28;
				const filled = Math.min(bw, Math.round((percent / 100) * bw));
				process.stdout.write(
					`\r  Downloading [${'#'.repeat(filled)}${'.'.repeat(bw - filled)}] ${String(percent).padStart(3)}%  (${Math.round(received / 1024)} KB / ${Math.round(contentLength / 1024)} KB)`,
				);
			}
		} else {
			const mb = Math.floor(received / (1024 * 1024));
			if (mb > lastMbShown) {
				lastMbShown = mb;
				process.stdout.write(`\r  ${mb} MB downloaded...`);
			}
		}
	}
	process.stdout.write('\n');

	const merged = new Uint8Array(received);
	let off = 0;
	for (const chunk of chunks) {
		merged.set(chunk, off);
		off += chunk.byteLength;
	}
	log('Parsing JSON...');
	return JSON.parse(new TextDecoder().decode(merged));
}

/**
 * Fetch all local variables for a Figma file.
 *
 * @param {string} fileKey
 * @param {string} figmaToken
 * @param {(msg?: string) => void} [log]
 * @returns {Promise<{variableCollections: Array<object>, variables: Array<object>}>}
 */
export async function fetchFigmaLocalVariables(fileKey, figmaToken, log = () => {}) {
	const variableCollections = [];
	const variables = [];
	let cursor = '';
	let page = 1;

	do {
		const endpoint = new URL(`https://api.figma.com/v1/files/${fileKey}/variables/local`);
		if (cursor) {
			endpoint.searchParams.set('cursor', cursor);
		}

		log(`Fetching variables page ${page}...`);
		const response = await fetch(endpoint, {
			headers: { 'X-Figma-Token': figmaToken.trim() },
		});

		if (!response.ok) {
			throw new FigmaApiError(response.status, await response.text());
		}

		const payload = await response.json();
		if (Array.isArray(payload?.meta?.variableCollections)) {
			variableCollections.push(...payload.meta.variableCollections);
		}
		if (Array.isArray(payload?.meta?.variables)) {
			variables.push(...payload.meta.variables);
		}

		cursor = payload?.meta?.cursor || '';
		page += 1;
	} while (cursor);

	return { variableCollections, variables };
}

function sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

/**
 * GET a Figma URL. Retries HTTP 429 and 5xx with backoff; gives up when Figma asks to wait longer than maxWaitMs.
 *
 * @param {string | URL} url
 * @param {string} figmaToken
 * @param {(msg?: string) => void} [log]
 * @param {{ maxWaitMs?: number }} [opts]
 * @returns {Promise<object>} parsed JSON
 */
export async function figmaGetJson(url, figmaToken, log = () => {}, opts = {}) {
	let waitMs = 1000;
	const maxWaitMs = opts.maxWaitMs ?? 90000;

	for (let attempt = 1; attempt <= 4; attempt += 1) {
		const response = await fetch(url, {
			headers: { 'X-Figma-Token': figmaToken.trim() },
			signal: AbortSignal.timeout(180000),
		});

		const retryable = response.status === 429 || response.status >= 500;
		if (retryable && attempt < 4) {
			const retryAfter = Number(response.headers.get('retry-after'));
			const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : waitMs;
			await response.text().catch(() => {});
			// Figma can ask for hours. Never block that long: fail, so the caller can use cached data.
			if (delay > maxWaitMs) {
				throw new FigmaApiError(
					response.status,
					`Figma rate limit: Figma asks to wait about ${Math.ceil(delay / 60000)} min. Try again later.`,
				);
			}
			log(`Figma API ${response.status}. Waiting ${Math.round(delay / 1000)}s before retry ${attempt + 1}...`);
			await sleep(delay);
			waitMs *= 2;
			continue;
		}

		if (!response.ok) {
			throw new FigmaApiError(response.status, await response.text());
		}
		return response.json();
	}

	throw new FigmaApiError(429, 'Figma rate limit persisted after retries.');
}

/**
 * Fetch only the given nodes (pages or frames) with their whole subtree.
 * Much smaller than the full file when the file has many pages.
 *
 * @param {string} fileKey
 * @param {string} figmaToken
 * @param {string[]} nodeIds
 * @param {(msg?: string) => void} [log]
 * @returns {Promise<{ name?: string, nodes: Record<string, { document: object, styles?: object, components?: object, componentSets?: object } | null> }>}
 */
export async function fetchFigmaNodes(fileKey, figmaToken, nodeIds, log = () => {}) {
	const endpoint = new URL(`https://api.figma.com/v1/files/${fileKey}/nodes`);
	endpoint.searchParams.set('ids', nodeIds.join(','));
	log(`Fetching ${nodeIds.length} node(s) from Figma...`);
	return figmaGetJson(endpoint, figmaToken, log);
}

/**
 * Render nodes to PNG. Returns a map of node id to a temporary image URL (null when Figma could not render it).
 *
 * @param {string} fileKey
 * @param {string} figmaToken
 * @param {string[]} nodeIds
 * @param {{ scale?: number }} [opts]
 * @returns {Promise<Record<string, string | null>>}
 */
export async function fetchFigmaImageUrls(fileKey, figmaToken, nodeIds, opts = {}) {
	const endpoint = new URL(`https://api.figma.com/v1/images/${fileKey}`);
	endpoint.searchParams.set('ids', nodeIds.join(','));
	endpoint.searchParams.set('format', 'png');
	endpoint.searchParams.set('scale', String(opts.scale ?? 0.5));
	const payload = await figmaGetJson(endpoint, figmaToken, () => {}, { maxWaitMs: 30000 });
	if (payload?.err) {
		throw new Error(`Figma could not render the node: ${payload.err}`);
	}
	return payload?.images && typeof payload.images === 'object' ? payload.images : {};
}

/**
 * Download a rendered image URL (already signed; no token needed).
 *
 * @param {string} imageUrl
 * @returns {Promise<Buffer>}
 */
export async function downloadFigmaImage(imageUrl) {
	const response = await fetch(imageUrl, { signal: AbortSignal.timeout(120000) });
	if (!response.ok) {
		throw new FigmaApiError(response.status, await response.text());
	}
	return Buffer.from(await response.arrayBuffer());
}
