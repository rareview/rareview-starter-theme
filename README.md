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
After cloning, run the interactive setup script:

```bash
npm run setup
```

This handles all renaming, rebranding, and configuration automatically:
- Renames the theme directory, translation files, and all references
- Performs case-sensitive find-and-replace across all project files
- Updates Lando config, deploy scripts, and CI workflows
- Generates a project-specific `AGENTS.md` for AI-assisted development
- Optionally runs `npm install` and `lando start`

For CI or non-interactive use: `npm run setup -- --yes`
To preview changes: `npm run setup -- --dry-run`
___________________________________________________________

## Step 1: Local Environment Setup

See [Local Development Setup](.local/docs/local-development-setup.md) for details.

## Step 2: Theme Development

See [Theme Development](.local/docs/theme-development.md) for details.
