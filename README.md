## Veritas — TON Website Truth & Trust Investigator

**Veritas is a Telegram-native TON trust investigation agent that checks website claims, token controls, authority-linked history, website drift, and repeated trust‑abuse patterns in one scan.**

It is built to answer a concrete user question:

> “If I tap this meme coin link in Telegram, what does its own website, token contract, and launch history really say about trust?”

Veritas is not a generic “all-in-one scanner.” Its wedge is **website truth + authority history + cross‑scan abuse patterns**, surfaced inside a Telegram Mini App and bot.

---

## Problem

Most TON token scanners focus on:

- contract flags (mint / freeze / proxy)
- holder concentration
- basic market stats

They rarely look at:

- what the **website actually claims** (audit / partner / ecosystem / renounced)
- whether those claims are **supported, unverified, or contradicted**
- whether this **authority has launched risky tokens before**
- whether the **website quietly changed** after launch
- whether **similar trust patterns** appeared across prior suspicious tokens

For Telegram users, this means:

- “safe” scores on tokens with deceptive landing pages
- no memory of serial launchers and reused domains
- no honest “Cannot verify” when data is missing

---

## Solution

Veritas runs a **single investigation pipeline** for a TON jetton address that combines:

- **Claims check** — structured audit/partner/sponsor/ecosystem/renounced/listing claims, with verification status and evidence.
- **Authority history** — prior launches **linked to this mint/freeze authority** in Veritas records, with careful copy that never claims deployer identity.
- **Website drift** — comparison of the current website against prior snapshots (by token first, then domain) to highlight material trust‑signal changes.
- **Reputation signals** — repeated trust‑abuse patterns across scans (same domain in prior flagged scans, repeated unsupported claim motifs, weak visual repetition), with strong vs weak signal hierarchy.

All of this is presented inside:

- a **Telegram bot** (verdict card + Full Report), and
- a **Telegram Mini App** (Truth Console UI) backed by a Next.js app.

---

## Why Veritas is different

Most TON scanners:

- stop at contract + liquidity checks,
- ignore website content beyond “has URL,” and
- treat every scan as stateless.

Veritas is different in four ways:

- **Claims check** — it extracts trust claims from the website (audit / partner / sponsor / ecosystem / renounced / listing) and classifies each as **verified / unverified / contradicted / unknown**, with short evidence and deterministic on‑chain overrides for “renounced”.
- **Authority history** — it persists **authority‑linked launch history** keyed by mint/freeze authority (not deployer), and surfaces prior suspicious/high‑risk launches with explicit “in our records” and “authority may not be the original deployer” caveats.
- **Website drift** — it stores website snapshots per scan, then compares the current page against prior token/domain snapshots to flag added/removed claims, social changes, and technical page/branding changes.
- **Reputation signals** — it looks for **repeated patterns** across scans (same domain in prior flagged tokens, repeated unsupported trust claims, authority plus pattern) and labels each signal as **strong** or **weak** so that only meaningful repetition influences the top summary.

The result is a Telegram‑native experience that **feels like a forensic investigator with memory**, not just another score.

---

## Core features

- **Telegram bot verdict card**
  - Verdict: Likely legitimate / Suspicious / High risk / Cannot verify.
  - Short reasons plus screenshot link when available.
  - Inline buttons: Full report, Why risky, Rescan.

- **Telegram Mini App (“Truth Console”)**
  - Fast HUD (on‑chain + market) and full unified report.
  - Top “Finding” block that can surface a strong claim, authority, drift, or reputation signal.
  - Dedicated sections for **Claims check**, **Authority history**, **Website drift**, and **Reputation signals**.

- **Claims check (Phase 1)**
  - Claim types: `audit | partner | sponsor | ecosystem | renounced | listing`.
  - Each claim has `verificationStatus: verified | unverified | contradicted | unknown` plus short evidence.
  - On‑chain override for `renounced` (mint/freeze authorities disabled vs still enabled).

- **Authority history (Phase 2)**
  - MongoDB `deployer_lineage` collection keyed by authority address (mint/freeze).
  - `LineageSummary` reports number of prior launches, counts for suspicious/high‑risk vs cannot‑verify, and a list of prior tokens with verdict labels.
  - Copy always says “this authority appears in N prior tokens in our records”; it never claims deployer identity.

- **Website drift (Phase 3)**
  - `website_snapshots` collection stores per‑scan website URL, domain, visual summary, claims, socials, content fingerprint, and optional screenshot URL.
  - On each scan, Veritas compares the current snapshot against the best prior snapshot (same token first, else same domain) and reports whether material trust‑signal changes were detected.

- **Reputation signals (Phase 4, hardened)**
  - **Strong signals**:
    - Same domain seen in prior suspicious/high‑risk scans.
    - Repeated **claim combination** (2+ types) in prior flagged tokens.
    - Repeated **unsupported/contradicted** claim motif in prior flagged tokens.
    - **Authority + pattern**: this authority has prior flagged launches **and** a domain or strong claim motif also appears in prior flagged scans.
  - **Weak signals**:
    - Generic single‑type repetition (e.g. “audit” alone) across flagged tokens.
    - Repeated visual fingerprint (same normalized visual summary hash).
  - Only **strong** signals can drive the top‑level reputation finding; weak signals are always marked as such.

