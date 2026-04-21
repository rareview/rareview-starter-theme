<?php
/**
 * The main application instance.
 *
 * @package RVStarterTheme
 */

namespace RVStarterTheme;

use RVStarterTheme\Rest\RestServiceProvider;
use RVStarterTheme\Theme\ThemeServiceProvider;

/**
 * App class
 */
class App {

	public const REST_API_CUSTOM_NAMESPACE = 'rv-starter/v1';

	public const ANALYTICS_GTM_ID_OPTION = 'rv_starter_analytics_gtm_id';
	public const ANALYTICS_GA_ID_OPTION  = 'rv_starter_analytics_ga_id';

	/**
	 * The providers of the application.
	 *
	 * @var array
	 */
	public static array $service_providers = [
		RestServiceProvider::class,
		ThemeServiceProvider::class,
	];

	/**
	 * Boot the app.
	 *
	 * @return void
	 */
	public function __construct() {
		$this->boot();
	}

	/**
	 * Boot all the providers.
	 *
	 * @return void
	 */
	public function boot(): void {
		foreach ( static::$service_providers as $provider ) {
			new $provider();
		}
	}
}
