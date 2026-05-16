#!/usr/bin/env node

/**
 * Rareview Starter Theme — Block Scaffolding
 *
 * Generates new custom blocks following the theme's exact conventions.
 *
 * Usage:
 *   npm run create-block -- --name="hero-banner"
 *   npm run create-block                          # interactive
 *
 * @author Rareview <hello@rareview.com>
 */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout, argv, exit } from 'node:process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

// CLI flags
const args = argv.slice(2);
const nameFlag = args.find((a) => a.startsWith('--name='));
const NAME_ARG = nameFlag ? nameFlag.split('=')[1].replace(/"/g, '') : null;

// ANSI colors
const color = {
	green: (s) => `\x1b[32m${s}\x1b[0m`,
	yellow: (s) => `\x1b[33m${s}\x1b[0m`,
	cyan: (s) => `\x1b[36m${s}\x1b[0m`,
	red: (s) => `\x1b[31m${s}\x1b[0m`,
	bold: (s) => `\x1b[1m${s}\x1b[0m`,
	dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

/**
 * Detect the theme directory and its configuration.
 */
async function findThemeConfig() {
	const { readdir } = await import('node:fs/promises');

	// Support both standard WP (wp-content/themes/) and WP VIP (themes/) layouts.
	const stdThemesDir = resolve(ROOT, 'wp-content', 'themes');
	const vipThemesDir = resolve(ROOT, 'themes');
	const themesDir = existsSync(stdThemesDir) ? stdThemesDir : vipThemesDir;

	const entries = await readdir(themesDir, { withFileTypes: true });

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;

		try {
			const pkgPath = resolve(themesDir, entry.name, 'package.json'); // todo: Fix this so it doesn't just pick the first theme with package.json, which may not be our starter theme.
			const raw = await readFile(pkgPath, 'utf-8');
			const pkg = JSON.parse(raw);

			// Read functions.php or style.css for textdomain
			let textdomain = `${entry.name}-theme`;
			try {
				const styleCss = await readFile(resolve(themesDir, entry.name, 'style.css'), 'utf-8');
				const tdMatch = styleCss.match(/Text Domain:\s*(.+)/i);
				if (tdMatch) textdomain = tdMatch[1].trim();
			} catch {
				// style.css may not exist
			}

			return {
				themeDir: resolve(themesDir, entry.name),
				slug: entry.name,
				textdomain,
				pkg,
			};
		} catch {
			// not a valid theme directory
		}
	}

	console.log(color.red(`\nError: No theme found in ${themesDir.replace(ROOT + '/', '')}/`));
	exit(1);
}

/**
 * Convert block name to slug format.
 */
function toSlug(name) {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.trim()
		.replace(/\s+/g, '-');
}

/**
 * Convert block name to title case.
 */
function toTitle(slug) {
	return slug
		.split('-')
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');
}

/**
 * Convert slug to PascalCase for JS component names.
 */
function toPascalCase(slug) {
	return slug
		.split('-')
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join('');
}

/**
 * Generate block.json
 */
function generateBlockJson(config) {
	const block = {
		$schema: 'https://schemas.wp.org/trunk/block.json',
		apiVersion: 3,
		title: config.title,
		description: config.description,
		textdomain: config.textdomain,
		name: `${config.themeSlug}/${config.slug}`,
		icon: 'block-default',
		category: config.category,
		keywords: config.slug.split('-'),
		attributes: {},
		supports: {
			align: true,
			anchor: true,
			customClassName: true,
			html: false,
		},
		editorScript: 'file:./index.js',
	};

	if (config.renderType === 'dynamic') {
		block.render = 'file:./markup.php';
	}

	return JSON.stringify(block, null, '\t') + '\n';
}

/**
 * Generate edit.js (editor component)
 *
 * todo: extract this to a real example block in the theme — one source of truth for the scaffold, a live example for developers, and an easy place to maintain the starting point, easier for AI to understand.
 */
function generateEditJs(config) {
	const componentName = toPascalCase(config.slug) + 'Edit';

	return `/**
 * WordPress dependencies
 */
import { __ } from '@wordpress/i18n';
import { useBlockProps } from '@wordpress/block-editor';

/**
 * ${config.title} — Editor component
 * @returns {Element}    Block edit element.
 */
const ${componentName} = () => {
	const blockProps = useBlockProps();

	return (
		<div {...blockProps}>
			<p>{__('${config.title}', '${config.textdomain}')}</p>
		</div>
	);
};

export default ${componentName};
`;
}

/**
 * Generate index.js (block registration)
 *
 * todo: extract this to a real example block in the theme — one source of truth for the scaffold, a live example for developers, and an easy place to maintain the starting point, easier for AI to understand.
 */
function generateIndexJs(config) {
	let imports = `/**
 * WordPress dependencies
 */
import { registerBlockType } from '@wordpress/blocks';

/**
 * Internal dependencies
 */
import edit from './edit';
import metadata from './block.json';`;

	let save = 'null';
	if (config.renderType === 'static') {
		imports += `\nimport save from './save';`;
		save = 'save';
	}

	return `${imports}

/**
 * Block styles
 */
import './style.scss';

/**
 * Register ${config.title} block.
 */
registerBlockType(metadata.name, {
	edit,
	save: ${save === 'null' ? '() => null' : save},
});
`;
}

/**
 * Generate save.js for static blocks
 *
 * todo: extract this to a real example block in the theme — one source of truth for the scaffold, a live example for developers, and an easy place to maintain the starting point, easier for AI to understand.
 */
function generateSaveJs(config) {
	const componentName = toPascalCase(config.slug) + 'Save';

	return `/**
 * WordPress dependencies
 */
import { __ } from '@wordpress/i18n';
import { useBlockProps } from '@wordpress/block-editor';

/**
 * ${config.title} — Save component
 * @returns {Element}    Block save element.
 */
const ${componentName} = () => {
	const blockProps = useBlockProps.save();

	return (
		<div {...blockProps}>
			<p>{__('${config.title}', '${config.textdomain}')}</p>
		</div>
	);
};

export default ${componentName};
`;
}

/**
 * Generate markup.php for dynamic blocks
 *
 * todo: extract this to a real example block in the theme — one source of truth for the scaffold, a live example for developers, and an easy place to maintain the starting point, easier for AI to understand.
 */
function generateMarkupPhp(config) {
	return `<?php
/**
 * ${config.title} — Server-side render.
 *
 * @package ${config.textdomain.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')}
 *
 * @var array    $attributes Block attributes.
 * @var string   $content    Inner block content.
 * @var WP_Block $block      Block instance.
 */

?>

<div <?php echo get_block_wrapper_attributes(); // phpcs:ignore ?>>
	<p><?php echo esc_html__( '${config.title}', '${config.textdomain}' ); ?></p>
</div>
`;
}

/**
 * Generate style.scss
 *
 * todo: extract this to a real example block in the theme — one source of truth for the scaffold, a live example for developers, and an easy place to maintain the starting point, easier for AI to understand.
 */
function generateStyleScss(config) {
	return `/**
 * ${config.title} block styles.
 *
 * @author Rareview <hello@rareview.com>
 */
.wp-block-${config.themeSlug}-${config.slug} {
	/* Block styles */
}
`;
}

/**
 * Main entry point.
 */
async function main() {
	console.log('');
	console.log(color.bold('  Rareview Starter Theme — Block Scaffolding'));
	console.log(color.dim('  ────────────────────────────────────'));
	console.log('');

	const themeConfig = await findThemeConfig();

	let slug, title, description, category, renderType;
	const rl = createInterface({ input: stdin, output: stdout });

	try {
		if (NAME_ARG) {
			slug = toSlug(NAME_ARG);
			title = toTitle(slug);
		} else {
			const nameInput = await rl.question('  Block name (kebab-case): ');
			if (!nameInput.trim()) {
				console.log(color.red('\n  Block name is required.\n'));
				exit(1);
			}
			slug = toSlug(nameInput);
			title = toTitle(slug);

			const titleInput = await rl.question(`  Block title: ${color.dim(`(${title})`)} `);
			title = titleInput.trim() || title;
		}

		const descInput = await rl.question(`  Block description: ${color.dim(`(${title})`)} `);
		description = descInput.trim() || title;

		const catAnswer = await rl.question(`  Category ${color.dim('(theme/media/text/design)')} ${color.dim('(theme)')} `);
		category = catAnswer.trim() || 'theme';

		const renderAnswer = await rl.question(`  Render type ${color.dim('(static/dynamic)')} ${color.dim('(dynamic)')} `);
		renderType = renderAnswer.trim() || 'dynamic';
	} finally {
		rl.close();
	}

	const config = {
		slug,
		title,
		description,
		category,
		renderType,
		themeSlug: themeConfig.slug,
		textdomain: themeConfig.textdomain,
	};

	// Create block directory
	const blockDir = resolve(themeConfig.themeDir, 'includes', 'blocks', slug);

	try {
		await mkdir(blockDir, { recursive: true });
	} catch (err) {
		console.log(color.red(`\n  Error creating directory: ${err.message}\n`));
		exit(1);
	}

	// Generate files
	console.log(color.bold('\n  Generating block files...\n'));

	const files = [
		{ name: 'block.json', content: generateBlockJson(config) },
		{ name: 'edit.js', content: generateEditJs(config) },
		{ name: 'index.js', content: generateIndexJs(config) },
		{ name: 'style.scss', content: generateStyleScss(config) },
	];

	if (renderType === 'dynamic') {
		files.push({ name: 'markup.php', content: generateMarkupPhp(config) });
	} else {
		files.push({ name: 'save.js', content: generateSaveJs(config) });
	}

	for (const file of files) {
		const filePath = resolve(blockDir, file.name);
		await writeFile(filePath, file.content, 'utf-8');
		console.log(`    ${color.green('✓')} includes/blocks/${slug}/${file.name}`);
	}

	console.log('');
	console.log(color.green(color.bold('  ✓ Block created!')));
	console.log(color.dim(`\n  Run \`npm run build\` to compile the new block.\n`));
}

main().catch((err) => {
	console.error(color.red(`\n  Error: ${err.message}\n`));
	exit(1);
});
