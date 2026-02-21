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
      tokenAddress: z.string().describe("TON token/contract address to analyze for fraud risk"),
    },
    async ({ tokenAddress }) => {
      try {
        const investigator = new VeritasInvestigator();
        const result = await investigator.investigate(tokenAddress);

        const normalizedLies = result.lies && result.lies.length > 0 ? result.lies : ["None identified"];

        const mcpResult = {
          veritasSays: result.veritasSays,
          trustScore: result.trustScore,
          verdict: result.verdict,
          tokenName: result.tokenName,
          tokenSymbol: result.tokenSymbol,
          tokenAddress: result.tokenAddress,
          visualEvidenceStatus: result.visualEvidenceStatus,
          visualAssetReuse: result.visualAssetReuse,
          onChain: {
            ...result.onChain,
            mintAuth: Boolean(result.onChain.mintAuth),
            freezeAuth: Boolean(result.onChain.freezeAuth),
          },
          market: result.market ? {
            ...result.market,
            anomalies: result.market.anomalies.length > 0 ? result.market.anomalies : ["None detected"],
            anomaliesSummary: result.market.anomalies.length > 0 ? result.market.anomalies.join("; ") : "None detected",
          } : null,
          marketAvailable: result.market !== null,
          rugCheck: result.rugCheck ? {
            ...result.rugCheck,
            risksSummary: result.rugCheck.risks.length > 0 ? result.rugCheck.risks.map(r => r.name).join("; ") : "None detected",
          } : { score: 0, risks: [], risksSummary: "TonSecurity API not yet implemented." },
          rugCheckAvailable: result.rugCheck !== null,
          creatorHistory: result.creatorHistory,
          socials: result.socials,
          elephantMemory: result.elephantMemory,
          analyzedAt: result.analyzedAt,
          analysisTimeMs: result.analysisTimeMs,
          dataCompleteness: "complete",
          rawIntelligence: {
            summary: result.summary,
            criminalProfile: result.criminalProfile,
            lies: normalizedLies,
            evidence: result.evidence,
            analysis: result.analysis,
            visualAnalysis: result.visualAnalysis,
            visualEvidenceSummary: result.visualEvidenceSummary,
            degenComment: result.degenComment,
            thoughtSummary: result.thoughtSummary,
          },
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(mcpResult, null, 2) }],
          structuredContent: mcpResult as unknown as Record<string, unknown>,
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
