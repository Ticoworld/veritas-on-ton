/**
 * Normalized scan result for Telegram bot and other consumers.
 * Evidence-first; does not present missing data as confirmed.
 */

import type { InvestigationResult } from "@/lib/services/VeritasInvestigator";

/** Internal verdict from scan engine (unchanged). */
export type BotVerdict = "Safe" | "Caution" | "Danger";

/** User-facing verdict label. */
export type DisplayVerdict = "Likely legitimate" | "Suspicious" | "High risk" | "Cannot verify";

export type DataCoverageLevel = "available" | "partial" | "unavailable";

export type ConfidenceBand = "High" | "Medium" | "Low";

export interface DataCoverage {
  visual: DataCoverageLevel;
  onChain: DataCoverageLevel;
  market: DataCoverageLevel;
}

export interface BotScanResult {
  /** Internal verdict (for logic). */
  verdict: BotVerdict;
  /** User-facing label (Likely legitimate / Suspicious / High risk / Cannot verify). */
  displayVerdict: DisplayVerdict;
  /** 0–100 internal score; not shown as primary in UI. */
  confidence: number;
  /** High / Medium / Low for display. */
  confidenceBand: ConfidenceBand;
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  onChainFindings: string[];
  visualFindings: string[];
  marketFindings: string[];
  unknowns: string[];
  nextActions: string[];
  summaryLine: string;
  analysisTimeMs: number;
  dataCoverage: DataCoverage;
  /** When screenshot was saved (relative path); bot may prepend base URL. */
  screenshotPublicUrl?: string;
}

function coverageVisual(r: InvestigationResult): DataCoverageLevel {
  return r.visualEvidenceStatus === "captured" ? "available" : "unavailable";
}

function coverageOnChain(r: InvestigationResult): DataCoverageLevel {
  const hasHolders = r.onChain.top10Percentage >= 0;
  const hasCreator = r.creatorHistory.creatorAddress && r.creatorHistory.creatorAddress !== "Unknown";
  if (hasHolders && hasCreator) return "available";
  if (hasHolders || hasCreator) return "partial";
  return "unavailable";
}

function coverageMarket(r: InvestigationResult): DataCoverageLevel {
  if (!r.market) return "unavailable";
  const hasLiq = r.market.liquidity > 0;
  const hasCap = r.market.marketCap > 0;
  if (hasLiq && hasCap) return "available";
  if (hasLiq || hasCap) return "partial";
  return "unavailable";
}

function computeDisplayVerdict(
  verdict: BotVerdict,
  dataCoverage: DataCoverage
): DisplayVerdict {
  const { visual, onChain, market } = dataCoverage;
  const weak =
    visual === "unavailable" &&
    (onChain === "unavailable" || market === "unavailable");
  if (weak) return "Cannot verify";
  if (verdict === "Safe") return "Likely legitimate";
  if (verdict === "Caution") return "Suspicious";
  return "High risk";
}

function confidenceToBand(score: number): ConfidenceBand {
  if (score >= 65) return "High";
  if (score >= 35) return "Medium";
  return "Low";
}

/**
 * Build specific next actions from findings; no generic DYOR/small-amounts filler.
 */
function buildNextActions(r: InvestigationResult): string[] {
  const actions: string[] = [];

  if (r.elephantMemory?.isKnownScammer) {
    actions.push("Do not interact with this token or send funds.");
    actions.push("Block or report the project if it is promoted in groups.");
    return actions;
  }

  if (r.onChain.mintAuth) {
    actions.push("Supply can be changed by the contract; do not assume fixed supply.");
  }
  if (r.onChain.freezeAuth) {
    actions.push("Holder balances can be frozen by the contract; factor this into risk.");
  }
  if (r.onChain.isDumped) {
    actions.push("Creator has sold most of their allocation; treat as high exit risk.");
  }
  if (r.onChain.top10Percentage > 50) {
    actions.push("Concentration in top 10 holders is high; liquidity and price are more fragile.");
  }
  if (r.visualAssetReuse === "YES") {
    actions.push("Visual analysis flagged possible scam template reuse; avoid interaction.");
  }
  if (r.creatorHistory.previousTokens >= 2 && r.verdict !== "Safe") {
    actions.push("Creator has launched multiple tokens; check their history before trusting.");
  }

  if (r.verdict === "Danger" && actions.length === 0) {
    actions.push("Multiple risk factors were identified; do not invest or transfer funds.");
  }
  if (r.verdict === "Caution" && actions.length === 0) {
    actions.push("Address the on-chain and visual findings before considering any exposure.");
  }
  if (r.verdict === "Safe" && actions.length === 0) {
    actions.push("No critical issues in this scan; other risks (team, contract upgrades) are outside this assessment.");
  }

  return actions;
}

