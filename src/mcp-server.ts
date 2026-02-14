/**
 * Veritas MCP Server - "Veritas-Intelligence"
 * Standalone entry point for local MCP testing (stdio).
 * Remote Context Protocol endpoint is now /api/mcp (HTTP/SSE).
 *
 * Run: npm run mcp   OR   npx tsx src/mcp-server.ts
 * Configure in Claude Desktop etc. via command + args.
 */

import { config } from "dotenv";

config(); // .env
config({ path: ".env.local" }); // Next.js env (overrides)

import { z } from "zod/v3";
import { VeritasInvestigator } from "@/lib/services/VeritasInvestigator";

async function main() {
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");

  const server = new McpServer({
    name: "Veritas-Intelligence",
    version: "1.0.0",
  });

  server.tool(
    "analyze_token",
    {
      tokenAddress: z.string().describe("TON token/contract address to analyze for fraud risk. TODO: Replace with TON API."),
    },
    async ({ tokenAddress }) => {
      try {
        const investigator = new VeritasInvestigator();
        const result = await investigator.investigate(tokenAddress);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[Veritas MCP] Veritas-Intelligence running on stdio");
}

main().catch((e) => {
  console.error("[Veritas MCP] Fatal:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
