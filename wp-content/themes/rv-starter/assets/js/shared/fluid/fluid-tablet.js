const fluidTablet = (root) => {
	// Calculate fluid font-sizes between mobile and desktop sizes for tablet screens.
	// This will set the new, fluid CSS variables, to be used as middle value in clamp, between mobile and desktop sizes.
	const fluidSizeCalculate = (mobileVar, desktopVar) => {
		const minWidth = 500;
		const maxWidth = 1440;

		const mobileSize = parseFloat(getComputedStyle(root).getPropertyValue(mobileVar));
		const desktopSize = parseFloat(getComputedStyle(root).getPropertyValue(desktopVar));

		const slug = mobileVar.split('--').pop();
		const varName = `--rv--fluid-size-tablet--${slug}`;

		const updateFluidSizeTablet = () => {
			// Get the viewport width, but only between the minWidth and maxWidth.
			// Otherwise, fix it to minWidth or maxWidth.
			const vw = Math.max(minWidth, Math.min(window.innerWidth, maxWidth));

			// Calculates a value that gradually scales from mobileSize → desktopSize depending on the viewport width (vw).
			// 1. (vw - minWidth) - How far are we from the minimum width?
			// 2. (vw - minWidth) / (maxWidth - minWidth) - This creates a progress value between 0 and 1.
			// 3. (desktopSize - mobileSize) * progress - At progress 0, adds 0px, at progress 0.5 adds half the difference, at progress 1 adds the full difference between desktop and mobile sizes.
			// 4. mobileSize + (...) - Start at the mobile size and add the scaled difference.
			const size =
				mobileSize + (desktopSize - mobileSize) * ((vw - minWidth) / (maxWidth - minWidth));
			root.style.setProperty(varName, `${size}px`);
		};

		// Update tablet sizes on load and on resize.
		updateFluidSizeTablet();
		window.addEventListener('resize', updateFluidSizeTablet);
	};

	fluidSizeCalculate(
		'--wp--custom--font-size--mobile--body-small',
		'--wp--custom--font-size--desktop--body-small',
	);

	fluidSizeCalculate(
		'--wp--custom--font-size--mobile--body-medium',
		'--wp--custom--font-size--desktop--body-medium',
	);

	fluidSizeCalculate(
		'--wp--custom--font-size--mobile--body-large',
		'--wp--custom--font-size--desktop--body-large',
	);

	fluidSizeCalculate(
		'--wp--custom--font-size--mobile--heading-1',
		'--wp--custom--font-size--desktop--heading-1',
	);

	fluidSizeCalculate(
		'--wp--custom--font-size--mobile--heading-2',
		'--wp--custom--font-size--desktop--heading-2',
	);

	fluidSizeCalculate(
		'--wp--custom--font-size--mobile--heading-3',
		'--wp--custom--font-size--desktop--heading-3',
	);

	fluidSizeCalculate(
		'--wp--custom--font-size--mobile--heading-4',
		'--wp--custom--font-size--desktop--heading-4',
	);

	fluidSizeCalculate(
		'--wp--custom--font-size--mobile--heading-5',
		'--wp--custom--font-size--desktop--heading-5',
	);

	fluidSizeCalculate(
		'--wp--custom--font-size--mobile--heading-6',
		'--wp--custom--font-size--desktop--heading-6',
	);

	fluidSizeCalculate('--rv--size-mobile--root', '--rv--size-desktop--root');
};

export default fluidTablet;
