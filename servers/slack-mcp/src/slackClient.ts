import type { SlackServerConfig } from "./config.js";

export interface PostMessageOptions {
  text?: string;
  blocks?: unknown[];
  attachments?: unknown[];
  webhookName?: string;
  webhookUrl?: string;
  username?: string;
  iconEmoji?: string;
}

export interface SlackPostResult {
  status: number;
  statusText: string;
  body: string;
}

export class SlackWebhookClient {
  constructor(private readonly config: SlackServerConfig) {}

  async postMessage(options: PostMessageOptions): Promise<SlackPostResult> {
    const url = this.resolveWebhookUrl(options);
    const payload = this.buildPayload(options);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(
        `Slack webhook returned ${response.status} ${response.statusText}: ${body}`
      );
    }

    return {
      status: response.status,
      statusText: response.statusText,
      body
    };
  }

  private resolveWebhookUrl(options: PostMessageOptions): string {
    if (options.webhookUrl) {
      return options.webhookUrl;
    }

    if (options.webhookName) {
      const mapped = this.config.webhookMap[options.webhookName];
      if (!mapped) {
        throw new Error(
          `Unknown webhook name '${options.webhookName}'. Define it in SLACK_WEBHOOK_MAP.`
        );
      }
      return mapped;
    }

    if (this.config.defaultWebhookUrl) {
      return this.config.defaultWebhookUrl;
    }

    throw new Error(
      "No Slack webhook configured. Provide webhookUrl, webhookName, or SLACK_WEBHOOK_URL."
    );
  }

  private buildPayload(options: PostMessageOptions) {
    const payload: Record<string, unknown> = {};

    if (options.text) {
      payload.text = options.text;
    }

    if (options.blocks) {
      payload.blocks = options.blocks;
    }

    if (options.attachments) {
      payload.attachments = options.attachments;
    }

    const username = options.username?.trim() || this.config.username;
    if (username) {
      payload.username = username;
    }

    const iconEmoji = options.iconEmoji?.trim() || this.config.iconEmoji;
    if (iconEmoji) {
      payload.icon_emoji = iconEmoji;
    }

    return payload;
  }
}
