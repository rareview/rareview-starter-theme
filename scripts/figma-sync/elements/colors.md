# Colors Extractor Logic

Source: `scripts/figma-sync/elements/colors.mjs`

## What this element is trying to find

- dominant color palette,
- mono scale,
- optional semantic swatches (role-tagged) from palette frames.

## Detection Strategy

### Pass 1: curated swatch detection in scoped palette nodes

- Run only when scoped nodes are provided (e.g. from "Colors/Palette/Brand" frames).
- Candidate node types: rectangle/ellipse/frame/component/instance.
- Require:
  - solid fill color,
  - dimensions > 0 and <= 300,
  - swatch-like geometry (roughly square) OR semantic name OR hex-like name.
- Deduplicate by hex.
- Attach semantic role by name keyword (`primary`, `secondary`, `neutral`, `accent`, etc).
- Require at least 2 unique swatches; otherwise treat as insufficient.

### Pass 2: frequency-based global color mining

- Scan all node solid fills.
- Build `byHex` counts (usage frequency).
- Keep style name when fill style exists.

Then split:

- `mono`:
  - must be monochrome,
  - luminance bounded (exclude near-black/near-white extremes),
  - take the four highest-usage mono swatches (order follows global usage ranking).
- `colored`:
  - non-mono colors,
  - top ten by usage (same global usage ranking as `all`).

If curated swatches exist, attach them without replacing existing `colored/mono` outputs.

## Scoring / Ranking

- Swatch pass: rule-based acceptance + dedupe (not weighted score).
- Global pass: usage count frequency.
- `mono` and `colored` array order follows `usageCount` (most-used first).

## Tunable Parameters

- `SWATCH_MAX_DIM = 300`
- role keyword map
- hex-in-name regex
- mono luminance band (`0.02..0.98` currently).

## Recreate Prompt (for agent/human)

Extract colors using a dual approach: first attempt high-confidence swatch extraction inside palette-scoped frames, then always run a document-wide frequency pass over solid fills. For swatches, accept small color-carrying shapes with semantic/hex/squarish signals and assign optional semantic roles from names. For global colors, count by hex, derive mono vs colored buckets, order both lists by usage frequency, and preserve compatibility by returning `colored` and `mono` while optionally adding `swatches`.

## Downstream: `figma-apply` + `theme.json` palette

Extracted hex values (e.g. from `colors.mono.*`, `colors.colored.*`, or other Figma-driven fields) are often consumed by **`npm run figma-apply`** when CSV rows use **`scss_value_type` = `scss-color-match`** for SCSS variables such as **`$color-primary`**, **`$color-background`**, **`$color-body`**, etc.

For **`variables.scss`** only, that type now means:

- **Exact** match to a `theme.json` palette `color` → emit **`$color-<slug>`**.
- Otherwise → emit **literal hex** and log a fallback line (see **`README.md`** in this folder for the full policy).

Keeping **`theme.json`** palette entries aligned with real brand hexes makes SCSS stay on **`$color-*`** references instead of literals.
