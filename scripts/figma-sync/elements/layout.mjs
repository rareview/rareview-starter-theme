export function extractContainerWidth(nodes) {
	const counts = new Map();
	for (const node of nodes) {
		if (node.type !== 'FRAME') {
			continue;
		}
		const w = node.absoluteBoundingBox?.width;
		if (typeof w !== 'number') {
			continue;
		}
		const rounded = Math.round(w);
		if (rounded < 900 || rounded > 1440) {
			continue;
		}
		counts.set(rounded, (counts.get(rounded) ?? 0) + 1);
	}
	if (!counts.size) {
		return null;
	}
	return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * @param {number | null} containerWidth
 * @param {number | null} buttonBorderRadius
 */
export function buildLayout(containerWidth, buttonBorderRadius) {
	if (containerWidth == null && buttonBorderRadius == null) {
		return null;
	}
	const layout = {};
	if (containerWidth != null) {
		layout.containerWidth = containerWidth;
	}
	if (buttonBorderRadius != null) {
		layout.buttonBorderRadius = buttonBorderRadius;
	}
	return layout;
}
