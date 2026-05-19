/**
 * Editor content overrides entry point (enqueue_block_assets).
 *
 * Enables hot reloading of editor content styles inside WordPress admin.
 * Targets user-generated content (blocks) rendered inside the iframed Editor.
 *
 * NOTE: Intended for the block canvas only, but WordPress 6.3+ may also load these
 * assets on the parent admin page (sidebar, toolbar, etc.). Avoid global
 * selectors in the SCSS; scope rules to .editor-styles-wrapper (or similar).
 *
 * @see https://developer.wordpress.org/block-editor/how-to-guides/enqueueing-assets-in-the-editor/#editor-content-scripts-and-styles
 * @see https://developer.wordpress.org/block-editor/how-to-guides/enqueueing-assets-in-the-editor/#backward-compatibility-and-known-issues
 */
import '../../css/editor-content-overrides.scss';
import fluidInit from '../shared/fluid';

fluidInit();
