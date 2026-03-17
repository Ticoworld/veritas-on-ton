/**
 * Format normalized scan results for Telegram.
 * Evidence-first; no fake precision; data coverage and visual evidence surfaced.
 * Telegram message limit 4096 chars; we truncate long sections.
 */

import type { BotScanResult } from "./normalized-result";
import type { InlineKeyboardButton } from "./telegram-api";
import type { Claim } from "@/lib/claims";

const MAX_MESSAGE_LENGTH = 4000;
const CAPTION_MAX_LENGTH = 1024;

/** Build full URL for screenshot when saved and base URL is set. Exported for webhook (sendPhoto). */
export function getScreenshotFullUrl(bot: BotScanResult): string | undefined {
  if (!bot.screenshotPublicUrl) return undefined;
  const base =
    process.env.VERITAS_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);
  if (!base) return undefined;
  const baseClean = base.replace(/\/$/, "");
  const path = bot.screenshotPublicUrl.startsWith("/")
    ? bot.screenshotPublicUrl
    : `/${bot.screenshotPublicUrl}`;
  return `${baseClean}${path}`;
}

/**
 * Format Authority history section: based on Veritas records only; authority ≠ deployer; split counts.
 */
function formatAuthorityHistorySection(bot: BotScanResult): string {
  const lin = bot.lineage;
  if (!lin) return "• Insufficient history (authority not identified or no prior Veritas scans).";
  const basis = lin.identitySource
    ? `History is based on ${lin.identitySource.replace("_", " ")} in our records.`
    : "History is based on prior Veritas scans only.";
  const authorityCaveat = " Authority is the mint/freeze control address; it may not be the original deployer.";
  const confidenceNote =
    lin.lineageIdentityConfidence === "low"
      ? " Identity confidence is limited; do not overstate."
      : lin.lineageIdentityConfidence === "medium"
        ? " Identity is inferred from one contract authority."
        : "";
  if (!lin.hasPriorHistory) {
    return `• No prior launches linked to this authority in our records.\n• ${basis}${authorityCaveat}${confidenceNote}`;
  }
  const lines: string[] = [];
  lines.push(`• ${basis}${authorityCaveat}${confidenceNote}`.trim());
  lines.push(`• Among previously scanned launches in our records, this authority appears in ${lin.priorLaunchCount} prior token(s).`);
  if (lin.priorSuspiciousOrHighRiskCount > 0) {
    lines.push(`• Prior suspicious or high-risk (in our records): ${lin.priorSuspiciousOrHighRiskCount}.`);
  }
  if (lin.priorCannotVerifyCount > 0) {
    lines.push(`• Prior scans with insufficient data (not counted as suspicious): ${lin.priorCannotVerifyCount}.`);
  }
  if (lin.priorSuspiciousOrHighRiskCount === 0 && lin.priorCannotVerifyCount === 0) {
    lines.push("• No prior suspicious or high-risk history found in our records.");
  }
  if (lin.priorLaunches.length > 0) {
    lin.priorLaunches.slice(0, 5).forEach((p) => {
      const date = p.scannedAt.slice(0, 10);
      const label = p.displayLabel;
      lines.push(`  — ${p.tokenName} ($${p.tokenSymbol}): ${label} (${date})`);
    });
  }
  return lines.join("\n");
}

/**
 * Picks 2–4 strongest, decision-relevant reasons only.
 * Verdict-aware: legit tokens exclude drift noise; suspicious/high-risk rank claims above drift.
 */
