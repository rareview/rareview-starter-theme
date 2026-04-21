# Development

## Prerequisites

- Node >= 20, NPM >= 10
- PHP >= 8.2
- [Lando](https://lando.dev) (latest)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Mac/Windows)

## Quick Start

```bash
# 1. Set up the project (interactive — renames, rebrands everything)
npm run setup

# 2. Install dependencies
npm install
npm --prefix wp-content/themes/{your-theme} install

# 3. Build the theme
npm run build

# 4. Start the local environment
lando start

# 5. Visit your local site
open http://{your-slug}.local
```

Login: `lando` / `password`

## NPM Scripts

| Command | Description |
|---------|-------------|
| `npm run start` | Dev server with HMR (port 5000) |
| `npm run build` | Production build |
| `npm run watch` | Watch mode without HMR |
| `npm run lint` | Lint all (JS, CSS, PHP) |
| `npm run format` | Format all (JS, CSS, PHP) |
| `npm run setup` | Interactive project setup |
| `npm run design-system` | Update design tokens |
| `npm run create-block -- --name="name"` | Scaffold new block |

## Lando Commands

```bash
lando start        # Start the environment
lando poweroff     # Stop the environment
lando destroy      # Remove the environment
lando composer     # Run composer commands
lando wp           # Run WP-CLI commands
```

Database is available on port 3307. phpMyAdmin URL is shown after `lando start`.

## Build System

Uses [10up Toolkit](https://github.com/10up/10up-toolkit) (Webpack-based).

Entry points are defined in the theme's `package.json` under `10up-toolkit.entry`:

- `frontend` — front-end JS and CSS
- `admin` — admin-only styles and scripts
- `shared` — code shared between front-end and admin
- `editor-content-overrides` — styles for block/content rendering inside the editor iframe
- `editor-ui-overrides` — styles for editor UI outside the content iframe
- `styleguide` — styleguide page assets
- `core-block-overrides` — core block modifications

Block assets are auto-discovered from `includes/blocks/*/block.json`.

## Linting

- **PHP**: 10up-Default PHPCS rules via `composer lint` / `composer format`
- **JS**: @10up/eslint-config/wordpress
- **CSS**: stylelint-config-standard-scss
- **JSON**: Prettier

Pre-commit hooks (Husky + lint-staged) lint only staged files.

## Performance Debugging

Add `?debug_perf=1` to any page URL to enable [ct.css](https://csswizardry.com/ct/) — a diagnostic stylesheet that highlights render-blocking resources.

## Asset Cleanup

The theme conditionally dequeues unused assets:
- jQuery is removed unless Gravity Forms is present
- Block scripts are dequeued on pages that don't use the block
