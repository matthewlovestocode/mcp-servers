import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { SlackServerConfig } from "./config.js";
import { SlackWebhookClient } from "./slackClient.js";

const slackBlocksSchema = z.array(z.record(z.string(), z.any()));
const slackAttachmentsSchema = z.array(z.record(z.string(), z.any()));

const postMessageArgs = z
  .object({
    text: z.string().min(1).optional(),
    blocks: slackBlocksSchema.optional(),
    attachments: slackAttachmentsSchema.optional(),
    webhookName: z.string().optional(),
    webhookUrl: z.string().url().optional()
  })
  .describe("Post a message to Slack using the configured webhook.");

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
    webhookUrl: z.string().url().optional()
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
        "- post-message: send a general-purpose message or block payload.",
        "- post-pr: share pull request summaries with key metadata."
      ].join("\n")
    }
  );

  const client = new SlackWebhookClient(config);
  server.tool(
    "post-message",
    "Send a message or block payload to Slack.",
    postMessageArgs.shape,
    async (rawArgs: unknown) => {
      const args = postMessageArgs.parse(rawArgs);

      if (!args.text && !args.blocks && !args.attachments) {
        return toolError(
          "Provide at least one of text, blocks, or attachments for Slack message."
        );
      }

      await client.postMessage({
        text: args.text,
        blocks: args.blocks,
        attachments: args.attachments,
        webhookName: args.webhookName,
        webhookUrl: args.webhookUrl
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
        webhookUrl: args.webhookUrl
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
