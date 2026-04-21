<?php
/**
 * The template for displaying the header.
 *
 * @package RVStarterTheme
 *
 * @author Rareview <hello@rareview.com>
 */

?>
<!DOCTYPE html>
<html <?php language_attributes(); ?> class="no-js">
	<head>
		<meta charset="<?php bloginfo( 'charset' ); ?>" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<?php wp_head(); ?>
	</head>
	<body <?php body_class(); ?>>
		<?php wp_body_open(); ?>
		<a class="rv-skip-link" href="#main">
			<?php esc_html_e( 'Skip to content', 'rv-starter-theme' ); ?>
		</a>

		<header class="rv-header">
			<?php if ( has_nav_menu( 'primary' ) ) : ?>
				<nav class="rv-header__nav" aria-label="<?php esc_attr_e( 'Primary Navigation', 'rv-starter-theme' ); ?>">
					<?php
					wp_nav_menu(
						[
							'theme_location' => 'primary',
							'container'      => false,
							'fallback_cb'    => false,
						]
					);
					?>
				</nav>
			<?php endif; ?>
		</header>
