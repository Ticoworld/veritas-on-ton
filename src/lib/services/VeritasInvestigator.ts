/**
 * VERITAS INVESTIGATOR - Master Service Class
 * 
 * The Grand Unification: Single orchestrator for all token fraud detection.
 * Replaces the fragmented analyze/scan/unified routes.
 * 
 * Flow:
 * 1. Check Elephant Memory (instant block for known scammers)
 * 2. Fetch Data Pipeline (blockchain, DexScreener, Market, Screenshots). TODO: Replace with TON API.
 * 3. AI Analysis (Unified Analyzer - "Sherlock" brain)
 * 4. Save to Elephant Memory (if DANGER/SCAM verdict)
 */

import { getTokenInfo, getHolderDistribution, validateAddress } from "@/lib/blockchain";
import { getTokenSocials } from "@/lib/api/dexscreener";
import { getMarketAnalysis } from "@/lib/api/market";
import { getCreatorHistory } from "@/lib/api/historian";
import { fetchScreenshotAsBase64 } from "@/lib/api/screenshot";
import { fetchTonSecurity, type TonSecurityReport } from "@/lib/api/tonsecurity";
import { runUnifiedAnalysis, type UnifiedAnalysisInput, type UnifiedAnalysisResult } from "@/lib/ai/unified-analyzer";
import { checkKnownScammer, flagScammer, type ScammerRecord } from "@/lib/db/elephant";
import { LRUCache } from "lru-cache";

// =============================================================================
// TYPES
// =============================================================================

export interface InvestigationResult {
  // Core verdict
  trustScore: number;
  verdict: "Safe" | "Caution" | "Danger";
  summary: string;
  criminalProfile: string;
  
  // Evidence
  lies: string[];
  evidence: string[];
  analysis: string[];
  visualAnalysis?: string;

  // Visual forensics fields
  visualEvidenceStatus: "captured" | "not_captured";
  visualAssetReuse: "YES" | "NO" | "UNKNOWN";
  visualEvidenceSummary: string;

  // Pre-composed display block for MCP agents (THE primary output)
  veritasSays: string;

  // Degen Commentary - The Real Talk
  degenComment: string;
  
  /** Thought summary from Gemini (Reasoning Trace for UI) */
  thoughtSummary?: string;
  
  // Token metadata
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  
  // On-chain data
  onChain: {
    mintAuth: string | null;
    freezeAuth: string | null;
    supply: number;
    decimals: number;
    top10Percentage: number;
    creatorPercentage: number;
    isDumped: boolean;
    isWhale: boolean;
  };
  
  // Market data
  market: {
    liquidity: number;
    volume24h: number;
    marketCap: number;
    buySellRatio: number;
    ageInHours: number;
    botActivity: string;
    anomalies: string[];
  } | null;
  
  // RugCheck audit
  rugCheck: {
    score: number;
    risks: Array<{
      name: string;
      description: string;
      level: string;
      score: number;
    }>;
  } | null;
  
  // Creator history
  creatorHistory: {
    creatorAddress: string;
    previousTokens: number;
    isSerialLauncher: boolean;
  };
  
  // Social links
  socials: {
    website?: string;
    twitter?: string;
    telegram?: string;
    discord?: string;
  };
  
  // Metadata
  elephantMemory: {
    isKnownScammer: boolean;
    previousFlags?: ScammerRecord;
  };
  
  analyzedAt: string;
  analysisTimeMs: number;
}

// =============================================================================
// LRU CACHE (5-min TTL, persists across Next.js hot reloads)
// =============================================================================
const globalForCache = globalThis as unknown as {
  veritasResultCache?: LRUCache<string, InvestigationResult>;
};
const resultCache = (globalForCache.veritasResultCache ??= new LRUCache<string, InvestigationResult>({
  max: 50,
  ttl: 5 * 60 * 1000, // 5 min
}));

// =============================================================================
// VERITAS INVESTIGATOR CLASS
// =============================================================================

export class VeritasInvestigator {
  private startTime: number = 0;
  
