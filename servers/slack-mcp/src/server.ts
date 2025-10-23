import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { SlackServerConfig } from "./config.js";
import { SlackWebhookClient } from "./slackClient.js";

const slackAttachmentsSchema = z.array(z.record(z.string(), z.any()));

const postMessageArgs = z
  .object({
    headline: z
      .string()
      .min(1)
      .describe("Primary headline displayed in the message header."),
    body: z
      .string()
      .optional()
      .describe("Main message body rendered as Markdown."),
    highlights: z
      .array(z.string().min(1))
      .default([])
      .describe("Bullet highlights to emphasize key points."),
    fields: z
      .array(
        z.object({
          label: z.string().min(1),
          value: z.string().min(1)
        })
      )
      .default([])
      .describe("Key/value pairs rendered as a side-by-side facts table."),
    footer: z
      .string()
      .optional()
      .describe("Additional context rendered in the footer."),
    cta: z
      .object({
        text: z.string().min(1),
        url: z.string().url()
      })
      .optional()
      .describe("Optional call-to-action button."),
    attachments: slackAttachmentsSchema.optional(),
    webhookName: z.string().optional(),
    webhookUrl: z.string().url().optional(),
    username: z.string().min(1).optional(),
    iconEmoji: z.string().min(1).optional()
  })
  .describe("Post a rich, Block Kit driven message to Slack.");

const postPullRequestArgs = z
  .object({
    repository: z.string().min(1).describe("Repository in owner/name format."),
    number: z.number().int().positive().describe("Pull request number."),
    title: z.string().min(1),
    url: z.string().url(),
    author: z.string().min(1),
    state: z.enum(["open", "closed", "merged"]).default("open"),
    draft: z.boolean().default(false),
    labels: z.array(z.string().min(1)).default([]),
    reviewers: z.array(z.string().min(1)).default([]),
    additions: z.number().int().nonnegative().optional(),
    deletions: z.number().int().nonnegative().optional(),
    comments: z.number().int().nonnegative().optional(),
    body: z.string().optional(),
    webhookName: z.string().optional(),
    webhookUrl: z.string().url().optional(),
    username: z.string().min(1).optional(),
    iconEmoji: z.string().min(1).optional()
  })
  .describe("Post a pull request summary to Slack.");

type PullRequestInput = z.infer<typeof postPullRequestArgs>;

export function createSlackServer(config: SlackServerConfig): McpServer {
  const server = new McpServer(
    {
      name: "slack-mcp",
      version: "0.1.0"
    },
    {
      instructions: [
        "Slack MCP Server",
        "",
        "Configure using environment variables:",
        "- SLACK_WEBHOOK_URL (optional) default Slack incoming webhook URL.",
        "- SLACK_WEBHOOK_MAP (optional) JSON map of named webhooks.",
        "- SLACK_USERNAME (optional) override username shown in Slack.",
        "- SLACK_ICON_EMOJI (optional) emoji avatar for messages.",
        "",
        "Available tools:",
        "- post-message: craft rich announcements with headline, highlights, fields, and CTA.",
        "- post-pr: share pull request summaries with key metadata.",
        "Optional arguments: username/iconEmoji override sender details per message."
      ].join("\n")
    }
  );

  const client = new SlackWebhookClient(config);
  server.tool(
    "post-message",
    "Send a rich Slack message with headline, highlights, fields, and CTA.",
    postMessageArgs.shape,
    async (rawArgs: unknown) => {
      const args = postMessageArgs.parse(rawArgs);

      const effectiveUsername = args.username ?? config.username;
      const effectiveIcon = args.iconEmoji ?? config.iconEmoji;

      const blocks = buildRichBlocks({
        args,
        username: effectiveUsername,
        iconEmoji: effectiveIcon
      });

      await client.postMessage({
        text: buildFallbackText({
          args,
          username: effectiveUsername,
          iconEmoji: effectiveIcon
        }),
        blocks,
        attachments: args.attachments,
        webhookName: args.webhookName,
        webhookUrl: args.webhookUrl,
        username: args.username,
        iconEmoji: args.iconEmoji
      });

      return toolText("Message posted to Slack.");
    }
  );

  server.tool(
    "post-pr",
    "Share pull request information in Slack.",
    postPullRequestArgs.shape,
    async (rawArgs: unknown) => {
      const args = postPullRequestArgs.parse(rawArgs);

      const blocks = pullRequestBlocks(args);

      await client.postMessage({
        text: pullRequestText(args),
        blocks,
        webhookName: args.webhookName,
        webhookUrl: args.webhookUrl,
        username: args.username,
        iconEmoji: args.iconEmoji
      });

      return toolText(
        `Pull request posted: ${args.repository}#${args.number} (${args.title})`
      );
    }
  );
  return server;
}

