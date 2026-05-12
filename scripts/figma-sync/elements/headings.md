# Headings Extractor Logic

Source: `scripts/figma-sync/elements/headings.mjs`

## What this element is trying to find

Desktop and mobile heading styles (`H1`..`H6`) with typography properties.

## Detection Order (confidence ladder)

### Pass 1 (highest confidence): shared text style name

- For each `TEXT` node, resolve style name via style registry.
- Match strict or extended heading patterns:
  - strict: `H1..H6`,
  - extended: `Heading 1`, `Title 2`, `Display 3`, `Headline 4`.

### Pass 2: layer name

- If style name is not heading-like, inspect layer name with same patterns.

### Pass 3: annotation text inside typography containers

- Identify containers named like `typography`, `style guide`, `foundations`, `ui kit`.
- Inside those containers, allow short text content (`<= 15 chars`) like `H1` or `Heading 2`
  to define heading slots.

### Fallback heuristic (only if passes above find nothing)

- Estimate body baseline size (dominant char volume).
- Keep text nodes:
  - font size >= `1.2 * body`,
  - characters <= 120,
  - not UI/decorative names.
- Group by font size separately for desktop/mobile context.
- Rank sizes descending -> assign H1..H6.

## Scoring / Ranking

- Targeted passes are deterministic by regex + sloting.
- Heuristic pass score per node:
  - `brevityScore` (shorter text preferred) weight `0.6`,
  - `sizeScore` (larger vs body preferred) weight `0.4`.
- Representative node for each size is upgraded when score improves.
- Final candidate per slot prefers dominant font family across all slots.

## Guardrails

- Skip UI labels (`button`, `input`, `chip`, `tooltip`, etc) unless style name explicitly says heading.
- Deduplicate candidates in same slot by `(fontFamily, fontSize)`.
- Sort final arrays by heading level ascending (`H1 -> H6`).

## Tunable Parameters

- typography container regex
- `MOBILE_RE` context detection
- heuristic thresholds:
  - min ratio `1.2`,
  - max chars `120`,
  - scoring weights `0.6 / 0.4`.

## Recreate Prompt (for agent/human)

Extract heading styles with a strict priority chain: text-style names first, then layer names, then short annotation text inside typography-style containers. Map matches to heading levels 1-6 and split desktop/mobile based on mobile keywords. If no named signals exist, infer heading hierarchy statistically: find non-UI text significantly larger than body baseline, group by font size, rank largest sizes to H1-H6, and pick best representative by combined shortness and size score. Prefer dominant font family when selecting final candidates per slot.
