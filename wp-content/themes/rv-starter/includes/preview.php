<?php
/**
 * Preview page: a normal Gutenberg page with real blocks that shows the global styles
 * (typography, headings, links, buttons, quote, colors, inputs).
 *
 * - Created once per environment: Lando runs `wp create-preview` on start/rebuild, and it
 *   creates the page only the first time. After that it is a normal page: edit or delete it freely.
 * - `npm run figma-sync` runs `wp create-preview --rewrite`: the whole page is rewritten from the
 *   new design, edits included. A deleted page is not created again.
 * - `npm run create-preview` brings the page back (or resets it) any time (`--force`).
 * - Admins see Figma links next to each sample on the frontend (from generated/figma-sources.json).
 *
 * @package RVStarterTheme
 */

namespace RVStarterTheme\Preview;

use RVStarterTheme\DarkLight;

/**
 * Post meta that marks the generated page.
 */
const PAGE_META = '_rv_preview_page';

/**
 * Option set once the page was created in this environment (so a deleted page stays deleted).
 */
const CREATED_OPTION = 'rv_starter_preview_page_created';

/**
 * Class prefix that links a block to a Figma source slug, e.g. `rv-preview-figma--color-link`.
 */
const FIGMA_CLASS = 'rv-preview-figma--';

/**
 * Set up hooks.
 */
function setup(): void {
	$n = static function ( $f ) {
		return __NAMESPACE__ . "\\$f";
	};

	// Frontend filters only on the Preview page (queried object is ready on `wp`).
	add_action( 'wp', $n( 'register_frontend_hooks' ) );

	if ( defined( 'WP_CLI' ) && WP_CLI ) {
		\WP_CLI::add_command( 'create-preview', $n( 'cli_command' ) );
	}
}

/**
 * Attach Preview-only frontend filters when an admin is viewing that page.
 */
function register_frontend_hooks(): void {
	if ( ! is_preview_page() || ! can_view_figma_sources() ) {
		return;
	}

	$n = static function ( $f ) {
		return __NAMESPACE__ . "\\$f";
	};

	add_filter( 'render_block', $n( 'add_figma_links' ), 10, 2 );
	add_filter( 'the_content', $n( 'add_sync_banner' ), 20 );
}

// Page creation.

/**
 * Creates or rewrites the Preview page.
 *
 * Without flags: creates the page the first time only, and never touches an existing page.
 *
 * ## OPTIONS
 *
 * [--rewrite]
 * : Rewrite the existing page from the current theme (edits are replaced). Used by figma-sync.
 *
 * [--force]
 * : Like --rewrite, and also create the page again if it was deleted. Used by npm run create-preview.
 *
 * ## EXAMPLES
 *
 *     wp create-preview
 *     wp create-preview --rewrite
 *     wp create-preview --force
 *
 * @param array<int, string>    $args       Positional args (unused).
 * @param array<string, string> $assoc_args Flags.
 */
function cli_command( array $args, array $assoc_args ): void {
	$force  = ! empty( $assoc_args['force'] );
	$result = ensure_page( $force || ! empty( $assoc_args['rewrite'] ), $force );
	$url    = $result['id'] ? get_permalink( $result['id'] ) : '';

	$messages = [
		'created'   => 'Preview page created: %s',
		'rewritten' => 'Preview page rewritten: %s',
		'unchanged' => 'Preview page is up to date: %s',
		'exists'    => 'Preview page already exists, left as it is: %s',
		'deleted'   => 'Preview page was deleted, so it was not created again (use --force to create it).%s',
	];
	\WP_CLI::success( rtrim( sprintf( $messages[ $result['status'] ], $url ), ': ' ) );
}

/**
 * Find the generated page (by meta, then by slug).
 */
function find_page(): ?\WP_Post {
	$ids = get_posts(
		[
			'post_type'      => 'page',
			'post_status'    => [ 'publish', 'draft', 'private', 'pending' ],
			'meta_key'       => PAGE_META, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- one admin-only lookup.
			'posts_per_page' => 1,
			'fields'         => 'ids',
		]
	);
	if ( $ids ) {
		return get_post( (int) $ids[0] );
	}
	$page = get_page_by_path( 'preview' );
	return $page instanceof \WP_Post && 'trash' !== $page->post_status ? $page : null;
}

