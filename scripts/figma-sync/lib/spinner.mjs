/**
 * A one-line "still working" loader with a timer, e.g. "  ⠋ AI is reading the design  0:42 · 12 steps".
 * Only in a real terminal; in a log or CI it prints nothing.
 */

import { color } from './ui.mjs';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * @param {string} label
 * @returns {{ start: () => void, stop: () => void, setExtra: (text: string) => void, elapsed: () => string }}
 */
export function createSpinner(label) {
	const tty = Boolean(process.stdout.isTTY);
	const startedAt = Date.now();
	let timer = null;
	let frame = 0;
	let extra = '';

	const elapsed = () => {
		const seconds = Math.floor((Date.now() - startedAt) / 1000);
		return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
	};

	const draw = () => {
		const tail = color.dim(`${elapsed()}${extra ? ` · ${extra}` : ''}`);
		process.stdout.write(`\r  ${color.magenta(FRAMES[frame % FRAMES.length])} ${label}  ${tail}\x1b[K`);
		frame += 1;
	};

	return {
		start() {
			if (!tty || timer) {
				return;
			}
			draw();
			timer = setInterval(draw, 100);
		},
		stop() {
			if (!timer) {
				return;
			}
			clearInterval(timer);
			timer = null;
			process.stdout.write('\r\x1b[K');
		},
		/** Text after the timer, e.g. "12 steps". */
		setExtra(text) {
			extra = text;
		},
		elapsed,
	};
}
