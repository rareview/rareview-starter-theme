# Theme Development

## Requirements

- PHP >= 8.2
- Composer
- Node >= 20
- NPM >= 10

## Setup

From the theme directory `wp-content/themes/rv-starter`:

1. Run `composer install` to install PHP tools and autoload (`vendor/`).
2. Run `npm install` to install JS/CSS dependencies (`node_modules/`).
3. Build assets with one of:
	- `npm run dev` - Watch and rebuild as you work.
	- `npm run watch` - Watch and rebuild with browser sync workflow.
	- `npm run build` - One-off production build (`dist/`).

## NPM Scripts

- `npm run start` - Dev server with HMR (port 5000)
- `npm run build` - Production build
- `npm run watch` - Watch mode without HMR
- `npm run lint` - Lint all (JS, CSS, PHP)
- `npm run format` - Format all (JS, CSS, PHP)
- `npm run create-block -- --name="name"` - Scaffold a block
- `npm run design-system` - Update design tokens

## Build System

Uses [10up Toolkit](https://github.com/10up/10up-toolkit) (Webpack-based).

Entry points are configured in the theme `package.json` under `10up-toolkit.entry`.
Block assets are auto-discovered from `includes/blocks/*/block.json`.

## Plugins

This project includes useful local development plugins via root composer dev dependencies.

If a plugin exists on [WordPress Packagist](https://wpackagist.org/), add it to root `composer.json` and install with `lando composer require`.

If it is not on WordPress Packagist, commit it directly to `wp-content/plugins` and update `.gitignore` rules (for example, `!/wp-content/plugins/plugin-to-keep`).

Also activate required plugins in `.local/bin/post-start.sh` and `bin/deploy.sh`.

## Linting and Hooks

- PHP uses 10up-Default PHPCS rules.
- JS uses `@10up/eslint-config/wordpress`.
- CSS uses `stylelint-config-standard-scss`.
- JSON uses Prettier.

Pre-commit hooks (Husky + lint-staged) lint only staged files.

## More Information

For local Docker/Lando environment setup and first-time bootstrapping, see [Local Development Setup](local-development-setup.md).
