import { config as loadEnv } from "dotenv";

loadEnv();

export interface SlackServerConfig {
  defaultWebhookUrl?: string;
  webhookMap: Record<string, string>;
  username?: string;
  iconEmoji?: string;
}

function parseWebhookMap(raw: string | undefined): Record<string, string> {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("SLACK_WEBHOOK_MAP must be a JSON object of name to URL.");
    }

    const entries = Object.entries(parsed).map(([key, value]) => {
      if (typeof value !== "string" || value.trim() === "") {
        throw new Error(
          `Invalid webhook URL for key '${key}'. Expected non-empty string.`
        );
      }
      return [key, value.trim()] as const;
    });

    return Object.fromEntries(entries);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "Unknown error");
    throw new Error(`Failed to parse SLACK_WEBHOOK_MAP: ${message}`);
  }
}

export function resolveConfig(): SlackServerConfig {
  const defaultWebhookUrl = process.env.SLACK_WEBHOOK_URL?.trim() || undefined;
  const webhookMap = parseWebhookMap(process.env.SLACK_WEBHOOK_MAP);

  if (!defaultWebhookUrl && Object.keys(webhookMap).length === 0) {
    throw new Error(
      "Missing Slack webhook configuration. Set SLACK_WEBHOOK_URL or SLACK_WEBHOOK_MAP."
    );
  }

  return {
    defaultWebhookUrl,
    webhookMap,
    username: process.env.SLACK_USERNAME?.trim() || undefined,
    iconEmoji: process.env.SLACK_ICON_EMOJI?.trim() || undefined
  };
}
