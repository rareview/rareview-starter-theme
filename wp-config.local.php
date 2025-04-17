<?php
/**
 * Config file used for local development.
 *
 * @package Lando
 */

// Set a default local host, is one is not set in the server.
$local_http_host = isset( $_SERVER['HTTP_HOST'] ) ? htmlspecialchars( $_SERVER['HTTP_HOST'] ) : 'rv-starter.local';


// Connect the local database.
define( 'DB_NAME', 'wordpress' );
define( 'DB_USER', 'wordpress' );
define( 'DB_PASSWORD', 'wordpress' );
define( 'DB_HOST', 'database' );
define( 'DB_CHARSET', 'utf8' );
define( 'DB_COLLATE', '' );

// Always debug in development.
define( 'WP_DEBUG', true );
define( 'JETPACK_DEV_DEBUG', true );
define( 'SAVEQUERIES', true );
define( 'SCRIPT_DEBUG', true );
define( 'STYLE_DEBUG', true );
define( 'COMPRESS_SCRIPTS', false );
define( 'COMPRESS_CSS', false );

// Respond as if we were on HTTPS.
if ( isset( $_SERVER['HTTP_X_FORWARDED_PROTO'] ) && 'https' === $_SERVER['HTTP_X_FORWARDED_PROTO'] ) {
	$_SERVER['HTTPS'] = 'on';
}

if ( WP_DEBUG ) {
	define('WP_DEBUG_LOG', true);
	define('WP_DEBUG_DISPLAY', true);
	define('WP_DISABLE_FATAL_ERROR_HANDLER', true);

	$GLOBALS['wp_filter'] = [
		'enable_wp_debug_mode_checks' => [
			10 => [[
				'accepted_args' => 0,
				'function'      => static function() { return false; },
			]],
		],
	];
	error_reporting( E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED );
}

// Set SSL in admin.
define( 'FORCE_SSL_LOGIN', false );

// Set the site urls statically.
define( 'WP_HOME', sprintf( 'http://%s', $local_http_host ) );
define( 'WP_SITEURL', sprintf( 'http://%s', $local_http_host ) );

$table_prefix = 'wp_';

require_once ABSPATH . 'wp-settings.php';
