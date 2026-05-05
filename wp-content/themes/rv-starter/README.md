# Rareview Starter Theme

## Intro

Welcome to the Rareview Starter Theme, based on the [10Up Scaffold Theme](https://github.com/10up/wp-scaffold/tree/trunk/themes/10up-theme),
a best base for high-end WordPress builds.

Compiling, minifying, and bundling JS/CSS is handled by [10up Toolkit](https://github.com/10up/10up-toolkit).

For Docker, Lando, hosts file, and other project-wide local setup, see the root [`README.md`](../../../README.md).

## Requirements
1. PHP 8.2+
2. Composer
3. Node.js (current LTS)


## Setup

After cloning or copying this theme, install dependencies **from the theme directory** (`wp-content/themes/rv-starter`):

1. Run **`composer install`** to install PHP tools and autoload. (`vendor/`)
2. Run **`npm install`** to install JS/CSS dependencies (`node_modules/`)
3. Choose one of the options to build assets (`dist/`)
   1. **`npm run dev`** — Just watch for changes and rebuild as you work.
   2. **`npm run watch`** — Watch for changes and rebuild as you work, with changes automatically reflecting in the browser (also called hot reload, browser sync etc.).
   3. **`npm run build`** — For one-off build. This is how the assets will be built on the server on deployment.

## Linting

```bash
npm run lint        # all
npm run lint:js
npm run lint:json
npm run lint:css
npm run lint:php
```

## Formatting

```bash
npm run format      # all
npm run format:js
npm run format:json
npm run format:css
npm run format:php
```

## Global design variables

This starter theme is not FSE theme, but it is a Gutenberg / block editor theme, therefore it leverages the theme.json file to keep it compatible with the block editor.

It uses SCSS variables in the code, but the values and options that suppose to be compatible with the block editor are defined in the `theme.json` first, and the SCSS variables then reference those theme.json values.

Use this variable-mapping spreadsheet to align globals with your design source (e.g. Figma):
https://docs.google.com/spreadsheets/d/1zmItLvX_qZ0Lz713tzVgxnR9WjOd1fWdckj7hA8aM_E/edit?usp=sharing

It covers layout, typography scales, headings, color palette, breakpoints, and more. Driving global styles from these tokens helps Gutenberg compatibility, fluid responsiveness, and related features work smoothly.

## Blocks and `@wordpress/*` packages

If you build Gutenberg blocks and import `@wordpress/*` packages, you do not need to install those manually—10up-toolkit wires them in for this workflow.
