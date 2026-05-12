/**
 * Count corner radius occurrences for FRAME/INSTANCE nodes whose names match `re`.
 * COMPONENT nodes are master definitions, not placed usage, so they are excluded
 * to avoid inflating counts for library components with many variants.
 */
export function countCornerRadiusByNamePattern(nodes, re) {
	const counts = new Map();
	for (const node of nodes) {
		if (!['FRAME', 'INSTANCE'].includes(node.type) || !re.test(node.name ?? '')) {
			continue;
		}
		const r = node.cornerRadius;
		if (typeof r !== 'number' || r < 0) {
			continue;
		}
		counts.set(r, (counts.get(r) ?? 0) + 1);
	}
	return counts;
}