function strongestReasons(bot: BotScanResult): string[] {
  const reasons: string[] = [];
  if (bot.displayVerdict === "Cannot verify") {
    reasons.push(bot.summaryLine);
    return reasons;
  }

  if (bot.displayVerdict === "Likely legitimate") {
    // Only include genuine claim contradictions or domain/authority signals; skip drift noise.
    const hasContradiction = (bot.claims ?? []).some((c) => c.verificationStatus === "contradicted");
    if (hasContradiction && bot.claimSummary) reasons.push(bot.claimSummary);
    const hasStrongDomainOrAuthority = !!(
      bot.reputationSignals?.sameDomainInPriorFlagged ||
      bot.reputationSignals?.authorityPlusPattern
    );
    if (hasStrongDomainOrAuthority && bot.reputationSignals?.strongestReputationFinding) {
      reasons.push(bot.reputationSignals.strongestReputationFinding);
    }
    if (bot.onChainFindings.some((f) => f.includes("Mint authority is disabled"))) reasons.push("Mint and freeze disabled");
    if (bot.visualFindings.some((f) => f.includes("did not detect") || f.includes("NO"))) reasons.push("No major visual deception detected");
    const hasLiquidity = bot.marketFindings.some(
      (f) => f.includes("Liquidity:") && (f.includes("K") || f.includes("M") || (f.includes("$") && !f.includes("$0.")))
    );
    if (hasLiquidity) reasons.push("Liquidity support present");
    if (reasons.length === 0) reasons.push(bot.summaryLine);
    return reasons.slice(0, 4);
  }

  // Suspicious / High risk: current-scan claim findings first, then strong reputation, then drift, then lineage
  if (bot.claimSummary) reasons.push(bot.claimSummary);
  if (bot.reputationSignals?.strongestReputationFinding) {
    reasons.push(bot.reputationSignals.strongestReputationFinding);
  }
  if (bot.websiteDrift?.materialChangesDetected && bot.websiteDrift.strongestFinding) {
    reasons.push(bot.websiteDrift.strongestFinding);
  }
  if (bot.lineage?.strongestLineageFinding && bot.lineage.lineageIdentityConfidence !== "low") {
    reasons.push(bot.lineage.strongestLineageFinding);
  }
  if (bot.displayVerdict === "High risk" || bot.displayVerdict === "Suspicious") {
    if (bot.onChainFindings.some((f) => f.includes("Mint authority is enabled"))) reasons.push("Mint authority enabled");
    if (bot.onChainFindings.some((f) => f.includes("Freeze authority is enabled"))) reasons.push("Freeze authority enabled");
    if (bot.visualFindings.some((f) => f.toLowerCase().includes("reuse") || f.toLowerCase().includes("copy"))) reasons.push("Visual scam pattern detected");
    if (bot.onChainFindings.some((f) => f.includes("sold most of their allocation"))) reasons.push("Creator sold heavily");
    if (bot.onChainFindings.some((f) => f.includes("control") && f.includes("%"))) reasons.push("High holder concentration");
  }
  if (reasons.length === 0) reasons.push(bot.summaryLine);
  return reasons.slice(0, 4);
}

function formatWebsiteDriftSection(bot: BotScanResult): string {
  const drift = bot.websiteDrift;
  if (!drift) return "• Website drift unavailable for this scan.";
  if (!drift.priorSnapshotExists) return "• No prior website snapshot in Veritas records for comparison.";
  const lines: string[] = [];
  const when = drift.priorScannedAt ? drift.priorScannedAt.slice(0, 10) : "unknown date";
  const basisLabel =
    drift.comparisonBasis === "token"
      ? "same token (strong continuity)"
      : drift.comparisonBasis === "domain"
        ? "same domain (weaker continuity; domain may be reused or repointed)"
        : "similar context";
  lines.push(`• Compared with prior snapshot from ${when} for ${basisLabel}.`);
  if (drift.materialChangesDetected) {
    lines.push("• Material website trust-signal changes detected since previous scan:");
    drift.keyChanges.slice(0, 3).forEach((c) => lines.push(`  — ${c}`));
  } else {
    lines.push("• No material website trust-signal changes detected since previous scan.");
  }
  return lines.join("\n");
}

