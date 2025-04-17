#!/usr/bin/env bash
set -e

# If WordPress is not installed, run the installation.
if ! $(wp core is-installed); then
	wp core install --url=rv-starter.local --title="RV Starter" --admin_user=lando --admin_password=password --admin_email=lando@rv-starter.local --skip-email
else
	wp core update
fi

# Activate theme
wp theme activate rv-starter

# Activate dev plugins
wp plugin activate debug-bar query-monitor

# Activate plugins
wp plugin activate wordpress-seo

wp rewrite structure '/%postname%/'
wp rewrite flush
