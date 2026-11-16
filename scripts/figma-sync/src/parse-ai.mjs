/**
 * Parse an AI response as JSON: tolerates code fences, line and block comments, and trailing commas.
 */

/**
 * @param {string} text
 */
export function parseAiJson(text) {
	const trimmed = String(text ?? '').trim();
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
	const source = fenced ? fenced[1] : trimmed;
	const start = source.indexOf('{');
	const end = source.lastIndexOf('}');
	if (start === -1 || end <= start) {
		throw new Error('AI response did not contain a JSON object.');
	}
	const body = source.slice(start, end + 1);
	try {
		return JSON.parse(body);
	} catch (error) {
		// Models sometimes write JSON5-ish output: // or /* */ comments and trailing commas.
		try {
			return JSON.parse(relaxJson(body));
		} catch {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`AI JSON could not be parsed: ${message}`);
		}
	}
}

/**
 * Removes comments and trailing commas outside of strings, so near-JSON parses.
 *
 * @param {string} text
 * @returns {string}
 */
export function relaxJson(text) {
	let out = '';
	let inString = false;
	for (let i = 0; i < text.length; i += 1) {
		const char = text[i];
		if (inString) {
			out += char;
			if (char === '\\') {
				out += text[i + 1] ?? '';
				i += 1;
			} else if (char === '"') {
				inString = false;
			}
			continue;
		}
		if (char === '"') {
			inString = true;
			out += char;
		} else if (char === '/' && text[i + 1] === '/') {
			while (i < text.length && text[i] !== '\n') {
				i += 1;
			}
			out += '\n';
		} else if (char === '/' && text[i + 1] === '*') {
			const close = text.indexOf('*/', i + 2);
			i = close === -1 ? text.length : close + 1;
		} else {
			out += char;
		}
	}
	return out.replace(/,(\s*[}\]])/g, '$1');
}
