# Local Development Setup

## Requirements

- [Lando](https://lando.dev) Latest Release
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) For Mac and Windows only.
- PHP >= 8.2
- Node >= 20
- NPM >= 10

## Setup

- Add `rv-starter.local` to your `hosts` file.
- Run `npm install` to install root dependencies.
- Run `npm --prefix wp-content/themes/rv-starter install` to install theme dependencies.
- Run `npm run build` to build the theme.
- Simply run `lando start` to start the environment.
- if `wp-config.php` does not exist copy `wp-config.local.php` to `wp-config.php`.
- Login at [http://rv-starter.local](http://rv-starter.local) using `lando` and `password`.

## Lando

This project uses Lando to manage the local development environment. Lando is a free, open-source, cross-platform, local development environment and DevOps tool built on Docker container technology.

To start the environment, simply run `lando start` from the root of the project.

To stop the environment, simply run `lando poweroff` from the root of the project.

To destroy the environment, simply run `lando destroy` from the root of the project.

Lando will make the database available locally on port 3307 but also provide access through phpMyAdmin. The URL will be provided after the `Lando start` command.

## Theme Development

See [Theme Development](theme-development.md) for more information.

## Plugins

This project already includes several useful plugins for WordPress local development. These plugins are added via composer dev dependencies.

**If** plugins can be found at [WordPress Packagist](https://wpackagist.org/), they should be installed via "composer" and should be added to the `composer.json` file at the root of the repo and installed via `lando composer require` command.

Other can be directly committed to the repo in the `wp-content/plugins` directory and add the relevant .gitignore rules such as `!/wp-content/plugins/plugin-to-keep`.

Also make sure to activate the plugins in the `.local/bin/post-start.sh` and `bin/deploy.sh` files.

## Extra information

### Husky and Lint Staged

The PHP linting process will lint only the files that are staged for commit using Husky and Lint Staged.
