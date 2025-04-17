import { createRoot } from '@wordpress/element';
import ThemeOptions from './ThemeOptions';

document.addEventListener('DOMContentLoaded', function () {
	const domNode = document.getElementById('rv-starter-theme-options');
	if (typeof domNode !== 'undefined' && domNode !== null) {
		const root = createRoot(domNode);
		root.render(<ThemeOptions />);
	}
});
