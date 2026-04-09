<?php
/**
 * Analytics IDs REST endpoint.
 *
 * @package RVStarterTheme
 *
 * @author Rareview <hello@rareview.com>
 */

namespace RVStarterTheme\Rest;

use RVStarterTheme\App;
use WP_Error;
use WP_HTTP_Response;
use WP_REST_Request;
use WP_REST_Response;
use function get_option;
use function sanitize_text_field;

/**
 * Analytics IDs REST endpoint.
 */
class AnalyticsIdsRestEndpoint {
	private const ENDPOINT = '/analytics-ids';

	private const ANALYTICS_IDS_OPTIONS_KEYS = [
		App::ANALYTICS_GTM_ID_OPTION,
		App::ANALYTICS_GA_ID_OPTION,
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
				'callback'            => [ $this, 'theme_options_get_analytics_ids' ],
				'permission_callback' => '__return_true',
			],
		);

		register_rest_route(
			App::REST_API_CUSTOM_NAMESPACE,
			self::ENDPOINT,
			[
				'methods'             => 'POST',
				'callback'            => [ $this, 'theme_options_update_analytics_ids' ],
				'permission_callback' => function () {
					return current_user_can( 'manage_options' );
				},
			],
		);
	}

	/**
	 * Get analytics IDs from theme options.
	 *
	 * @return WP_Error|WP_HTTP_Response|WP_REST_Response
	 */
	public function theme_options_get_analytics_ids(): WP_Error|WP_HTTP_Response|WP_REST_Response {
		$data = [];

		foreach ( self::ANALYTICS_IDS_OPTIONS_KEYS as $setting ) {
			$option = get_option( $setting );

			$data[ $setting ] = $option ?: '';
		}

		return rest_ensure_response( $data );
	}

	/**
	 * Update analytics IDs on theme options.
	 *
	 * @param WP_REST_Request $request The WordPress REST request.
	 * @return WP_Error|WP_HTTP_Response|WP_REST_Response
	 */
	public function theme_options_update_analytics_ids( WP_REST_Request $request ): WP_Error|WP_HTTP_Response|WP_REST_Response {
		$data    = [];
		$payload = $request->get_param( 'payload' );

		if ( ! is_array( $payload ) ) {
			return new WP_Error(
				'invalid_payload',
				'Payload must be an object/array of analytics settings.',
				[ 'status' => 400 ]
			);
		}

		foreach ( $payload as $setting_key => $setting ) {
			if ( ! in_array( $setting_key, self::ANALYTICS_IDS_OPTIONS_KEYS, true ) ) {
				continue;
			}

			$sanitized_setting    = sanitize_text_field( $setting );
			$data[ $setting_key ] = $sanitized_setting;
			update_option( $setting_key, $sanitized_setting );
		}

		return rest_ensure_response( $data );
	}
}
