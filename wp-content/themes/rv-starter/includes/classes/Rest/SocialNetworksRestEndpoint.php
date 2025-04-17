<?php
/**
 * Social Network REST endpoint.
 *
 * @package RVStarterTheme
 *
 * @author Rareview <hello@rareview.com>
 */

namespace RVStarterTheme\Rest;

use RVStarterTheme\App;
use WP_Error;
use WP_HTTP_Response;
use WP_REST_Response;
use WP_REST_Request;
use function get_option;

/**
 * Social Network REST endpoint.
 */
class SocialNetworksRestEndpoint {
	private const ENDPOINT = '/social-networks';

	private const SOCIAL_NETWORKS_OPTIONS_KEYS = [
		App::SOCIAL_NETWORK_FACEBOOK_URL_OPTION,
		App::SOCIAL_NETWORK_TWITTER_URL_OPTION,
		App::SOCIAL_NETWORK_YOUTUBE_URL_OPTION,
		App::SOCIAL_NETWORK_INSTAGRAM_URL_OPTION,
	];

	/**
	 * Boot the service provider.
	 *
	 * @return void
	 */
	public function __construct() {
		add_action( 'rest_api_init', [ $this, 'register_api_endpoint' ] );
	}

	/**
	 * Register REST API endpoint.
	 *
	 * @return void
	 */
	public function register_api_endpoint(): void {
		register_rest_route(
			App::REST_API_CUSTOM_NAMESPACE,
			self::ENDPOINT,
			[
				'methods'             => 'GET',
				'callback'            => [ $this, 'theme_options_get_social_networks' ],
				'permission_callback' => '__return_true',
			],
		);

		register_rest_route(
			App::REST_API_CUSTOM_NAMESPACE,
			self::ENDPOINT,
			[
				'methods'             => 'POST',
				'callback'            => [ $this, 'theme_options_update_social_networks' ],
				'permission_callback' => function () {
					return current_user_can( 'manage_options' );
				},
			],
		);
	}

	/**
	 * Get social networks URLs from theme options.
	 *
	 * @return WP_Error|WP_HTTP_Response|WP_REST_Response
	 */
	public function theme_options_get_social_networks(): WP_Error|WP_HTTP_Response|WP_REST_Response {
		$data = [];

		foreach ( self::SOCIAL_NETWORKS_OPTIONS_KEYS as $setting ) {
			$option = get_option( $setting );

			$data[ $setting ] = $option ?: '';
		}

		return rest_ensure_response( $data );
	}

	/**
	 * Update social networks URLs on theme options.
	 *
	 * @param WP_REST_Request $request The WordPress rest request.
	 * @return WP_Error|WP_HTTP_Response|WP_REST_Response
	 */
	public function theme_options_update_social_networks( WP_REST_Request $request ): WP_Error|WP_HTTP_Response|WP_REST_Response {
		$data    = [];
		$payload = $request->get_param( 'payload' );

		foreach ( $payload as $setting_key => $setting ) {
			update_option( $setting_key, $setting );
			$data[ $setting_key ] = $setting;
		}

		return rest_ensure_response( $data );
	}
}