  /**
   * Main investigation entry point
   */
  async investigate(tokenAddress: string): Promise<InvestigationResult> {
    // Cache check — repeat scans return in ~0ms
    const cacheKey = tokenAddress.trim();
    const cached = resultCache.get(cacheKey);
    if (cached) {
      console.log(`[Veritas] ⚡ Cache hit for ${tokenAddress.slice(0, 8)}`);
      return cached;
    }

    this.startTime = Date.now();
    console.log(`\n[Veritas Investigator] 🔍 Starting investigation for ${tokenAddress.slice(0, 8)}...`);
    
    if (!validateAddress(tokenAddress)) {
      throw new Error("Invalid token address format");
    }

    // =========================================================================
    // PHASE 1: ELEPHANT MEMORY CHECK (Instant Block)
    // =========================================================================
    console.log("[Veritas Investigator] 🐘 Phase 1: Checking Elephant Memory...");

    const tokenInfo = await getTokenInfo(tokenAddress);
    const creatorAddress = tokenInfo.mintAuthority || tokenInfo.freezeAuthority;
    
    if (creatorAddress) {
      const knownScammer = await checkKnownScammer(creatorAddress);
      if (knownScammer) {
        const elapsed = Date.now() - this.startTime;
        console.log(`[Veritas Investigator] 🚨 INSTANT BLOCK in ${elapsed}ms - Known scammer detected!`);
        return this.buildKnownScammerResult(tokenAddress, tokenInfo, creatorAddress, knownScammer, elapsed);
      }
    }
    
    console.log("[Veritas Investigator] ✅ No prior record found. Proceeding with full analysis...");
    
    // =========================================================================
    // PHASE 2: DATA PIPELINE (All in parallel — holders included)
    // =========================================================================
    console.log("[Veritas Investigator] 📊 Phase 2: Fetching data in parallel...");
    
    const decimals = tokenInfo.decimals || 0;
    const supply = Number(tokenInfo.supply) / Math.pow(10, decimals);

    const [socials, marketData, rugCheckReport, holderResult] = await Promise.all([
      getTokenSocials(tokenAddress),
      getMarketAnalysis(tokenAddress),
      fetchTonSecurity(tokenAddress),
      getHolderDistribution(tokenAddress, supply, decimals),
    ]);

    const { topHolders, top10Percentage } = holderResult;
    
    const creatorStatus = this.analyzeCreator(
      tokenInfo.mintAuthority,
      tokenInfo.freezeAuthority,
      topHolders,
      supply
    );
    
    // =========================================================================
    // PHASE 3: SCREENSHOT + CREATOR HISTORY (Parallel, non-critical)
    // Screenshot runs for all real website URLs — vision is Veritas's primary edge.
    // =========================================================================
    const websiteUrl = socials?.website;
    const twitterUrl = socials?.twitter;

    const isRealWebsite =
      !!websiteUrl &&
      String(websiteUrl).trim() !== "" &&
      String(websiteUrl).trim().toLowerCase() !== "none" &&
      !websiteUrl.includes("t.me") &&
      !websiteUrl.includes("telegram.me") &&
      !websiteUrl.includes("x.com") &&
      !websiteUrl.includes("twitter.com");

    if (!websiteUrl) {
      console.log("[Veritas Investigator] 🌐 No website found — visual analysis skipped");
    } else if (!isRealWebsite) {
      console.log("[Veritas Investigator] 🌐 Social/redirect URL — screenshot skipped");
    } else {
      console.log(`[Veritas Investigator] 📸 Phase 3: Capturing website screenshot: ${websiteUrl}`);
    }

    const saveScreenshots = process.env.VERITAS_SAVE_SCREENSHOTS === "true";

    const [websiteScreenshot, creatorHistory] = await Promise.all([
      isRealWebsite
        ? fetchScreenshotAsBase64(websiteUrl!.trim(), {
            saveToDisk: saveScreenshots,
            prefix: "website",
            fullPage: true,
          }).catch(() => null)
        : Promise.resolve(null),
      getCreatorHistory(creatorStatus.creatorAddress).catch(() => [] as any[]),
    ]);

    if (isRealWebsite && websiteScreenshot) {
      console.log("[Veritas Investigator] ✅ Website screenshot captured");
    }
    
    // =========================================================================
    // PHASE 4: AI ANALYSIS (Vision-first)
    // =========================================================================
    console.log("[Veritas Investigator] 🤖 Phase 4: Running AI analysis (Vision-first)...");
    
    const tokenName = socials?.name || "Token";
    const tokenSymbol = socials?.symbol || "TOKEN";

    const analysisInput: UnifiedAnalysisInput = {
      tokenName,
      tokenSymbol,
      tokenAddress,
      mintAuth: tokenInfo.mintAuthority,
      freezeAuth: tokenInfo.freezeAuthority,
      top10Percentage,
      creatorPercentage: creatorStatus.creatorPercentage,
      isDumped: creatorStatus.isDumped,
      isWhale: creatorStatus.isWhale,
      websiteUrl: isRealWebsite ? websiteUrl : undefined,
      twitterUrl,
      marketData: marketData ? {
        liquidity: marketData.liquidity,
        volume24h: marketData.volume24h,
        marketCap: marketData.marketCap,
        buySellRatio: marketData.buySellRatio,
        ageInHours: marketData.ageInHours,
      } : undefined,
      websiteScreenshot: websiteScreenshot || undefined,
      missingWebsiteFlag: !isRealWebsite
        ? "Flag: No Website Detected. This indicates a very high risk of a low-effort rug pull."
        : undefined,
    };
    
    const aiResult = await runUnifiedAnalysis(analysisInput);
    
    if (!aiResult) {
      throw new Error("AI analysis failed to return result");
    }
    
    console.log(`[Veritas Investigator] 🎯 AI Verdict: ${aiResult.verdict} (Trust: ${aiResult.trustScore})`);

    // =========================================================================
    // TRUST SCORE: Deterministic ceiling + AI pull-down only
    // =========================================================================
    const deterministicScore = this.computeTrustScore(
      tokenInfo.mintAuthority,
      tokenInfo.freezeAuthority,
      top10Percentage,
      marketData,
      creatorStatus,
      rugCheckReport,
      marketData?.ageInHours ?? 0,
    );

    // AI can only pull DOWN, never inflate the deterministic score
    let finalScore = Math.min(deterministicScore, aiResult.trustScore);

    // SCAM TEMPLATE NUKE: Only fires when we have an actual screenshot.
    // Non-meme visual asset reuse hard-caps the score at 50.
    if (
      websiteScreenshot &&
      aiResult.visualAnalysis &&
      /VISUAL ASSET REUSE:\s*YES/i.test(aiResult.visualAnalysis) &&
      !/meme culture|meme aesthetic|thematic|standard for|pepe|wojak|doge|iconic meme|cultural|tribute|community meme/i.test(aiResult.visualAnalysis) &&
      finalScore > 50
    ) {
      console.log(`[Veritas Investigator] 🚨 Scam Template Nuke: ${finalScore} → 50`);
      finalScore = 50;
    }

    const finalVerdict: "Safe" | "Caution" | "Danger" =
      finalScore >= 70 ? "Safe" : finalScore >= 40 ? "Caution" : "Danger";

    console.log(
      `[Veritas Investigator] 🎯 Deterministic: ${deterministicScore} | AI: ${aiResult.trustScore} | Final: ${finalScore} (${finalVerdict})`
    );
    
    // =========================================================================
    // PHASE 5: ELEPHANT MEMORY SAVE (Flag Scammers)
    // =========================================================================
    if (creatorAddress && finalVerdict === "Danger") {
      console.log("[Veritas Investigator] 🐘 Phase 5: Flagging scammer in Elephant Memory...");
      await flagScammer(creatorAddress, tokenAddress, tokenName, finalVerdict, aiResult.summary);
      console.log("[Veritas Investigator] ✅ Scammer flagged for future instant detection");
    }

    // =========================================================================
    // PHASE 6: COMPOSE VISUAL FORENSICS FIELDS
    // =========================================================================
    const visualTrust = !!(websiteScreenshot && aiResult.visualAnalysis && aiResult.visualAnalysis.trim() !== "");
    const rawVisual = visualTrust ? aiResult.visualAnalysis! : null;

    const visualEvidenceStatus: "captured" | "not_captured" = visualTrust ? "captured" : "not_captured";

    const hasReuseYes = rawVisual ? /VISUAL ASSET REUSE:\s*YES/i.test(rawVisual) : false;
    const hasReuseNo  = rawVisual ? /VISUAL ASSET REUSE:\s*NO/i.test(rawVisual) : false;
    const visualAssetReuse: "YES" | "NO" | "UNKNOWN" = hasReuseYes ? "YES" : hasReuseNo ? "NO" : "UNKNOWN";

    const visualEvidenceSummary = rawVisual
      ? hasReuseYes
        ? `⚠️ VISUAL ASSET REUSE DETECTED. ${rawVisual.replace(/.*VISUAL ASSET REUSE:\s*YES\.?\s*/i, "").slice(0, 120)}`
        : `✅ ORIGINAL ASSETS. ${rawVisual.replace(/.*VISUAL ASSET REUSE:\s*NO\.?\s*/i, "").slice(0, 120)}`
      : !websiteUrl
      ? "No website — visual forensics not applicable."
      : !isRealWebsite
      ? "Social/redirect URL — no screenshot captured."
      : "Screenshot failed — visual forensics unavailable.";

    const visualAnalysisFinal = rawVisual
      ? rawVisual
      : !websiteUrl
      ? "No website found. Visual analysis could not be performed."
      : !isRealWebsite
      ? `Website URL appears to be a social media or redirect link (${websiteUrl}). No screenshot was captured.`
      : "Screenshot capture failed. Visual analysis could not be performed.";

    // =========================================================================
    // PHASE 7: BUILD VERITAS SAYS (pre-composed display block for MCP agents)
    // =========================================================================
    const ageHours = marketData?.ageInHours ?? 0;
    const ageDisplay = ageHours >= 48
      ? `${Math.floor(ageHours / 24)} days`
      : ageHours >= 1 ? `${Math.floor(ageHours)}h` : "<1h";
    const fmt = (n: number | undefined) => {
      if (!n) return "N/A";
      if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
      if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
      return `$${n.toFixed(0)}`;
    };
    const socialsLine = [
      isRealWebsite ? socials?.website : null,
      socials?.telegram ? `TG: ${socials.telegram}` : null,
      socials?.twitter ? `X: ${socials.twitter}` : null,
    ].filter(Boolean).join(" | ");

    const veritasSays = [
      `🔍 VERITAS FORENSIC REPORT: ${tokenName} ($${tokenSymbol})`,
      `Trust Score: ${finalScore}/100 — ${finalVerdict}`,
      `Profile: ${aiResult.criminalProfile}`,
      ``,
      aiResult.degenComment,
      ``,
      `👁 VISUAL FORENSICS: ${visualEvidenceSummary}`,
      ``,
      `📊 KEY DATA:`,
      `• Market Cap: ${fmt(marketData?.marketCap)} | Liquidity: ${fmt(marketData?.liquidity)} | 24h Volume: ${fmt(marketData?.volume24h)}`,
      `• Top 10 Holders: ${top10Percentage.toFixed(1)}% | Creator: ${creatorStatus.creatorPercentage.toFixed(1)}%${creatorStatus.isDumped ? " (Dumped)" : ""}`,
      `• Contract: Mint ${tokenInfo.mintAuthority ? "⚠️ Enabled" : "✅ Disabled"} | Freeze ${tokenInfo.freezeAuthority ? "⚠️ Enabled" : "✅ Disabled"}`,
      rugCheckReport ? `• TonSecurity: ${rugCheckReport.score}/100` : null,
      marketData ? `• Age: ${ageDisplay}` : null,
      socialsLine ? `\n🔗 ${socialsLine}` : null,
    ].filter(x => x !== null).join("\n");
    
    // =========================================================================
    // BUILD FINAL RESULT
    // =========================================================================
    const elapsed = Date.now() - this.startTime;
    console.log(`[Veritas Investigator] ✅ Investigation complete in ${elapsed}ms`);
    
    const finalResult: InvestigationResult = {
      trustScore: finalScore,
      verdict: finalVerdict,
      summary: aiResult.summary,
      criminalProfile: aiResult.criminalProfile,
      lies: aiResult.lies,
      evidence: aiResult.evidence,
      analysis: aiResult.analysis,
      visualAnalysis: visualAnalysisFinal,
      visualEvidenceStatus,
      visualAssetReuse,
      visualEvidenceSummary,
      veritasSays,
      degenComment: aiResult.degenComment,
      thoughtSummary: aiResult.thoughtSummary,
      tokenAddress,
      tokenName,
      tokenSymbol,
      onChain: {
        mintAuth: tokenInfo.mintAuthority,
        freezeAuth: tokenInfo.freezeAuthority,
        supply,
        decimals,
        top10Percentage,
        creatorPercentage: creatorStatus.creatorPercentage,
        isDumped: creatorStatus.isDumped,
        isWhale: creatorStatus.isWhale,
      },
      market: marketData ? {
        liquidity: marketData.liquidity,
        volume24h: marketData.volume24h,
        marketCap: marketData.marketCap,
        buySellRatio: marketData.buySellRatio,
        ageInHours: marketData.ageInHours,
        botActivity: marketData.botActivity,
        anomalies: marketData.anomalies,
      } : null,
      rugCheck: rugCheckReport ? {
        score: rugCheckReport.score,
        risks: rugCheckReport.risks,
      } : null,
      creatorHistory: {
        creatorAddress: creatorStatus.creatorAddress,
        previousTokens: Array.isArray(creatorHistory) ? creatorHistory.length : 0,
        isSerialLauncher: Array.isArray(creatorHistory) && creatorHistory.length >= 2,
      },
      socials: {
        website: socials?.website,
        twitter: socials?.twitter,
        telegram: socials?.telegram,
        discord: socials?.discord,
      },
      elephantMemory: {
        isKnownScammer: false,
      },
      analyzedAt: new Date().toISOString(),
      analysisTimeMs: elapsed,
    };

    resultCache.set(cacheKey, finalResult);
    return finalResult;
  }
  
  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  // ===========================================================================
  // TRUST SCORE v2 — deterministic, 7 factors, capped at 88
  // ===========================================================================
  private computeTrustScore(
    mintAuth: string | null,
    freezeAuth: string | null,
    top10Percentage: number,
    marketData: { liquidity: number; marketCap: number } | null,
    creatorStatus: { isDumped: boolean; isWhale: boolean; creatorPercentage: number },
    tonSecurity: import("@/lib/api/tonsecurity").TonSecurityReport | null,
    ageInHours: number,
  ): number {
    let score = 100;

    // On-chain security (hard caps)
    if (mintAuth) score -= 40;
    if (freezeAuth) score -= 40;

    // Holder concentration
    if (top10Percentage > 50) score -= 15;
    else if (top10Percentage > 30) score -= 10;

    // Creator behavior
    if (creatorStatus.isDumped) score -= 15;
    if (creatorStatus.isWhale) score -= 10;

    // Liquidity health
    if (marketData) {
      if (marketData.liquidity < 5000) score -= 20;
      else if (marketData.marketCap > 0) {
        const liqRatio = marketData.liquidity / marketData.marketCap;
        if (liqRatio < 0.02) score -= 15;
      }
    }

    // Token age (brand new = higher risk)
    if (ageInHours < 1) score -= 10;

    // TonSecurity risk score (higher score = riskier)
    if (tonSecurity) {
      if (tonSecurity.score > 500) score -= 20;
      else if (tonSecurity.score > 200) score -= 10;
    }

    // Never exceed 88 (no meme coin is fully safe)
    return Math.min(88, Math.max(0, score));
  }

