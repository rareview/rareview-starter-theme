#!/usr/bin/env bash
set -e

composer install --prefer-dist --optimize-autoloader
composer install --prefer-dist --optimize-autoloader --working-dir=wp-content/themes/rv-starter

if [ ! -f "./wp-config.php" ]; then
	cp wp-config.local.php wp-config.php
fi

if [ ! -d "./wp-admin" ]; then
	wp core download --skip-content
fi
