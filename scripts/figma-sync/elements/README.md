# Figma Sync Element Logic Docs

These Markdown notes sit next to the matching `*.mjs` extractors in this folder. They describe how each extractor works and how values flow into **`npm run figma-apply`** (`scripts/figma-sync/figma-apply.mjs` + `scripts/figma-sync/variable_mapping_figma_sync.csv`). **Agents:** when you edit an extractor `.mjs`, update its paired `.md` — see [`../AI.md`](../AI.md).

Each document is structured so it can be used both as:

- human-readable implementation notes, and
- a prompt-like spec to recreate the logic consistently.

## Files

- `body.md`
- `headings.md`
- `button.md`
- `input-field.md`
- `colors.md`
- `link.md`
- `layout.md`

## Non-production Figma pages (filtered before extract)

`build-export.mjs` walks the file with **`walkProductionDocument`** (`lib/node-utils.mjs`): top-level **pages** (`CANVAS` nodes under the document) whose names match **`shouldExcludePage`** are **skipped entirely** (not visited, so no descendants are extracted).

- Names are compared as **trim + lowercase**; match is **substring** (e.g. `Archive v2` is excluded when the list contains `archive`).
- Substrings live in **`NON_PRODUCTION_PAGE_SUBSTRINGS`** — extend that array to add patterns.
- Each skipped page is **logged** during sync when the parent passes a `log` function (same log stream as `generated/figma-sync.log`).

Scoped frame search (**`getScopedNodes`**) uses the same skip rule so archive/ideas pages never contribute “Buttons” / “Colors” scope hits.

## Shared Pattern Used Across Extractors

Most extractors use the same reliability ladder:

1. **Scoped pass (highest confidence)**: use nodes inside keyword-matched frames.
2. **Document-wide pass**: scan all nodes with naming/style filters.
3. **Structural heuristic (fallback)**: infer by geometry and visual traits when naming is poor.

When changing logic, prefer tightening pass 1 and pass 2 first before making pass 3 more permissive.

## figma-apply — `scss-color-match` on `variables.scss`

Rows in `variable_mapping_figma_sync.csv` with **`scss_value_type` = `scss-color-match`** control how a **Figma hex** is written into **`variables.scss`** for the given `scss_target`.

**Rules (current):**

1. Normalize the Figma color to hex (same `hex` rules as elsewhere in `scripts/figma-sync/figma-apply.mjs`).
2. Compare that hex to every entry in **`theme.json` → `settings.color.palette`** (normalized the same way).
3. **Exact match only** → write **`$color-<slug>`** for the matching palette slug.
4. **No exact match** → write the **literal normalized hex** (e.g. `#102e5c`) so SCSS never points at the wrong swatch. A line is appended to **`scripts/figma-sync/generated/figma-sync.log`** (and to the console when apply runs with `--verbose`).

**Explicitly unchanged:**

- **`scss_value_type` = `theme-json-var-ref`** — still emits the static `var(--wp--…)` string from the CSV for Gutenberg compatibility.
- **`scss_value_type` = `scss-ref`** — still passes through `$…` / `var()` via normalisation; no palette matching.
- **`theme_json_value_type` = `scss-color-match`** (if used) — still uses **nearest** palette + `var(--wp--preset--color--…)` for `theme.json` only; only the **variables.scss** branch uses exact-or-hex.

Element-specific CSV rows (e.g. button font colors, theme semantic colors) are called out in **`button.md`**, **`colors.md`**, and **`body.md`** where relevant.

**CSV `figma_path` vs export JSON:** `npm run figma-apply` walks `generated/figma-export.json` with dot paths only (it does not use `variable-mapping.mjs` aliases). Example: body background is **`body.backgroundColor`**, not a root-level `bodyBackgroundColor`.
