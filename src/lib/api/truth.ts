/**
 * Truth Engine - Core Data Aggregator
 * The heart of Veritas: fetches and combines all forensic data sources
 */

import { getTokenSocials } from "./dexscreener";
import { getMarketAnalysis, type MarketAnalysis } from "./market";
import { getCreatorHistory, type CreatorTokenHistory } from "./historian";
import {
  fetchScreenshotAsBase64,
  getMicrolinkUrl,
  getTwitterScreenshotUrl,
} from "./screenshot";
import type { TokenSocials } from "@/types";

// =============================================================================
// TYPES
// =============================================================================

/**
 * RugCheck API response for token risk report
 */
export interface RugCheckReport {
  score: number; // 0-100, higher = riskier
  risks: RugCheckRisk[];
  creator?: string; // Deployer wallet address (for Elephant Memory)
}

export interface RugCheckRisk {
  name: string;
  description: string;
  level: "info" | "warn" | "danger";
  score: number;
}

/**
 * Screenshot evidence bundle
 */
export interface Evidence {
  websiteScreenshot: { base64: string; mimeType: string } | null;
  twitterScreenshot: { base64: string; mimeType: string } | null;
}

/**
 * Security flags from on-chain analysis
 */
export interface SecurityFlags {
  mintAuthorityEnabled: boolean;
  freezeAuthorityEnabled: boolean;
  // Derived from MarketAnalysis
  honeypotRisk: boolean;
  washTradingDetected: boolean;
}

/**
 * Complete Truth Data - All forensic evidence combined
 */
export interface TruthData {
  // Token Identity (from DexScreener)
  tokenProfile: TokenSocials;

  // Market Metrics (from DexScreener via market.ts)
  marketMetrics: {
    liquidity: number;
    marketCap: number;
    volume24h: number;
    priceChange24h: number;
    buySellRatio: number;
    botActivity: "Low" | "Medium" | "High";
    anomalies: string[];
    ageInHours: number; // Token age from pairCreatedAt
  } | null;

  // Security Analysis (derived from market + contract audit)
  security: SecurityFlags;

  // Contract audit (previously RugCheck). TODO: Replace with TON API
  rugCheck: RugCheckReport | null;

  // Creator History (Serial Killer Detection)
  creatorHistory: {
    creatorAddress: string | null;
    previousTokens: CreatorTokenHistory[];
    isSerialLauncher: boolean; // More than 2 tokens = suspicious
  };

  // Visual Evidence (Screenshots)
  evidence: Evidence;

  // Metadata
  fetchedAt: string;
  address: string;
}

// =============================================================================
// CONTRACT AUDIT (TON Security)
// TODO: Replace with TON API - integrate TON contract audit when available.
// =============================================================================

async function fetchRugCheck(_mint: string): Promise<RugCheckReport | null> {
  // TODO: Replace with TON API
  return null;
}

// =============================================================================
// MAIN AGGREGATOR
// =============================================================================

/**
 * Fetches all truth data for a token address
 * This is the core function that powers the Truth Engine
 *
 * @param address Token/contract address (TON).
 * @returns Complete TruthData object with all forensic evidence
 */