export function investigationResultToBotResult(r: InvestigationResult): BotScanResult {
  const onChainFindings: string[] = [];
  if (r.onChain.mintAuth) {
    onChainFindings.push("Mint authority is enabled; supply can be changed by the contract.");
  } else {
    onChainFindings.push("Mint authority is disabled.");
  }
  if (r.onChain.freezeAuth) {
    onChainFindings.push("Freeze authority is enabled; holder balances can be frozen.");
  } else {
    onChainFindings.push("Freeze authority is disabled.");
  }
  onChainFindings.push(`Top 10 holders control ${r.onChain.top10Percentage.toFixed(1)}% of supply.`);
  if (r.creatorHistory.creatorAddress && r.creatorHistory.creatorAddress !== "Unknown") {
    onChainFindings.push(`Creator holds ${r.onChain.creatorPercentage.toFixed(1)}% of supply.`);
    if (r.onChain.isDumped) {
      onChainFindings.push("Creator appears to have sold most of their allocation.");
    }
    if (r.onChain.isWhale) {
      onChainFindings.push("Creator holds a large share of supply.");
    }
  }
  if (r.creatorHistory.previousTokens > 0) {
    onChainFindings.push(`Creator has launched ${r.creatorHistory.previousTokens} token(s) before.`);
  }

  const visualFindings: string[] = [];
  if (r.visualEvidenceStatus === "captured") {
    if (r.visualAssetReuse === "YES") {
      visualFindings.push("Visual analysis detected possible asset reuse or copy of known scam templates.");
    } else if (r.visualAssetReuse === "NO") {
      visualFindings.push("Visual analysis did not detect obvious asset reuse.");
    } else {
      visualFindings.push("Visual analysis was performed; asset reuse could not be determined.");
    }
    if (r.visualEvidenceSummary && r.visualEvidenceSummary.trim()) {
      const clean = r.visualEvidenceSummary.replace(/^[✅⚠️👁\s]+/, "").trim();
      if (clean.length > 0 && clean.length < 200) {
        visualFindings.push(clean);
      }
    }
  } else {
    visualFindings.push("Visual forensics were not performed (no website screenshot or capture failed).");
  }

  const marketFindings: string[] = [];
  if (r.market) {
    if (r.market.liquidity > 0) {
      marketFindings.push(`Liquidity: $${formatShortUsd(r.market.liquidity)}.`);
    }
    if (r.market.marketCap > 0) {
      marketFindings.push(`Market cap: $${formatShortUsd(r.market.marketCap)}.`);
    }
    if (r.market.ageInHours >= 0) {
      const age =
        r.market.ageInHours >= 48
          ? `${Math.floor(r.market.ageInHours / 24)} days`
          : r.market.ageInHours >= 1
            ? `${Math.floor(r.market.ageInHours)} hours`
            : "under 1 hour";
      marketFindings.push(`Token age: ${age}.`);
    }
    if (r.market.botActivity && r.market.botActivity.trim()) {
      marketFindings.push(r.market.botActivity.trim());
    }
    if (r.market.anomalies && r.market.anomalies.length > 0) {
      marketFindings.push(...r.market.anomalies.slice(0, 3));
    }
  } else {
    marketFindings.push("Market data was not available for this token.");
  }

  const unknowns: string[] = [];
  if (!r.market || (r.market.liquidity === 0 && r.market.marketCap === 0)) {
    unknowns.push("Market and liquidity data could not be verified.");
  }
  if (r.visualEvidenceStatus !== "captured") {
    unknowns.push("Visual forensics were not performed.");
  }
  if (r.rugCheck === null) {
    unknowns.push("Contract audit / risk score from external provider was not available.");
  }
  if (r.creatorHistory.creatorAddress === "Unknown" || !r.creatorHistory.creatorAddress) {
    unknowns.push("Creator identity could not be determined from on-chain data.");
  }

  const dataCoverage: DataCoverage = {
    visual: coverageVisual(r),
    onChain: coverageOnChain(r),
    market: coverageMarket(r),
  };

  const displayVerdict = computeDisplayVerdict(r.verdict, dataCoverage);
  let nextActions = buildNextActions(r);
  if (displayVerdict === "Cannot verify") {
    nextActions = ["Insufficient data for a confident verdict; rescan when more sources are available or use other tools."];
  }
  const summaryLine = toProfessionalSummary(r, displayVerdict, dataCoverage);

  return {
    verdict: r.verdict,
    displayVerdict,
    confidence: r.trustScore,
    confidenceBand: confidenceToBand(r.trustScore),
    tokenAddress: r.tokenAddress,
    tokenName: r.tokenName,
    tokenSymbol: r.tokenSymbol,
    onChainFindings,
    visualFindings,
    marketFindings,
    unknowns,
    nextActions,
    summaryLine,
    analysisTimeMs: r.analysisTimeMs,
    dataCoverage,
    screenshotPublicUrl: r.screenshotPublicUrl,
  };
}

function formatShortUsd(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function toProfessionalSummary(
  r: InvestigationResult,
  displayVerdict: DisplayVerdict,
  dataCoverage: DataCoverage
): string {
  if (r.elephantMemory?.isKnownScammer) {
    return "This token is linked to a creator previously flagged for fraud. Do not interact.";
  }
  if (displayVerdict === "Cannot verify") {
    return "Insufficient data to assess risk. Visual, on-chain, or market data were missing or partial; no confident verdict can be given.";
  }
  if (displayVerdict === "High risk") {
    return "Multiple risk factors were identified in on-chain, visual, or market data. Treat as high risk.";
  }
  if (displayVerdict === "Suspicious") {
    return "Some concerns were identified. Review the findings before any interaction.";
  }
  return "No critical issues were found in the data sources used. Other risks (team, contract changes) are outside this assessment.";
}
