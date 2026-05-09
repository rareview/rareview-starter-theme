/**
 * Input Fields Examples block — representational form controls only.
 */

/**
 * WordPress dependencies
 */
import { registerBlockType } from '@wordpress/blocks';

/**
 * Internal dependencies
 */
import edit from './edit';
import save from './save';
import block from './block.json';

import './style.scss';

registerBlockType(block, {
	edit,
	save,
});
