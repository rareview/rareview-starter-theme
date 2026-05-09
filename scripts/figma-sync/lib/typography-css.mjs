export function textCaseToCss(tc) {
	if (tc === 'UPPER') {
		return 'uppercase';
	}
	if (tc === 'LOWER') {
		return 'lowercase';
	}
	if (tc === 'TITLE') {
		return 'capitalize';
	}
	return 'none';
}

export function textDecorationToCss(td) {
	if (td === 'UNDERLINE') {
		return 'underline';
	}
	if (td === 'STRIKETHROUGH') {
		return 'line-through';
	}
	return 'none';
}

export function buildTypographyKey(s) {
	return [s?.fontFamily, s?.fontWeight, s?.fontSize, s?.lineHeightPx, s?.letterSpacing, s?.textCase].join('|');
}
