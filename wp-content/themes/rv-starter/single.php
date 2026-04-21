<?php
/**
 * The template for displaying all single posts.
 *
 * @package RVStarterTheme
 *
 * @author Rareview <hello@rareview.com>
 */

get_header(); ?>

	<main id="main" class="rv-page-single" tabindex="-1">
		<?php
		if ( have_posts() ) :
			while ( have_posts() ) : the_post();

				?>
				<h1 class="rv-single__title rv-title"><?php echo wp_kses_post( get_the_title() ); ?></h1>
				<?php

				the_content(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped

			endwhile;
		endif;
		?>
	</main>

<?php
get_footer();
