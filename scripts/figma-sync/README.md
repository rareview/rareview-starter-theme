## Figma Sync

Before you start:

- set **FIGMA_ACCESS_TOKEN** in **scripts/figma-sync/.env** (or the project root **.env**). See **.env.example**.
- set up an AI key in **WordPress → Settings → Connectors** (Anthropic or OpenAI; WordPress 7.0+). The local site must be running (`lando start`): the sync asks WordPress for the key through WP-CLI.

Then run:

```bash
npm run figma-sync
```

1. Paste links to the relevant Figma pages or frames containing the final designs and styles (e.g. “Final”, “Pages”, “Homepage”, “Style Guide”, “Typography”), one per line. In Figma: right-click a page name > **Copy link to page**, or select a frame > **Copy link**. Press Enter on an empty line when done.
2. Only those pages are loaded (not the whole file). The AI looks at them, measures, and picks every value.
3. The theme is updated (`figma-apply`), and the **Preview** page (`/preview/`) is rewritten from the new design (`wp create-preview --rewrite`). Edits on that page are replaced. Read **`generated/ai-report.md`**: every value with its confidence, the Figma node it came from, and why.
4. Style details: the AI edits the theme's SCSS directly for what variables cannot express (shadows, an arrow on buttons, underline style, hover looks). Skip this step with `--no-styles`.

The terminal shows only the steps and their results. Add `--details` (`npm run figma-sync -- --details`) to see every AI step and each style change.

The sync is meant to be the **first step of a project**. Every sync starts the style details from the clean starter styles, so running it again gives a fresh result instead of piling up changes. If the edited CSS does not compile, the edits are undone automatically. Commit before syncing to see the AI's edits as a diff.

Next time for the same file, the sync offers the same page links again.

You can also give the links right after the command (no questions). Put each link in quotes:

```bash
npm run figma-sync "LINK1" "LINK2"
npm run figma-sync "LINK1,LINK2"
```

More: [`src/README.md`](src/README.md).

## Fresh download

**`--fetch-fresh`** always downloads the pasted pages from the Figma API again.

```bash
npm run figma-sync -- --fetch-fresh
```

## Docs

- **How the sync works**: [`src/README.md`](src/README.md)
- **Agents (measurement rules and apply)**: [`AI.md`](AI.md)

Apply only (after you already have `generated/figma-export.json`):

```bash
npm run figma-apply
```
