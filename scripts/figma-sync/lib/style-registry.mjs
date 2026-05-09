export function buildStyleRegistry(figmaStyles) {
	if (!figmaStyles || typeof figmaStyles !== 'object') {
		return {};
	}
	return Object.fromEntries(
		Object.entries(figmaStyles).map(([id, style]) => [id, { id, name: style?.name ?? null, type: style?.styleType ?? null }]),
	);
}