/**
 * Create or rewrite the page.
 *
 * @param bool $rewrite  Rewrite an existing page.
 * @param bool $recreate Create the page again if it was deleted.
 * @return array{id: int, status: string}
 */
function ensure_page( bool $rewrite = false, bool $recreate = false ): array {
	// WP-CLI runs without a user, so kses would strip inline styles from the blocks.
	kses_remove_filters();

	$page = find_page();

	if ( ! $page && get_option( CREATED_OPTION ) && ! $recreate ) {
		return [
			'id'     => 0,
			'status' => 'deleted',
		];
	}

	if ( ! $page ) {
		$id = wp_insert_post(
			[
				'post_type'    => 'page',
				'post_status'  => 'publish',
				'post_title'   => __( 'Preview', 'rv-starter-theme' ),
				'post_name'    => 'preview',
				'post_content' => wp_slash( build_content() ),
			],
			true
		);
		if ( is_wp_error( $id ) ) {
			\WP_CLI::error( $id->get_error_message() );
		}
		mark_page( (int) $id );
		return [
			'id'     => (int) $id,
			'status' => 'created',
		];
	}

	$id = (int) $page->ID;
	mark_page( $id );

	if ( ! $rewrite ) {
		return [
			'id'     => $id,
			'status' => 'exists',
		];
	}

	$content = build_content();
	if ( $content === $page->post_content ) {
		return [
			'id'     => $id,
			'status' => 'unchanged',
		];
	}

	wp_update_post(
		[
			'ID'           => $id,
			'post_content' => wp_slash( $content ),
		]
	);
	return [
		'id'     => $id,
		'status' => 'rewritten',
	];
}

/**
 * Mark the page as the generated one, and remember it was created in this environment.
 *
 * @param int $id Page ID.
 */
function mark_page( int $id ): void {
	update_post_meta( $id, PAGE_META, 1 );
	update_option( CREATED_OPTION, 1, false );
}

// Block markup helpers.

/**
 * Block comment attributes as JSON (empty = no attributes).
 *
 * @param array<string, mixed> $attrs Block attributes.
 */
function attrs( array $attrs ): string {
	return $attrs ? ' ' . wp_json_encode( $attrs, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) : '';
}

/**
 * Class attribute value.
 *
 * @param array<int, string> $classes Classes.
 */
function classes( array $classes ): string {
	return esc_attr( implode( ' ', array_filter( $classes ) ) );
}

/**
 * Figma classes for a list of source slugs.
 *
 * @param array<int, string> $slugs Mapping slugs.
 */
function figma( array $slugs ): string {
	return implode(
		' ',
		array_map(
			static function ( $slug ) {
				return FIGMA_CLASS . $slug;
			},
			$slugs
		)
	);
}

/**
 * Paragraph block.
 *
 * @param string $html       Inner HTML (already escaped).
 * @param string $class_name Extra classes.
 */
function paragraph( string $html, string $class_name = '' ): string {
	$a = $class_name ? [ 'className' => $class_name ] : [];
	$c = $class_name ? ' class="' . classes( [ $class_name ] ) . '"' : '';
	return '<!-- wp:paragraph' . attrs( $a ) . " -->\n<p{$c}>{$html}</p>\n<!-- /wp:paragraph -->\n";
}

/**
 * Heading block.
 *
 * @param int    $level      1–6.
 * @param string $text       Plain text.
 * @param string $class_name Extra classes.
 */
function heading( int $level, string $text, string $class_name = '' ): string {
	$a = [];
	if ( 2 !== $level ) {
		$a['level'] = $level;
	}
	if ( $class_name ) {
		$a['className'] = $class_name;
	}
	$c = classes( [ 'wp-block-heading', $class_name ] );
	return '<!-- wp:heading' . attrs( $a ) . " -->\n<h{$level} class=\"{$c}\">" . esc_html( $text ) . "</h{$level}>\n<!-- /wp:heading -->\n";
}

/**
 * Group block.
 *
 * @param string               $inner Inner blocks markup.
 * @param array<string, mixed> $a     Block attributes (className, layout, colors, style).
 */
