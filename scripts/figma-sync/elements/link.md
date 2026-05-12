# Link Extractor Logic

Source: `scripts/figma-sync/elements/link.mjs`

## What this element is trying to find

Primary link style tokens:

- color
- letter spacing
- font weight
- text decoration
- hover color/decoration (when variant exists)

## Detection Logic

### Base link style

- Scan `TEXT` nodes that have shared text style IDs.
- Resolve style names and keep only styles whose name contains `link`.
- Build typography key per node and frequency-count each key.
- Select the most frequent key as the canonical link style.
- Extract style/token fields from representative node.

### Hover style

- Search `COMPONENT_SET` names containing `link`.
- Find child variant with `hover` in name.
- Read first text node in hover variant and extract:
  - hover color,
  - hover text decoration.

## Scoring / Ranking

- Core ranking is frequency of equivalent typography signature (style-key count).
- Hover extraction is deterministic first-match variant discovery.

## Tunable Parameters

- regex for identifying link text styles (`/link/i`)
- regex for hover variant naming (`/hover/i`)

## Recreate Prompt (for agent/human)

Extract link tokens by selecting the dominant shared text style whose style name includes "link". Count typography signatures across link-styled text nodes and use the most frequent signature as canonical. Then enrich with hover tokens by locating a link component set and reading the text style from its hover variant. Return base typography/color plus hover color and hover decoration when available.
