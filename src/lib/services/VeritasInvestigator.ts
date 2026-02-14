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
import { fetchScreenshotAsBase64, getMicrolinkUrl } from "@/lib/api/screenshot";
import { fetchTonSecurity, type TonSecurityReport } from "@/lib/api/tonsecurity";
import { runUnifiedAnalysis, type UnifiedAnalysisInput, type UnifiedAnalysisResult } from "@/lib/ai/unified-analyzer";
import { checkKnownScammer, flagScammer, type ScammerRecord } from "@/lib/db/elephant";

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
// VERITAS INVESTIGATOR CLASS
// =============================================================================

export class VeritasInvestigator {
  private startTime: number = 0;
  
  /**
   * Main investigation entry point
   */
  async investigate(tokenAddress: string): Promise<InvestigationResult> {
    this.startTime = Date.now();
    
    console.log(`\n[Veritas Investigator] 🔍 Starting investigation for ${tokenAddress.slice(0, 8)}...`);
    
    // Validate address. TODO: Replace with TON API validation.
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
        
        return this.buildKnownScammerResult(
          tokenAddress,
          tokenInfo,
          creatorAddress,
          knownScammer,
          elapsed
        );
      }
    }
    
    console.log("[Veritas Investigator] ✅ No prior record found. Proceeding with full analysis...");
    
    // =========================================================================
    // PHASE 2: DATA PIPELINE (Parallel Fetching)
    // =========================================================================
    console.log("[Veritas Investigator] 📊 Phase 2: Fetching data in parallel...");
    
    const [socials, marketData, rugCheckReport] = await Promise.all([
      getTokenSocials(tokenAddress),
      getMarketAnalysis(tokenAddress),
      fetchTonSecurity(tokenAddress),
    ]);

    // Calculate holder distribution. TODO: Replace with TON API.
    const decimals = tokenInfo.decimals || 0;
    const supply = Number(tokenInfo.supply) / Math.pow(10, decimals);
    const { topHolders, top10Percentage } = await getHolderDistribution(
      tokenAddress,
      supply,
      decimals
    );
    
    // Analyze creator wallet
    const creatorStatus = this.analyzeCreator(
      tokenInfo.mintAuthority,
      tokenInfo.freezeAuthority,
      topHolders,
      supply
    );
    
    // Fetch creator history
    let creatorHistory: any[] = [];
    try {
      creatorHistory = await getCreatorHistory(creatorStatus.creatorAddress);
      console.log(`[Veritas Investigator] 📜 Found ${creatorHistory.length} previous tokens by creator`);
    } catch (error) {
      console.warn("[Veritas Investigator] Creator history fetch failed:", error);
    }
    
    // =========================================================================
    // PHASE 3: SCREENSHOT CAPTURE (Visual Evidence)
    // =========================================================================
    console.log("[Veritas Investigator] 📸 Phase 3: Capturing visual evidence...");
    
    const websiteUrl = socials?.website;
    const twitterUrl = socials?.twitter;
    
    // Convert Twitter to Nitter for better bot access
    let nitterUrl = twitterUrl;
    if (nitterUrl) {
      nitterUrl = nitterUrl
        .replace('https://x.com/', 'https://nitter.net/')
        .replace('https://twitter.com/', 'https://nitter.net/');
    }
    
    const saveScreenshots = process.env.VERITAS_SAVE_SCREENSHOTS === "true";
    const [websiteScreenshot, twitterScreenshot] = await Promise.all([
      websiteUrl
        ? fetchScreenshotAsBase64(getMicrolinkUrl(websiteUrl, true), {
            saveToDisk: saveScreenshots,
            prefix: "website",
          })
        : Promise.resolve(null),
      twitterUrl
        ? fetchScreenshotAsBase64(getMicrolinkUrl(twitterUrl, false), {
            saveToDisk: saveScreenshots,
            prefix: "twitter",
          })
        : Promise.resolve(null),
    ]);
    
    if (websiteScreenshot) console.log("[Veritas Investigator] ✅ Website screenshot captured");
    if (twitterScreenshot) console.log("[Veritas Investigator] ✅ Twitter screenshot captured");
    
    // =========================================================================
    // PHASE 4: AI ANALYSIS (Unified Analyzer - "Sherlock")
    // =========================================================================
    console.log("[Veritas Investigator] 🤖 Phase 4: Running AI analysis (Sherlock)...");
    
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
      websiteUrl,
      twitterUrl: nitterUrl,
      marketData: marketData ? {
        liquidity: marketData.liquidity,
        volume24h: marketData.volume24h,
        marketCap: marketData.marketCap,
        buySellRatio: marketData.buySellRatio,
      } : undefined,
      websiteScreenshot: websiteScreenshot || undefined,
      twitterScreenshot: twitterScreenshot || undefined,
      isPumpFun: false,
    };
    
    const aiResult = await runUnifiedAnalysis(analysisInput);
    
    if (!aiResult) {
      throw new Error("AI analysis failed to return result");
    }
    
    console.log(`[Veritas Investigator] 🎯 AI Verdict: ${aiResult.verdict} (Trust: ${aiResult.trustScore})`);
    
    // =========================================================================
    // PHASE 5: ELEPHANT MEMORY SAVE (Flag Scammers)
    // =========================================================================
    if (creatorAddress && aiResult.verdict === "Danger") {
      console.log("[Veritas Investigator] 🐘 Phase 5: Flagging scammer in Elephant Memory...");
      
      await flagScammer(
        creatorAddress,
        tokenAddress,
        tokenName,
        aiResult.verdict,
        aiResult.summary
      );
      
      console.log("[Veritas Investigator] ✅ Scammer flagged for future instant detection");
    }
    
    // =========================================================================
    // PHASE 6: BUILD FINAL RESULT
    // =========================================================================
    const elapsed = Date.now() - this.startTime;
    console.log(`[Veritas Investigator] ✅ Investigation complete in ${elapsed}ms`);
    
    return {
      // Core verdict
      trustScore: aiResult.trustScore,
      verdict: aiResult.verdict,
      summary: aiResult.summary,
      criminalProfile: aiResult.criminalProfile,
      
      // Evidence
      lies: aiResult.lies,
      evidence: aiResult.evidence,
      analysis: aiResult.analysis,
      visualAnalysis: aiResult.visualAnalysis,
      degenComment: aiResult.degenComment,
      thoughtSummary: aiResult.thoughtSummary,
      
      // Token metadata
      tokenAddress,
      tokenName,
      tokenSymbol,
      
      // On-chain data
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
      
      // Market data
      market: marketData ? {
        liquidity: marketData.liquidity,
        volume24h: marketData.volume24h,
        marketCap: marketData.marketCap,
        buySellRatio: marketData.buySellRatio,
        ageInHours: marketData.ageInHours,
        botActivity: marketData.botActivity,
        anomalies: marketData.anomalies,
      } : null,
      
      // TON Security / contract audit
      rugCheck: rugCheckReport ? {
        score: rugCheckReport.score,
        risks: rugCheckReport.risks,
      } : null,
      
      // Creator history
      creatorHistory: {
        creatorAddress: creatorStatus.creatorAddress,
        previousTokens: creatorHistory.length,
        isSerialLauncher: creatorHistory.length >= 2,
      },
      
      // Social links
      socials: {
        website: socials?.website,
        twitter: socials?.twitter,
        telegram: socials?.telegram,
        discord: socials?.discord,
      },
      
      // Metadata
      elephantMemory: {
        isKnownScammer: false,
      },
      
      analyzedAt: new Date().toISOString(),
      analysisTimeMs: elapsed,
    };
  }
  
  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

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
    
    return {
      // Core verdict - INSTANT BLOCK
      trustScore: 0,
      verdict: "Danger",
      summary: `🚨 KNOWN SCAMMER DETECTED. This token was deployed by a wallet flagged on ${knownScammer.flaggedAt.toISOString().split('T')[0]} for: "${knownScammer.reason}". This is their ${knownScammer.scanCount}th detected token. DO NOT INTERACT.`,
      criminalProfile: "The Repeat Offender",
      
      // Evidence
      lies: [`Creator wallet ${creatorAddress.slice(0, 8)}... is a known scammer`],
      evidence: [
        `Previous scam: ${knownScammer.tokenName || "Unknown"}`,
        `Original verdict: ${knownScammer.verdict}`,
        `First flagged: ${knownScammer.flaggedAt.toISOString().split('T')[0]}`,
        `Detection count: ${knownScammer.scanCount} times`,
      ],
      analysis: [
        "🚨 INSTANT BLOCK - Elephant Memory triggered",
        "This creator has been permanently flagged",
        "No further analysis required - avoid at all costs",
      ],
      degenComment: `Bro this dev already rugged before. INSTANT BLOCK. This is their ${knownScammer.scanCount}th token. Don't even think about it. 🚫`,
      
      // Token metadata
      tokenAddress,
      tokenName: knownScammer.tokenName || "Unknown Token",
      tokenSymbol: "SCAM",
      
      // On-chain data (minimal)
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
      
      // Market data
      market: null,
      
      // RugCheck audit
      rugCheck: null,
      
      // Creator history
      creatorHistory: {
        creatorAddress,
        previousTokens: knownScammer.scanCount,
        isSerialLauncher: true,
      },
      
      // Social links
      socials: {},
      
      // Metadata
      elephantMemory: {
        isKnownScammer: true,
        previousFlags: knownScammer,
      },
      
      analyzedAt: new Date().toISOString(),
      analysisTimeMs: elapsed,
    };
  }
}
