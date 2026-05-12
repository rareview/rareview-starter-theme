# Layout Extractor Logic

Source: `scripts/figma-sync/elements/layout.mjs`

## What this element is trying to find

- container width
- button border radius (assembled from other extractor outputs)

## Detection Logic

### Container width (`extractContainerWidth`)

- Scan only `FRAME` nodes.
- Read absolute width, round to integer.
- Keep widths in plausible content range `[900..1440]`.
- Count frequency per width.
- Choose most frequent width as container width.

### Layout object (`buildLayout`)

- Build result object only when at least one signal exists.
- Include `containerWidth` and/or `buttonBorderRadius`.

## Scoring / Ranking

- single-frequency winner model for width.
- no probabilistic score; deterministic count sort.

## Tunable Parameters

- allowed width range (`900..1440`).

## Recreate Prompt (for agent/human)

Infer layout container width by scanning frame widths, filtering to realistic desktop content widths, and choosing the most frequent rounded value. Build a compact layout object that includes container width and button border radius only when available.
