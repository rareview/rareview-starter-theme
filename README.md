# RV Starter Theme

Get up and running with a high-end WordPress projects in no time!
- Based on 10up Scaffold Theme
- Follows WP VIP coding standards and best practices
- Latest PHP without fancy templating languages
- Support for fast global styles setup
	- 130+ variables covering the global styles
	- AI support for setting up the variables
	- Gutenberg compatibility out of the box
	- Fluid responsiveness out of the box
	- Frontend and block editor looks the same
- Mindful about SEO and accessibility
- WP VIP and WPE platforms supported
- Translation-ready
- And many more!

## Requirements

- PHP >= 8.2
- Node >= 20
- NPM >= 10
- [Lando](https://lando.dev) v3.25.6+ (recommended)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Mac/Windows)

## Initial Project Setup

First, create a new repository from one of the options below and clone it to your local machine:
- For **WP VIP** projects, use [wp-vip-starter](https://github.com/rareview/wp-vip-starter) repo **as a template**.<br>
- For **WPEngine** projects, use [wpe-starter](https://github.com/rareview/wpe-starter) repo as a template.<br>
- For platform-independent WP projects, you can use this repo **as a template** (Lando-based).
- Clone a newly created repo to your local machine.
  <br><br><img src="https://docs.github.com/assets/cb-76823/mw-1440/images/help/repository/use-this-template-button.webp" width="400">

## Renaming placeholders

After cloning, there's a bit of manual work to do:

- Rename `wp-content/themes/rv-starter` to `wp-content/themes/your-project`
- Rename `wp-content/themes/rv-starter/languages/RVStarterTheme.pot` to `wp-content/themes/rv-starter/languages/YourProjectTheme.pot`
- Replace all instances of:
	- `rv-starter` -> `your-project`
	- `RV Starter` -> `Your Project`
	- `RVStarter` -> `YourProject`
	- `RV_STARTER` -> `YOUR_PROJECT`
	- `rv_starter` -> `your_project`
	- `TBD`
	- `WEBSITE_NAME`
	- `WEBSITE_URL`

## Local environment setup

1. Add `rv-starter.local` to your hosts file.
2. Run `npm install` in the project root.
3. Run `npm --prefix wp-content/themes/rv-starter install`.
4. Start services with `lando start`.
5. If `wp-config.php` does not exist, copy `wp-config.local.php` to `wp-config.php`.
6. Build assets with `npm run build`.
7. Log in at [http://rv-starter.local](http://rv-starter.local) using:
	- username: `lando`
	- password: `password`

## Theme development

Theme-specific setup, build scripts, linting, formatting, and conventions are documented in:

- [`wp-content/themes/rv-starter/README.md`](wp-content/themes/rv-starter/README.md)
