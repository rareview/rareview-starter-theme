import classNames from 'classnames';
import { __ } from '@wordpress/i18n';

import { addFilter } from '@wordpress/hooks';
import { useSelect } from '@wordpress/data';
import { InspectorControls } from '@wordpress/block-editor';
import { Notice, PanelBody, ToggleControl } from '@wordpress/components';
import { Fragment, useEffect } from '@wordpress/element';
import { createHigherOrderComponent } from '@wordpress/compose';

const BLOCK_NAME = 'core/image';
const FILL_CLASS = 'is-fill';

/**
 * Container-type blocks, for fill-space images.
 */
const FILL_SPACE_CONTAINER_BLOCKS = [
	'core/group',
	'core/columns',
	'core/column',
	'core/cover',
	'core/media-text',
	'core/stack',
	'core/grid',
];

/**
 * Check if the parent block is a container-type.
 *
 * @param {string} clientId Block client ID.
 * @returns {boolean}
 */
function useIsInsideFillContainer(clientId) {
	return useSelect(
		(select) => {
			const { getBlockParents, getBlock } = select('core/block-editor');
			const parents = getBlockParents(clientId, true);

			return parents.some((parentClientId) => {
				const parent = getBlock(parentClientId);
				return parent && FILL_SPACE_CONTAINER_BLOCKS.includes(parent.name);
			});
		},
		[clientId],
	);
}

/**
 * Make sure existing images classes stay, and is-fill class doesn't get duplicated on multiple toggle on/off.
 *
 * @param {string} className  Existing class names.
 * @param {object} attributes Block attributes.
 * @returns {string} Updated class names.
 */
function prepareImageClasses(className, attributes) {
	const withoutFill = (className || '')
		.split(/\s+/)
		.filter((cls) => cls && cls !== FILL_CLASS)
		.join(' ');

	if (!attributes.fillSpace) {
		return withoutFill;
	}

	return classNames(withoutFill, FILL_CLASS);
}

/**
 * Declare custom attributes for Image block.
 *
 * @param {object} settings The settings object for the block.
 * @param {string} name     The name of the block.
 *
 * @returns {object} The modified block settings object with updated attributes.
 */
const ImageBlockAttributes = (settings, name) => {
	if (name !== BLOCK_NAME) {
		return settings;
	}

	if (typeof settings.attributes !== 'undefined') {
		settings.attributes = Object.assign(settings.attributes, {
			fillSpace: {
				type: 'boolean',
				default: false,
			},
		});
	}

	return settings;
};

addFilter('blocks.registerBlockType', 'rv-starter/image-block-attributes', ImageBlockAttributes);

/**
 * Image block inspector controls.
 *
 * @param {Function} BlockEdit The original block edit component.
 *
 * @returns {Function} Updated block edit component.
 */
const ImageBlockUI = createHigherOrderComponent((BlockEdit) => {
	return (props) => {
		const { attributes, setAttributes, name, clientId } = props;
		const { fillSpace = false } = attributes;
		const isInsideFillContainer = useIsInsideFillContainer(clientId);
		const fillSpaceHelp = fillSpace
			? __('On - Image fills its container.', 'rv-starter-theme')
			: __('Off - Image uses its natural dimensions.', 'rv-starter-theme');

		useEffect(() => {
			if (!isInsideFillContainer && fillSpace) {
				setAttributes({ fillSpace: false });
			}
		}, [isInsideFillContainer, fillSpace, setAttributes]);

		if (name !== BLOCK_NAME) {
			return <BlockEdit {...props} />;
		}

		return (
			<Fragment>
				<BlockEdit {...props} />
				<InspectorControls group="settings">
					<PanelBody title={__('Layout', 'rv-starter-theme')} initialOpen>
						<ToggleControl
							label={__('Fill space', 'rv-starter-theme')}
							help={isInsideFillContainer ? fillSpaceHelp : undefined}
							checked={fillSpace}
							disabled={!isInsideFillContainer}
							onChange={(value) => setAttributes({ fillSpace: value })}
						/>
						{!isInsideFillContainer && (
							<div style={{ marginTop: '12px' }}>
								<Notice status="info" isDismissible={false}>
									{__(
										'Works only when the image is inside a container block (Group, Column, Cover, etc.).',
										'rv-starter-theme',
									)}
								</Notice>
							</div>
						)}
					</PanelBody>
				</InspectorControls>
			</Fragment>
		);
	};
}, 'ImageBlockUI');

addFilter('editor.BlockEdit', 'rv-starter/filter-image-block-ui', ImageBlockUI);

/**
 * Live-update Image block in the block editor.
 *
 * @param {Function} BlockListBlock The original component.
 *
 * @returns {Function} The modified component.
 */
const updateImageInEditor = createHigherOrderComponent((BlockListBlock) => {
	return (props) => {
		const { name, attributes, className, clientId } = props;
		const isInsideFillContainer = useIsInsideFillContainer(clientId);

		if (name !== BLOCK_NAME) {
			return <BlockListBlock {...props} />;
		}

		const imageAttributes = isInsideFillContainer
			? attributes
			: { ...attributes, fillSpace: false };

		return (
			<BlockListBlock
				{...props}
				className={prepareImageClasses(className, imageAttributes)}
			/>
		);
	};
}, 'updateImageInEditor');

addFilter('editor.BlockListBlock', 'rv-starter/update-image-in-editor', updateImageInEditor);

/**
 * Save fill-space class on Image block markup.
 *
 * @param {object} extraProps  The extra props object.
 * @param {object} blockType   The type of the block.
 * @param {object} attributes  The attributes of the block.
 *
 * @returns {object} The modified extra props object.
 */
const saveImageFillSpace = (extraProps, blockType, attributes) => {
	if (blockType.name !== BLOCK_NAME) {
		return extraProps;
	}

	extraProps.className = prepareImageClasses(extraProps.className, attributes);

	return extraProps;
};

addFilter(
	'blocks.getSaveContent.extraProps',
	'rv-starter/save-image-fill-space',
	saveImageFillSpace,
);
