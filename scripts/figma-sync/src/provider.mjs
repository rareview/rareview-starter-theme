/**
 * One AI client for Anthropic Messages and OpenAI Responses.
 * Keys are never written to logs.
 */

import { color } from '../lib/ui.mjs';

const REQUEST_TIMEOUT_MS = 300000;
const MAX_ATTEMPTS = 4;

/**
 * @param {string} provider
 * @param {number} status
 * @param {string} bodyText
 */
function aiError(provider, status, bodyText) {
	const detail = bodyText.replace(/\s+/g, ' ').trim().slice(0, 400);
	return new Error(`${provider} request failed (${status}): ${detail}`);
}

/**
 * @param {string} url
 * @param {Record<string, string>} headers
 * @param {object} body
 * @param {string} provider
 */
async function postJson(url, headers, body, provider) {
	let waitMs = 2000;
	let response;
	let text = '';
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
		try {
			response = await fetch(url, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});
		} catch (error) {
			// Network error or timeout: retry, then give up with the real message.
			if (attempt === MAX_ATTEMPTS) {
				throw error;
			}
			await new Promise((resolve) => setTimeout(resolve, waitMs));
			waitMs *= 2;
			continue;
		}
		text = await response.text();
		// 429 rate limit, 529 overloaded, 5xx: wait and retry.
		const retryable = response.status === 429 || response.status >= 500;
		if (!retryable || attempt === MAX_ATTEMPTS) {
			break;
		}
		const retryAfter = Number(response.headers.get('retry-after'));
		const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : waitMs;
		// \r + clear line: do not write over the "AI is thinking" timer line.
		console.log(`${process.stdout.isTTY ? '\r\x1b[K' : ''}  ${color.yellow(`${provider} is busy (${response.status}). Retrying in ${Math.round(delay / 1000)}s...`)}`);
		await new Promise((resolve) => setTimeout(resolve, delay));
		waitMs *= 2;
	}
	if (!response.ok) {
		throw aiError(provider, response.status, text);
	}
	try {
		return JSON.parse(text);
	} catch {
		throw new Error(`${provider} returned a response that was not JSON.`);
	}
}

/**
 * @param {object} data
 */
function anthropicText(data) {
	return (data.content ?? [])
		.filter((block) => block.type === 'text' && typeof block.text === 'string')
		.map((block) => block.text)
		.join('\n')
		.trim();
}

/**
 * @param {object} data
 */
function openaiText(data) {
	const parts = [];
	for (const item of data.output ?? []) {
		if (item.type !== 'message' || !Array.isArray(item.content)) {
			continue;
		}
		for (const block of item.content) {
			if (block.type === 'output_text' && typeof block.text === 'string') {
				parts.push(block.text);
			}
		}
	}
	return parts.join('\n').trim();
}

/**
 * @param {Array<{ name: string, description: string, inputSchema: object }>} tools
 */
function anthropicTools(tools) {
	return tools.map((tool) => ({
		name: tool.name,
		description: tool.description,
		input_schema: tool.inputSchema,
	}));
}

/**
 * @param {Array<{ name: string, description: string, inputSchema: object }>} tools
 */
function openaiTools(tools) {
	return tools.map((tool) => ({
		type: 'function',
		name: tool.name,
		description: tool.description,
		parameters: tool.inputSchema,
	}));
}

/**
 * Run a prompt. When tools are passed, call onTool until the model stops or the budget runs out.
 *
 * @param {object} options
 * @param {{ provider: 'anthropic' | 'openai', apiKey: string, model: string }} options.settings
 * @param {string} options.system
 * @param {string} options.userText
 * @param {Array<{ name: string, description: string, inputSchema: object }>} [options.tools]
 * @param {(name: string, input: object) => Promise<{ text: string, images?: Array<{ mediaType: string, base64: string }> }>} [options.onTool]
 * @param {number} [options.maxCalls]
 * @param {number} [options.maxInputTokens]
 * @param {Array<{ mediaType: string, base64: string }>} [options.images] attached to the first user message
 * @returns {Promise<{ text: string, usage: { inputTokens: number, outputTokens: number, cacheReadTokens: number, cacheWriteTokens: number } }>}
 */
