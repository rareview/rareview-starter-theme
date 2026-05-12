# Rareview Starter Theme

## Overview
WordPress starter theme built on 10up Toolkit. PHP 8.2+, Node 20+.

## Architecture
- Service Provider pattern: App.php -> ServiceProviders -> Services
- PSR-4 autoloading: `RVStarterTheme\` -> `includes/classes/`
- Namespaced functions in includes/ (core.php, blocks.php, helpers.php, etc.)
- Hook callbacks use namespace helper: `$n = static function($f) { return __NAMESPACE__ . "\\$f"; };`

## Commands
- `npm run start` - dev server with HMR (port 5000)
- `npm run build` - production build
- `npm run lint` / `npm run format` - lint and format all (JS, CSS, PHP)
- `npm run setup` - interactive project setup (rename, rebrand)
- `npm run create-block -- --name="name"` - scaffold new block
- `npm run design-system` - update design tokens interactively
- `npm run figma-sync` - Figma fetch/export + apply (see `scripts/figma-sync/README.md`)
- `npm run figma-apply` - apply `generated/figma-export.json` + CSV only (`scripts/figma-sync/figma-apply.mjs`)
- `lando start` / `lando poweroff` - local environment

## Coding Standards
- Indentation: tabs (not spaces)
- Quotes: single quotes (JS and PHP)
- CSS class naming: `rv-{component}__{element}` (BEM-adjacent)
- PHP: 10up-Default PHPCS rules, PHP 8.2+ with type hints
- JS: @10up/eslint-config/wordpress, no jQuery on frontend
- SCSS: stylelint-config-standard-scss

## File Conventions
- Blocks: `includes/blocks/{name}/` (block.json, markup.php, edit.js, style.scss)
- Styles: `assets/css/components/{name}.scss` -> import in frontend.scss
- JS features: `assets/js/frontend/features/{name}.js` -> import in frontend.js
- Templates: `templates/page-{name}.php`
- Classes: `includes/classes/` (PSR-4, namespace RVStarterTheme)

## Design System
- Source of truth: `theme.json` (colors, fonts, sizes)
- SCSS variables: `assets/css/abstracts/variables/variables.scss` (references theme.json CSS custom properties)
- Fluid typography: clamp() in SCSS + JS engine in `assets/js/shared/fluid/`
- Breakpoints: 500 / 781 / 1024 / 1440 / 1600 / 1920px
- Run `npm run design-system` to update design tokens interactively

## Key Patterns
- Asset loading: `Utility\get_asset_info()` reads .asset.php manifests for dependencies/version
- Blocks: auto-discovered from `dist/blocks/*/block.json`
- REST API namespace: `rv-starter/v1`
- Conditional asset loading: jQuery dequeued unless Gravity Forms present
- Template tags: pure functions only (no side effects, no hooks)

## Theme Directory
`wp-content/themes/rv-starter/`

## Repo CLI scripts
Entrypoints live beside their feature folder: `scripts/setup/setup.mjs`, `scripts/design-system/design-system.mjs`, `scripts/create-block/create-block.mjs`, `scripts/figma-sync/figma-sync.mjs` (see root `package.json` and `wp-content/themes/rv-starter/package.json` where applicable).
