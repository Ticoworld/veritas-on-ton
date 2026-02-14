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
    summary: { type: "string" },
    criminalProfile: { type: "string" },
    lies: {
      type: "array",
      description: "Contains at least one entry (e.g., 'None detected')",
      items: { type: "string" },
    },
    evidence: { type: "array", items: { type: "string" } },
    analysis: { type: "array", items: { type: "string" } },
    visualAnalysis: { type: ["string", "null"] },
    degenComment: { type: "string" },
    thoughtSummary: { type: ["string", "null"] },
    tokenAddress: { type: "string" },
    tokenName: { type: "string" },
    tokenSymbol: { type: "string" },
    onChain: {
      type: "object",
      properties: {
        mintAuth: { type: "string", enum: ["Enabled", "Disabled"] },
        freezeAuth: { type: "string", enum: ["Enabled", "Disabled"] },
        mintAuthStatus: { type: "string", enum: ["Enabled", "Disabled"] },
        freezeAuthStatus: { type: "string", enum: ["Enabled", "Disabled"] },
        supply: { type: "number" },
        decimals: { type: "number" },
        top10Percentage: { type: "number" },
        creatorPercentage: { type: "number" },
        isDumped: { type: "boolean" },
        isWhale: { type: "boolean" },
      },
      required: [
        "mintAuth",
        "freezeAuth",
        "mintAuthStatus",
        "freezeAuthStatus",
        "supply",
        "decimals",
        "top10Percentage",
        "creatorPercentage",
        "isDumped",
        "isWhale",
      ],
    },
    market: {
      type: "object",
      properties: {
        liquidity: { type: "number" },
        volume24h: { type: "number" },
        marketCap: { type: "number" },
        buySellRatio: { type: "number" },
        ageInHours: { type: "number" },
        botActivity: { type: "string" },
        anomalies: {
          type: "array",
          description: "Contains at least one entry (e.g., 'None detected')",
          items: { type: "string" },
        },
        anomaliesSummary: {
          type: "string",
          description: "Human-readable summary; 'None detected' when empty.",
        },
      },
    },
    marketAvailable: { type: "boolean" },
    dataCompleteness: {
      type: "string",
      enum: ["complete"],
      description: "Signals that the response is complete and ready to use.",
    },
    rugCheck: {
      type: "object",
      properties: {
        score: { type: "number" },
        risks: {
          type: "array",
          description:
            "Contains at least one entry (e.g., a 'None detected' placeholder)",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              level: { type: "string" },
              score: { type: "number" },
            },
            required: ["name", "description", "level", "score"],
          },
        },
        risksSummary: {
          type: "string",
          description: "Human-readable summary; 'None detected' when empty.",
        },
      },
    },
    rugCheckAvailable: { type: "boolean" },
    creatorHistory: {
      type: "object",
      properties: {
        creatorAddress: { type: "string" },
        previousTokens: { type: "number" },
        isSerialLauncher: { type: "boolean" },
      },
      required: ["creatorAddress", "previousTokens", "isSerialLauncher"],
    },
    socials: {
      type: "object",
      properties: {
        website: { type: ["string", "null"] },
        twitter: { type: ["string", "null"] },
        telegram: { type: ["string", "null"] },
        discord: { type: ["string", "null"] },
      },
    },
    elephantMemory: {
      type: "object",
      properties: {
        isKnownScammer: { type: "boolean" },
        previousFlags: { type: ["object", "null"] },
      },
      required: ["isKnownScammer"],
    },
    analyzedAt: { type: "string" },
    analysisTimeMs: { type: "number" },
  },
  required: [
    "trustScore",
    "verdict",
    "summary",
    "criminalProfile",
    "lies",
    "evidence",
    "analysis",
    "degenComment",
    "tokenAddress",
    "tokenName",
    "tokenSymbol",
    "onChain",
    "market",
    "marketAvailable",
    "dataCompleteness",
    "rugCheck",
    "rugCheckAvailable",
    "creatorHistory",
    "socials",
    "elephantMemory",
    "analyzedAt",
    "analysisTimeMs",
  ],
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
      anomalies: market.anomalies && market.anomalies.length > 0
        ? market.anomalies
        : ["None detected"],
      anomaliesSummary:
        market.anomalies && market.anomalies.length > 0
          ? market.anomalies.join("; ")
          : "None detected",
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
        rugCheck.risks && rugCheck.risks.length > 0
          ? rugCheck.risks.map((risk) => risk.name).join("; ")
          : "None detected",
    };
    const normalizedLies =
      result.lies && result.lies.length > 0 ? result.lies : ["None detected"];
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
    return {
      content: [{ type: "text" as const, text: JSON.stringify(mcpResult, null, 2) }],
      structuredContent: mcpResult,
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
    return {
      content: [{ type: "text" as const, text: JSON.stringify(mcpResult, null, 2) }],
      structuredContent: mcpResult,
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
