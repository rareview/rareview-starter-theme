/**
 * Editor content overrides entry point.
 *
 * Enables hot reloading of editor content styles inside WordPress admin.
 * Targets user-generated content (blocks) rendered inside the iframed Editor.
 *
 * @see https://developer.wordpress.org/block-editor/how-to-guides/enqueueing-assets-in-the-editor/#editor-content-scripts-and-styles
 */
import '../../css/editor-content-overrides.scss';
import fluidInit from '../shared/fluid';

fluidInit();
