const remRootSizes = (root) => {
	// Set the desktop rem root.
	// Gutenberg block editor's root size is 16px, so in order to keep the FE and BE look the same, this must be 16px.
	const rootSizeDesktop = () => {
		root.style.setProperty('--rv--size-desktop--root', '16px');
	};
	rootSizeDesktop();

	// Calculate the mobile rem root.
	// The difference between design-provided desktop and mobile font-size for 'body-medium' is subtracted from 16px to get the mobile root size.
	const rootSizeMobile = () => {
		const desktop = parseFloat(
			getComputedStyle(document.documentElement).getPropertyValue(
				'--wp--custom--font-size--desktop--body-medium',
			),
		);

		const mobile = parseFloat(
			getComputedStyle(document.documentElement).getPropertyValue(
				'--wp--custom--font-size--mobile--body-medium',
			),
		);

		const diff = desktop - mobile;
		const rootSize = 16 - diff;

		document.documentElement.style.setProperty('--rv--size-mobile--root', `${rootSize}px`);
	};
	rootSizeMobile();
};

export default remRootSizes;
