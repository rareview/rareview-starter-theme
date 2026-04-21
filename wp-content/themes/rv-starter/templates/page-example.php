<?php
/**
 * Template name: Example
 *
 * @package RVStarterTheme
 *
 * @author Rareview <hello@rareview.com>
 */

get_header(); ?>

		<main id="main" class="rv-page-example" tabindex="-1">
		<?php
		if ( have_posts() ) :
			while ( have_posts() ) : the_post();

				if ( get_the_title() ) :
					?>
					<div class="rv-page-example__title">
						<h1><?php echo wp_kses_post( get_the_title() ); ?></h1>
					</div>
					<?php
				endif;

				the_content(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped

			endwhile;
		endif;
		?>
	</main>

<?php get_footer(); ?>
