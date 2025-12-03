const fluidHugeScreen = (root) => {
	// Add CSS variables (px) that should become fluid (rem) on huge screens.
	// Everything else that is already in rem will automatically become fluid on huge screens.
	const varsToConvert = [
		'--wp--custom--font-size--desktop--body-small',
		'--wp--custom--font-size--desktop--body-medium',
		'--wp--custom--font-size--desktop--body-large',
		'--wp--custom--font-size--desktop--heading-1',
		'--wp--custom--font-size--desktop--heading-2',
		'--wp--custom--font-size--desktop--heading-3',
		'--wp--custom--font-size--desktop--heading-4',
		'--wp--custom--font-size--desktop--heading-5',
		'--wp--custom--font-size--desktop--heading-6',
	];

	// Get the rem root size in px.
	const rootFontSize = parseFloat(
		getComputedStyle(root).getPropertyValue('--rv--size-desktop--root'),
	);

	// Generate new '--rv--rem--' CSS variables with rem values, to be used on huge screens.
	varsToConvert.forEach((cssVar) => {
		const value = getComputedStyle(root).getPropertyValue(cssVar);
		if (value) {
			const px = parseFloat(value);
			const rem = px / rootFontSize;
			const newVar = cssVar.replace('--wp--custom--', '--rv--rem--');
			document.documentElement.style.setProperty(newVar, `${rem}rem`);
		}
	});
};

export default fluidHugeScreen;
