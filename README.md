# Veritas (TON) — Visual Security Oracle

## 1) Executive Summary

**Veritas is an Application-to-Application (A2A) visual security oracle for the TON ecosystem.**  
It produces a structured, machine-consumable fraud-risk report for TON jettons by combining:

- **On-chain signals** (TonAPI jetton metadata + holder distribution)
- **Market signals** (GeckoTerminal pools for liquidity/volume/FDV)
- **Visual forensics** (website screenshot capture + Gemini multimodal analysis)
- **Criminal memory** (MongoDB “Elephant Memory” and ThreatLedger cache)

Veritas is designed to be consumed by **both humans (Telegram Mini App)** and **agents (MCP tools)** without forking the core intelligence pipeline.

---

## 2) Architecture

Veritas is a dual-layer system:

### Layer 1 — Model Context Protocol (MCP) server (AI agents)

Purpose: provide a **single synchronous tool call** returning a complete structured payload suitable for agent workflows.

- **STDIO MCP server**: `mcp-core/mcp-server.ts`
- **HTTP MCP server** (SSE + Streamable HTTP): `mcp-core/server-http.ts`
- Core tool: `analyze_token` → calls `VeritasInvestigator.investigate()` and returns a unified intelligence object.

### Layer 2 — Telegram Mini App (retail users)

Purpose: maximize scan completion and reduce user abandonment via **progressive disclosure**.

- UI: `src/components/truth/TruthConsole.tsx`
- Two concurrent backend channels:
  - **Fast**: `POST /api/analyze-fast` → on-chain + market metrics for immediate HUD
  - **Slow**: `POST /api/analyze-unified` → full unified pipeline (Gemini vision + verdict)

Both layers share the same security posture (Telegram initData validation) and the same “slow” unified pipeline for the final verdict.

---

## 3) The Hybrid Cache (ThreatLedger)

### MongoDB ThreatLedger (24h cache for expensive/static work)

The `scan_ledger` collection stores cached scan results (ThreatLedger) using the existing MongoDB connection:

- File: `src/lib/db/elephant.ts`
- Collection: `scan_ledger`
- Key: `{ tokenAddress, chain: "TON" }`
- Payload: `{ result, modelUsed, scannedAt }`
- TTL policy: **24 hours** (enforced in application logic)

### Hybrid cache rule: cache static, refresh dynamic

To avoid serving stale market conditions (rug-pull risk), Veritas uses a hybrid approach:

- **Cached for 24 hours (static/expensive)**:
  - Gemini vision forensics + reasoning
  - Screenshot capture output
  - Deterministic contract posture fields (mint/freeze authority, etc.)

- **Refetched every request (dynamic/cheap)**:
  - GeckoTerminal market metrics (liquidity, 24h volume, market cap, anomalies)
  - TonAPI jetton supply/decimals used for display and derived values

Implementation:

- `VeritasInvestigator.investigate()` checks `getCachedScan(address)`.
- On ledger hit, it **does not return immediately**.  
  It fetches fresh `getMarketAnalysis(address)` and `getTokenInfo(address)` and **patches** the cached object before returning it.

This preserves a 24-hour cache on expensive AI work while guaranteeing real-time market safety signals are never stale.

---

## 4) Ecosystem Compliance

Veritas implements the mandatory TON + Telegram compliance stack expected by TON ecosystem grant reviewers.

### TON Connect (mandatory wallet connection)

- Dependency: `@tonconnect/ui-react`
- Provider: `src/components/providers/TonConnectProvider.tsx`
  - `manifestUrl`: `https://veritas-on-ton.vercel.app/tonconnect-manifest.json`
- App integration: `src/app/layout.tsx` wraps the app with `TonConnectProvider`
- UI button: `TonConnectButton` is rendered in the Mini App UI (`TruthConsole`)

### Telegram Web Apps lifecycle (native UX)

Telegram Web App script is injected via Next.js:

- `src/app/layout.tsx` loads: `https://telegram.org/js/telegram-web-app.js`

Client-side lifecycle is applied in the Mini App UI:

- `window.Telegram.WebApp.ready()`
- `window.Telegram.WebApp.expand()`
- `window.Telegram.WebApp.setHeaderColor(window.Telegram.WebApp.themeParams.bg_color)`

This prevents half-height sheet UX, avoids SSR crashes, and synchronizes native header theming.

### Backend cryptographic validation (HMAC-SHA256)