function group( string $inner, array $a = [] ): string {
	$class_list = [ 'wp-block-group', $a['className'] ?? '' ];
	$style      = '';

	if ( ! empty( $a['textColor'] ) ) {
		$class_list[] = 'has-' . $a['textColor'] . '-color';
		$class_list[] = 'has-text-color';
	}
	if ( ! empty( $a['backgroundColor'] ) ) {
		$class_list[] = 'has-' . $a['backgroundColor'] . '-background-color';
		$class_list[] = 'has-background';
	}
	if ( ! empty( $a['style']['color']['background'] ) ) {
		$class_list[] = 'has-background';
		$style        = ' style="background-color:' . esc_attr( $a['style']['color']['background'] ) . '"';
	}

	return '<!-- wp:group' . attrs( $a ) . " -->\n<div class=\"" . classes( $class_list ) . "\"{$style}>\n{$inner}</div>\n<!-- /wp:group -->\n";
}

/**
 * Section: group with a heading, an optional note and content.
 *
 * @param string             $title Section title.
 * @param string             $inner Inner blocks markup.
 * @param string             $note  Optional note under the title.
 * @param array<int, string> $slugs Figma source slugs for the title.
 */
function section( string $title, string $inner, string $note = '', array $slugs = [] ): string {
	$body = heading( 2, $title, trim( 'rv-preview__section-label ' . figma( $slugs ) ) );
	if ( $note ) {
		$body .= paragraph( esc_html( $note ), 'rv-preview__note has-small-font-size' );
	}
	return group(
		$body . $inner,
		[
			'className' => 'rv-preview__section',
			'layout'    => [ 'type' => 'constrained' ],
		]
	);
}

/**
 * Buttons block with core/button children.
 *
 * @param array<int, array{label: string, style?: string}> $buttons Buttons.
 * @param array<int, string>                               $slugs   Figma source slugs for the row.
 */
function buttons( array $buttons, array $slugs = [] ): string {
	$inner = '';
	foreach ( $buttons as $button ) {
		$class_name = ! empty( $button['style'] ) ? 'is-style-' . $button['style'] : '';
		$a          = $class_name ? [ 'className' => $class_name ] : [];
		$inner     .= '<!-- wp:button' . attrs( $a ) . " -->\n<div class=\"" . classes( [ 'wp-block-button', $class_name ] ) . '"><a class="wp-block-button__link wp-element-button">' . esc_html( $button['label'] ) . "</a></div>\n<!-- /wp:button -->\n";
	}
	// Figma links go on the whole row, so they show below the buttons (not between them).
	$row_class = figma( $slugs );
	$a         = $row_class ? [ 'className' => $row_class ] : [];
	return '<!-- wp:buttons' . attrs( $a ) . " -->\n<div class=\"" . classes( [ 'wp-block-buttons', $row_class ] ) . "\">\n{$inner}</div>\n<!-- /wp:buttons -->\n";
}

/**
 * One color tile (label on the color).
 *
 * @param string               $label Visible name.
 * @param array<string, mixed> $color Group color attributes (backgroundColor or style).
 * @param string               $hex   Hex value (for the label color).
 * @param string               $slug  Figma source slug.
 */
function color_tile( string $label, array $color, string $hex, string $slug ): string {
	$is_light = $hex && DarkLight\hex_luminance( $hex ) >= 0.55;
	$chip     = group(
		paragraph( esc_html( $label ), 'rv-preview__color-label' ),
		array_merge(
			[ 'className' => trim( 'rv-preview__color-chip ' . ( $is_light ? 'is-light' : 'is-dark' ) . ' ' . figma( [ $slug ] ) ) ],
			$color
		)
	);
	return group( $chip, [ 'className' => 'rv-preview__color-tile' ] );
}

// Page content.

/**
 * Palette entries from theme.json: slug => [name, hex].
 *
 * @return array<string, array{name: string, hex: string}>
 */
function get_palette(): array {
	$palette = [];
	$entries = wp_get_global_settings( [ 'color', 'palette', 'theme' ] );
	foreach ( is_array( $entries ) ? $entries : [] as $entry ) {
		if ( is_array( $entry ) && ! empty( $entry['slug'] ) && ! empty( $entry['color'] ) ) {
			$palette[ (string) $entry['slug'] ] = [
				'name' => (string) ( $entry['name'] ?? $entry['slug'] ),
				'hex'  => (string) $entry['color'],
			];
		}
	}
	return $palette;
}

