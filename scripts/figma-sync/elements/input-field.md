# Input Field Extractor Logic

Source: `scripts/figma-sync/elements/input-field.mjs`

## What this element is trying to find

Input field metrics:

- border width
- height
- border radius

## Shared rules (all passes + heuristic)

Sizing and eligibility are **centralized** so scoped, named, and heuristic paths stay consistent (aligned with **`button.mjs`** structural caps where noted).

### Size band (same max as button heuristic)

- **Max height** `INPUT_MAX_HEIGHT` = **80** px — same as `BUTTON_MAX_HEIGHT` in `button.mjs`.
- **Max width** `INPUT_MAX_WIDTH` = **500** px — same as `BUTTON_MAX_WIDTH` in `button.mjs`.
- **Min height** `INPUT_MIN_HEIGHT` = **32** px — excludes tiny controls (e.g. 16 px arrow icons inside buttons).
- **Min width** `INPUT_MIN_WIDTH` = **80** px — excludes narrow icon strips.

Only **`FRAME`**, **`RECTANGLE`**, and **`INSTANCE`** nodes are considered.

### Decorative / icon exclusion

Layer names matching **`DECORATIVE_NAME_RE`** (substring, case-insensitive) are **never** counted: `arrow`, `icon`, `chevron`, `caret`, `glyph`, `sprite`.  
Extend that regex in code if new false-positive patterns appear (e.g. `spinner`).

### Text / content signal (scoped + heuristic)

**Scoped pass** (`requireName === false`) and the **structural heuristic** require a descendant **`TEXT`** node that passes **`hasInputStyleTextChild`**:

- placeholder-like copy (`PLACEHOLDER_RE`), or
- opacity `< 0.7` (hint / muted label), or
- at least **two** non-whitespace characters (real field copy during design).

Single-character text only counts if it matches the placeholder regex or uses low opacity — avoids lone icon glyphs.

**Named pass** (`requireName === true`) still keys off **`INPUT_NAME_RE`** on the node name **plus** the same sizing and decorative filters, but **does not** require the text-child signal (so real components named `Input / Default` without nested text in the same node still work).

## Detection Order

### 1) Scoped pass (highest confidence)

- Nodes are descendants of keyword-matched input/form frames (see `getScopedNodes` in `lib/node-utils.mjs`).
- Uses **`isBaseInputFieldCandidate(node, false)`**: sizing band, not decorative, **and** `hasInputStyleTextChild`.
- Then frequency aggregation for border width (with stroke range), height, radius — same sub-extractors as pass 2.

### 2) Full-document named pass

- Same sub-extractors with **`isBaseInputFieldCandidate(node, true)`**: sizing band, not decorative, **and** name matches `INPUT_NAME_RE`.

### 3) Structural heuristic fallback

- No input keyword in name required.
- Requires: sizing band, not decorative, valid stroke band, **`hasInputStyleTextChild`**, and **`isBaseInputFieldCandidate(node, false)`** (text signal already inside that predicate — combined with stroke checks in the heuristic loop).

## Scoring / Ranking

- Pure frequency model: most common value per property wins among **eligible** nodes only.

## Tunable Parameters

- `INPUT_MIN_HEIGHT` / `INPUT_MIN_WIDTH` — raise to be stricter on icons; lower only if legitimate fields are excluded.
- `INPUT_MAX_HEIGHT` / `INPUT_MAX_WIDTH` — keep aligned with `button.mjs` unless there is a deliberate reason to diverge.
- `INPUT_STROKE_MIN` / `INPUT_STROKE_MAX`
- `PLACEHOLDER_RE` and `DECORATIVE_NAME_RE`

## Recreate Prompt (for agent/human)

Extract input metrics in three passes: scoped descendants of input frames, then document-wide nodes whose names look like inputs, then a structural fallback. For every pass, only count `FRAME`/`RECTANGLE`/`INSTANCE` nodes whose bounding box sits between shared min/max width and height (aligned with button max caps), whose names are not icon-like (`arrow`, `icon`, `chevron`, etc.), and whose stroke weight is in the thin-border range when measuring borders. Scoped and heuristic passes additionally require a text descendant that looks like field content (placeholder, muted opacity, or multi-character copy); the named pass relies on input-like layer names plus sizing and decor filters only. Rank border width, height, and radius by frequency among eligible nodes.