  private analyzeCreator(
    mintAuth: string | null,
    freezeAuth: string | null,
    topHolders: { address: string; balance: number; percentage: number }[],
    supply: number
  ) {
    // STRICT RULE: Only use mint/freeze authority as creator
    // Do NOT guess based on largest holder (could be LP, whale, or exchange)
    const creatorAddress = mintAuth || freezeAuth || "Unknown";
    
    let creatorPercentage = 0;
    
    // Only calculate percentage if we have a verified creator address
    if (creatorAddress !== "Unknown") {
      const holding = topHolders.find(h => h.address === creatorAddress);
      if (holding) {
        creatorPercentage = holding.percentage;
      }
    }
    
    // isDumped only applies if we have a known creator
    const isDumped = creatorAddress !== "Unknown" && creatorPercentage < 1 && supply > 0;
    const isWhale = creatorPercentage > 20;
    
    return {
      creatorAddress,
      creatorPercentage,
      isDumped,
      isWhale,
    };
  }
  
  private buildKnownScammerResult(
    tokenAddress: string,
    tokenInfo: any,
    creatorAddress: string,
    knownScammer: ScammerRecord,
    elapsed: number
  ): InvestigationResult {
    const decimals = tokenInfo.decimals || 0;
    const supply = Number(tokenInfo.supply) / Math.pow(10, decimals);
    
    const tokenName = knownScammer.tokenName || "Unknown Token";
    return {
      trustScore: 0,
      verdict: "Danger",
      summary: `🚨 KNOWN SCAMMER DETECTED. This token was deployed by a wallet flagged on ${knownScammer.flaggedAt.toISOString().split('T')[0]} for: "${knownScammer.reason}". This is their ${knownScammer.scanCount}th detected token. DO NOT INTERACT.`,
      criminalProfile: "The Repeat Offender",
      lies: [`Creator wallet ${creatorAddress.slice(0, 8)}... is a known scammer`],
      evidence: [
        `Previous scam: ${knownScammer.tokenName || "Unknown"}`,
        `Original verdict: ${knownScammer.verdict}`,
        `First flagged: ${knownScammer.flaggedAt.toISOString().split('T')[0]}`,
        `Detection count: ${knownScammer.scanCount} times`,
      ],
      analysis: [
        "🚨 INSTANT BLOCK — Elephant Memory triggered",
        "This creator has been permanently flagged",
        "No further analysis required — avoid at all costs",
      ],
      visualAnalysis: "No visual analysis — known scammer fast-path.",
      visualEvidenceStatus: "not_captured" as const,
      visualAssetReuse: "UNKNOWN" as const,
      visualEvidenceSummary: "No visual analysis — known scammer fast-path.",
      veritasSays: [
        `🔍 VERITAS FORENSIC REPORT: ${tokenName} ($SCAM)`,
        `Trust Score: 0/100 — Danger`,
        `Profile: The Repeat Offender`,
        ``,
        `This dev already rugged before. ${knownScammer.scanCount}th token. RUN. 🚫`,
        ``,
        `👁 VISUAL FORENSICS: No visual analysis — known scammer fast-path.`,
        ``,
        `📊 KEY DATA:`,
        `• 🚨 KNOWN SCAMMER — Wallet flagged: ${knownScammer.flaggedAt.toISOString().split('T')[0]}`,
        `• Previous scam: ${knownScammer.tokenName || "Unknown"}`,
        `• Detection count: ${knownScammer.scanCount}`,
      ].join("\n"),
      degenComment: `This dev already rugged before. ${knownScammer.scanCount}th token. RUN. 🚫`,
      tokenAddress,
      tokenName,
      tokenSymbol: "SCAM",
      onChain: {
        mintAuth: tokenInfo.mintAuthority || null,
        freezeAuth: tokenInfo.freezeAuthority || null,
        supply,
        decimals,
        top10Percentage: 0,
        creatorPercentage: 0,
        isDumped: true,
        isWhale: false,
      },
      market: null,
      rugCheck: null,
      creatorHistory: {
        creatorAddress,
        previousTokens: knownScammer.scanCount,
        isSerialLauncher: true,
      },
      socials: {},
      elephantMemory: {
        isKnownScammer: true,
        previousFlags: knownScammer,
      },
      analyzedAt: new Date().toISOString(),
      analysisTimeMs: elapsed,
    };
  }
}
