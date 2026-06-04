import classNames from 'classnames';
import { __ } from '@wordpress/i18n';

import { addFilter } from '@wordpress/hooks';
import { InspectorControls } from '@wordpress/block-editor';
import { PanelBody, ToggleControl } from '@wordpress/components';
import { Fragment } from '@wordpress/element';
import { createHigherOrderComponent } from '@wordpress/compose';

const BLOCK_NAME = 'core/columns';
const EARLY_STACK_CLASS = 'has-early-stack';

/**
 * Merge with existing Columns block classes without accumulating multiple early-stack classes.
 *
 * @param {string} className  Existing class names.
 * @param {object} attributes Block attributes.
 * @returns {string} Updated class names.
 */
function prepareColumnsClasses(className, attributes) {
	const withoutEarlyStack = (className || '')
		.split(/\s+/)
		.filter((cls) => cls && cls !== EARLY_STACK_CLASS)
		.join(' ');

	if (!attributes.stackEarly) {
		return withoutEarlyStack;
	}

	return classNames(withoutEarlyStack, EARLY_STACK_CLASS);
}

/**
 * Declare custom attributes for Columns block.
 *
 * @param {object} settings The settings object for the block.
 * @param {string} name     The name of the block.
 *
 * @returns {object} The modified block settings object with updated attributes.
 */
const ColumnsBlockAttributes = (settings, name) => {
	if (name !== BLOCK_NAME) {
		return settings;
	}

	if (typeof settings.attributes !== 'undefined') {
		settings.attributes = Object.assign(settings.attributes, {
			stackEarly: {
				type: 'boolean',
				default: false,
			},
		});
	}

	return settings;
};

addFilter(
	'blocks.registerBlockType',
	'rv-starter/columns-block-attributes',
	ColumnsBlockAttributes,
);

/**
 * Columns block inspector controls.
 *
 * @param {Function} BlockEdit The original block edit component.
 *
 * @returns {Function} Updated block edit component.
 */
const ColumnsBlockUI = createHigherOrderComponent((BlockEdit) => {
	return (props) => {
		const { attributes, setAttributes, name } = props;
		const { stackEarly = false } = attributes;
		const stackEarlyHelp = stackEarly
			? __('On - Columns stack below 992px (tablet & mobile).', 'rv-starter-theme')
			: __('Off - Default columns stack breakpoint.', 'rv-starter-theme');

		if (name !== BLOCK_NAME) {
			return <BlockEdit {...props} />;
		}

		return (
			<Fragment>
				<BlockEdit {...props} />
				<InspectorControls group="settings">
					<PanelBody title={__('Stack columns early', 'rv-starter-theme')}>
						<ToggleControl
							label={__('Stack columns early', 'rv-starter-theme')}
							help={stackEarlyHelp}
							checked={stackEarly}
							onChange={(value) => setAttributes({ stackEarly: value })}
						/>
					</PanelBody>
				</InspectorControls>
			</Fragment>
		);
	};
}, 'ColumnsBlockUI');

addFilter('editor.BlockEdit', 'rv-starter/filter-columns-block-ui', ColumnsBlockUI);

/**
 * Live-update Columns block in the block editor.
 *
 * @param {Function} BlockListBlock The original component.
 *
 * @returns {Function} The modified component.
 */
const updateColumnsInEditor = createHigherOrderComponent((BlockListBlock) => {
	return (props) => {
		const { name, attributes, className } = props;

		if (name !== BLOCK_NAME) {
			return <BlockListBlock {...props} />;
		}

		return (
			<BlockListBlock {...props} className={prepareColumnsClasses(className, attributes)} />
		);
	};
}, 'updateColumnsInEditor');

addFilter('editor.BlockListBlock', 'rv-starter/update-columns-in-editor', updateColumnsInEditor);

/**
 * Save early-stack class on Columns block markup.
 *
 * @param {object} extraProps  The extra props object.
 * @param {object} blockType   The type of the block.
 * @param {object} attributes  The attributes of the block.
 *
 * @returns {object} The modified extra props object.
 */
const saveColumnsEarlyStack = (extraProps, blockType, attributes) => {
	if (blockType.name !== BLOCK_NAME) {
		return extraProps;
	}

	extraProps.className = prepareColumnsClasses(extraProps.className, attributes);

	return extraProps;
};

addFilter(
	'blocks.getSaveContent.extraProps',
	'rv-starter/save-columns-early-stack',
	saveColumnsEarlyStack,
);
