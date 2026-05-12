#!/usr/bin/env node

/**
 * Rareview Starter Theme — Interactive Project Setup
 *
 * Automates all manual setup steps when creating a new project
 * from the rv-starter-theme template.
 *
 * Usage:
 *   npm run setup
 *   npm run setup -- --dry-run
 *   npm run setup -- --yes
 */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout, argv, exit } from 'node:process';
import { readdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { join, extname, resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const THEME_DIR = join(ROOT, 'wp-content', 'themes', 'rv-starter');

// CLI flags
const args = argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const AUTO_YES = args.includes('--yes');

// ANSI colors
const color = {
	green: (s) => `\x1b[32m${s}\x1b[0m`,
	yellow: (s) => `\x1b[33m${s}\x1b[0m`,
	cyan: (s) => `\x1b[36m${s}\x1b[0m`,
	red: (s) => `\x1b[31m${s}\x1b[0m`,
	bold: (s) => `\x1b[1m${s}\x1b[0m`,
	dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

// File extensions to process
const PROCESSABLE_EXTENSIONS = new Set([
	'.php', '.js', '.mjs', '.json', '.scss', '.css',
	'.yml', '.yaml', '.md', '.xml', '.sh', '.pot',
	'.txt', '.html',
]);

// Directories to skip
const SKIP_DIRS = new Set([
	'node_modules', 'vendor', '.git', 'dist',
	'10up-starter', // skip the reference 10up theme if present
]);

// Files to skip (don't modify the setup scripts themselves)
const SKIP_FILES = new Set([
	'setup.mjs',
	'design-system.mjs',
	'create-block.mjs',
]);

/**
 * Convert a project name to various case formats.
 */
function deriveCases(name) {
	const words = name.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/);

	const slug = words.map((w) => w.toLowerCase()).join('-');
	const namespace = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
	const constant = words.map((w) => w.toUpperCase()).join('_');
	const snake = words.map((w) => w.toLowerCase()).join('_');

	return { slug, namespace, constant, snake };
}

/**
 * Validate a slug format.
 */
function isValidSlug(slug) {
	return /^[a-z][a-z0-9-]*[a-z0-9]$/.test(slug) && !slug.includes('--');
}

/**
 * Prompt user for input with a default value.
 */
async function ask(rl, question, defaultValue) {
	if (AUTO_YES && defaultValue) {
		console.log(`  ${color.dim(question)} ${color.cyan(defaultValue)}`);
		return defaultValue;
	}

	const answer = await rl.question(`  ${question} ${color.dim(`(${defaultValue})`)} `);
	return answer.trim() || defaultValue;
}

/**
 * Recursively collect all processable files.
 */
async function collectFiles(dir, files = []) {
	const entries = await readdir(dir, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = join(dir, entry.name);

		if (entry.isDirectory()) {
			if (!SKIP_DIRS.has(entry.name)) {
				await collectFiles(fullPath, files);
			}
		} else if (entry.isFile()) {
			const ext = extname(entry.name);
			if (PROCESSABLE_EXTENSIONS.has(ext) && !SKIP_FILES.has(entry.name)) {
				files.push(fullPath);
			}
		}
	}

	return files;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegExp(string) {
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Perform find-and-replace on a single file.
 * Returns the number of replacements made.
 */
async function replaceInFile(filePath, replacements) {
	let content;
	try {
		content = await readFile(filePath, 'utf-8');
	} catch {
		return 0;
	}

	let modified = content;
	let totalReplacements = 0;

	for (const [search, replacement] of replacements) {
		const regex = new RegExp(escapeRegExp(search), 'g');
		const matches = modified.match(regex);
		if (matches) {
			totalReplacements += matches.length;
			modified = modified.replace(regex, replacement);
		}
	}

	if (totalReplacements > 0 && !DRY_RUN) {
		await writeFile(filePath, modified, 'utf-8');
	}

	return totalReplacements;
}

/**
 * Check if the theme directory exists (hasn't been set up already).
 */
async function checkPrerequisites() {
	try {
		await stat(THEME_DIR);
	} catch {
		console.log(color.red('\nError: Theme directory not found at:'));
		console.log(color.red(`  ${THEME_DIR}`));
		console.log(color.yellow('\nIt looks like the project may have already been set up.'));
		exit(1);
	}
}

/**
 * Clean up README.md — remove Step 0 section.
 */
async function cleanupReadme(readmePath) {
	try {
		let content = await readFile(readmePath, 'utf-8');

		// Remove everything from "## Step 0" through the separator line
		const step0Regex = /## Step 0:[\s\S]*?_{3,}\n*/;
		if (step0Regex.test(content)) {
			content = content.replace(step0Regex, '');
			if (!DRY_RUN) {
				await writeFile(readmePath, content, 'utf-8');
			}
			return true;
		}
	} catch {
		// README might not exist
	}
	return false;
}

/**
 * Generate AGENTS.md with project-specific values.
 */
function generateAgentsMd(config) {
	return `# ${config.name}

## Overview
WordPress theme built on 10up Toolkit. PHP 8.2+, Node 20+.

## Architecture
- Service Provider pattern: App.php -> ServiceProviders -> Services
- PSR-4 autoloading: \`${config.namespace}Theme\\\` -> \`includes/classes/\`
- Namespaced functions in includes/ (core.php, blocks.php, helpers.php, etc.)

## Commands
- \`npm run start\` - dev server with HMR (port 5000)
- \`npm run build\` - production build
- \`npm run lint\` / \`npm run format\` - lint and format all (JS, CSS, PHP)
- \`npm run create-block -- --name="name"\` - scaffold new block
- \`npm run design-system\` - update design tokens interactively
- \`lando start\` / \`lando poweroff\` - local environment

## Coding Standards
- Indentation: tabs (not spaces)
- Quotes: single quotes (JS and PHP)
- CSS class naming: \`rv-{component}__{element}\` (BEM-adjacent)
- PHP: 10up-Default PHPCS rules, PHP 8.2+ with type hints
- JS: @10up/eslint-config/wordpress, no jQuery on frontend
- SCSS: stylelint-config-standard-scss

## File Conventions
- Blocks: \`includes/blocks/{name}/\` (block.json, markup.php, edit.js, style.scss)
- Styles: \`assets/css/components/{name}.scss\` -> import in frontend.scss
- JS features: \`assets/js/frontend/features/{name}.js\` -> import in frontend.js
- Templates: \`templates/page-{name}.php\`
- Classes: \`includes/classes/\` (PSR-4, namespace ${config.namespace}Theme)

## Design System
- Source of truth: \`theme.json\` (colors, fonts, sizes)
- SCSS variables: \`assets/css/abstracts/variables/variables.scss\` (references theme.json CSS custom properties)
- Fluid typography: clamp() in SCSS + JS engine in \`assets/js/shared/fluid/\`
- Breakpoints: 500 / 781 / 1024 / 1440 / 1600 / 1920px
- Run \`npm run design-system\` to update design tokens interactively

## Key Patterns
- Hook callbacks use namespace helper: \`$n = static function($f) { return __NAMESPACE__ . "\\\\$f"; };\`
- Asset loading: \`Utility\\\\get_asset_info()\` reads .asset.php manifests for dependencies/version
- Blocks: auto-discovered from \`dist/blocks/*/block.json\`
- REST API namespace: \`${config.slug}/v1\`
- Conditional asset loading: jQuery dequeued unless Gravity Forms present
- Template tags: pure functions only (no side effects, no hooks)

## Theme Directory
\`wp-content/themes/${config.slug}/\`
`;
}

/**
 * Run a command safely using execFileSync.
 */
function runCommand(command, commandArgs, options = {}) {
	try {
		execFileSync(command, commandArgs, { cwd: ROOT, stdio: 'inherit', ...options });
		return true;
	} catch {
		return false;
	}
}

/**
 * Print manual next steps.
 */
function printManualSteps(slug) {
	console.log(color.bold('\n  Next steps:\n'));
	console.log(`    1. ${color.cyan('npm install')}`);
	console.log(`    2. ${color.cyan(`npm --prefix wp-content/themes/${slug} install`)}`);
	console.log(`    3. ${color.cyan('npm run build')}`);
	console.log(`    4. ${color.cyan('lando start')}`);
	console.log(`    5. Visit ${color.cyan(`http://${slug}.local`)}`);
}

/**
 * Main setup flow.
 */
async function main() {
	console.log('');
	console.log(color.bold('  Rareview Starter Theme \u2014 Project Setup'));
	console.log(color.dim('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'));
	console.log('');

	if (DRY_RUN) {
		console.log(color.yellow('  DRY RUN MODE \u2014 no files will be modified\n'));
	}

	await checkPrerequisites();

	const rl = createInterface({ input: stdin, output: stdout });

	try {
		// Step 1: Gather project info
		console.log(color.bold('  Project Information\n'));

		const name = await ask(rl, 'Project name:', 'My Project');
		const derived = deriveCases(name);

		let slug = await ask(rl, 'Project slug (kebab-case):', derived.slug);
		while (!isValidSlug(slug)) {
			console.log(color.red('    Invalid slug. Use lowercase letters, numbers, and hyphens only.'));
			slug = await ask(rl, 'Project slug (kebab-case):', derived.slug);
		}

		const namespace = await ask(rl, 'PHP namespace (PascalCase):', derived.namespace);
		const constant = await ask(rl, 'Constant prefix (UPPER_SNAKE):', derived.constant);
		const snake = await ask(rl, 'Snake case prefix:', derived.snake);
		const localUrl = await ask(rl, 'Local development URL:', `${slug}.local`);
		const productionUrl = await ask(rl, 'Production URL:', `${slug}.com`);
		const description = await ask(rl, 'Project description:', `${name} WordPress Theme`);

		console.log('');
		console.log(color.bold('  Summary\n'));
		console.log(`    Name:         ${color.cyan(name)}`);
		console.log(`    Slug:         ${color.cyan(slug)}`);
		console.log(`    Namespace:    ${color.cyan(namespace)}Theme`);
		console.log(`    Constants:    ${color.cyan(constant)}_THEME_*`);
		console.log(`    Snake case:   ${color.cyan(snake)}`);
		console.log(`    Local URL:    ${color.cyan(localUrl)}`);
		console.log(`    Prod URL:     ${color.cyan(productionUrl)}`);
		console.log(`    Description:  ${color.cyan(description)}`);
		console.log('');

		if (!AUTO_YES) {
			const confirm = await rl.question(`  ${color.bold('Proceed with setup?')} (Y/n) `);
			if (confirm.toLowerCase() === 'n') {
				console.log(color.yellow('\n  Setup cancelled.\n'));
				exit(0);
			}
		}

		// Step 2: Define replacements (order matters — most specific first!)
		const replacements = [
			['rv-starter-theme', `${slug}-theme`],
			['RVStarterTheme', `${namespace}Theme`],
			['RV_STARTER_THEME', `${constant}_THEME`],
			['rv-starter.com', productionUrl],
			['rv-starter.local', localUrl],
			['rv-starter-lando', `${slug}-lando`],
			['rv-starter', slug],
			['Rareview Starter', name],
			['RVStarter', namespace],
			['RV_STARTER', constant],
			['rv_starter', snake],
		];

		// Step 3: Collect and process files
		console.log(color.bold('\n  Processing files...\n'));

		const files = await collectFiles(ROOT);
		let totalFiles = 0;
		let totalReplacements = 0;

		for (const file of files) {
			const count = await replaceInFile(file, replacements);
			if (count > 0) {
				totalFiles++;
				totalReplacements += count;
				const relative = file.replace(ROOT + '/', '');
				console.log(`    ${color.green('\u2713')} ${relative} ${color.dim(`(${count} replacements)`)}`);
			}
		}

		console.log(`\n    ${color.bold(`${totalReplacements} replacements`)} across ${color.bold(`${totalFiles} files`)}`);

		// Step 4: Rename theme directory
		const newThemeDir = join(ROOT, 'wp-content', 'themes', slug);
		if (slug !== 'rv-starter') {
			console.log(color.bold('\n  Renaming theme directory...\n'));
			if (!DRY_RUN) {
				await rename(THEME_DIR, newThemeDir);
			}
			console.log(`    ${color.green('\u2713')} wp-content/themes/rv-starter/ \u2192 wp-content/themes/${slug}/`);
		}

		// Step 5: Rename .pot file
		const themeDirToUse = DRY_RUN ? THEME_DIR : newThemeDir;
		const oldPot = join(themeDirToUse, 'languages', 'RVStarterTheme.pot');
		const newPot = join(themeDirToUse, 'languages', `${namespace}Theme.pot`);
		try {
			await stat(oldPot);
			console.log(color.bold('\n  Renaming translation file...\n'));
			if (!DRY_RUN) {
				await rename(oldPot, newPot);
			}
			console.log(`    ${color.green('\u2713')} RVStarterTheme.pot \u2192 ${namespace}Theme.pot`);
		} catch {
			// .pot file may not exist
		}

		// Step 6: Clean up README
		console.log(color.bold('\n  Cleaning up README...\n'));
		const readmePath = join(ROOT, 'README.md');
		const cleaned = await cleanupReadme(readmePath);
		if (cleaned) {
			console.log(`    ${color.green('\u2713')} Removed Step 0 section from README.md`);
		}

		// Step 7: Generate AGENTS.md
		console.log(color.bold('\n  Generating AGENTS.md...\n'));
		const agentsMdPath = join(ROOT, 'AGENTS.md');
		const agentsContent = generateAgentsMd({ name, slug, namespace, constant, snake });
		if (!DRY_RUN) {
			await writeFile(agentsMdPath, agentsContent, 'utf-8');
		}
		console.log(`    ${color.green('\u2713')} Generated AGENTS.md`);

		// Step 8: Run composer dump-autoload
		console.log(color.bold('\n  Updating autoloader...\n'));
		if (!DRY_RUN) {
			const success = runCommand('composer', ['dump-autoload'], {
				cwd: themeDirToUse,
				stdio: 'pipe',
			});
			if (success) {
				console.log(`    ${color.green('\u2713')} Composer autoloader regenerated`);
			} else {
				console.log(`    ${color.yellow('\u26a0')} Could not run composer dump-autoload (run it manually)`);
			}
		} else {
			console.log(`    ${color.dim('Would run: composer dump-autoload')}`);
		}

		// Step 9: Success
		console.log('');
		console.log(color.green(color.bold('  \u2713 Setup complete!')));
		console.log('');

		if (DRY_RUN) {
			console.log(color.yellow('  This was a dry run. Run without --dry-run to apply changes.\n'));
			rl.close();
			exit(0);
		}

		// Step 10: Optional npm install + lando start
		if (!AUTO_YES) {
			const runInstall = await rl.question('  Run npm install and lando start now? (y/N) ');

			if (runInstall.toLowerCase() === 'y') {
				console.log(color.bold('\n  Installing dependencies...\n'));

				console.log(color.dim('    Running: npm install'));
				if (!runCommand('npm', ['install'])) {
					console.log(color.yellow('    Failed. You may need to run npm install manually.'));
				}

				console.log(color.dim(`\n    Running: npm --prefix wp-content/themes/${slug} install`));
				if (!runCommand('npm', ['--prefix', `wp-content/themes/${slug}`, 'install'])) {
					console.log(color.yellow('    Failed. You may need to install theme dependencies manually.'));
				}

				console.log(color.dim('\n    Running: npm run build'));
				if (!runCommand('npm', ['run', 'build'])) {
					console.log(color.yellow('    Failed. You may need to run the build manually.'));
				}

				console.log(color.dim('\n    Running: lando start'));
				if (!runCommand('lando', ['start'])) {
					console.log(color.yellow('    Failed. You may need to run lando start manually.'));
				}
			} else {
				printManualSteps(slug);
			}
		} else {
			printManualSteps(slug);
		}

		console.log('');
	} finally {
		rl.close();
	}
}

main().catch((err) => {
	console.error(color.red(`\n  Error: ${err.message}\n`));
	exit(1);
});
