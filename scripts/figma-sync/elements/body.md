# Body Extractor Logic

Source: `scripts/figma-sync/elements/body.mjs`

## What this element is trying to find

- dominant body typography (`fontFamilyPrimary`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, text color),
- paragraph size triplets (desktop/mobile small-medium-large),
- body background color.

## Detection Logic

### 1) Body typography (`extractBody`)

- Search only `TEXT` nodes with `style.fontFamily`.
- Exclude heading-like text by checking heading regex on:
  - shared text style name, and
  - layer name.
- Prefer paragraph-like rows:
  - text length >= 20 chars,
  - not named like UI chrome (`button`, `badge`, `input`, `nav`, etc).
- If no paragraph-like rows exist, fall back to all non-heading text.

### 2) Dominant style selection

- **Font family score**: sum character count per font family; highest total wins.
- **Font size score**: sum character count per font size; highest total wins.
- Pick a representative node from dominant size (longest text at that size).
- Extract remaining metrics from representative node.

This is a weighted frequency model where text length acts as confidence.

### 3) Paragraph sizes (`extractParagraphSizes`)

- First, search within frames/sections named roughly `typography`, `body`, `paragraph`.
- Classify text entries into slots by label:
  - context: desktop/mobile,
  - size: small/medium/large.
- Prefer candidates using dominant font family.
- If explicit 6-slot set (desktop + mobile x 3) is missing:
  - synthesize values from body baseline using defaults/deltas.
- Normalize each triplet to strictly ascending sizes.

### 4) Background (`extractBodyBackgroundColor`)

- Search `FRAME`, `SECTION`, `RECTANGLE`.
- Ignore UI/decorative names (`button`, `card`, `icon`, `text`, etc).
- Candidate if:
  - width below **2000** px (`width >= 2000` excluded — full-file pasteboard mats), and
  - explicitly named as background (`background`, `page`, `canvas`, ...), or
  - very large surface (>= 900 x 400).
- Score each color by area, with explicit names weighted 4x.
- Pick highest score.
- Fallback: darkest mono color from extracted palette.

## Scoring / Ranking Model

- **Body text**: character-volume weighted frequency.
- **Paragraph slots**: slot assignment + dominant font preference.
- **Background color**: `score += area * (isExplicit ? 4 : 1)`.

## Tunable Thresholds

- `BODY_MIN_CHARS = 20`
- paragraph synthesis defaults (`18/14`, deltas, `GAP=2`)
- background max width (`2000` — `width >= 2000` excluded)
- background large-surface threshold (`900 x 400`)
- explicit background weight multiplier (`4`)

## Recreate Prompt (for agent/human)

Implement body extraction with three outputs: dominant body typography, paragraph size triplets, and body background. Use text-length weighted frequency to choose primary font and size from non-heading text. Prefer paragraph-like text (>=20 chars, not UI labels). For paragraph scales, first read explicitly labeled small/medium/large from typography/body frames, then synthesize missing slots from body baseline and normalize to ascending sizes. For background, scan large or explicitly named background surfaces under 2000px wide, score by area with 4x weight for explicit naming, and choose top-scored fill color; fallback to darkest mono palette color.

## Downstream: `figma-apply` — body text color

CSV maps **`body.color`** to **`$color-body`** with **`scss_value_type` = `scss-color-match`**. The same **exact palette match or literal hex** rules as other `scss-color-match` SCSS rows apply (see **`README.md`** in this folder). Align **`theme.json`** palette swatches with the real body text hex if you want `$color-body` instead of a raw hex in `variables.scss`.

## Downstream: `figma-apply` — background color (`$color-background`)

The export JSON places page background at **`body.backgroundColor`** (nested under `body`). In **`variable_mapping_figma_sync.csv`**, the **`figma_path`** for background must be **`body.backgroundColor`**.

`figma-apply.mjs` resolves `figma_path` with simple dot notation on `generated/figma-export.json` only. A legacy path like **`bodyBackgroundColor`** (top-level) does **not** exist on the export object, so apply never sees the Figma hex and **`$color-background`** stays on the CSV default (e.g. `$color-black`). `variable-mapping.mjs` accepts both spellings for keyed extraction, but apply does not — keep the CSV aligned with the export shape.
