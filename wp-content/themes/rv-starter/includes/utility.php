<?php
/**
 * Utility functions for the theme.
 *
 * This file is for custom helper functions.
 * These should not be confused with WordPress template
 * tags. Template tags typically use prefixing, as opposed
 * to Namespaces.
 *
 * @link https://developer.wordpress.org/themes/basics/template-tags/
 * @package RVStarterTheme
 */

namespace RVStarterTheme\Utility;

/**
 * Get asset info from extracted asset files.
 *
 * @param  string      $slug  Asset slug as defined in build/webpack configuration.
 * @param  string|null $attribute  Optional attribute to get. Can be version or dependencies.
 *
 * @return array|string|null
 */
function get_asset_info( string $slug, string $attribute = null ): array|string|null {
	if ( file_exists( RV_STARTER_THEME_PATH . 'dist/js/' . $slug . '.asset.php' ) ) {
		$asset = require RV_STARTER_THEME_PATH . 'dist/js/' . $slug . '.asset.php';
	} elseif ( file_exists( RV_STARTER_THEME_PATH . 'dist/css/' . $slug . '.asset.php' ) ) {
		$asset = require RV_STARTER_THEME_PATH . 'dist/css/' . $slug . '.asset.php';
	} else {
		return null;
	}

	if ( ! empty( $attribute ) && isset( $asset[ $attribute ] ) ) {
		return $asset[ $attribute ];
	}

	return $asset;
}
