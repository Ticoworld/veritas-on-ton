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