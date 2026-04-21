<?php
/**
 * The main template file.
 *
 * @package RVStarterTheme
 *
 * @author Rareview <hello@rareview.com>
 */

get_header(); ?>

	<main id="main" class="rv-page-default" tabindex="-1">
		<?php
		if ( have_posts() ) :
			while ( have_posts() ) : the_post();

				the_content(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped

			endwhile;
		endif;
		?>
	</main>

<?php
get_footer();
