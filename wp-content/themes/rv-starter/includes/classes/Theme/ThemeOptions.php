<?php
/**
 * This file contains adjustments for the Theme Options admin page.
 *
 * @package RVStarterTheme
 *
 * @author Rareview <hello@rareview.com>
 */

namespace RVStarterTheme\Theme;

/**
 * ThemeOptions class.
 */
class ThemeOptions {
	/**
	 * ThemeSettings.
	 *
	 * @return void
	 */
	public function __construct() {
		add_action( 'admin_menu', [ $this, 'add_admin_menu' ] );
		add_action( 'admin_enqueue_scripts', [ $this, 'add_styles' ] );
	}

	/**
	 * Add styles.
	 */
	public function add_styles(): void {
		wp_enqueue_style( 'wp-components' );
	}

	/**
	 * Add sub menu page in the Appearance section.
	 */
	public function add_admin_menu(): void {
		add_theme_page(
			esc_html( 'Theme Settings' ),
			esc_html( 'Theme Settings' ),
			'manage_options',
			'theme-settings',
			[ $this, 'create_admin_page' ]
		);
	}

	/**
	 * Settings page output.
	 */
	public function create_admin_page(): void {
		?>

		<div class="wrap">

			<h1><?php echo esc_html( get_admin_page_title() ); ?></h1>

			<div id="rv-starter-theme-options"></div>

		</div>
		<?php
	}
}
