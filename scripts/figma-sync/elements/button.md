# Button Extractor Logic

Source: `scripts/figma-sync/elements/button.mjs`

## What this element is trying to find

Primary and secondary button tokens (background, border, radius, spacing, text style, font color).

## Detection Strategy

### Pre-pass: build component maps

- Scan all `COMPONENT_SET` nodes with "button" in name.
- Record valid button variant component IDs (skip hover/pressed/disabled states).
- Cache variant text color and corner radius for fallback when scanning instances.

### Main pass: frequency-based candidates

- Search `FRAME` and `INSTANCE` nodes.
- Keep nodes that look like buttons by name or by componentId membership.
- Require visible solid background and reject bright/non-button backgrounds
  using luminance threshold.
- Fingerprint candidates by:
  - background,
  - radius,
  - padding,
  - font size/weight.
- Route to pools:
  - primary pool (name says primary),
  - secondary pool (name says secondary),
  - general pool.
- Weight instances higher (`2x`) than plain frames (`1x`).

### Resolution

- Prefer best explicit primary + best explicit secondary if both exist.
- Otherwise backfill from general pool with distinct fingerprints/colors.
- Return max 2 candidates.

### Last-resort structural heuristic

- Find frame/instance nodes with:
  - constrained size (`height <= 80`, `width <= 500`),
  - dark-enough solid fill,
  - padding,
  - short centered text.
- Count by fingerprint, return top distinct colors.

### Primary ordering tie-break

- If link color exists, sort two button candidates by hue distance to link color.
- Closest hue becomes index `0` (primary).

## Scoring / Ranking

- frequency count by fingerprint, with instance weight boost.
- luminance filter as confidence gate.
- optional hue-distance ranking against link color.

## Tunable Parameters

- `BUTTON_MAX_LUMINANCE = 0.72`
- `BUTTON_MAX_HEIGHT = 80`
- `BUTTON_MAX_WIDTH = 500`
- regexes:
  - primary/secondary naming,
  - skip state naming,
  - label node naming.

## Recreate Prompt (for agent/human)

Extract up to two button variants by first indexing button component sets, then scanning frame/instance nodes for button-like candidates. Build candidate fingerprints from visual+typographic traits, count frequency with extra weight for instances, and prefer explicit primary/secondary naming when present. If naming is weak, recover candidates from structural constraints (size, padding, centered short label, non-bright fill). If a link color is known, order the two variants by hue proximity so the brand-like one becomes primary.

## Downstream: `figma-apply` — button font colors

In `variable_mapping_figma_sync.csv`, **`buttons.0.fontColor`** / **`buttons.1.fontColor`** map to SCSS targets **`button-primary-font-color`** and **`button-secondary-font-color`** with **`scss_value_type` = `scss-color-match`**.

When apply runs, those rows use the **exact palette match or literal hex** policy for **`variables.scss`** (see this folder’s **`README.md`**). If Figma’s label hex is not identical to any `theme.json` palette swatch after normalization, SCSS will contain the **hex** until you add or adjust a palette entry to match.
