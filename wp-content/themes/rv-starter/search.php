<?php
/**
 * The template for displaying search results pages.
 *
 * @package RVStarterTheme
 *
 * @author Rareview <hello@rareview.com>
 */

get_header(); ?>

	<main class="rv-page-search" itemscope itemtype="https://schema.org/SearchResultsPage" tabindex="-1">
		<?php if ( have_posts() ) : ?>
			<h1 class="rv-search__heading">
				<?php
				/* translators: the search query */
				printf( esc_html__( 'Search Results for: %s', 'rv-starter-theme' ), '<span>' . esc_html( get_search_query() ) . '</span>' );
				?>
			</h1>

			<ul>
			<?php
			while ( have_posts() ) :
				the_post();
				?>

				<li class="rv-search__item" itemscope itemtype="https://schema.org/Thing">
					<?php
					if ( has_post_thumbnail() ) {
						the_post_thumbnail();
					}

					the_title( '<span class="rv-search__item-title" itemprop="name"><a href="' . esc_url( get_permalink() ) . '" itemprop="url">', '</a></span>' );
					?>
					<div class="rv-search__item-description" itemprop="description">
						<?php the_excerpt(); ?>
					</div>
				</li>

			<?php endwhile; ?>
			</ul>

			<?php the_posts_navigation(); ?>
		<?php endif; ?>
	</main>

<?php
get_footer();
