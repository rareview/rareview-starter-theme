<?php
/**
 * Theme provider.
 *
 * @package RVStarterTheme
 */

namespace RVStarterTheme\Theme;

/**
 *
 * Theme service provider.
 */
class ThemeServiceProvider {

	/**
	 * The user features that should be bootstrapped.
	 *
	 * @var array
	 */
	public static array $services = [
		ThemeOptions::class,
	];

	/**
	 * Boot the service provider.
	 *
	 * @return void
	 */
	public function __construct() {
		foreach ( self::$services as $service ) {
			new $service();
		}
	}
}
