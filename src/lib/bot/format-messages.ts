/**
 * Format normalized scan results for Telegram.
 * Evidence-first; no fake precision; data coverage and visual evidence surfaced.
 * Telegram message limit 4096 chars; we truncate long sections.
 */

import type { BotScanResult } from "./normalized-result";
import type { InlineKeyboardButton } from "./telegram-api";

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
 * Picks 2–4 strongest, decision-relevant reasons only. No filler (e.g. "Visual evidence captured").
 */
function strongestReasons(bot: BotScanResult): string[] {
  const reasons: string[] = [];
  if (bot.displayVerdict === "Cannot verify") {
    reasons.push(bot.summaryLine);
    return reasons;
  }
  if (bot.displayVerdict === "High risk" || bot.displayVerdict === "Suspicious") {
    if (bot.onChainFindings.some((f) => f.includes("Mint authority is enabled"))) reasons.push("Mint authority enabled");
    if (bot.onChainFindings.some((f) => f.includes("Freeze authority is enabled"))) reasons.push("Freeze authority enabled");
    if (bot.visualFindings.some((f) => f.toLowerCase().includes("reuse") || f.toLowerCase().includes("copy"))) reasons.push("Visual scam pattern detected");
    if (bot.onChainFindings.some((f) => f.includes("sold most of their allocation"))) reasons.push("Creator sold heavily");
    if (bot.onChainFindings.some((f) => f.includes("control") && f.includes("%"))) reasons.push("High holder concentration");
  }
  if (bot.displayVerdict === "Likely legitimate") {
    if (bot.onChainFindings.some((f) => f.includes("Mint authority is disabled"))) reasons.push("Mint and freeze disabled");
    if (bot.visualFindings.some((f) => f.includes("did not detect") || f.includes("NO"))) reasons.push("No major visual deception detected");
    const hasLiquidity = bot.marketFindings.some(
      (f) => f.includes("Liquidity:") && (f.includes("K") || f.includes("M") || (f.includes("$") && !f.includes("$0.")))
    );
    if (hasLiquidity) reasons.push("Liquidity support present");
  }
  if (reasons.length === 0) reasons.push(bot.summaryLine);
  return reasons.slice(0, 4);
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

/** Short verdict card for main reply (alert style). Verdict, confidence, 2–4 reasons, compact coverage, clear visual status. */
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
  sections.push("");
  sections.push("Data coverage:");
  sections.push(`• Visual: ${bot.dataCoverage.visual}`);
  sections.push(`• On-chain: ${bot.dataCoverage.onChain}`);
  sections.push(`• Market: ${bot.dataCoverage.market}`);
  sections.push("");
  sections.push("Why this verdict:");
  sections.push(`• ${bot.summaryLine}`);
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
