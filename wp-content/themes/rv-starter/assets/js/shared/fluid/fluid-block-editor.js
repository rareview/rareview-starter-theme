import fluidInit from '../fluid';

const EDITOR_IFRAME =
	'iframe[name="editor-canvas"], iframe.editor-canvas__iframe, .block-editor-iframe__container iframe';

// Get block editor canvas, which is .editor-styles-wrapper in this document, or in the canvas iframe.
const getEditorCanvas = () => {
	const editorStylesWrapper = document.querySelector('.editor-styles-wrapper');

	if (editorStylesWrapper) {
		return editorStylesWrapper;
	}

	const iframe = document.querySelector(EDITOR_IFRAME);

	return iframe?.contentDocument?.querySelector('.editor-styles-wrapper') || null;
};

// If the heading sizes are not set, exit.
const areHeadingSizesReady = (canvas) => {
	const styles = getComputedStyle(canvas);

	for (let level = 1; level <= 6; level++) {
		if (!styles.getPropertyValue(`--wp--custom--font-size--desktop--heading-${level}`).trim()) {
			return false;
		}
	}

	return true;
};

// If the canvas is found, apply the scripts.
const applyFluidToEditorCanvas = () => {
	const canvas = getEditorCanvas();

	if (!canvas || !areHeadingSizesReady(canvas)) {
		return false;
	}

	fluidInit(canvas);
	return true;
};

const fluidBlockEditor = () => {
	if (applyFluidToEditorCanvas()) {
		return;
	}

	// Do scripts on load.
	document.querySelector(EDITOR_IFRAME)?.addEventListener('load', applyFluidToEditorCanvas);

	// Retry until the heading sizes are set.
	let tries = 0;
	const retry = () => {
		if (applyFluidToEditorCanvas() || tries >= 40) {
			return;
		}

		tries += 1;
		window.setTimeout(retry, 250);
	};

	retry();
};

export default fluidBlockEditor;