/**
 * Full block markup for the Preview page, from the current theme.json.
 */
function build_content(): string {
	$lorem = __( 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.', 'rv-starter-theme' );
	$out   = '';

	// Typography.
	$sizes = [
		'large'  => __( 'Large', 'rv-starter-theme' ),
		'medium' => __( 'Medium', 'rv-starter-theme' ),
		'small'  => __( 'Small', 'rv-starter-theme' ),
	];
	$inner = '';
	foreach ( $sizes as $size => $label ) {
		$inner .= paragraph(
			'<strong>' . esc_html( $label ) . '</strong> - ' . esc_html( $lorem ),
			"has-{$size}-font-size " . figma( [ "body-size-desktop-{$size}" ] )
		);
	}
	$out .= section(
		__( 'Typography', 'rv-starter-theme' ),
		$inner,
		__( 'Body font sizes from the fluidness mixins (large / medium / small).', 'rv-starter-theme' ),
		[ 'color-body' ]
	);

	// Headings.
	$inner = '';
	for ( $level = 1; $level <= 6; $level++ ) {
		/* translators: %d: heading level */
		$inner .= heading( $level, sprintf( __( 'Heading %d', 'rv-starter-theme' ), $level ), figma( [ "heading-{$level}-font-size-desktop" ] ) );
	}
	$out .= section( __( 'Headings', 'rv-starter-theme' ), $inner, __( 'Native h1–h6 elements (heading mixin).', 'rv-starter-theme' ) );

	// Links.
	$out .= section(
		__( 'Links', 'rv-starter-theme' ),
		paragraph(
			sprintf(
				/* translators: %s: example link */
				esc_html__( 'Inline link example: %s within a sentence of body copy.', 'rv-starter-theme' ),
				'<a href="#">' . esc_html__( 'styled anchor', 'rv-starter-theme' ) . '</a>'
			),
			figma( [ 'color-link' ] )
		)
	);

	// Buttons: block.
	$out .= section(
		__( 'Button (Block)', 'rv-starter-theme' ),
		buttons(
			[
				[
					'label' => __( 'Primary', 'rv-starter-theme' ),
				],
				[
					'label' => __( 'Primary outline', 'rv-starter-theme' ),
					'style' => 'default-outline',
				],
				[
					'label' => __( 'Secondary', 'rv-starter-theme' ),
					'style' => 'secondary',
				],
				[
					'label' => __( 'Secondary outline', 'rv-starter-theme' ),
					'style' => 'secondary-outline',
				],
			],
			[ 'button-primary-background-color', 'button-secondary-background-color' ]
		),
		__( 'core/button with the block styles: Default, Default Outline, Secondary, Secondary Outline.', 'rv-starter-theme' )
	);

	// Buttons: utility classes.
	$utility  = "<!-- wp:html -->\n<div class=\"rv-preview__row\">\n";
	$utility .= "\t<a href=\"#\" class=\"rv-button--primary\">" . esc_html__( 'Primary', 'rv-starter-theme' ) . "</a>\n";
	$utility .= "\t<a href=\"#\" class=\"rv-button--primary--outline\">" . esc_html__( 'Primary outline', 'rv-starter-theme' ) . "</a>\n";
	$utility .= "\t<a href=\"#\" class=\"rv-button--secondary\">" . esc_html__( 'Secondary', 'rv-starter-theme' ) . "</a>\n";
	$utility .= "\t<a href=\"#\" class=\"rv-button--secondary--outline\">" . esc_html__( 'Secondary outline', 'rv-starter-theme' ) . "</a>\n";
	$utility .= "\t<button type=\"button\" class=\"rv-button--primary\" disabled>" . esc_html__( 'Disabled', 'rv-starter-theme' ) . "</button>\n";
	$utility .= "</div>\n<!-- /wp:html -->\n";
	$out     .= section(
		__( 'Button (Utility Classes)', 'rv-starter-theme' ),
		$utility,
		__( 'For buttons outside the Button block: .rv-button--primary, .rv-button--primary--outline, .rv-button--secondary, .rv-button--secondary--outline.', 'rv-starter-theme' )
	);

	// Quote.
	$quote  = "<!-- wp:quote -->\n<blockquote class=\"wp-block-quote\">\n";
	$quote .= paragraph( esc_html__( 'Design tokens should be easy to update and immediately visible across the site.', 'rv-starter-theme' ) );
	$quote .= '<cite>' . esc_html__( 'Rareview Starter Theme', 'rv-starter-theme' ) . "</cite></blockquote>\n<!-- /wp:quote -->\n";
	$out   .= section( __( 'Quote', 'rv-starter-theme' ), $quote );

	// Colors.
	$palette    = get_palette();
	$surface    = DarkLight\resolve_background_hex() ?: '#ffffff';
	$mono_slugs = [ 'black', 'dark', 'dark-grey', 'grey', 'grey-light', 'white' ];
	$grid       = [
		'className' => 'rv-preview__color-grid',
		'layout'    => [
			'type'     => 'flex',
			'flexWrap' => 'wrap',
		],
	];

	$mono  = '';
	$brand = '';
	foreach ( $palette as $slug => $entry ) {
		$tile = color_tile( $entry['name'], [ 'backgroundColor' => $slug ], $entry['hex'], str_starts_with( $slug, 'brand-' ) ? $slug : "color-{$slug}" );
		if ( in_array( $slug, $mono_slugs, true ) ) {
			$mono .= $tile;
		} else {
			$brand .= $tile;
		}
	}

	$inner  = heading( 3, __( 'Page background', 'rv-starter-theme' ), 'rv-preview__subsection-label' );
	$inner .= group( color_tile( __( 'Body / page background', 'rv-starter-theme' ), [ 'style' => [ 'color' => [ 'background' => $surface ] ] ], $surface, 'color-background' ), $grid );
	$inner .= heading( 3, __( 'Mono', 'rv-starter-theme' ), 'rv-preview__subsection-label' );
	$inner .= group( $mono, $grid );
	if ( $brand ) {
		$inner .= heading( 3, __( 'Color', 'rv-starter-theme' ), 'rv-preview__subsection-label' );
		$inner .= group( $brand, $grid );
	}
	$out .= section( __( 'Colors', 'rv-starter-theme' ), $inner, __( 'Palette from theme.json.', 'rv-starter-theme' ) );

	// Input fields: the site default surface first, then the other one for comparison.
	$is_dark = DarkLight\is_dark_background();
	$light   = group(
		paragraph( esc_html( $is_dark ? __( 'Light surface (for comparison).', 'rv-starter-theme' ) : __( 'Light page background (site default).', 'rv-starter-theme' ) ), 'rv-preview__note has-small-font-size' ) . "<!-- wp:rv-starter/input-fields-examples /-->\n",
		[ 'className' => 'rv-preview__light-panel' ]
	);
	$dark    = group(
		paragraph( esc_html( $is_dark ? __( 'Dark page background (site default).', 'rv-starter-theme' ) : __( 'Dark surface (for comparison).', 'rv-starter-theme' ) ), 'rv-preview__note has-small-font-size' ) . "<!-- wp:rv-starter/input-fields-examples /-->\n",
		[ 'className' => 'rv-preview__dark-panel rv-background-dark' ]
	);
	$out    .= section(
		__( 'Input fields', 'rv-starter-theme' ),
		$is_dark ? $dark . $light : $light . $dark,
		__( 'Form controls use light styles by default, and dark styles inside .rv-background-dark. When the page background is dark, body gets that class automatically after sync.', 'rv-starter-theme' ),
		[ 'input-field-border-radius', 'input-field-border-width', 'input-field-border-color', 'input-dark-border-color' ]
	);

	return group(
		$out,
		[
			'className' => 'rv-preview',
			'layout'    => [ 'type' => 'constrained' ],
		]
	);
}

// Figma links (frontend, admins only).

/**
 * Whether the current user may see Figma source links.
 */
function can_view_figma_sources(): bool {
	return current_user_can( 'edit_theme_options' );
}

/**
 * Sources written by `npm run figma-sync` (generated/figma-sources.json).
 *
 * @return array<string, mixed>|null
 */
function get_figma_sources(): ?array {
	static $cached = false;

	if ( false !== $cached ) {
		return $cached;
	}

	$cached = null;
	$path   = RV_STARTER_THEME_PATH . 'generated/figma-sources.json';
	if ( is_readable( $path ) ) {
		$data   = json_decode( (string) file_get_contents( $path ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- local file.
		$cached = is_array( $data ) ? $data : null;
	}
	return $cached;
}

/**
 * Whether the current request shows the Preview page.
 */
function is_preview_page(): bool {
	return is_page() && get_post_meta( (int) get_queried_object_id(), PAGE_META, true );
}

/**
 * Append "Figma ↗" links after blocks that carry rv-preview-figma--{slug} classes.
 *
 * @param string               $html  Block HTML.
 * @param array<string, mixed> $block Parsed block.
 */
function add_figma_links( string $html, array $block ): string {
	$class_name = (string) ( $block['attrs']['className'] ?? '' );
	if ( false === strpos( $class_name, FIGMA_CLASS ) ) {
		return $html;
	}

	$sources = get_figma_sources()['sources'] ?? [];
	$links   = '';
	foreach ( preg_split( '/\s+/', $class_name ) as $class ) {
		if ( 0 !== strpos( $class, FIGMA_CLASS ) ) {
			continue;
		}
		$slug   = substr( $class, strlen( FIGMA_CLASS ) );
		$source = $sources[ $slug ] ?? null;
		if ( empty( $source['url'] ) ) {
			continue;
		}
		$title  = (string) ( $source['note'] ?? $source['nodeId'] ?? '' );
		$links .= sprintf(
			'<a class="rv-preview__figma-link" href="%1$s" target="_blank" rel="noopener noreferrer" title="%2$s">Figma ↗ %3$s</a>',
			esc_url( (string) $source['url'] ),
			esc_attr( $title ),
			esc_html( $slug )
		);
	}

	return $links ? $html . '<span class="rv-preview__figma-links">' . $links . '</span>' : $html;
}

/**
 * Sync info + warnings at the top of the Preview page (admins only).
 *
 * @param string $content Post content.
 */
function add_sync_banner( string $content ): string {
	if ( ! in_the_loop() ) {
		return $content;
	}

	$bundle = get_figma_sources();
	if ( ! $bundle ) {
		return '<p class="rv-preview__sync-banner">' . esc_html__( 'No Figma sync sources yet. Run npm run figma-sync to show Figma links here.', 'rv-starter-theme' ) . '</p>' . $content;
	}

	$banner = '<div class="rv-preview__sync-banner"><p class="rv-preview__sync-meta">' . esc_html__( 'Figma sync sources', 'rv-starter-theme' );
	if ( ! empty( $bundle['generatedAt'] ) ) {
		$banner .= ' · ' . esc_html( (string) $bundle['generatedAt'] );
	}
	if ( ! empty( $bundle['fileUrl'] ) ) {
		$banner .= ' · <a href="' . esc_url( (string) $bundle['fileUrl'] ) . '" target="_blank" rel="noopener noreferrer">' . esc_html__( 'Open file', 'rv-starter-theme' ) . '</a>';
	}
	$banner .= '</p>';

	$warnings = is_array( $bundle['warnings'] ?? null ) ? $bundle['warnings'] : [];
	if ( $warnings ) {
		$banner .= '<ul class="rv-preview__sync-warnings">';
		foreach ( $warnings as $warning ) {
			if ( ! is_array( $warning ) ) {
				continue;
			}
			$banner .= '<li>';
			if ( ! empty( $warning['slug'] ) ) {
				$banner .= '<code>' . esc_html( (string) $warning['slug'] ) . '</code>: ';
			}
			$banner .= esc_html( (string) ( $warning['message'] ?? '' ) );
			if ( ! empty( $warning['url'] ) ) {
				$banner .= ' <a href="' . esc_url( (string) $warning['url'] ) . '" target="_blank" rel="noopener noreferrer">' . esc_html__( 'Open in Figma', 'rv-starter-theme' ) . '</a>';
			}
			$banner .= '</li>';
		}
		$banner .= '</ul>';
	}

	return $banner . '</div>' . $content;
}
