# Blocks

## Creating Blocks

### Using the CLI (recommended)

```bash
npm run create-block -- --name="hero-banner"
```

This generates:

```
includes/blocks/hero-banner/
├── block.json       # Block metadata
├── edit.js          # Editor component
├── index.js         # Block registration
├── markup.php       # Server-side render (dynamic blocks)
└── style.scss       # Block styles
```

### Manual creation

Create files in `includes/blocks/{block-name}/` following the conventions below.

## Block Conventions

### block.json

```json
{
  "$schema": "https://schemas.wp.org/trunk/block.json",
  "apiVersion": 3,
  "title": "Block Title",
  "description": "Block description",
  "textdomain": "rv-starter-theme",
  "name": "rv-starter/block-name",
  "icon": "block-default",
  "category": "theme",
  "keywords": ["relevant", "search", "terms"],
  "supports": {
    "align": true,
    "anchor": true,
    "customClassName": true,
    "html": false
  }
}
```

Key fields:
- `apiVersion`: Use `3` for new blocks
- `name`: `{theme-slug}/{block-slug}`
- `textdomain`: Must match theme text domain
- `keywords`: Help users find the block in the inserter
- `supports.html`: Set `false` to prevent HTML editing mode

### Dynamic vs Static Blocks

**Dynamic blocks** (recommended) render on the server:
- Include `"render": "file:./markup.php"` in block.json
- Save function returns `null`
- Content always reflects current data

**Static blocks** save HTML to the database:
- Include a `save.js` component
- Content is fixed at save time

### Block Styles

Block styles go in `style.scss` within the block directory. Use the auto-generated wrapper class:

```scss
.wp-block-{theme-slug}-{block-name} {
    // styles
}
```

## Block Patterns

Block patterns live in `patterns/` directory. Each pattern is a PHP file:

```php
<?php
/**
 * Title: Pattern Name
 * Slug: rv-starter/pattern-name
 * Categories: rv-starter
 */
?>
<!-- wp:group -->
<!-- Block markup here -->
<!-- /wp:group -->
```

## Asset Loading

Blocks are auto-discovered from `dist/blocks/*/block.json` during build. Block scripts are conditionally dequeued on pages that don't use the block (see `assets_cleanup()` in `core.php`).
