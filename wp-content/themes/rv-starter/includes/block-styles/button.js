import { registerBlockStyle, unregisterBlockStyle } from '@wordpress/blocks';

/* todo: follow progress on https://github.com/WordPress/gutenberg/issues/38767, so we can remove the Width Settings tab. */

wp.domReady(function () {
	unregisterBlockStyle('core/button', 'outline');
});

registerBlockStyle('core/button', [
	{
		name: 'default-outline',
		label: 'Default Outline',
	},
]);

registerBlockStyle('core/button', [
	{
		name: 'secondary',
		label: 'Secondary',
	},
]);

registerBlockStyle('core/button', [
	{
		name: 'secondary-outline',
		label: 'Secondary Outline',
	},
]);