/** Format Reputation signals section: strong vs weak; no overclaiming. */
function formatReputationSection(bot: BotScanResult): string {
  const rep = bot.reputationSignals;
  if (!rep) return "• Reputation signals not available for this scan.";
  const hasAny =
    rep.sameDomainInPriorFlagged ||
    rep.repeatedClaimMotif ||
    rep.repeatedVisualPattern ||
    rep.authorityPlusPattern;
  if (!hasAny) {
    return "• No repeated trust pattern found across prior scans in our records.";
  }
  const lines: string[] = [];
  if (rep.authorityPlusPattern) {
    lines.push(`• ${rep.authorityPlusPattern.patternDescription}`);
  }
  if (rep.sameDomainInPriorFlagged) {
    const verdictNote =
      rep.sameDomainInPriorFlagged.scansWithVerdictCount != null
        ? ` (${rep.sameDomainInPriorFlagged.scansWithVerdictCount} with verdict data)`
        : "";
    lines.push(
      `• Same domain (${rep.sameDomainInPriorFlagged.domain}) appeared in prior suspicious scans: ${rep.sameDomainInPriorFlagged.priorScanCount} prior scan(s), ${rep.sameDomainInPriorFlagged.priorFlaggedCount} flagged${verdictNote}.`,
    );
  }
  if (rep.repeatedClaimMotif) {
    const label =
      rep.repeatedClaimMotif.strength === "weak"
        ? " (weaker signal: generic claim-type repetition)"
        : rep.repeatedClaimMotif.unsupportedContradicted
          ? " (unsupported or contradicted claim motif)"
          : " (repeated claim combination)";
    lines.push(
      `• Repeated trust-claim motif (${rep.repeatedClaimMotif.claimTypes.join(", ")}) seen in prior flagged scans: ${rep.repeatedClaimMotif.priorScanCount} prior scan(s), ${rep.repeatedClaimMotif.priorFlaggedCount} flagged${label}.`,
    );
  }
  if (rep.repeatedVisualPattern) {
    lines.push(
      `• Similar visual trust summary in prior flagged scans: ${rep.repeatedVisualPattern.priorScanCount} prior scan(s), ${rep.repeatedVisualPattern.priorFlaggedCount} flagged (weaker signal).`,
    );
  }
  return lines.join("\n");
}

/**
 * One-line visual status for the card: captured and analyzed vs not captured; strongest signal when available.
 */
function cardVisualLine(bot: BotScanResult): string {
  if (bot.dataCoverage.visual !== "available") {
    return "Visual: not captured";
  }
  const hasReuse = bot.visualFindings.some((f) => f.toLowerCase().includes("reuse") || f.toLowerCase().includes("copy"));
  const hasClean = bot.visualFindings.some((f) => f.includes("did not detect") || f.includes("NO"));
  if (hasReuse) return "Visual: captured and analyzed — possible scam template reuse";
  if (hasClean) return "Visual: captured and analyzed — no major deception detected";
  return "Visual: captured and analyzed — see Full Report for details";
}

/** Format Claims check section: claim, status, short reason. */
function formatClaimsSection(claims: Claim[]): string {
  if (!claims.length) return "• No trust claims extracted from the website.";
  return claims
    .map(
      (c) =>
        `• [${c.type}] ${c.rawClaim.slice(0, 60)}${c.rawClaim.length > 60 ? "…" : ""}\n  Status: ${c.verificationStatus}. ${c.evidence.slice(0, 100)}${c.evidence.length > 100 ? "…" : ""}`
    )
    .join("\n\n");
}

/** Short verdict card for main reply (alert style). Verdict, confidence, 2–4 reasons (incl. claim finding when relevant), compact coverage, clear visual status. */
export function formatVerdictCard(bot: BotScanResult): string {
  const reasons = strongestReasons(bot);
  const coverageLine = `Coverage: Visual ${bot.dataCoverage.visual} · On-chain ${bot.dataCoverage.onChain} · Market ${bot.dataCoverage.market}`;
  const visualLine = cardVisualLine(bot);

  const lines: string[] = [
    `${bot.tokenName} ($${bot.tokenSymbol})`,
    "",
    `Verdict: ${bot.displayVerdict} · Confidence: ${bot.confidenceBand}`,
    "",
    ...reasons.map((r) => `• ${r}`),
    "",
    coverageLine,
    visualLine,
  ];
  return lines.join("\n");
}

