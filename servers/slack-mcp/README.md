# Slack MCP Server

TypeScript implementation of an MCP server that posts messages to Slack via incoming webhooks.

## Features

- Sends ad-hoc messages to Slack using either a default webhook or named webhooks defined via environment variables.
- Posts pull request summaries (state, reviewers, labels, link) to Slack with helpful formatting.
- Supports blocks and attachments so richer layouts can be orchestrated by upstream tooling.
- Provides reusable tooling for other automations through the Model Context Protocol.

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file (or export environment variables):

   ```bash
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T0000/B0000/XXXXX
   SLACK_WEBHOOK_MAP={"alerts":"https://hooks.slack.com/services/...","deploy":"https://hooks.slack.com/services/..."}
   SLACK_USERNAME=Automation Bot
   SLACK_ICON_EMOJI=:robot_face:
   ```

   Either `SLACK_WEBHOOK_URL` or `SLACK_WEBHOOK_MAP` must be provided. When both are supplied, named webhooks fall back to the default URL when a name is missing.

3. Build the server (generates `dist/`):

   ```bash
   npm run build
   ```

4. Run the MCP server over stdio:

   ```bash
   node dist/index.js
   ```

   During development you can use watch mode:

   ```bash
   npm run dev
   ```

## Available Tools

- `post-message` – Create a rich Block Kit announcement with a headline, optional body, bullet highlights, side-by-side facts, footer context, and a call-to-action button. The plain-text fallback is `[icon] [username]:` followed by the headline and key details.
- `post-pr` – Share pull request details (state, reviewers, labels, stats, link).

Both tools accept optional `username` and `iconEmoji` arguments to override the sender for individual messages.

### `post-message` arguments

- `headline` *(required)* – Main title rendered via header block.
- `body` – Markdown section beneath the headline.
- `highlights` – Array of bullet strings rendered as a list.
- `fields` – Array of `{label, value}` pairs shown as a facts table.
- `cta` – `{text, url}` turns into a button.
- `footer` – Additional context placed in the footer alongside username/icon.
- `attachments` – Optional raw Slack attachments array passed through.
- `username` / `iconEmoji` – Override sender metadata per message.

## Environment Variables

- `SLACK_WEBHOOK_URL` – Default webhook URL for Slack.
- `SLACK_WEBHOOK_MAP` – JSON object mapping webhook names to URLs.
- `SLACK_USERNAME` – Override Slack display name for posts.
- `SLACK_ICON_EMOJI` – Set emoji avatar for posts (e.g., `:rocket:`).

## Linting

```bash
npm run lint
```

## License

MIT
