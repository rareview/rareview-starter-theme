# RV Starter Theme

## Step 0: Initial Project Setup

First, create a new repository from one of the options below and clone it to your local machine:
- For a **WP VIP** project, use https://github.com/rareview/wp-vip-starter as a template.<br>
- For a **WPEngine** project, use https://github.com/rareview/wpe-starter as a template.<br>
- For an platform-independent WP project, you can use this repo as a template (Lando-based).
- Clone a newly created repo to your local machine.
  <br><br><img src="https://docs.github.com/assets/cb-76823/mw-1440/images/help/repository/use-this-template-button.webp" width="400">

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

**IMPORTANT**: Delete the **Step 0** section from this README.md file after you are done with the project setup.
___________________________________________________________

## Step 1: Local Environment Setup

See [Local Development Setup](.local/docs/local-development-setup.md) for details.

## Step 2: Theme Development

See [Theme Development](.local/docs/theme-development.md) for details.