---

## How it works (high‑level flow)

1. User sends a TON jetton address in Telegram (bot chat or Mini App).
2. Backend normalizes the address and passes it to `VeritasInvestigator.investigate(address)`.
3. Investigator:
   - checks **Elephant Memory** for known scammers (instant block),
   - fetches on‑chain and market data (TonAPI adapter + market API),
   - fetches creator history,
   - resolves socials and project website,
   - captures a screenshot (ScreenshotOne / Microlink),
   - calls **Gemini** with on‑chain + market + visual context for unified analysis,
   - applies on‑chain claim verification,
   - computes trust score and verdict,
   - persists scan to Mongo (ThreatLedger cache, authority history, website snapshot),
   - derives website drift and reputation signals.
4. The **Telegram bot** formats a verdict card and optional full report.
5. The **Mini App** fetches the same unified result and renders the Truth Console.

---

## Architecture diagram (Mermaid)

```mermaid
flowchart LR
  tgUser[Telegram user] --> botOrMini[(Telegram Bot / Mini App)]

  subgraph Frontend / API
    botOrMini --> nextAPI[Next.js API<br/>/api/analyze-fast<br/>/api/analyze-unified]
    botOrMini --> tgWebhook[Telegram bot webhook<br/>/api/telegram/webhook]
  end

  nextAPI --> investigator[Veritas Investigator<br/>(unified scan service)]
  tgWebhook --> investigator

  investigator --> tonApi[TON RPC / TonAPI adapter]
  investigator --> market[Market data<br/>(DexScreener / market API)]
  investigator --> screenshot[Website screenshot<br/>(ScreenshotOne / Microlink)]
  investigator --> gemini[Gemini vision + analysis]
  investigator --> mongo[(MongoDB / Elephant Memory)]

  mongo --> investigator

  investigator --> nextAPI
  investigator --> tgWebhook

  nextAPI --> botOrMini
  tgWebhook --> tgUser
```

---

## Telegram + Mini App user flow

- **Telegram bot**
  - `/start` explains what Veritas does and how to submit a token address.
  - User pastes a TON jetton address (48‑character friendly base64).
  - Bot runs the unified investigation and returns:
    - a compact verdict card (verdict, confidence band, 2–4 strongest reasons, coverage summary, visual status),
    - an optional screenshot photo with caption when screenshot capture and public URL are configured,
    - inline buttons for **Full report** and **Why risky?** that expand into multi‑section messages (Claims check, Website drift, Authority history, Reputation signals, Unknowns & limitations, Next actions).

- **Telegram Mini App (Truth Console)**
  - Launched from the bot or as a pinned app.
  - User pastes the jetton address and triggers a scan.
  - UI shows:
    - **Fast lane**: quick on‑chain + market HUD.
    - **Slow lane**: full unified report once Gemini + screenshot work completes.
  - Sections:
    - Summary (trust score, verdict, “Finding” block).
    - Top reasons (evidence bullets).
    - AI Vision (visual narrative).
    - Claims check.
    - Website drift.
    - Authority history.
    - Reputation signals.
    - Limitations note when visual or market data is missing.

---

## Tech stack

- **Runtime / framework**
  - Next.js 16 (App Router, API routes) on Node.js.
  - TypeScript end‑to‑end.

- **Telegram**
  - Telegram Bot API webhook: `src/app/api/telegram/webhook/route.ts`.
  - Telegram Web Apps (Mini App) via `@twa-dev/sdk`.

- **TON / data**
  - TON blockchain adapter for jetton metadata and holders (`src/lib/blockchain.ts`).
  - Market data via DexScreener / market API wrapper (`src/lib/api/market.ts`).
  - Creator history (`src/lib/api/historian.ts`).

- **AI and vision**
  - Google Gemini via `@google/genai` (`src/lib/ai/unified-analyzer.ts`).
  - Screenshot capture via ScreenshotOne (and Microlink fallback) in `src/lib/api/screenshot.ts`.

- **Persistence**
  - MongoDB (Atlas or self‑hosted) via `src/lib/db/mongodb.ts`.
  - **Elephant Memory** in `src/lib/db/elephant.ts`:
    - `scammers` — known scammer authorities.
    - `scan_ledger` — 24h ThreatLedger cache of full results.
    - `deployer_lineage` — authority history records.
    - `website_snapshots` — website drift + reputation base.

- **MCP (optional)**
  - MCP servers in `mcp-core/` (stdio + HTTP) expose the same `VeritasInvestigator` for agents, but the hackathon focus is Telegram and the Mini App.

---

## Setup instructions

### 1. Install dependencies

```bash
git clone https://github.com/your-org/veritas-on-ton.git
cd veritas-on-ton
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill at least:

```bash
GEMINI_API_KEY=your_gemini_api_key_here

