/**
 * CRITICAL: Stdio protocol purity
 * Redirect console.log/info to stderr BEFORE any imports/server logic.
 * Stdio transport uses stdout exclusively for JSON-RPC; any other output breaks the protocol.
 */
const originalConsoleLog = console.log;
const originalConsoleInfo = console.info;

console.log = function (...args: unknown[]) {
  console.error(...args);
};

console.info = function (...args: unknown[]) {
  console.error(...args);
};

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
import { BotAnalysisOutput } from "@/types";

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

        const botOutput: BotAnalysisOutput = {
          trustScore: result.trustScore,
          verdict: result.verdict,
          onChain: {
            mintAuthorityEnabled: Boolean(result.onChain?.mintAuth),
            freezeAuthorityEnabled: Boolean(result.onChain?.freezeAuth),
            isDumped: Boolean(result.onChain?.isDumped),
            isWhale: Boolean(result.onChain?.isWhale),
            top10Percentage: Number(result.onChain?.top10Percentage ?? 0),
            creatorPercentage: Number(result.onChain?.creatorPercentage ?? 0),
          },
          market: {
            botActivity: (result.market?.botActivity as any) ?? "Unknown",
            washTradeScore: Number((result.market as any)?.washTradeScore ?? 0),
            liquidity: result.market?.liquidity ?? undefined,
            volume24h: result.market?.volume24h ?? undefined,
            marketCap: result.market?.marketCap ?? undefined,
          },
          elephantMemory: {
            isKnownScammer: Boolean(result.elephantMemory?.isKnownScammer),
          },
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(botOutput, null, 2) }],
          structuredContent: botOutput as unknown as Record<string, unknown>,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
          structuredContent: { error: message },
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
