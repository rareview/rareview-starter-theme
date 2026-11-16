# Guide for AI tools (Cursor, Claude Code, etc.)

Figma Sync uses an AI model. The user pastes links to the relevant Figma pages; the model measures them with tools and decides every value. See [`src/README.md`](src/README.md).

## Measurement rules

`src/rules/*.md` are the measurement notes the model is given (`src/prompt.mjs` reads them, up to the first `## Downstream` heading). The `## Downstream` sections are for people editing apply, not for the model.

If you change how an element should be measured, update the matching file in `src/rules/`.

## figma-apply — `scss-color-match` on `variables.scss`

Rows in `variable_mapping.csv` with **`scss_value_type` = `scss-color-match`** control how a **Figma hex** is written into **`variables.scss`** for the given `scss_target`.

1. Normalize the Figma color to hex (same hex rules as elsewhere in `figma-apply.mjs`).
2. Compare that hex to every entry in **`theme.json` → `settings.color.palette`** (normalized the same way).
3. **Exact match only** → write **`$color-<slug>`** for the matching palette slug.
4. **No exact match** → write the **literal normalized hex** (e.g. `#102e5c`). A line is appended to **`generated/figma-sync.log`** (and to the console when apply runs with `--verbose`).

**Unchanged:**

- **`scss_value_type` = `theme-json-var-ref`** — still emits the static `var(--wp--…)` string from the CSV.
- **`scss_value_type` = `scss-ref`** — still passes through `$…` / `var()`.
- **`theme_json_value_type` = `scss-color-match`** — still uses the **nearest** palette + `var(--wp--preset--color--…)` for `theme.json` only. Only the **variables.scss** branch uses exact-or-hex.

**CSV `figma_path` vs export JSON:** `npm run figma-apply` walks `generated/figma-export.json` with dot paths only. Example: body background is **`body.backgroundColor`**, not a root-level `bodyBackgroundColor`.

## Layout of this folder

- `figma-sync.mjs` — entry → `generated/figma-export.json`, then apply, preview page, style edits
- `figma-apply.mjs` — CSV + export → theme `theme.json` / `variables.scss`
- `src/` — page links, tools, prompt, checks, report, style edits
- `src/rules/` — measurement notes included in the prompt
- `lib/` — shared helpers (Figma API, colors, nodes)
- `generated/` — export JSON, `ai-report.md`, sync log (gitignored except `.gitkeep`)
- `variable_mapping.csv` — mapping (lives here with apply)
- `fetched/` — cached Figma JSON, saved page links, images (gitignored except `.gitkeep`)
