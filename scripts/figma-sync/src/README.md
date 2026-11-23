# Figma Sync

`npm run figma-sync`.

## The idea

You paste links to the Figma pages that matter (for example "Final", "Homepage", "Style Guide", "Typography").
Only those pages are loaded, not the whole file. The AI then works like a engineer:

1. It looks at the screens (images from Figma).
2. It measures with tools: counts text styles, colors, button-like and field-like nodes, frame widths.
3. It reads exact values from real nodes.
4. It decides every value and says why, with a confidence and the Figma node it used.

The AI follows the measurement notes in `rules/*.md` (they are part of its instructions),
but it can use judgment where a rigid rule would be fooled (a "Button" layer in the menu, a wireframe page, a status bar).

Code never invents values. Code only checks them:

- format (hex color, px number, line-height ratio, …), wrong formats are rejected;
- heading sizes go down, body sizes go up, mobile is not bigger than desktop;
- button label and body text are readable on their background;
- each value points at a real node.

When a check fails or values are missing, the AI gets **one review round** to fix them with the tools.

## Files

| File | What it does |
| --- | --- |
| `figma-links.mjs` | Asks for page links, remembers them per file, loads only those pages (saved copy first, then Figma API `GET /v1/files/:key/nodes`). |
| `tools.mjs` | The tools the AI uses: `outline`, `inspect`, `search`, `text_styles`, `colors`, `button_candidates`, `input_candidates`, `frame_widths`, `view`. They measure; they never decide. |
| `prompt.mjs` | The instructions: how to work, rules per element (`rules/*.md`), and the list of values (read from `../variable_mapping.csv`). |
| `index.mjs` | Runs the AI, the checks and the review round, then writes `generated/figma-export.json` and `generated/ai-report.md`. |
| `additional-styling.mjs` | The style step, after the theme is updated: undoes the AI's style edits of the last sync, lets the AI edit the editable SCSS files (button, link, heading, quote and input mixins, Button/Quote/Image block styles) for details variables cannot express (shadows, button icons, hover looks, underline style), compiles the theme CSS and undoes the edits if it fails. `generated/style-state.json` remembers each edited file's text from before; a file changed since (by you or git) is left alone. |
| `provider.mjs`, `connectors.mjs`, `parse-ai.mjs` | AI client (Anthropic or OpenAI), the key from WordPress Connectors and the model, JSON parsing. |

## Output

- `generated/figma-export.json`: `keyedBySlug` (one value per CSV slug, what `figma-apply` reads first) plus the usual sections (`body`, `headings`, `buttons`, `colors`, …).
- `generated/ai-report.md`: every value with confidence, the Figma node link and the reason; problems to check; the AI's notes; the tool calls.
- `generated/figma-sync.log`: every tool call with its full output and the raw AI answers.

## Settings

The AI key comes **only from WordPress Connectors** (Settings → Connectors, WordPress 7.0+). The sync asks WordPress through WP-CLI,
so the local site must be running (`lando start`). WordPress decides where the key comes from, in its own order:
environment variable, PHP constant (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`), then the key saved on the Connectors screen.
Without a configured Anthropic or OpenAI connector the AI sync stops with a link to that screen.

- WP-CLI command: `lando wp` in a Lando project, otherwise `wp`. Override with the environment variable `RV_WP_CLI` (e.g. `RV_WP_CLI="wp --path=/path/to/wp"`).
- Anthropic is used when both connectors have a key. `RV_AI_PROVIDER` = `anthropic` | `openai` forces one.
- `RV_ANTHROPIC_MODEL` (default `claude-opus-5-5`), `RV_OPENAI_MODEL` (default `gpt-5.5`).
  These three settings can be environment variables or PHP constants in `wp-config.php`.

Flags:

```bash
npm run figma-sync "https://www.figma.com/design/KEY/x?node-id=1-2" "https://www.figma.com/design/KEY/x?node-id=3-4"
npm run figma-sync -- --yes          # use the pages saved for this file without asking
npm run figma-sync -- --fetch-fresh  # download the pages again from Figma
npm run figma-sync -- --no-styles    # only the variables, no direct SCSS edits
npm run figma-sync -- --details      # show every AI step (tool calls) and each style change
npm run figma-sync -- --model gpt-5.5 --provider openai
```

The page links are saved in `fetched/pages-{fileKey}.json`; downloaded pages in `fetched/nodes-{fileKey}-{ids}.json`;
rendered images in `fetched/{fileKey}/images/`.
