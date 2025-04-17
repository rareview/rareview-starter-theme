# Theme Development

Covers information regarding how to develop locally the theme.

You need to have installed your local development first. See [Local Development Setup](local-development-setup.md).

The base theme for this site is located in `wp-content/themes/rv-starter`. It is based on the [10Up Scaffold Theme](https://github.com/10up/wp-scaffold/tree/trunk/themes/10up-theme).

Make sure to run `npm install` from the `wp-content/themes/rv-starter` directory to install the theme dependencies.

All the command below can be run from the root of the project or from the `wp-content/themes/rv-starter` directory.

## Install new packages

To install new packages, use `npm install <package-name> <--save-dev>` to save the package to the `package.json` file.

## Run in dev mode

To start a watcher that will compile your assets as you make changes to them.

```sh
npm run start or npm run watch
```

To do one time build of the theme.

```sh
npm run build
```

## Linting

### Lint All

```sh
npm run lint
```

### Lint JS

```sh
npm run lint:js
```

### Lint JSON

```sh
npm run lint:json
```

### Lint CSS

```sh
npm run lint:css
```

### Lint PHP

```sh
npm run lint:php
```

## Formatting

### Format All

```sh
npm run format
```

### Format JS

```sh
npm run format:js
```

### Format JSON

```sh
npm run format:json
```

### Format CSS

```sh
npm run format:css
```

### Format PHP

```sh
npm run format:php
```

## Extra information

If you're building Gutenberg blocks and importing @wordpress/* packages, you do not need to manually install them as 10up-toolkit will handle these packages properly.

Compiling, minifying, bundling, etc. of JavaScript and CSS is all done by [10up Toolkit](https://github.com/10up/10up-toolkit).