/** Full verdict message (long form). Kept for optional use; main reply uses formatVerdictCard. */
export function formatVerdictMessage(bot: BotScanResult): string {
  const lines: string[] = [];

  lines.push(`Veritas security assessment for ${bot.tokenName} ($${bot.tokenSymbol})`);
  lines.push("");
  lines.push(`Verdict: ${bot.displayVerdict}`);
  lines.push(`Confidence: ${bot.confidenceBand}`);
  lines.push(`Analysis time: ${(bot.analysisTimeMs / 1000).toFixed(1)}s`);
  lines.push("");

  lines.push("Data coverage:");
  lines.push(`• Visual: ${bot.dataCoverage.visual}`);
  lines.push(`• On-chain: ${bot.dataCoverage.onChain}`);
  lines.push(`• Market: ${bot.dataCoverage.market}`);
  lines.push("");

  lines.push("Why this verdict:");
  lines.push(`• ${bot.summaryLine}`);
  lines.push("");

  lines.push("Visual findings:");
  const screenshotUrl = getScreenshotFullUrl(bot);
  if (screenshotUrl) {
    lines.push(`• Captured page: ${screenshotUrl}`);
  }
  if (bot.visualFindings.length > 0) {
    bot.visualFindings.slice(0, 3).forEach((f) => lines.push(`• ${f}`));
  } else if (!screenshotUrl) {
    lines.push("• Visual forensics were not performed for this token.");
  }
  lines.push("");

  lines.push("On-chain findings:");
  if (bot.onChainFindings.length > 0) {
    bot.onChainFindings.slice(0, 3).forEach((f) => lines.push(`• ${f}`));
  } else {
    lines.push("• On-chain holder and authority data were not available in this scan.");
  }
  lines.push("");

  lines.push("Market findings:");
  if (bot.marketFindings.length > 0) {
    bot.marketFindings.slice(0, 3).forEach((f) => lines.push(`• ${f}`));
  } else {
    lines.push("• Market and liquidity data were not available in this scan.");
  }
  lines.push("");

  lines.push("Claims check:");
  lines.push(bot.claims?.length ? formatClaimsSection(bot.claims) : "• No trust claims extracted from the website.");
  lines.push("");

  lines.push("Website drift:");
  lines.push(formatWebsiteDriftSection(bot));
  lines.push("");

  lines.push("Reputation signals:");
  lines.push(formatReputationSection(bot));
  lines.push("");

  lines.push("Authority history:");
  lines.push(formatAuthorityHistorySection(bot));
  lines.push("");

  lines.push("Unknowns and limitations:");
  if (bot.unknowns.length > 0) {
    bot.unknowns.forEach((u) => lines.push(`• ${u}`));
  } else {
    lines.push("• This assessment is based only on the data sources available at scan time and cannot guarantee safety.");
  }
  lines.push("");

  lines.push("Recommended next actions:");
  bot.nextActions.forEach((a) => lines.push(`• ${a}`));

  const out = lines.join("\n");
  return out.length > MAX_MESSAGE_LENGTH ? out.slice(0, MAX_MESSAGE_LENGTH - 20) + "\n\n[truncated]" : out;
}