function pullRequestBlocks(args: PullRequestInput): unknown[] {
  const statusEmoji = prStatusEmoji(args.state, args.draft);
  const headline = `${statusEmoji} ${args.repository}#${args.number} — ${args.title}`;

  const fields = [
    `*State:* ${prStateLabel(args.state, args.draft)}`,
    `*Author:* ${args.author}`,
    args.reviewers.length > 0
      ? `*Reviewers:* ${args.reviewers.join(", ")}`
      : undefined,
    args.labels.length > 0 ? `*Labels:* ${args.labels.join(", ")}` : undefined,
    args.additions !== undefined
      ? `*Additions:* +${args.additions}`
      : undefined,
    args.deletions !== undefined ? `*Deletions:* −${args.deletions}` : undefined,
    args.comments !== undefined
      ? `*Comments:* ${args.comments}`
      : undefined
  ].filter(Boolean);

  const blocks: unknown[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*<${args.url}|${headline}>*`
      }
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Opened by *${args.author}*`
        }
      ]
    }
  ];

  if (fields.length > 0) {
    blocks.push({
      type: "section",
      fields: fields.map((value) => ({ type: "mrkdwn", text: value as string }))
    });
  }

  if (args.body) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Description:*\n${truncate(args.body)}`
      }
    });
  }

  return blocks;
}

function pullRequestText(args: PullRequestInput): string {
  const emoji = prStatusEmoji(args.state, args.draft);
  const parts = [
    `${emoji} ${args.repository}#${args.number} — ${args.title}`,
    `State: ${prStateLabel(args.state, args.draft)}`,
    `Author: ${args.author}`,
    args.reviewers.length > 0 ? `Reviewers: ${args.reviewers.join(", ")}` : undefined,
    args.labels.length > 0 ? `Labels: ${args.labels.join(", ")}` : undefined,
    args.additions !== undefined ? `Additions: +${args.additions}` : undefined,
    args.deletions !== undefined ? `Deletions: -${args.deletions}` : undefined,
    args.comments !== undefined ? `Comments: ${args.comments}` : undefined,
    args.body ? `Description: ${truncate(args.body)}` : undefined,
    `Link: ${args.url}`
  ].filter(Boolean);

  return parts.join("\n");
}

function buildRichBlocks(options: {
  args: z.infer<typeof postMessageArgs>;
  username?: string;
  iconEmoji?: string;
}): unknown[] {
  const { args, username, iconEmoji } = options;
  const blocks: unknown[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: truncatePlainText(args.headline, 150),
        emoji: true
      }
    }
  ];

  if (args.body) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: args.body
      }
    });
  }

  if (args.highlights.length > 0) {
    const highlightList = args.highlights.map((item) => `• ${item}`).join("\n");
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: highlightList
      }
    });
  }

  if (args.fields.length > 0) {
    blocks.push({
      type: "section",
      fields: args.fields.map((field) => ({
        type: "mrkdwn",
        text: `*${field.label}*\n${field.value}`
      }))
    });
  }

  if (args.cta) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: truncatePlainText(args.cta.text, 75),
            emoji: true
          },
          url: args.cta.url
        }
      ]
    });
  }

  const contextElements: { type: string; text: string }[] = [];
  if (iconEmoji) {
    contextElements.push({
      type: "mrkdwn",
      text: iconEmoji
    });
  }
  if (username) {
    contextElements.push({
      type: "mrkdwn",
      text: `*${username}*`
    });
  }
  if (args.footer) {
    contextElements.push({
      type: "mrkdwn",
      text: args.footer
    });
  }

  if (contextElements.length > 0) {
    blocks.push({
      type: "context",
      elements: contextElements
    });
  }

  return blocks;
}

function buildFallbackText(options: {
  args: z.infer<typeof postMessageArgs>;
  username?: string;
  iconEmoji?: string;
}): string {
  const { args, username, iconEmoji } = options;
  const parts: string[] = [];

  if (iconEmoji) {
    parts.push(`[${iconEmoji}]`);
  }
  if (username) {
    parts.push(`[${username}]`);
  }

  parts.push(args.headline);

  if (args.body) {
    parts.push(args.body);
  }

  args.highlights.forEach((item) => {
    parts.push(`• ${item}`);
  });

  args.fields.forEach((field) => {
    parts.push(`${field.label}: ${field.value}`);
  });

  if (args.cta) {
    parts.push(`${args.cta.text} -> ${args.cta.url}`);
  }

  if (args.footer) {
    parts.push(args.footer);
  }

  return parts.join(" \u2014 ");
}

function truncatePlainText(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}\u2026`;
}

function prStatusEmoji(state: PullRequestInput["state"], draft: boolean): string {
  if (draft && state === "open") {
    return "📝";
  }
  switch (state) {
    case "open":
      return "✅";
    case "merged":
      return "🎉";
    case "closed":
      return "❌";
    default:
      return "ℹ️";
  }
}

function prStateLabel(state: PullRequestInput["state"], draft: boolean): string {
  if (draft && state === "open") {
    return "Draft";
  }
  return state.charAt(0).toUpperCase() + state.slice(1);
}

function truncate(text: string, maxLength = 400): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

function toolText(text: string): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text
      }
    ]
  };
}

function toolError(text: string): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text
      }
    ],
    isError: true
  };
}
