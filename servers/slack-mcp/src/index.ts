#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { resolveConfig } from "./config.js";
import { createSlackServer } from "./server.js";

async function main(): Promise<void> {
  const config = resolveConfig();
  const server = createSlackServer(config);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  process.stdin.resume();

  const closed = new Promise<void>((resolve, reject) => {
    const previousOnClose = server.server.onclose;
    const previousOnError = server.server.onerror;

    server.server.onclose = () => {
      previousOnClose?.();
      resolve();
    };

    server.server.onerror = (error: unknown) => {
      previousOnError?.(error as Error);
      reject(error instanceof Error ? error : new Error(String(error)));
    };
  });

  console.error("slack-mcp server ready.");

  const shutdown = async (signal: NodeJS.Signals) => {
    console.error(`Received ${signal}. Shutting down slack-mcp server...`);
    await transport.close().catch((error: unknown) => {
      console.error("Error closing transport:", error);
    });
    await server.close().catch((error: unknown) => {
      console.error("Error closing server:", error);
    });
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  await closed;
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error("Unexpected error starting slack-mcp server:", error);
  }
  process.exit(1);
});