export function formatFullReport(bot: BotScanResult): string {
  const sections: string[] = [];

  sections.push(`Veritas full report for ${bot.tokenName} ($${bot.tokenSymbol})`);
  sections.push("");
  sections.push(`Verdict: ${bot.displayVerdict}`);
  sections.push(`Confidence: ${bot.confidenceBand}`);
  if (bot.claimSummary) {
    sections.push("");
    sections.push("Claim finding:");
    sections.push(`• ${bot.claimSummary}`);
  }
  sections.push("");
  sections.push("Data coverage:");
  sections.push(`• Visual: ${bot.dataCoverage.visual}`);
  sections.push(`• On-chain: ${bot.dataCoverage.onChain}`);
  sections.push(`• Market: ${bot.dataCoverage.market}`);
  sections.push("");
  sections.push("Why this verdict:");
  sections.push(`• ${bot.summaryLine}`);
  sections.push("");

  sections.push("Claims check:");
  sections.push(bot.claims?.length ? formatClaimsSection(bot.claims) : "• No trust claims extracted from the website.");
  sections.push("");

  sections.push("Website drift:");
  sections.push(formatWebsiteDriftSection(bot));
  sections.push("");

  sections.push("Reputation signals:");
  sections.push(formatReputationSection(bot));
  sections.push("");

  sections.push("Authority history:");
  sections.push(formatAuthorityHistorySection(bot));
  sections.push("");

  sections.push("Visual findings:");
  const screenshotUrl = getScreenshotFullUrl(bot);
  if (screenshotUrl) {
    sections.push(`• Captured page: ${screenshotUrl}`);
  }
  if (bot.visualFindings.length > 0) {
    bot.visualFindings.forEach((f) => sections.push(`• ${f}`));
  } else if (!screenshotUrl) {
    sections.push("• Visual forensics were not performed for this token.");
  }
  sections.push("");

  sections.push("On-chain findings:");
  if (bot.onChainFindings.length > 0) {
    bot.onChainFindings.forEach((f) => sections.push(`• ${f}`));
  } else {
    sections.push("• On-chain holder and authority data were not available in this scan.");
  }
  sections.push("");

  sections.push("Market findings:");
  if (bot.marketFindings.length > 0) {
    bot.marketFindings.forEach((f) => sections.push(`• ${f}`));
  } else {
    sections.push("• Market and liquidity data were not available in this scan.");
  }
  sections.push("");

  sections.push("Unknowns and limitations:");
  if (bot.unknowns.length > 0) {
    bot.unknowns.forEach((u) => sections.push(`• ${u}`));
  } else {
    sections.push("• This report cannot cover risks outside the observed on-chain, market, and visual data.");
  }
  sections.push("");

  sections.push("Recommended next actions:");
  bot.nextActions.forEach((a) => sections.push(`• ${a}`));

  const out = sections.join("\n");
  return out.length > MAX_MESSAGE_LENGTH ? out.slice(0, MAX_MESSAGE_LENGTH - 20) + "\n\n[truncated]" : out;
}