export async function runAiWithTools(options) {
	const {
		settings,
		system,
		userText,
		tools = [],
		onTool = async () => ({ text: '' }),
		maxCalls = 15,
		maxInputTokens = 60000,
		images = [],
	} = options;
	const run = settings.provider === 'openai' ? runOpenAi : runAnthropic;
	const result = await run({ settings, system, userText, tools, onTool, maxCalls, maxInputTokens, images });
	recordUsage(result.usage, settings);
	return result;
}

/** Running total for the end-of-sync cost line. */
const totals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, calls: 0, model: '' };

/**
 * @param {{ inputTokens: number, outputTokens: number, cacheReadTokens?: number, cacheWriteTokens?: number }} usage
 * @param {{ model: string }} settings
 */
function recordUsage(usage, settings) {
	totals.inputTokens += usage.inputTokens ?? 0;
	totals.outputTokens += usage.outputTokens ?? 0;
	totals.cacheReadTokens += usage.cacheReadTokens ?? 0;
	totals.cacheWriteTokens += usage.cacheWriteTokens ?? 0;
	totals.calls += 1;
	totals.model = settings.model;
}

/**
 * Rough USD per million tokens (input, output). Only used for the estimate line; unknown models print tokens only.
 * Cache reads cost ~10% of input; cache writes ~125%.
 */
const PRICES = [
	[/opus-5-5/i, 4, 20],
	[/sonnet-5/i, 2, 10],
	[/haiku-5-5/i, 0.1, 0.5],
	[/opus/i, 5, 25],
	[/sonnet/i, 3, 15],
	[/haiku/i, 1, 5],
	[/gpt-4\.1-mini/i, 0.4, 1.6],
	[/gpt-4\.1/i, 2, 8],
	[/gpt-4o-mini/i, 0.15, 0.6],
	[/gpt-4o/i, 2.5, 10],
];

/**
 * @returns {{ inputTokens: number, outputTokens: number, cacheReadTokens: number, cacheWriteTokens: number, calls: number, model: string, usd: number | null }}
 */
export function getUsageTotals() {
	const price = PRICES.find(([pattern]) => pattern.test(totals.model));
	let usd = null;
	if (price) {
		const [, input, output] = price;
		usd =
			(totals.inputTokens * input +
				totals.cacheReadTokens * input * 0.1 +
				totals.cacheWriteTokens * input * 1.25 +
				totals.outputTokens * output) /
			1e6;
	}
	return { ...totals, usd };
}

/**
 * @param {object} options
 */
async function runAnthropic(options) {
	const { settings, system, userText, tools, onTool, maxCalls, maxInputTokens, images } = options;
	// The first user block (overview / design detail) is the big repeated part of tool loops and retries;
	// cache_control marks it so later turns read it from the prompt cache at ~10% of the price.
	const firstContent = [
		...images.map((image) => ({
			type: 'image',
			source: { type: 'base64', media_type: image.mediaType, data: image.base64 },
		})),
		{ type: 'text', text: userText, cache_control: { type: 'ephemeral' } },
	];
	const messages = [{ role: 'user', content: firstContent }];
	let toolCalls = 0;
	let inputTokens = 0;
	let outputTokens = 0;
	let cacheReadTokens = 0;
	let cacheWriteTokens = 0;

	for (;;) {
		const forceFinal = toolCalls >= maxCalls || inputTokens + cacheReadTokens >= maxInputTokens;
		// Move the second cache breakpoint to the newest message, so each turn reads the whole history from cache.
		for (const message of messages.slice(1)) {
			for (const block of Array.isArray(message.content) ? message.content : []) {
				delete block.cache_control;
			}
		}
		const last = messages[messages.length - 1];
		if (messages.length > 1 && Array.isArray(last.content) && last.content.length) {
			last.content[last.content.length - 1].cache_control = { type: 'ephemeral' };
		}
		const body = {
			model: settings.model,
			max_tokens: 16000,
			thinking: { type: 'adaptive' },
			system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
			messages,
		};
		if (tools.length) {
			// History with tool calls needs the tool list; when the budget is used up, forbid more calls instead.
			body.tools = anthropicTools(tools);
			if (forceFinal) {
				body.tool_choice = { type: 'none' };
			}
		}

		const data = await postJson(
			'https://api.anthropic.com/v1/messages',
			{
				'x-api-key': settings.apiKey,
				'anthropic-version': '2023-06-01',
				'content-type': 'application/json',
			},
			body,
			'Anthropic',
		);

		inputTokens += data.usage?.input_tokens ?? 0;
		outputTokens += data.usage?.output_tokens ?? 0;
		cacheReadTokens += data.usage?.cache_read_input_tokens ?? 0;
		cacheWriteTokens += data.usage?.cache_creation_input_tokens ?? 0;

		const content = Array.isArray(data.content) ? data.content : [];
		const usedTools = content.filter((block) => block.type === 'tool_use');
		const text = anthropicText(data);
		if (!usedTools.length || forceFinal) {
			return { text, usage: { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } };
		}

		messages.push({ role: 'assistant', content });
		const results = [];
		for (const call of usedTools) {
			toolCalls += 1;
			const result = await callTool(onTool, call.name, call.input ?? {});
			const blocks = [{ type: 'text', text: result.text || '' }];
			for (const image of result.images ?? []) {
				blocks.push({
					type: 'image',
					source: { type: 'base64', media_type: image.mediaType, data: image.base64 },
				});
			}
			results.push({ type: 'tool_result', tool_use_id: call.id, content: blocks });
		}
		messages.push({ role: 'user', content: results });
	}
}

