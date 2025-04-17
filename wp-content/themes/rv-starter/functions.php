<?php
/**
 * WP Theme constants and setup functions
 *
 * @package RVStarterTheme
 */

use RVStarterTheme\App;

// Useful global constants.
define( 'RV_STARTER_THEME_VERSION', '0.1.0' );
define( 'RV_STARTER_THEME_TEMPLATE_URL', get_template_directory_uri() );
define( 'RV_STARTER_THEME_PATH', get_template_directory() . '/' );
define( 'RV_STARTER_THEME_DIST_PATH', RV_STARTER_THEME_PATH . 'dist/' );
define( 'RV_STARTER_THEME_DIST_URL', RV_STARTER_THEME_TEMPLATE_URL . '/dist/' );
define( 'RV_STARTER_THEME_INC', RV_STARTER_THEME_PATH . 'includes/' );
define( 'RV_STARTER_THEME_BLOCK_DIR', RV_STARTER_THEME_INC . 'blocks/' );
define( 'RV_STARTER_THEME_BLOCK_DIST_DIR', RV_STARTER_THEME_PATH . 'dist/blocks/' );

$is_local_env = in_array( wp_get_environment_type(), [ 'local', 'development' ], true );
$is_local_url = strpos( home_url(), '.test' ) || strpos( home_url(), '.local' );
$is_local     = $is_local_env || $is_local_url;

if ( $is_local && file_exists( __DIR__ . '/dist/fast-refresh.php' ) ) {
	require_once __DIR__ . '/dist/fast-refresh.php';
	TenUpToolkit\set_dist_url_path( basename( __DIR__ ), RV_STARTER_THEME_DIST_URL, RV_STARTER_THEME_DIST_PATH );
}

require_once RV_STARTER_THEME_INC . 'core.php';
require_once RV_STARTER_THEME_INC . 'overrides.php';
require_once RV_STARTER_THEME_INC . 'template-tags.php';
require_once RV_STARTER_THEME_INC . 'utility.php';
require_once RV_STARTER_THEME_INC . 'blocks.php';
require_once RV_STARTER_THEME_INC . 'helpers.php';

// Run the setup functions.
RVStarterTheme\Core\setup();
RVStarterTheme\Blocks\setup();

// Require Composer autoloader if it exists.
if ( file_exists( __DIR__ . '/vendor/autoload.php' ) ) {
	require_once __DIR__ . '/vendor/autoload.php';
	new App();
} else {
	/** @noinspection ForgottenDebugOutputInspection */ // phpcs:ignore
	wp_die( 'You must install Composer packages before running this theme.' );
}

if ( ! function_exists( 'wp_body_open' ) ) {

	/**
	 * Shim for the new wp_body_open() function that was added in 5.2
	 */
	function wp_body_open(): void {
		do_action( 'wp_body_open' );
	}
}
