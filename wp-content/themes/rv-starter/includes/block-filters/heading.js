import classNames from 'classnames';
import { __ } from '@wordpress/i18n';

import { addFilter } from '@wordpress/hooks';
import { SelectControl, PanelBody, PanelRow } from '@wordpress/components';
import { Fragment } from '@wordpress/element';
import { InspectorControls } from '@wordpress/block-editor';
import { createHigherOrderComponent } from '@wordpress/compose';

/**
 * Declare custom attributes for Heading block.
 *
 * @param {object} settings The settings object for the block.
 * @param {string} name The name of the block.
 *
 * @returns {object} The modified block settings object with updated attributes.
 */
const HeadingBlockAttributes = (settings, name) => {
	if (name !== 'core/heading') {
		return settings;
	}

	if (typeof settings.attributes !== 'undefined') {
		settings.attributes = Object.assign(settings.attributes, {
			hasStyleHeading: {
				type: 'string',
				default: '',
			},
		});
	}

	return settings;
};

addFilter(
	'blocks.registerBlockType',
	'rv-starter/heading-block-attributes',
	HeadingBlockAttributes,
);

/**
 * Save the updated block attributes.
 *
 * @param {Function} BlockEdit The original block edit component.
 *
 * @returns {Function} Updated block edit component.
 */
const HeadingBlockUI = createHigherOrderComponent((BlockEdit) => {
	return (props) => {
		const { attributes, setAttributes, name } = props;
		const { hasStyleHeading } = attributes;

		if (name !== 'core/heading') {
			return <BlockEdit {...props} />;
		}

		return (
			<Fragment>
				<BlockEdit {...props} />
				<InspectorControls>
					<PanelBody title={__('General', 'rv-starter-theme')}>
						<PanelRow>
							<SelectControl
								label={__('Apply different heading style', 'rv-starter-theme')}
								help={__(
									'Change the appearance of the heading without affecting its level (H1–H6)',
									'rv-starter-theme',
								)}
								value={hasStyleHeading}
								options={[
									{
										label: __('Default', 'rv-starter-theme'),
										value: '',
									},
									{
										label: __('H1', 'rv-starter-theme'),
										value: 'has-style-h1',
									},
									{
										label: __('H2', 'rv-starter-theme'),
										value: 'has-style-h2',
									},
									{
										label: __('H3', 'rv-starter-theme'),
										value: 'has-style-h3',
									},
									{
										label: __('H4', 'rv-starter-theme'),
										value: 'has-style-h4',
									},
									{
										label: __('H5', 'rv-starter-theme'),
										value: 'has-style-h5',
									},
									{
										label: __('H6', 'rv-starter-theme'),
										value: 'has-style-h6',
									},
								]}
								onChange={(value) => {
									setAttributes({ hasStyleHeading: value });
								}}
							/>
						</PanelRow>
					</PanelBody>
				</InspectorControls>
			</Fragment>
		);
	};
}, 'HeadingBlockUI');

addFilter('editor.BlockEdit', 'rv-starter/filter-heading-block-ui', HeadingBlockUI);

/**
 * Live-update Heading block in the block editor.
 *
 * @param {Function} BlockListBlock The original component.
 *
 * @returns {Function} The modified component.
 */
const updateHeaderInEditor = createHigherOrderComponent((BlockListBlock) => {
	return (props) => {
		const { name, attributes, className } = props;

		if (name !== 'core/heading') {
			return <BlockListBlock {...props} />;
		}

		const { hasStyleHeading } = attributes;

		return <BlockListBlock {...props} className={classNames(className, hasStyleHeading)} />;
	};
}, 'updateHeaderInEditor');

addFilter(
	'editor.BlockListBlock',
	'custom-attributes/with-toolbar-button-prop',
	updateHeaderInEditor,
);

/**
 * Save changes to heading block.
 *
 * @param {object} extraProps The extra props object.
 * @param {string} blockType  The type of the block.
 * @param {object} attributes The attributes of the block.
 *
 * @returns {object} The modified extra props object.
 */
const saveHeadingChanges = (extraProps, blockType, attributes) => {
	const { hasStyleHeading } = attributes;

	if (typeof hasStyleHeading !== 'undefined' && hasStyleHeading) {
		extraProps.className = classNames(extraProps.className, hasStyleHeading);
	}

	return extraProps;
};

addFilter(
	'blocks.getSaveContent.extraProps',
	'rv-starter/save-heading-changes',
	saveHeadingChanges,
);
