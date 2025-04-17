<?php
/**
 * Example block markup
 *
 * @package RVStarterTheme\Blocks\Example
 *
 * @var array    $attributes         Block attributes.
 * @var string   $content            Block content.
 * @var WP_Block $block              Block instance.
 * @var array    $context            Block context.
 */

?>
<div <?php echo get_block_wrapper_attributes(); // phpcs:ignore ?>>
	<h2 class="wp-block-rv-starter-example__title">
		<?php echo wp_kses_post( $attributes['title'] ); ?>
	</h2>
</div>
