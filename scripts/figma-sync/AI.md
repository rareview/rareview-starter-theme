# Guide for AI tools (Cursor, Cloud Code, etc.)

## Keep element docs in sync with code

All Figma extractors live under `scripts/figma-sync/elements/`. Each extractor has a **`.mjs`** file and a matching **`.md`** file in the **same folder**.

**Rule:** If you change the logic in any `elements/*.mjs` extractor, update the paired `elements/*.md` in the same edit (or immediately after). The Markdown files are the spec for passes, heuristics, export shape, and how rows in `variable_mapping_figma_sync.csv` relate to the export.

| Code | Doc |
|------|-----|
| `elements/body.mjs` | `elements/body.md` |
| `elements/button.mjs` | `elements/button.md` |
| `elements/colors.mjs` | `elements/colors.md` |
| `elements/headings.mjs` | `elements/headings.md` |
| `elements/input-field.mjs` | `elements/input-field.md` |
| `elements/layout.mjs` | `elements/layout.md` |
| `elements/link.mjs` | `elements/link.md` |

Cross-cutting topics (shared patterns, `build-export`, `figma-apply` color rules) live in `elements/README.md`.

## Layout of this folder

- `figma-sync.mjs` — fetch / local `fetched/` → `generated/figma-export.json`
- `figma-apply.mjs` — CSV + export → theme `theme.json` / `variables.scss`
- `generated/` — export JSON, sync log, optional `figma-ai-export.json` (gitignored except `.gitkeep`)
- `variable_mapping_figma_sync.csv` — mapping (lives here with apply)
- `elements/` — extractors + their `.md` docs
- `lib/` — shared helpers
- `fetched/` — cached raw API JSON (gitignored except `.gitkeep`)
