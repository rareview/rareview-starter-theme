<?php
/**
 * Detect dark vs light page background from theme tokens (for body class + forms).
 *
 * @package RVStarterTheme
 */

namespace RVStarterTheme\DarkLight;

/**
 * Relative luminance of a #RRGGBB or #RGB color (0 = black, 1 = white).
 *
 * @param string $hex Color hex value.
 * @return float Luminance from 0 (black) to 1 (white).
 */
function hex_luminance( string $hex ): float {
	$hex = ltrim( trim( $hex ), '#' );
	if ( 3 === strlen( $hex ) ) {
		$hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
	}
	if ( 6 !== strlen( $hex ) || ! ctype_xdigit( $hex ) ) {
		return 1.0;
	}

	$channel = static function ( string $pair ): float {
		$v = hexdec( $pair ) / 255;
		return $v <= 0.04045 ? $v / 12.92 : pow( ( $v + 0.055 ) / 1.055, 2.4 );
	};

	$r = $channel( substr( $hex, 0, 2 ) );
	$g = $channel( substr( $hex, 2, 2 ) );
	$b = $channel( substr( $hex, 4, 2 ) );

	return ( 0.2126 * $r ) + ( 0.7152 * $g ) + ( 0.0722 * $b );
}

/**
 * Build a map of palette slug to hex color from theme settings or theme.json.
 *
 * @return array<string, string> slug => #hex
 */
function get_palette_hex_map(): array {
	$map = [];

	if ( function_exists( 'wp_get_global_settings' ) ) {
		$settings = wp_get_global_settings( [ 'color', 'palette' ] );
		$groups   = [];
		if ( isset( $settings['theme'] ) && is_array( $settings['theme'] ) ) {
			$groups[] = $settings['theme'];
		} elseif ( is_array( $settings ) ) {
			$groups[] = $settings;
		}
		foreach ( $groups as $palette ) {
			foreach ( $palette as $entry ) {
				if ( ! is_array( $entry ) ) {
					continue;
				}
				$slug  = isset( $entry['slug'] ) ? (string) $entry['slug'] : '';
				$color = isset( $entry['color'] ) ? (string) $entry['color'] : '';
				if ( $slug && $color ) {
					$map[ $slug ] = $color;
				}
			}
		}
	}

	if ( $map ) {
		return $map;
	}

	$path = RV_STARTER_THEME_PATH . 'theme.json';
	if ( ! is_readable( $path ) ) {
		return [];
	}
	$json    = json_decode( (string) file_get_contents( $path ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- local theme.json.
	$palette = $json['settings']['color']['palette'] ?? [];
	if ( ! is_array( $palette ) ) {
		return [];
	}
	foreach ( $palette as $entry ) {
		if ( ! is_array( $entry ) ) {
			continue;
		}
		$slug  = isset( $entry['slug'] ) ? (string) $entry['slug'] : '';
		$color = isset( $entry['color'] ) ? (string) $entry['color'] : '';
		if ( $slug && $color ) {
			$map[ $slug ] = $color;
		}
	}
	return $map;
}

/**
 * Resolve $color-background from variables.scss to a hex (via palette or literal).
 */
function resolve_background_hex(): ?string {
	$path = RV_STARTER_THEME_PATH . 'assets/css/abstracts/variables/variables.scss';
	if ( ! is_readable( $path ) ) {
		return null;
	}
	$scss = (string) file_get_contents( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- local SCSS file.

	if ( preg_match( '/\$color-background:\s*\$color-([a-z0-9-]+)\s*;/', $scss, $match ) ) {
		$slug    = $match[1];
		$palette = get_palette_hex_map();
		return $palette[ $slug ] ?? null;
	}

	if ( preg_match( '/\$color-background:\s*(#[0-9a-fA-F]{3,8})\s*;/', $scss, $match ) ) {
		return $match[1];
	}

	return null;
}

/**
 * Resolve $color-body to hex.
 */
function resolve_body_hex(): ?string {
	$path = RV_STARTER_THEME_PATH . 'assets/css/abstracts/variables/variables.scss';
	if ( ! is_readable( $path ) ) {
		return null;
	}
	$scss = (string) file_get_contents( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- local SCSS file.

	if ( preg_match( '/\$color-body:\s*\$color-([a-z0-9-]+)\s*;/', $scss, $match ) ) {
		$slug    = $match[1];
		$palette = get_palette_hex_map();
		return $palette[ $slug ] ?? null;
	}

	if ( preg_match( '/\$color-body:\s*(#[0-9a-fA-F]{3,8})\s*;/', $scss, $match ) ) {
		return $match[1];
	}

	return null;
}

/**
 * True when the theme page background is dark (needs light text + dark form controls).
 */
function is_dark_background(): bool {
	$sources = null;
	$path    = RV_STARTER_THEME_PATH . 'generated/figma-sources.json';
	if ( is_readable( $path ) ) {
		$data = json_decode( (string) file_get_contents( $path ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- local generated JSON.
		if ( is_array( $data ) && isset( $data['surface']['isDark'] ) ) {
			return (bool) $data['surface']['isDark'];
		}
	}

	$hex = resolve_background_hex();
	if ( ! $hex ) {
		return false;
	}
	return hex_luminance( $hex ) < 0.45;
}

/**
 * Add rv-background-dark on body when the page surface is dark.
 *
 * @param string[] $classes Body classes.
 * @return string[]
 */
function filter_body_class( array $classes ): array {
	if ( is_dark_background() && ! in_array( 'rv-background-dark', $classes, true ) ) {
		$classes[] = 'rv-background-dark';
	}
	return $classes;
}

/**
 * Wire body class filter.
 */
function setup(): void {
	add_filter( 'body_class', __NAMESPACE__ . '\\filter_body_class' );
}
