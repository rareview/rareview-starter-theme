export function rgbToHex(color) {
	if (!color || typeof color !== 'object') {
		return null;
	}
	const b = (v) => Math.max(0, Math.min(255, Math.round(Number(v ?? 0) * 255)));
	return `#${b(color.r).toString(16).padStart(2, '0')}${b(color.g).toString(16).padStart(2, '0')}${b(color.b).toString(16).padStart(2, '0')}`.toUpperCase();
}

export function firstSolidHex(fills) {
	if (!Array.isArray(fills)) {
		return null;
	}
	const f = fills.find((f) => f?.type === 'SOLID' && f?.visible !== false);
	return f ? rgbToHex(f.color) : null;
}

export function isMonoColor(hex) {
	if (!hex || hex.length !== 7) {
		return false;
	}
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const bv = parseInt(hex.slice(5, 7), 16);
	return Math.max(r, g, bv) - Math.min(r, g, bv) <= 22;
}

/**
 * Hue angle (0..360) from #RRGGBB.
 * Used only for ordering chromatic palette entries by color tone.
 */
export function hexHue(hex) {
	if (!hex || hex.length !== 7) {
		return 0;
	}
	const r = parseInt(hex.slice(1, 3), 16) / 255;
	const g = parseInt(hex.slice(3, 5), 16) / 255;
	const b = parseInt(hex.slice(5, 7), 16) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const d = max - min;
	if (d === 0) {
		return 0;
	}
	let h;
	if (max === r) {
		h = ((g - b) / d) % 6;
	} else if (max === g) {
		h = (b - r) / d + 2;
	} else {
		h = (r - g) / d + 4;
	}
	const deg = h * 60;
	return deg < 0 ? deg + 360 : deg;
}

/**
 * Relative luminance of a hex color (W3C formula, 0 = black, 1 = white).
 */
export function hexLuminance(hex) {
	if (!hex || hex.length !== 7) {
		return 0;
	}
	const lin = (c) => {
		const v = parseInt(c, 16) / 255;
		return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
	};
	const r = lin(hex.slice(1, 3));
	const g = lin(hex.slice(3, 5));
	const b = lin(hex.slice(5, 7));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