export function formatWhyRisky(bot: BotScanResult): string {
  const lines: string[] = [
    `Why this verdict — ${bot.tokenName} ($${bot.tokenSymbol})`,
    "",
  ];

  if (bot.displayVerdict === "Likely legitimate") {
    lines.push("This scan did not identify critical technical red flags in the data sources used.");
    lines.push("Other risk (team behaviour, contract upgradability, market conditions) is outside this assessment.");
    return lines.join("\n");
  }

  if (bot.displayVerdict === "Cannot verify") {
    lines.push("Insufficient data to explain risk. Visual, on-chain, or market data were missing or partial.");
    lines.push("");
    lines.push("Recommended next actions:");
    bot.nextActions.forEach((a) => lines.push(`• ${a}`));
    return lines.join("\n");
  }

  if (bot.onChainFindings.length > 0) {
    lines.push("On-chain:");
    bot.onChainFindings
      .filter((f) => f.includes("enabled") || f.includes("Dumped") || f.includes("large share") || f.includes("control"))
      .forEach((f) => lines.push(`• ${f}`));
    lines.push("");
  }

  if (bot.visualFindings.length > 0 && bot.visualFindings.some((f) => f.toLowerCase().includes("reuse") || f.toLowerCase().includes("copy"))) {
    lines.push("Visual:");
    bot.visualFindings.forEach((f) => lines.push(`• ${f}`));
    lines.push("");
  }

  if (bot.claims?.length > 0) {
    const claimRelevant = bot.claims.filter((c) => c.verificationStatus === "contradicted" || c.verificationStatus === "unverified");
    if (claimRelevant.length > 0) {
      lines.push("Claims check:");
      claimRelevant.forEach((c) => {
        const rc = c.rawClaim.length > 50 ? c.rawClaim.slice(0, 50) + "…" : c.rawClaim;
        const ev = c.evidence.length > 60 ? c.evidence.slice(0, 60) + "…" : c.evidence;
        lines.push(`• [${c.type}] ${c.verificationStatus}: ${rc} — ${ev}`);
      });
      lines.push("");
    }
  }

  if (bot.websiteDrift?.priorSnapshotExists) {
    lines.push("Website drift:");
    if (bot.websiteDrift.materialChangesDetected) {
      bot.websiteDrift.keyChanges.slice(0, 3).forEach((c) => lines.push(`• ${c}`));
    } else {
      lines.push("• No material website trust-signal changes detected since previous scan.");
    }
    lines.push("");
  }

  if (bot.lineage?.hasPriorHistory && bot.lineage.priorSuspiciousOrHighRiskCount > 0) {
    lines.push("Authority history (based on prior Veritas scans in our records):");
    lines.push(`• This authority appears in ${bot.lineage.priorLaunchCount} prior token(s), ${bot.lineage.priorSuspiciousOrHighRiskCount} prior suspicious or high-risk.`);
    lines.push("");
  }

  if (bot.unknowns.length > 0) {
    lines.push("Unverified:");
    bot.unknowns.forEach((u) => lines.push(`• ${u}`));
  }

  lines.push("");
  lines.push("Recommended next actions:");
  bot.nextActions.forEach((a) => lines.push(`• ${a}`));

  const out = lines.join("\n");
  return out.length > MAX_MESSAGE_LENGTH ? out.slice(0, MAX_MESSAGE_LENGTH - 20) + "\n\n[truncated]" : out;
}

/**
 * Evidence-based caption for screenshot photo. Summarizes the strongest visual finding, not generic status.
 * Do not overstate when analysis was inconclusive.
 */
export function formatScreenshotCaption(bot: BotScanResult): string {
  const tokenLabel = `${bot.tokenName} ($${bot.tokenSymbol})`;
  const hasReuse = bot.visualFindings.some((f) => f.toLowerCase().includes("reuse") || f.toLowerCase().includes("copy"));
  const hasClean = bot.visualFindings.some((f) => f.includes("did not detect") || f.includes("NO"));
  const inconclusive = bot.visualFindings.some((f) => f.includes("could not be determined") || f.includes("UNKNOWN"));

  let main: string;
  if (hasReuse) {
    main = "Visual finding: possible scam template reuse detected. Captured page resembles previously flagged branding patterns.";
  } else if (hasClean) {
    main = "Visual finding: no major visual deception detected. Captured page branding appears original in this scan.";
  } else if (inconclusive) {
    main = "Visual finding: analysis performed; asset reuse could not be determined. See Full Report for details.";
  } else {
    main = "Captured project page. Visual analysis in Full Report.";
  }
  const line = `${main} — ${tokenLabel}`;
  return line.length > CAPTION_MAX_LENGTH ? line.slice(0, CAPTION_MAX_LENGTH - 3) + "…" : line;
}

/** Inline keyboard for verdict message: Rescan, Full Report, Why risky? */
export function verdictInlineKeyboard(address: string): InlineKeyboardButton[][] {
  return [
    [
      { text: "Rescan", callback_data: `rescan:${address}` },
      { text: "Full Report", callback_data: `full:${address}` },
      { text: "Why risky?", callback_data: `why:${address}` },
    ],
  ];
}
