## Figma sync

Before you start, set **FIGMA_ACCESS_TOKEN** in **scripts/figma-sync/.env**, or the project root **.env** as a fallback. See **.env.example** in this folder.

Then simply run:

```bash
npm run figma-sync
```

- You will be asked for a Figma URL:
  - **First sync:** downloads the design from the Figma API using the token, saves it in `./fetched`, then builds the export, and updates the theme.
  - **Sync again:** if the design already exists in `./fetched`, figma-sync uses the local file, so no API requests are made.

`./fetched` is in the repo with only `.gitkeep`; raw JSON files inside it are gitignored. Each API save adds one file: `raw-{fileKey}-{date}.json`.

## Fresh download

`**--fetch-fresh`** will always make a new API request and replace the saved version in `./fetched`, then build the export.

```bash
npm run figma-sync -- --fetch-fresh
```

## Docs

- **Extractor + apply notes**: `[elements/README.md](elements/README.md)`
- **AI / agents (keep `.md` in sync with extractors)**: `[AI.md](AI.md)`

Apply only (after you already have `generated/figma-export.json`):

```bash
npm run figma-apply
```

