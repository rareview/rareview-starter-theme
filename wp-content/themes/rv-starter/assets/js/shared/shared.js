import fluidInit from './fluid';

/**
 * Set a CSS custom property for the scrollbar width.
 * Prevents layout shift on pages with/without scrollbars
 * when using 100vw containers.
 */
function setScrollbarWidth() {
	const width = window.innerWidth - document.documentElement.clientWidth;
	document.documentElement.style.setProperty('--scrollbar-width', `${width}px`);
}

setScrollbarWidth();
window.addEventListener('resize', setScrollbarWidth);

fluidInit();