/**
 * @param {object} options
 */
async function runOpenAi(options) {
	const { settings, system, userText, tools, onTool, maxCalls, maxInputTokens, images } = options;
	let previousResponseId = '';
	let nextInput = images.length
		? [
				{
					role: 'user',
					content: [
						{ type: 'input_text', text: userText },
						...images.map((image) => ({
							type: 'input_image',
							image_url: `data:${image.mediaType};base64,${image.base64}`,
							detail: 'low',
						})),
					],
				},
			]
		: userText;
	let toolCalls = 0;
	let inputTokens = 0;
	let outputTokens = 0;
	let cacheReadTokens = 0;

	for (;;) {
		const forceFinal = toolCalls >= maxCalls || inputTokens >= maxInputTokens;
		const body = {
			model: settings.model,
			instructions: system,
			input: nextInput,
			max_output_tokens: 16000,
		};
		if (previousResponseId) {
			body.previous_response_id = previousResponseId;
		}
		if (tools.length) {
			body.tools = openaiTools(tools);
			if (forceFinal) {
				body.tool_choice = 'none';
			}
		}

		const data = await postJson(
			'https://api.openai.com/v1/responses',
			{
				Authorization: `Bearer ${settings.apiKey}`,
				'Content-Type': 'application/json',
			},
			body,
			'OpenAI',
		);

		previousResponseId = typeof data.id === 'string' ? data.id : previousResponseId;
		// OpenAI caches long prefixes automatically; cached tokens are part of input_tokens.
		const cached = data.usage?.input_tokens_details?.cached_tokens ?? 0;
		inputTokens += (data.usage?.input_tokens ?? 0) - cached;
		cacheReadTokens += cached;
		outputTokens += data.usage?.output_tokens ?? 0;

		const output = Array.isArray(data.output) ? data.output : [];
		const usedTools = output.filter((item) => item.type === 'function_call');
		const text = openaiText(data);
		if (!usedTools.length || forceFinal) {
			return { text, usage: { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens: 0 } };
		}

		const followUp = [];
		const images = [];
		for (const call of usedTools) {
			toolCalls += 1;
			let toolInput = {};
			try {
				toolInput = JSON.parse(call.arguments || '{}');
			} catch {
				toolInput = {};
			}
			const result = await callTool(onTool, call.name, toolInput);
			followUp.push({
				type: 'function_call_output',
				call_id: call.call_id,
				output: result.text || '',
			});
			images.push(...(result.images ?? []));
		}
		if (images.length) {
			followUp.push({
				role: 'user',
				content: [
					{ type: 'input_text', text: 'Images of the nodes you just requested.' },
					...images.map((image) => ({
						type: 'input_image',
						image_url: `data:${image.mediaType};base64,${image.base64}`,
						detail: 'high',
					})),
				],
			});
		}
		nextInput = followUp;
	}
}

/**
 * @param {(name: string, input: object) => Promise<{ text: string, images?: object[] }>} onTool
 * @param {string} name
 * @param {object} input
 */
async function callTool(onTool, name, input) {
	try {
		const result = await onTool(name, input);
		return result && typeof result.text === 'string' ? result : { text: '' };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { text: message };
	}
}
