import "./load-env";
import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { VeritasInvestigator } from "@/lib/services/VeritasInvestigator";
import { BotAnalysisOutput } from "@/types";

const app = express();
const port = Number(process.env.MCP_PORT || process.env.PORT || 4000);

app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"] }));

const mcpServer = new McpServer({
  name: "Veritas-Intelligence",
  version: "1.0.0",
});

// Ensure tools capability is enabled for raw handlers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const serverAny = mcpServer.server as any;
if (typeof serverAny.setCapabilities === "function") {
  serverAny.setCapabilities({ tools: { listChanged: false } });
} else {
  serverAny.capabilities = serverAny.capabilities ?? {};
  serverAny.capabilities.tools = { listChanged: false };
  serverAny._capabilities = serverAny.capabilities;
}

const outputSchema = {
  type: "object",
  properties: {
    trustScore: { type: "number" },
    verdict: { type: "string", enum: ["Safe", "Caution", "Danger"] },
    onChain: {
      type: "object",
      properties: {
        mintAuthorityEnabled: { type: "boolean" },
        freezeAuthorityEnabled: { type: "boolean" },
        isDumped: { type: "boolean" },
        isWhale: { type: "boolean" },
        top10Percentage: { type: "number" },
        creatorPercentage: { type: "number" },
      },
      required: [
        "mintAuthorityEnabled",
        "freezeAuthorityEnabled",
        "isDumped",
        "isWhale",
        "top10Percentage",
        "creatorPercentage",
      ],
    },
    market: {
      type: "object",
      properties: {
        botActivity: { type: "string", enum: ["Low", "Medium", "High", "Unknown"] },
        washTradeScore: { type: "number" },
        liquidity: { type: ["number", "null"] },
        volume24h: { type: ["number", "null"] },
        marketCap: { type: ["number", "null"] },
      },
      required: ["botActivity", "washTradeScore"],
    },
    elephantMemory: {
      type: "object",
      properties: {
        isKnownScammer: { type: "boolean" },
      },
      required: ["isKnownScammer"],
    },
  },
  required: ["trustScore", "verdict", "onChain", "market", "elephantMemory"],
} as const;
const toolDefinition = {
  name: "analyze_token",
  description:
    "A forensic intelligence engine for TON tokens. YOU MUST PASS THE 'tokenAddress' ARGUMENT. TODO: Replace with TON API where applicable.",
  outputSchema,
} as const;

// Raw MCP handlers to avoid Zod serialization issues
mcpServer.server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: toolDefinition.name,
        description: toolDefinition.description,
        inputSchema: {
          type: "object",
          properties: {
            tokenAddress: {
              type: "string",
              description:
                "The exact TON token/contract address to analyze. TODO: Replace with TON API.",
            },
          },
          required: ["tokenAddress"],
        },
        outputSchema: toolDefinition.outputSchema,
      },
    ],
  };
});

mcpServer.server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== toolDefinition.name) {
    throw new Error("Tool not found");
  }

  const tokenAddress = request.params.arguments?.tokenAddress as string | undefined;
  if (!tokenAddress || typeof tokenAddress !== "string") {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: "tokenAddress argument is required" }),
        },
      ],
      structuredContent: { error: "tokenAddress argument is required" },
      isError: true,
    };
  }

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
      structuredContent: botOutput,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
      structuredContent: { error: message },
      isError: true,
    };
  }
});

console.log("[MCP HTTP] Tool schema loaded:", {
  name: toolDefinition.name,
  outputSchema: toolDefinition.outputSchema,
});

let transport: SSEServerTransport | null = null;

app.get("/sse", async (req, res) => {
  try {
    transport = new SSEServerTransport("/message", res);
    await mcpServer.connect(transport);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[MCP HTTP] SSE connection error:", message);
    res.status(500).end();
  }
});

app.post("/message", (req, res) => {
  if (!transport) {
    res.status(503).json({ error: "SSE not initialized. Connect to /sse first." });
    return;
  }
  transport.handlePostMessage(req, res);
});

app.options("/message", (_, res) => res.sendStatus(204));
app.options("/sse", (_, res) => res.sendStatus(204));
app.options("/mcp", (_, res) => res.sendStatus(204));

// ============================================================================
// /mcp endpoint - Streamable HTTP (required by Context Protocol for discovery)
// Context registers https://YOUR-URL/mcp - without this, tools show "Inactive"
// ============================================================================

const streamableTransports: Record<string, StreamableHTTPServerTransport> = {};
const streamableServer = new Server(
  { name: "Veritas-Intelligence", version: "1.0.0" },
  { capabilities: { tools: { listChanged: false } } }
);

streamableServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: toolDefinition.name,
      description: toolDefinition.description,
      inputSchema: {
        type: "object",
        properties: {
          tokenAddress: {
            type: "string",
            description:
              "The exact TON token/contract address to analyze. TODO: Replace with TON API.",
          },
        },
        required: ["tokenAddress"],
      },
      outputSchema: toolDefinition.outputSchema,
    },
  ],
}));

streamableServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== toolDefinition.name) {
    throw new Error("Tool not found");
  }

  const tokenAddress = request.params.arguments?.tokenAddress as string | undefined;
  if (!tokenAddress || typeof tokenAddress !== "string") {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: "tokenAddress argument is required" }),
        },
      ],
      structuredContent: { error: "tokenAddress argument is required" },
      isError: true,
    };
  }

  try {
    const investigator = new VeritasInvestigator();
    const result = await investigator.investigate(tokenAddress);
    const onChain = result.onChain;
    const marketAvailable = result.market !== null;
    const market = result.market ?? {
      liquidity: 0,
      volume24h: 0,
      marketCap: 0,
      buySellRatio: 0,
      ageInHours: 0,
      botActivity: "Unknown",
      anomalies: [],
      anomaliesSummary: "None detected",
    };
    const rugCheckAvailable = result.rugCheck !== null;
    const rugCheck = result.rugCheck ?? {
      score: 0,
      risks: [],
      risksSummary: "None detected",
    };
    const normalizedMarket = {
      ...market,
      anomalies: market.anomalies && market.anomalies.length > 0 ? market.anomalies : ["None detected"],
      anomaliesSummary:
        market.anomalies && market.anomalies.length > 0 ? market.anomalies.join("; ") : "None detected",
    };
    const normalizedRugCheck = {
      ...rugCheck,
      risks:
        rugCheck.risks && rugCheck.risks.length > 0
          ? rugCheck.risks
          : [
              {
                name: "None detected",
                description: "No risks detected. TODO: Replace with TON API contract audit.",
                level: "info",
                score: 0,
              },
            ],
      risksSummary:
        rugCheck.risks && rugCheck.risks.length > 0 ? rugCheck.risks.map((r) => r.name).join("; ") : "None detected",
    };
    const normalizedLies = result.lies && result.lies.length > 0 ? result.lies : ["None detected"];
    const mcpResult = {
      ...result,
      lies: normalizedLies,
      onChain: {
        ...onChain,
        mintAuth: onChain.mintAuth ? "Enabled" : "Disabled",
        freezeAuth: onChain.freezeAuth ? "Enabled" : "Disabled",
        mintAuthStatus: onChain.mintAuth ? "Enabled" : "Disabled",
        freezeAuthStatus: onChain.freezeAuth ? "Enabled" : "Disabled",
      },
      market: normalizedMarket,
      marketAvailable,
      rugCheck: normalizedRugCheck,
      rugCheckAvailable,
      dataCompleteness: "complete",
    };
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
      structuredContent: botOutput,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
      structuredContent: { error: message },
      isError: true,
    };
  }
});

async function handleMcpPost(req: express.Request, res: express.Response) {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && streamableTransports[sessionId]) {
    transport = streamableTransports[sessionId];
  } else if (
    !sessionId &&
    req.body &&
    (Array.isArray(req.body) ? (req.body as unknown[]).some(isInitializeRequest) : isInitializeRequest(req.body))
  ) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        streamableTransports[id] = transport;
      },
    });
    await streamableServer.connect(transport);
  } else {
    res.status(400).json({ error: "Invalid session" });
    return;
  }

  await transport.handleRequest(req, res, req.body);
}

async function handleMcpGet(req: express.Request, res: express.Response) {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const transport = sessionId ? streamableTransports[sessionId] : undefined;
  if (transport) {
    await transport.handleRequest(req, res);
  } else {
    res.status(400).json({ error: "Invalid session" });
  }
}

app.post("/mcp", express.json(), handleMcpPost);
app.get("/mcp", handleMcpGet);

// Health checks (required by Context Protocol)
const healthHandler = (_req: express.Request, res: express.Response) => {
  res.status(200).json({
    status: "ok",
    service: "Veritas",
    version: "1.0.0",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
};

app.get("/", healthHandler);
app.get("/health", healthHandler);
app.get("/ping", healthHandler);
// If Context appends /health to registered endpoint (e.g. .../sse -> .../sse/health)
app.get("/sse/health", healthHandler);
app.get("/mcp/health", healthHandler);

app.listen(port, () => {
  console.log(`[MCP HTTP] Veritas-Intelligence listening on :${port}`);
  console.log(`[MCP HTTP] MCP endpoint:  /mcp (Streamable HTTP - for Context Protocol)`);
  console.log(`[MCP HTTP] SSE endpoint:  /sse`);
  console.log(`[MCP HTTP] POST endpoint: /message`);
});
