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

- `post-message` – Send a free-form message or block payload to Slack.
- `post-pr` – Share pull request details (state, reviewers, labels, stats, link).

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
