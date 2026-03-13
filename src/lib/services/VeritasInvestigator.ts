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
import { applyOnChainClaimVerification, strongestClaimSummary, type Claim } from "@/lib/claims";
import {
  checkKnownScammer,
  flagScammer,
  getCachedScan,
  saveScanResult,
  getLineageByDeployer,
  saveLineageRecord,
  buildLineageSummary,
  getLatestWebsiteSnapshotByDomain,
  getLatestWebsiteSnapshotByToken,
  saveWebsiteSnapshot,
  buildReputationSignals,
  hashVisualSummary,
  type ScammerRecord,
  type LineageSummary,
  type LineageIdentitySource,
  type LineageIdentityConfidence,
  type LineageDisplayVerdict,
  type WebsiteSnapshotRecord,
  type WebsiteDriftSummary,
  type ReputationSignals,
} from "@/lib/db/elephant";
import { getDisplayVerdictForLineage } from "@/lib/bot/normalized-result";
import { discoverWebsite, type WebsiteDiscoveryResult } from "@/lib/website-discovery";
import { LRUCache } from "lru-cache";
import { createHash } from "crypto";

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

  // Structured claims (Phase 1: trust investigation)
  claims: Claim[];

  /** Short professional assessment (no hype). */
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

  /** Phase 2: Authority-linked history (prior launches linked to this mint/freeze authority in our records). */
  lineage?: LineageSummary;

  /** Phase 3: Website drift summary against prior snapshots in Veritas records. */
  websiteDrift?: WebsiteDriftSummary;

  /** Phase 4: Repeated-pattern signals across prior scans (claims, domain, visual). */
  reputationSignals?: ReputationSignals;

  /** Website discovery status and selected URL (official_site_found, social_only, etc.). */
  websiteDiscovery?: WebsiteDiscoveryResult;

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
  /** When VERITAS_SAVE_SCREENSHOTS is true and capture succeeded; relative path e.g. /screenshots/scan-website-{uuid}.jpg */
  screenshotPublicUrl?: string;
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
  /** Optional: user-provided website URL when no confident official site is found (e.g. from Mini App). */
  async investigate(
    tokenAddress: string,
    options?: { websiteOverride?: string },
  ): Promise<InvestigationResult> {
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

    const ledgerCached = await getCachedScan(tokenAddress);
    if (ledgerCached) {
      console.log(`[Veritas] ⚡ ThreatLedger cache hit for ${tokenAddress.slice(0, 8)} — refreshing dynamic data and lineage`);
      const [marketData, tokenInfo] = await Promise.all([
        getMarketAnalysis(tokenAddress),
        getTokenInfo(tokenAddress),
      ]);
      const supply = Number(tokenInfo.supply) / Math.pow(10, tokenInfo.decimals || 0);
      ledgerCached.market = marketData ? {
        liquidity: marketData.liquidity,
        volume24h: marketData.volume24h,
        marketCap: marketData.marketCap,
        buySellRatio: marketData.buySellRatio,
        ageInHours: marketData.ageInHours,
        botActivity: marketData.botActivity,
        anomalies: marketData.anomalies,
      } : null;
      ledgerCached.onChain.supply = supply;
      ledgerCached.onChain.decimals = tokenInfo.decimals ?? ledgerCached.onChain.decimals;
      if (!Array.isArray(ledgerCached.claims)) ledgerCached.claims = [];

      const creatorAddress = ledgerCached.creatorHistory?.creatorAddress;
      if (creatorAddress && creatorAddress !== "Unknown") {
        const lineageRecords = await getLineageByDeployer(creatorAddress, { excludeTokenAddress: tokenAddress });
        const { identitySource, lineageIdentityConfidence } = this.getLineageIdentityOptions(
          tokenInfo.mintAuthority ?? null,
          tokenInfo.freezeAuthority ?? null,
        );
        ledgerCached.lineage = buildLineageSummary(creatorAddress, lineageRecords, {
          identitySource,
          lineageIdentityConfidence,
        });
      }
      const cachedWebsite = ledgerCached.socials?.website;
      const cachedIsRealWebsite =
        !!cachedWebsite &&
        String(cachedWebsite).trim() !== "" &&
        String(cachedWebsite).trim().toLowerCase() !== "none" &&
        !cachedWebsite.includes("t.me") &&
        !cachedWebsite.includes("telegram.me") &&
        !cachedWebsite.includes("x.com") &&
        !cachedWebsite.includes("twitter.com");
      const cachedWebsiteDomain = this.extractWebsiteDomain(cachedIsRealWebsite ? cachedWebsite : undefined);
      if (cachedIsRealWebsite && cachedWebsiteDomain) {
        let priorSnapshot = await getLatestWebsiteSnapshotByToken(tokenAddress);
        let basis: "token" | "domain" | undefined;
        if (priorSnapshot) {
          basis = "token";
        } else {
          priorSnapshot = await getLatestWebsiteSnapshotByDomain(cachedWebsiteDomain, { excludeTokenAddress: tokenAddress });
          if (priorSnapshot) basis = "domain";
        }
        const currentSnapshot: WebsiteSnapshotRecord = {
          tokenAddress,
          websiteUrl: cachedWebsite!.trim(),
          websiteDomain: cachedWebsiteDomain,
          scannedAt: new Date(ledgerCached.analyzedAt),
          screenshotPublicUrl: ledgerCached.screenshotPublicUrl,
          screenshotAvailable: ledgerCached.visualEvidenceStatus === "captured",
          visualSummary: this.normalizeText(ledgerCached.visualEvidenceSummary),
          claims: Array.isArray(ledgerCached.claims) ? ledgerCached.claims : [],
          contentFingerprint: this.computeWebsiteFingerprint({
            websiteDomain: cachedWebsiteDomain,
            visualSummary: ledgerCached.visualEvidenceSummary,
            claims: Array.isArray(ledgerCached.claims) ? ledgerCached.claims : [],
            socials: ledgerCached.socials,
            screenshotPublicUrl: ledgerCached.screenshotPublicUrl,
          }),
          trustSectionSummary: strongestClaimSummary(Array.isArray(ledgerCached.claims) ? ledgerCached.claims : []) ?? this.normalizeText(ledgerCached.summary).slice(0, 200),
          socials: {
            twitter: ledgerCached.socials?.twitter,
            telegram: ledgerCached.socials?.telegram,
            discord: ledgerCached.socials?.discord,
          },
        };
        ledgerCached.websiteDrift = this.buildWebsiteDriftSummary(currentSnapshot, priorSnapshot, basis);
      }
      // Phase 4 hardening: refresh reputation on cache hit (same as lineage/drift)
      try {
        const cachedRep = await buildReputationSignals({
          tokenAddress,
          websiteDomain: cachedWebsiteDomain ?? undefined,
          claims: Array.isArray(ledgerCached.claims) ? ledgerCached.claims : [],
          visualSummary: this.normalizeText(ledgerCached.visualEvidenceSummary),
        });
        ledgerCached.reputationSignals = cachedRep;
        this.applyAuthorityPlusPattern(ledgerCached.reputationSignals, ledgerCached.lineage);
      } catch (e) {
        console.warn("[Veritas] cache path buildReputationSignals failed:", e);
      }
      // Persistence backfill: ensure lineage record exists (fixes empty deployer_lineage when first run skipped or failed)
      const cachedCreator = ledgerCached.creatorHistory?.creatorAddress;
      if (cachedCreator && cachedCreator !== "Unknown") {
        try {
          const { identitySource } = this.getLineageIdentityOptions(
            tokenInfo.mintAuthority ?? null,
            tokenInfo.freezeAuthority ?? null,
          );
          let websiteDomain: string | undefined;
          if (ledgerCached.socials?.website) {
            try {
              websiteDomain = new URL(ledgerCached.socials.website).hostname;
            } catch {
              websiteDomain = undefined;
            }
          }
          await saveLineageRecord({
            deployerAddress: cachedCreator,
            tokenAddress,
            tokenName: ledgerCached.tokenName ?? "Unknown",
            tokenSymbol: ledgerCached.tokenSymbol ?? "???",
            scannedAt: new Date(ledgerCached.analyzedAt ?? Date.now()),
            verdict: ledgerCached.verdict,
            displayVerdict: getDisplayVerdictForLineage(ledgerCached),
            identitySource,
            keyFlags: {
              isDumped: ledgerCached.onChain?.isDumped,
              isWhale: (ledgerCached.onChain?.creatorPercentage ?? 0) > 20,
              visualAssetReuse: ledgerCached.visualAssetReuse,
            },
            websiteDomain,
            claimSummary: strongestClaimSummary(Array.isArray(ledgerCached.claims) ? ledgerCached.claims : []),
          });
        } catch (e) {
          console.warn("[Veritas] cache path saveLineageRecord backfill failed:", e);
        }
      }
      return ledgerCached;
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
    // AUTHORITY-LINKED HISTORY (Phase 2: prior launches linked to this authority)
    // =========================================================================
    const { identitySource, lineageIdentityConfidence } = this.getLineageIdentityOptions(
      tokenInfo.mintAuthority ?? null,
      tokenInfo.freezeAuthority ?? null,
    );
    let lineageSummary: LineageSummary | undefined;
    if (creatorAddress) {
      const lineageRecords = await getLineageByDeployer(creatorAddress, { excludeTokenAddress: tokenAddress });
      lineageSummary = buildLineageSummary(creatorAddress, lineageRecords, {
        identitySource,
        lineageIdentityConfidence,
      });
      if (lineageSummary.hasPriorHistory) {
        console.log(`[Veritas Investigator] 📜 Authority history: ${lineageSummary.priorLaunchCount} prior tokens in our records, ${lineageSummary.priorSuspiciousOrHighRiskCount} suspicious/high-risk`);
      }
    }

    // =========================================================================
    // PHASE 2: DATA PIPELINE (All in parallel — holders included)
    // =========================================================================
    console.log("[Veritas Investigator] 📊 Phase 2: Fetching data in parallel...");
    
    const decimals = tokenInfo.decimals || 0;
    const supply = Number(tokenInfo.supply) / Math.pow(10, decimals);

    const [socials, marketData, rugCheckReport, holderResult, priorSnapshotForDiscovery] = await Promise.all([
      getTokenSocials(tokenAddress),
      getMarketAnalysis(tokenAddress),
      fetchTonSecurity(tokenAddress),
      getHolderDistribution(tokenAddress, supply, decimals),
      getLatestWebsiteSnapshotByToken(tokenAddress),
    ]);

    const { topHolders, top10Percentage } = holderResult;
    const priorSnapshotUrl = priorSnapshotForDiscovery?.websiteUrl;

    const websiteDiscovery = discoverWebsite({
      website: socials?.website,
      twitter: socials?.twitter,
      telegram: socials?.telegram,
      discord: socials?.discord,
      priorSnapshotUrl: priorSnapshotUrl ?? null,
    });

    let websiteUrl: string | undefined = websiteDiscovery.selectedWebsite ?? socials?.website;
    if (options?.websiteOverride?.trim()) {
      const override = options.websiteOverride.trim();
      const isOverrideReal =
        !override.includes("t.me") &&
        !override.includes("telegram.me") &&
        !override.includes("x.com") &&
        !override.includes("twitter.com");
      if (isOverrideReal) {
        websiteUrl = override;
        (websiteDiscovery as { selectedWebsite: string | null }).selectedWebsite = override;
        (websiteDiscovery as { status: typeof websiteDiscovery.status }).status =
          websiteDiscovery.status === "no_site_found" || websiteDiscovery.status === "social_only"
            ? "site_found_low_confidence"
            : websiteDiscovery.status;
      }
    }

    const twitterUrl = socials?.twitter;

    const creatorStatus = this.analyzeCreator(
      tokenInfo.mintAuthority,
      tokenInfo.freezeAuthority,
      topHolders,
      supply
    );

    // =========================================================================
    // PHASE 3: SCREENSHOT + CREATOR HISTORY (Parallel, non-critical)
    // Screenshot runs for all real website URLs — vision is Veritas's primary edge.
    // websiteUrl already set from discovery (or websiteOverride) above.
    // =========================================================================
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
        ? `Possible scam template reuse detected. ${rawVisual.replace(/.*VISUAL ASSET REUSE:\s*YES\.?\s*/i, "").trim().slice(0, 100)}`
        : `No major visual deception detected. Branding appears original in this scan. ${rawVisual.replace(/.*VISUAL ASSET REUSE:\s*NO\.?\s*/i, "").trim().slice(0, 80)}`
      : !websiteUrl
      ? "No website — visual forensics not applicable."
      : !isRealWebsite
      ? "Social/redirect URL — no screenshot captured."
      : "Screenshot failed — visual forensics unavailable.";

    const visualAnalysisFinal = rawVisual
      ? (hasReuseYes
          ? "VISUAL ASSET REUSE: YES. Possible scam template or recycled branding detected. See evidence above."
          : hasReuseNo
            ? "VISUAL ASSET REUSE: NO. No major visual deception detected. Branding appears original in this scan. No suspicious trust-badge or partner-claim reuse observed."
            : "Visual analysis performed; asset reuse could not be determined. See full report for details.")
      : !websiteUrl
      ? "No website found. Visual analysis could not be performed."
      : !isRealWebsite
      ? `Website URL appears to be a social media or redirect link. No screenshot was captured.`
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

    // Apply on-chain verification to renounced-type claims (overwrite AI status with ground truth)
    const claims: Claim[] = applyOnChainClaimVerification(
      Array.isArray(aiResult.claims) ? aiResult.claims : [],
      tokenInfo.mintAuthority,
      tokenInfo.freezeAuthority
    );

    // =========================================================================
    // PHASE 3: WEBSITE SNAPSHOT LOOKUP + DRIFT COMPARISON
    // =========================================================================
    const websiteDomain = this.extractWebsiteDomain(isRealWebsite ? websiteUrl : undefined);
    let websiteDrift: WebsiteDriftSummary | undefined;
    let driftComparisonBasis: "token" | "domain" | undefined;
    let priorSnapshot: WebsiteSnapshotRecord | null = null;

    if (isRealWebsite && websiteDomain) {
      priorSnapshot = await getLatestWebsiteSnapshotByToken(tokenAddress);
      if (priorSnapshot) {
        driftComparisonBasis = "token";
      } else {
        priorSnapshot = await getLatestWebsiteSnapshotByDomain(websiteDomain, {
          excludeTokenAddress: tokenAddress,
        });
        if (priorSnapshot) driftComparisonBasis = "domain";
      }

      const currentSnapshot: WebsiteSnapshotRecord = {
        tokenAddress,
        websiteUrl: websiteUrl!.trim(),
        websiteDomain,
        scannedAt: new Date(),
        screenshotPublicUrl: websiteScreenshot?.publicUrl,
        screenshotAvailable: visualEvidenceStatus === "captured",
        visualSummary: this.normalizeText(visualEvidenceSummary),
        claims,
        contentFingerprint: this.computeWebsiteFingerprint({
          websiteDomain,
          visualSummary: visualEvidenceSummary,
          claims,
          socials,
          screenshotPublicUrl: websiteScreenshot?.publicUrl,
        }),
        trustSectionSummary: strongestClaimSummary(claims) ?? this.normalizeText(aiResult.summary).slice(0, 200),
        socials: {
          twitter: socials?.twitter,
          telegram: socials?.telegram,
          discord: socials?.discord,
        },
      };

      websiteDrift = this.buildWebsiteDriftSummary(currentSnapshot, priorSnapshot, driftComparisonBasis);
    }

    // Phase 4: Reputation signals from prior scans (repeated claims, domain, visual pattern)
    let reputationSignals: ReputationSignals | undefined;
    try {
      reputationSignals = await buildReputationSignals({
        tokenAddress,
        websiteDomain: websiteDomain ?? undefined,
        claims,
        visualSummary: this.normalizeText(visualEvidenceSummary),
      });
      this.applyAuthorityPlusPattern(reputationSignals, lineageSummary);
    } catch (e) {
      console.warn("[Veritas] buildReputationSignals failed:", e);
    }

    const veritasSays = [
      `VERITAS FORENSIC REPORT: ${tokenName} ($${tokenSymbol})`,
      `Trust Score: ${finalScore}/100 — ${finalVerdict}`,
      `Profile: ${aiResult.criminalProfile}`,
      ``,
      aiResult.summary,
      ``,
      `VISUAL: ${visualEvidenceSummary}`,
      ``,
      `KEY DATA:`,
      `Market Cap: ${fmt(marketData?.marketCap)} | Liquidity: ${fmt(marketData?.liquidity)} | 24h Vol: ${fmt(marketData?.volume24h)}`,
      `Top 10: ${top10Percentage.toFixed(1)}% | Creator: ${creatorStatus.creatorPercentage.toFixed(1)}%${creatorStatus.isDumped ? " (Dumped)" : ""}`,
      `Mint: ${tokenInfo.mintAuthority ? "Enabled" : "Disabled"} | Freeze: ${tokenInfo.freezeAuthority ? "Enabled" : "Disabled"}`,
      rugCheckReport ? `TonSecurity: ${rugCheckReport.score}/100` : null,
      marketData ? `Age: ${ageDisplay}` : null,
      socialsLine ? `\n${socialsLine}` : null,
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
      claims,
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
      lineage: lineageSummary,
      websiteDrift,
      reputationSignals,
      websiteDiscovery,
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
      screenshotPublicUrl: websiteScreenshot?.publicUrl,
    };

    await saveScanResult(tokenAddress, finalResult, "unified");

    // Persist lineage record (Phase 2) when we have an authority address (mint or freeze from contract)
    const authorityForLineage = tokenInfo.mintAuthority ?? tokenInfo.freezeAuthority ?? null;
    if (authorityForLineage) {
      let websiteDomain: string | undefined;
      if (socials?.website) {
        try {
          websiteDomain = new URL(socials.website).hostname;
        } catch {
          websiteDomain = undefined;
        }
      }
      try {
        const displayVerdict: LineageDisplayVerdict = getDisplayVerdictForLineage(finalResult);
        await saveLineageRecord({
          deployerAddress: authorityForLineage,
          tokenAddress,
          tokenName,
          tokenSymbol,
          scannedAt: new Date(),
          verdict: finalVerdict,
          displayVerdict,
          identitySource,
          keyFlags: {
            isDumped: creatorStatus.isDumped,
            isWhale: creatorStatus.isWhale,
            visualAssetReuse,
          },
          websiteDomain,
          claimSummary: strongestClaimSummary(claims),
        });
      } catch (e) {
        console.warn("[Veritas] saveLineageRecord failed:", e);
      }
    }

    // Persist website snapshot for future drift comparison and Phase 4 reputation
    if (isRealWebsite && websiteDomain) {
      await saveWebsiteSnapshot({
        tokenAddress,
        websiteUrl: websiteUrl!.trim(),
        websiteDomain,
        scannedAt: new Date(),
        screenshotPublicUrl: websiteScreenshot?.publicUrl,
        screenshotAvailable: visualEvidenceStatus === "captured",
        visualSummary: this.normalizeText(visualEvidenceSummary),
        claims,
        contentFingerprint: this.computeWebsiteFingerprint({
          websiteDomain,
          visualSummary: visualEvidenceSummary,
          claims,
          socials,
          screenshotPublicUrl: websiteScreenshot?.publicUrl,
        }),
        trustSectionSummary: strongestClaimSummary(claims) ?? this.normalizeText(aiResult.summary).slice(0, 200),
        socials: {
          twitter: socials?.twitter,
          telegram: socials?.telegram,
          discord: socials?.discord,
        },
        verdictAtScan: finalVerdict,
        displayVerdictAtScan: getDisplayVerdictForLineage(finalResult),
        visualSummaryHash: hashVisualSummary(this.normalizeText(visualEvidenceSummary)),
      });
    }

    resultCache.set(cacheKey, finalResult);
    return finalResult;
  }
  
  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /** Phase 4 hardening: when authority has prior flagged launches AND we have same domain or strong claim motif, set combined signal. */
  private applyAuthorityPlusPattern(
    reputationSignals: ReputationSignals | undefined,
    lineage: LineageSummary | undefined,
  ): void {
    if (!reputationSignals || !lineage?.hasPriorHistory || (lineage.priorSuspiciousOrHighRiskCount ?? 0) === 0) return;
    const hasStrongPattern =
      reputationSignals.sameDomainInPriorFlagged ||
      (reputationSignals.repeatedClaimMotif && reputationSignals.repeatedClaimMotif.strength === "strong");
    if (!hasStrongPattern) return;
    const n = lineage.priorSuspiciousOrHighRiskCount ?? 0;
    const patternDesc =
      reputationSignals.sameDomainInPriorFlagged && reputationSignals.repeatedClaimMotif?.strength === "strong"
        ? "same domain and a repeated trust-claim pattern"
        : reputationSignals.sameDomainInPriorFlagged
          ? "same domain"
          : "a repeated trust-claim pattern";
    reputationSignals.authorityPlusPattern = {
      priorFlaggedLaunches: n,
      patternDescription: `This authority was previously linked to ${n} flagged token(s) in our records; ${patternDesc} also appears in prior flagged scans.`,
    };
    reputationSignals.strongestReputationFinding = reputationSignals.authorityPlusPattern.patternDescription;
  }

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

  private normalizeText(input: string | undefined): string {
    return String(input ?? "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  private extractWebsiteDomain(url: string | undefined): string | undefined {
    if (!url) return undefined;
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return undefined;
    }
  }

  private computeWebsiteFingerprint(input: {
    websiteDomain: string;
    visualSummary: string;
    claims: Claim[];
    socials: { twitter?: string; telegram?: string; discord?: string } | null | undefined;
    screenshotPublicUrl?: string;
  }): string {
    const claimKeys = input.claims
      .map((c) => `${c.type}:${this.normalizeText(c.rawClaim)}`)
      .sort()
      .join("|");
    const socialKey = [input.socials?.twitter, input.socials?.telegram, input.socials?.discord]
      .map((v) => this.normalizeText(v))
      .join("|");
    const payload = [
      input.websiteDomain,
      this.normalizeText(input.visualSummary),
      claimKeys,
      socialKey,
      this.normalizeText(input.screenshotPublicUrl),
    ].join("::");
    return createHash("sha256").update(payload).digest("hex");
  }

  private buildWebsiteDriftSummary(
    current: WebsiteSnapshotRecord,
    prior: WebsiteSnapshotRecord | null,
    basis?: "token" | "domain",
  ): WebsiteDriftSummary {
    if (!prior) {
      return {
        priorSnapshotExists: false,
        materialChangesDetected: false,
        keyChanges: [],
        currentWebsiteUrl: current.websiteUrl,
      };
    }

    const changes: string[] = [];
    const currentClaims = new Set(current.claims.map((c) => `${c.type}:${this.normalizeText(c.rawClaim)}`));
    const priorClaims = new Set((prior.claims ?? []).map((c) => `${c.type}:${this.normalizeText(c.rawClaim)}`));

    const addedClaims = [...currentClaims].filter((k) => !priorClaims.has(k));
    const removedClaims = [...priorClaims].filter((k) => !currentClaims.has(k));
    const claimTypeLabel = (k: string) => k.split(":")[0] ?? "claim";
    if (addedClaims.length > 0) {
      const topAdded = addedClaims.slice(0, 2).map(claimTypeLabel).join(", ");
      changes.push(`Website claims added since previous scan: ${topAdded}.`);
    }
    if (removedClaims.length > 0) {
      const topRemoved = removedClaims.slice(0, 2).map(claimTypeLabel).join(", ");
      changes.push(`Website claims removed since previous scan: ${topRemoved}.`);
    }

    const socialPairs: Array<["twitter" | "telegram" | "discord", string | undefined, string | undefined]> = [
      ["twitter", current.socials?.twitter, prior.socials?.twitter],
      ["telegram", current.socials?.telegram, prior.socials?.telegram],
      ["discord", current.socials?.discord, prior.socials?.discord],
    ];
    const socialChanged = socialPairs
      .filter(([, curr, prev]) => this.normalizeText(curr) !== this.normalizeText(prev))
      .map(([name]) => name);
    if (socialChanged.length > 0) {
      changes.push(`Social links changed since previous scan: ${socialChanged.join(", ")}.`);
    }

    const screenshotStateChanged = current.screenshotAvailable !== prior.screenshotAvailable;
    if (screenshotStateChanged) {
      changes.push(
        current.screenshotAvailable
          ? "Screenshot available now but was unavailable in previous scan."
          : "Screenshot unavailable now but was available in previous scan.",
      );
    }

    const visualChanged = this.normalizeText(current.visualSummary) !== this.normalizeText(prior.visualSummary);
    if (visualChanged) {
      changes.push("Visual trust section changed materially since previous scan.");
    }

    const fingerprintChanged =
      !!current.contentFingerprint &&
      !!prior.contentFingerprint &&
      current.contentFingerprint !== prior.contentFingerprint;
    if (fingerprintChanged) {
      changes.push(
        "Technical change in page structure or branding detected since previous scan (weak signal on its own; interpret together with other changes).",
      );
    }

    const materialChangesDetected = changes.length > 0;
    let strongestFinding: string | undefined;
    if (materialChangesDetected) {
      strongestFinding = changes[0];
    } else {
      strongestFinding = "No material website trust-signal changes detected since previous scan.";
    }

    return {
      priorSnapshotExists: true,
      comparisonBasis: basis,
      priorScannedAt: prior.scannedAt instanceof Date ? prior.scannedAt.toISOString() : String(prior.scannedAt),
      priorWebsiteUrl: prior.websiteUrl,
      currentWebsiteUrl: current.websiteUrl,
      materialChangesDetected,
      keyChanges: changes.slice(0, 3),
      strongestFinding,
    };
  }

  /**
   * Derive lineage identity source and confidence from contract authority fields.
   * Authority (mint/freeze) is not necessarily the deployer; do not overstate.
   */
  private getLineageIdentityOptions(
    mintAuth: string | null,
    freezeAuth: string | null,
  ): { identitySource?: LineageIdentitySource; lineageIdentityConfidence: LineageIdentityConfidence } {
    if (mintAuth && freezeAuth && mintAuth === freezeAuth) {
      return { identitySource: "both", lineageIdentityConfidence: "high" };
    }
    if (mintAuth) {
      return { identitySource: "mint_authority", lineageIdentityConfidence: "medium" };
    }
    if (freezeAuth) {
      return { identitySource: "freeze_authority", lineageIdentityConfidence: "medium" };
    }
    return { lineageIdentityConfidence: "low" };
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
        "Instant block — Elephant Memory triggered.",
        "This creator has been permanently flagged.",
        "Do not interact.",
      ],
      visualAnalysis: "No visual analysis — known scammer fast-path.",
      visualEvidenceStatus: "not_captured" as const,
      visualAssetReuse: "UNKNOWN" as const,
      visualEvidenceSummary: "No visual analysis — known scammer fast-path.",
      claims: [],
      veritasSays: [
        `VERITAS FORENSIC REPORT: ${tokenName} ($SCAM)`,
        `Trust Score: 0/100 — High risk`,
        `Profile: The Repeat Offender`,
        ``,
        `This token is linked to a creator previously flagged for fraud. Do not interact.`,
        ``,
        `VISUAL: No visual analysis — known scammer fast-path.`,
        ``,
        `KNOWN SCAMMER — Wallet flagged: ${knownScammer.flaggedAt.toISOString().split('T')[0]}`,
        `Previous scam: ${knownScammer.tokenName || "Unknown"} | Detection count: ${knownScammer.scanCount}`,
      ].join("\n"),
      degenComment: `Creator previously flagged. Do not interact.`,
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
