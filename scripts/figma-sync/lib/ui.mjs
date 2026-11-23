/**
 * Terminal output for Figma Sync: a few colors, step headings, and the --details flag.
 * Colors are off when the output is not a terminal or NO_COLOR is set.
 */

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));

export const color = {
	bold: paint('1'),
	dim: paint('2'),
	red: paint('31'),
	green: paint('32'),
	yellow: paint('33'),
	blue: paint('34'),
	magenta: paint('35'),
	cyan: paint('36'),
};

/** `npm run figma-sync -- --details`: show every AI step (tool calls, style edits) in the terminal. */
export const DETAILS = process.argv.includes('--details');

/** The title at the start of the sync. */
export function title(text) {
	console.log(`\n  ${color.bold(color.magenta('◆'))} ${color.bold(text)}`);
	console.log(color.dim(`  ${'─'.repeat(text.length + 2)}`));
}

/** A step heading, e.g. "● Updating the theme". */
export function step(text) {
	console.log(`\n  ${color.cyan('●')} ${color.bold(text)}`);
}

/** A result line: green check. */
export function ok(text) {
	console.log(`  ${color.green('✓')} ${text}`);
}

/** Something to look at: yellow. */
export function warn(text) {
	console.log(`  ${color.yellow('!')} ${color.yellow(text)}`);
}

/** An error: red cross. */
export function fail(text) {
	console.log(`  ${color.red('✖')} ${color.red(text)}`);
}

/** A quiet extra line (paths, hints). */
export function note(text) {
	console.log(color.dim(`    ${text}`));
}

/** One line of detail, only with --details. */
export function detail(text) {
	if (DETAILS) {
		console.log(color.dim(`     ${text}`));
	}
}
