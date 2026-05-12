export class FigmaApiError extends Error {
	constructor(status, bodyText) {
		super(`Figma API request failed (${status}): ${bodyText}`);
		this.name = 'FigmaApiError';
		this.status = status;
		this.bodyText = bodyText;
	}
}

export function parseFigmaUrl(figmaUrl) {
	const m = figmaUrl.trim().match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
	return m ? { fileKey: m[1] } : null;
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
