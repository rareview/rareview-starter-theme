/**
 * Dynamically calculate header height, and store value in the root CSS variable.
 * Calculate on load, and on screen resize.
 * */
const header = document.querySelector('.rv-header');

const headerHeight = () => {
	if (!header) return;
	const outputSize = () => {
		const root = document.querySelector(':root');
		root.style.setProperty('--header-height', `${header.offsetHeight - 1}px`);
	};
	new ResizeObserver(outputSize).observe(header);
};

export default headerHeight;