# Telegram bot
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
# Optional but recommended: secret to protect the webhook
TELEGRAM_WEBHOOK_SECRET=your_shared_secret

# MongoDB (Elephant Memory + ThreatLedger)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/veritas

# Screenshot + public URL (for Telegram photo messages)
VERITAS_SAVE_SCREENSHOTS=true
VERITAS_PUBLIC_BASE_URL=https://your-app.vercel.app
SCREENSHOTONE_ACCESS_KEY=your_screenshotone_key
```

Recommended additional variables (if used in your deployment):

- `RUGCHECK_API_KEY` — external contract risk API (if configured).
- `MCP_PORT` / `PORT` — for the HTTP MCP server when used.

### 3. Run the Next.js app (Mini App + APIs)

```bash
npm run dev
```

This starts:

- the Telegram Mini App frontend under the Next.js dev server, and
- the REST APIs (`/api/analyze-fast`, `/api/analyze-unified`, `/api/telegram/webhook`).

For production:

```bash
npm run build
npm run start
```

### 4. Configure Telegram webhook

1. Set `TELEGRAM_BOT_TOKEN` and (optionally) `TELEGRAM_WEBHOOK_SECRET`.
2. Deploy the Next.js app to a public URL (e.g. Vercel).
3. Set the bot webhook to `https://your-app.vercel.app/api/telegram/webhook` (include the secret in BotFather if using `TELEGRAM_WEBHOOK_SECRET`).

### 5. (Optional) Start MCP servers

If you want to use Veritas from agent frameworks via MCP:

```bash
# STDIO MCP
npm run mcp

# HTTP MCP (SSE / Streamable HTTP)
npm run start:mcp
```

---

## Demo flow (for judges)

You can also use `docs/DEMO_TEST_TEMPLATE.md` as a runbook. A simple live demo:

1. **Legit token**
   - Paste a well‑known TON jetton address.
   - Show the verdict (likely legitimate), stable trust score, clean Claims check section, and “no major visual deception” in Visual + Website drift.
2. **Suspicious / high‑risk token**
   - Paste a token with risky controls (enabled mint/freeze, high holder concentration) and a promotional website.
   - Show:
     - mint/freeze warnings in the on‑chain section,
     - contradicted or unsupported claims in the Claims check,
     - authority history if this authority appears in prior flagged tokens,
     - any website drift (claims added/removed, social changes),
     - reputation signals (same domain / repeated unsupported claim motif) when present.
3. **Cannot verify token**
   - Paste a token with no real project website or missing market/on‑chain data.
   - Show the **“Cannot verify”** verdict, explicit coverage gaps (visual / market / on‑chain), and that no false certainty is claimed.

---

## Limitations and honesty

Veritas is a **decision support tool**, not an oracle of truth:

- It cannot see private keys, off‑chain agreements, or undisclosed team behavior.
- Gemini’s analysis is bounded by the screenshot, on‑chain/market data, and search context at scan time.
- Website drift and reputation signals are only as strong as the history Veritas has stored; new tokens and untouched domains will have limited history.
- Authority history is keyed by mint/freeze authority. That address may not be the original deployer; the UI and bot copy state this explicitly.
- Repetition of claims, domains, or visual patterns is **evidence**, not proof of a scam network. The copy deliberately avoids “scam proof” or “fraud proven” language.

Users and integrators should treat Veritas as **one strong input** into their risk process, not the sole arbiter.

---

## Why this matters for TON users

TON is growing quickly, with many tokens launched and promoted directly inside Telegram.  
The surface area for **website‑level deception** and **serial launchers** is large, and most scanners do not look there.

Veritas gives TON users and bots:

- fast visibility into **what the website claims**, whether those claims are supported, and how the contract is actually configured;
- context on whether this **authority has appeared in prior suspicious launches**;
- an explanation of **how the website changed** over time; and
- a memory of **repeated trust‑abuse patterns** across scans.

This combination makes “open a link → paste an address” in Telegram meaningfully safer without promising perfect safety.

---

## Submission‑ready closing

Veritas is ready to be:

- **run locally** (Next.js + MongoDB + Gemini + Telegram bot), or
- **deployed** to a public URL for Track 2 Telegram demos.

The codebase is organized so that:

- `VeritasInvestigator` remains the single source of truth for investigations,
- the Telegram bot and Mini App are thin presentation layers on top of the same unified result, and
- MongoDB’s Elephant Memory cleanly separates fast cache (ThreatLedger) from longer‑lived history (authority, website snapshots, reputation).

If you want to evaluate or extend Veritas, start from:

- `src/lib/services/VeritasInvestigator.ts` — unified investigation pipeline
- `src/app/api/telegram/webhook/route.ts` — Telegram bot entrypoint
- `src/components/truth/TruthConsole.tsx` — Mini App Truth Console

Everything else is implementation detail. The core idea is simple:  
**make website truth, authority history, and repeated trust‑abuse patterns visible to TON users where they trade — inside Telegram.**