All protected API routes validate Telegram `initData`:

- Utility: `src/lib/security/telegram.ts` (`validateTelegramData(initData, TELEGRAM_BOT_TOKEN)`)
- Routes:
  - `POST /api/analyze-unified`
  - `POST /api/analyze-fast`

The client sends:

- Header: `x-telegram-init-data: window.Telegram?.WebApp?.initData || ""`

If the header is missing or invalid, the API returns **401 Unauthorized**.

---

## 5) Installation and Execution

### Prerequisites

- Node.js (recommended: current LTS)
- npm
- Optional: MongoDB Atlas (for Elephant Memory + ThreatLedger)

### Install dependencies

```bash
npm install
```

### Environment variables

Create `.env.local`:

```bash
cp .env.example .env.local
```

Set at minimum:

```bash
# Required for Telegram request authentication
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# Required for Gemini vision analysis
GEMINI_API_KEY=your_gemini_api_key
```

Optional (recommended for persistence + caching):

```bash
# Enables Elephant Memory + ThreatLedger
MONGODB_URI=mongodb+srv://...
```

Optional (for screenshot capture provider):

```bash
SCREENSHOTONE_ACCESS_KEY=your_screenshotone_key
```

### Run the Next.js app (Telegram Mini App + API)

```bash
npm run dev
```

Production build:

```bash
npm run build
npm run start
```

### Run MCP servers

#### STDIO MCP (for local tool runners / agent hosts)

```bash
npm run mcp
```

#### HTTP MCP (SSE + Streamable HTTP)

```bash
npm run start:mcp
```

Default port:

- `MCP_PORT` or `PORT` (falls back to `4000`)

# VERITAS: Visual Security Oracle for TON Agents

> Trust no one. Verify everything.

Veritas is a Model Context Protocol (MCP) server designed specifically for autonomous trading bots and AI agents on the TON network. It acts as a visual security oracle, providing deterministic, machine-readable risk assessments of TON smart contracts by combining on-chain data with Gemini 3 computer vision analysis.

## 🎯 What It Does

Veritas allows any Telegram bot, trading agent, or sniper script to execute a standard MCP tool call (`analyze_token`) and receive a strict JSON payload containing risk integers, boolean flags, and a deterministic safety verdict.

**Agents receive instant data on:**
* On-chain state (Mint/Freeze authorities, supply distribution)
* Market metrics (Liquidity, 24h volume, bot activity)
* Vision intelligence (Has the project website reused known scam templates?)

## 🏗️ Architecture: MCP First

Veritas is not a consumer web app. It is backend infrastructure for autonomous agents.

1. **The Core:** An MCP server communicating via `stdio` or `SSE` using standard JSON-RPC 2.0.
2. **The Brain:** A deterministic scoring engine powered by Google Gemini 3 (temperature locked to 0) that analyzes live TonAPI data and captured website screenshots.
3. **The Debugger:** A Next.js visual dashboard included in this repository strictly for human verification of the AI reasoning trace.

## 🚀 How Agents Connect (Getting Started)

### Prerequisites
* Node.js 18+
* Gemini API Key (`GEMINI_API_KEY`)

### Installation
```bash
git clone https://github.com/Ticoworld/veritas-on-ton.git
cd veritas-on-ton
npm install
```

### Start the MCP Server (Agent Transport)
To run the primary stdio transport layer for bot integration:
```bash
npx tsx src/mcp-server.ts
```

### Start the Visual Debugger (Human UI)
To run the Next.js interface and view the reasoning trace:
```bash
npm run dev
```

## 📦 Machine-Readable Payload (BotAnalysisOutput)

When an agent calls the `analyze_token` tool, Veritas returns strict, parsable JSON. No narrative fluff.

```json
{
  "trustScore": 62,
  "verdict": "Caution",
  "onChain": {
    "mintAuthorityEnabled": false,
    "freezeAuthorityEnabled": false,
    "isDumped": false,
    "isWhale": true,
    "top10Percentage": 85.4,
    "creatorPercentage": 12.1
  },
  "market": {
    "botActivity": "Medium",
    "washTradeScore": 0,
    "liquidity": 179786.63,
    "volume24h": 2785.45,
    "marketCap": 41873796.82
  }
}
```

## 🏆 Built for the TON Agent Tooling Track
This infrastructure allows developers to instantly plug visual scam detection into their existing Telegram trading bots using the official Model Context Protocol.

## 📄 License
MIT