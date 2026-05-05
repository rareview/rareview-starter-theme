# Design System

## Source of Truth

The design system uses two synchronized files:

1. **`theme.json`** — WordPress block editor settings (colors, fonts, sizes, layout)
2. **`assets/css/abstracts/variables/variables.scss`** — SCSS variables that reference theme.json CSS custom properties

### How the sync works

WordPress generates CSS custom properties from `theme.json`. SCSS variables reference these properties:

```scss
// variables.scss references theme.json via CSS custom properties
$body-font-family: var(--wp--preset--font-family--geist-mono);
$color-black: var(--wp--preset--color--black);
$heading-1-font-size-desktop: var(--wp--custom--font-size--desktop--heading-1);
```

This means colors and font sizes only need to be updated in `theme.json` — the SCSS variables automatically pick up the changes.

**SCSS-only values** (breakpoints, container padding, border radius, semantic color mappings) are maintained in `variables.scss`.

## Design System CLI

Use the CLI to update both files at once:

```bash
# Interactive mode — prompts for all tokens
npm run design-system

# Import from JSON file
npm run design-system -- --import tokens.json

# Preview changes without modifying files
npm run design-system -- --dry-run
```

### Import JSON format

```json
{
  "colors": {
    "primary": { "name": "Brand Color 1", "slug": "brand-1", "color": "#00b0be" },
    "secondary": { "name": "Brand Color 2", "slug": "brand-2", "color": "#ffcb2f" }
  },
  "typography": {
    "fontFamily": "Inter, sans-serif",
    "fontFamilySecondary": "Merriweather, serif"
  },
  "fontSize": {
    "mobile": { "heading1": "52px", "bodyMedium": "14px" },
    "desktop": { "heading1": "96px", "bodyMedium": "18px" }
  },
  "layout": { "contentSize": "1280px" },
  "breakpoints": { "mobile": "500px", "tablet": "781px", "desktop": "1024px" }
}
```

## Color System

### Palette Colors (theme.json)

Defined in `theme.json` under `settings.color.palette`. Available in the block editor color picker.

### Semantic Colors (variables.scss)

Map theme roles to palette colors:

```scss
$color-primary: $color-brand-1;
$color-secondary: $color-brand-2;
$link-color: $color-brand-1;
$color-background: $color-black;
$color-body: $color-white;
```

## Typography

### Fluid Typography

The theme uses a custom fluid typography engine (`assets/js/shared/fluid/`) that generates intermediate sizes between mobile and desktop breakpoints using CSS `clamp()`.

### Font Sizes

Defined in `theme.json` under `settings.custom.font-size` with mobile and desktop values:

- Headings: H1–H6
- Body: Small, Medium, Large

SCSS variables are available for all sizes across three breakpoints: mobile, tablet (fluid), desktop.

## Breakpoints

```scss
$breakpoint-mobile: 500px;
$breakpoint-tablet: 781px;
$breakpoint-desktop: 1024px;
$breakpoint-desktop-large: 1440px;
$breakpoint-desktop-x-large: 1600px;
$breakpoint-desktop-xx-large: 1920px;
```

## Scrollbar Width

The theme detects scrollbar width via JS and sets `--scrollbar-width` CSS custom property. Use `$scrollbar-width` in SCSS for `100vw` containers that need scrollbar compensation.
