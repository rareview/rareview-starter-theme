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

	public const SOCIAL_NETWORK_FACEBOOK_URL_OPTION  = 'rv_starter_social_network_facebook_url';
	public const SOCIAL_NETWORK_TWITTER_URL_OPTION   = 'rv_starter_social_network_twitter_url';
	public const SOCIAL_NETWORK_YOUTUBE_URL_OPTION   = 'rv_starter_social_network_youtube_url';
	public const SOCIAL_NETWORK_INSTAGRAM_URL_OPTION = 'rv_starter_social_network_instagram_url';

	/**
	 * The providers of the application.
	 *
	 * @var array
	 */
	public static array $providers = [
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
		foreach ( static::$providers as $provider ) {
			new $provider();
		}
	}
}
