<?php
/**
 * Theme-required synced patterns.
 *
 * @package RVStarterTheme
 */

namespace RVStarterTheme\Theme;

/**
 * Creates and protects required global patterns.
 */
class ThemeRequiredPatterns {

	private const POST_TYPE = 'wp_block';

	private const THEME_REQUIRED_BADGE = ' (Theme Required)';

	private const THEME_REQUIRED_META_KEY = '_rv_starter_theme_required_pattern';

	/**
	 * Boot hooks.
	 *
	 * @return void
	 */
	public function __construct() {
		add_action( 'init', [ $this, 'register_theme_required_meta' ] );
		add_action( 'init', [ $this, 'hide_file_based_pattern_duplicates' ], 11 );
		add_action( 'admin_init', [ $this, 'add_patterns_from_folder' ] );
		add_filter( 'map_meta_cap', [ $this, 'prevent_required_patterns_deletion' ], 10, 4 );
	}

	/**
	 * Register the marker meta for required patterns.
	 *
	 * @return void
	 */
	public function register_theme_required_meta(): void {
		register_post_meta(
			self::POST_TYPE,
			self::THEME_REQUIRED_META_KEY,
			[
				'show_in_rest'      => true,
				'single'            => true,
				'type'              => 'boolean',
				'description'       => __( 'Marker for theme-required synced patterns.', 'rv-starter-theme' ),
				'sanitize_callback' => 'rest_sanitize_boolean',
			]
		);
	}

	/**
	 * Unregister file-based theme patterns that duplicate synced wp_block posts.
	 *
	 * WordPress auto-registers PHP files under patterns/, including theme-required/.
	 * Those patterns are promoted to synced wp_block posts instead.
	 *
	 * @return void
	 */
	public function hide_file_based_pattern_duplicates(): void {
		$pattern_files = glob( get_template_directory() . '/patterns/theme-required/*.php' );

		if ( empty( $pattern_files ) ) {
			return;
		}

		$registry = \WP_Block_Patterns_Registry::get_instance();

		foreach ( $pattern_files as $pattern_file ) {
			$file_contents = file_get_contents( $pattern_file ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			$slug          = self::extract_pattern_comment_field( $file_contents, 'Slug' );

			if ( $slug && $registry->is_registered( $slug ) ) {
				unregister_block_pattern( $slug );
			}
		}
	}

	/**
	 * Creates theme-required patterns from the patterns folder.
	 *
	 * @return void
	 */
	public function add_patterns_from_folder(): void {
		$pattern_folder = get_template_directory() . '/patterns/theme-required/';
		$pattern_files  = glob( $pattern_folder . '*.php' );

		if ( empty( $pattern_files ) ) {
			return;
		}

		if ( ! function_exists( 'post_exists' ) ) {
			require_once ABSPATH . 'wp-admin/includes/post.php';
		}

		foreach ( $pattern_files as $pattern_file ) {
			$file_contents = file_get_contents( $pattern_file ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents

			$title      = self::extract_pattern_comment_field( $file_contents, 'Title' );
			$slug       = self::extract_pattern_comment_field( $file_contents, 'Slug' );
			$categories = self::extract_pattern_comment_field( $file_contents, 'Categories' );

			if ( ! $title || ! $slug ) {
				continue;
			}

			if ( post_exists( $title . self::THEME_REQUIRED_BADGE, '', '', self::POST_TYPE ) ) {
				continue;
			}

			$pattern_content = self::render_pattern_file( $pattern_file );
			$pattern_id      = wp_insert_post(
				[
					'post_title'   => $title . self::THEME_REQUIRED_BADGE,
					'post_content' => $pattern_content,
					'post_name'    => $slug,
					'post_status'  => 'publish',
					'post_type'    => self::POST_TYPE,
				]
			);

			if ( is_wp_error( $pattern_id ) ) {
				continue;
			}

			add_post_meta( $pattern_id, 'wp_pattern_sync_status', 'synced' );
			add_post_meta( $pattern_id, self::THEME_REQUIRED_META_KEY, true );

			if ( $categories ) {
				$category_terms = array_map( 'trim', explode( ',', $categories ) );
				wp_set_post_terms( $pattern_id, $category_terms, 'wp_pattern_category' );
			}
		}
	}

	/**
	 * Load a theme-required synced pattern by source title.
	 *
	 * @param string $title The source pattern title without the required badge.
	 * @param string $file_name The fallback pattern file name.
	 *
	 * @return string
	 */
	public static function load_pattern( string $title, string $file_name ): string {
		$pattern_content = '';
		$pattern_post    = self::get_pattern_post_by_title( $title . self::THEME_REQUIRED_BADGE );

		if ( $pattern_post ) {
			$pattern_content = $pattern_post->post_content;
		}

		if ( '' === $pattern_content ) {
			$pattern_file = get_template_directory() . '/patterns/theme-required/' . $file_name;

			if ( file_exists( $pattern_file ) ) {
				$pattern_content = self::render_pattern_file( $pattern_file );
			}
		}

		return apply_filters( 'the_content', $pattern_content );
	}

	/**
	 * Get a synced pattern by title.
	 *
	 * @param string $title Pattern title.
	 *
	 * @return \WP_Post|null
	 */
	private static function get_pattern_post_by_title( string $title ): ?\WP_Post {
		$query = new \WP_Query(
			[
				'title'          => $title,
				'post_type'      => self::POST_TYPE,
				'post_status'    => 'publish',
				'posts_per_page' => 1,
			]
		);

		if ( $query->have_posts() ) {
			return $query->posts[0];
		}

		return null;
	}

	/**
	 * Disable delete for theme-required patterns.
	 *
	 * @param array  $caps The user's capabilities.
	 * @param string $cap Capability name.
	 * @param int    $user_id The user ID.
	 * @param array  $args Optional parameters, typically starting with a post ID.
	 *
	 * @return array
	 */
	public function prevent_required_patterns_deletion( array $caps, string $cap, int $user_id, array $args ): array {
		if ( 'delete_post' !== $cap || empty( $args[0] ) ) {
			return $caps;
		}

		$pattern_required = get_post_meta( $args[0], self::THEME_REQUIRED_META_KEY, true );

		if ( self::POST_TYPE === get_post_type( $args[0] ) && true === (bool) $pattern_required ) {
			$caps[] = 'do_not_allow';
		}

		return $caps;
	}

	/**
	 * Extract a pattern header field from the file comments.
	 *
	 * @param string $file_contents The pattern file contents.
	 * @param string $field The field name to extract.
	 *
	 * @return string|null
	 */
	private static function extract_pattern_comment_field( string $file_contents, string $field ): ?string {
		preg_match( '/^\s*\*\s*' . preg_quote( $field, '/' ) . ':\s*(.+)$/m', $file_contents, $matches );

		return isset( $matches[1] ) ? trim( $matches[1] ) : null;
	}

	/**
	 * Render a PHP pattern file to block markup.
	 *
	 * @param string $pattern_file The pattern file path.
	 *
	 * @return string
	 */
	private static function render_pattern_file( string $pattern_file ): string {
		ob_start();
		include $pattern_file;
		return (string) ob_get_clean();
	}
}