export async function fetchTruthData(address: string): Promise<TruthData> {
  console.log(`\n[Truth Engine] ⚡ Starting forensic scan: ${address.slice(0, 8)}...`);
  const startTime = Date.now();

  // =========================================================================
  // STEP A: Parallel Data Fetching (Independent APIs)
  // =========================================================================

  const [tokenProfile, marketAnalysis, rugCheck] = await Promise.all([
    // 1. Token socials from DexScreener
    getTokenSocials(address).catch((e) => {
      console.error("[Truth Engine] DexScreener failed:", e);
      return {} as TokenSocials;
    }),

    // 2. Market metrics + bot detection
    getMarketAnalysis(address).catch((e) => {
      console.error("[Truth Engine] Market analysis failed:", e);
      return null;
    }),

    // 3. Contract audit. TODO: Replace with TON API
    fetchRugCheck(address),
  ]);

  // =========================================================================
  // STEP B: Screenshot Evidence (Depends on tokenProfile for URLs)
  // =========================================================================

  let websiteScreenshot: { base64: string; mimeType: string } | null = null;
  let twitterScreenshot: { base64: string; mimeType: string } | null = null;

  // Fetch screenshots in parallel (but only if URLs exist)
  const screenshotPromises: Promise<void>[] = [];

  if (tokenProfile.website) {
    screenshotPromises.push(
      (async () => {
        try {
          const url = getMicrolinkUrl(tokenProfile.website!, true);
          websiteScreenshot = await fetchScreenshotAsBase64(url);
        } catch (e) {
          console.warn("[Truth Engine] Website screenshot failed:", e);
        }
      })()
    );
  }

  if (tokenProfile.twitter) {
    screenshotPromises.push(
      (async () => {
        try {
          const url = getTwitterScreenshotUrl(tokenProfile.twitter!);
          twitterScreenshot = await fetchScreenshotAsBase64(url);
        } catch (e) {
          console.warn("[Truth Engine] Twitter screenshot failed:", e);
        }
      })()
    );
  }

  // Wait for screenshots (with timeout protection built into fetchScreenshotAsBase64)
  await Promise.all(screenshotPromises);

  // =========================================================================
  // STEP C: Creator History (Requires creator address - get from rugCheck or other source)
  // =========================================================================

  let creatorAddress: string | null = null;
  let previousTokens: CreatorTokenHistory[] = [];

  // Try to get creator from contract audit data. TODO: Replace with TON API for creator
  if (rugCheck?.creator) {
    creatorAddress = rugCheck.creator;
    console.log(`[Truth Engine] 🎯 Creator detected: ${creatorAddress.slice(0, 8)}...`);
  }

  if (creatorAddress) {
    try {
      previousTokens = await getCreatorHistory(creatorAddress);
    } catch (e) {
      console.warn("[Truth Engine] Creator history failed:", e);
    }
  }

  // =========================================================================
  // STEP D: Derive Security Flags
  // =========================================================================

  const security: SecurityFlags = {
    // TODO: Replace with TON API for on-chain authority flags
    mintAuthorityEnabled:
      rugCheck?.risks.some((r) =>
        r.name.toLowerCase().includes("mint")
      ) ?? false,
    freezeAuthorityEnabled:
      rugCheck?.risks.some((r) =>
        r.name.toLowerCase().includes("freeze")
      ) ?? false,
    honeypotRisk:
      (marketAnalysis?.buySellRatio ?? 0) > 20 ||
      rugCheck?.risks.some((r) =>
        r.name.toLowerCase().includes("honeypot")
      ) ||
      false,
    washTradingDetected: (marketAnalysis?.washTradeScore ?? 0) > 50,
  };

  // =========================================================================
  // STEP E: Assemble Final TruthData Object
  // =========================================================================

  const elapsed = Date.now() - startTime;
  console.log(`[Truth Engine] ✅ Scan complete in ${elapsed}ms`);

  return {
    address,
    tokenProfile,
    marketMetrics: marketAnalysis
      ? {
          liquidity: marketAnalysis.liquidity,
          marketCap: marketAnalysis.marketCap,
          volume24h: marketAnalysis.volume24h,
          priceChange24h: marketAnalysis.priceChange24h,
          buySellRatio: marketAnalysis.buySellRatio,
          botActivity: marketAnalysis.botActivity,
          anomalies: marketAnalysis.anomalies,
          ageInHours: marketAnalysis.ageInHours,
        }
      : null,
    security,
    rugCheck,
    creatorHistory: {
      creatorAddress,
      previousTokens,
      isSerialLauncher: previousTokens.length > 2,
    },
    evidence: {
      websiteScreenshot,
      twitterScreenshot,
    },
    fetchedAt: new Date().toISOString(),
  };
}
