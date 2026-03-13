"use client";

import { useState, useEffect, useRef } from "react";
import {
  Shield,
  ShieldAlert,
  ShieldX,
  Skull,
  ArrowLeft,
  Droplets,
  TrendingUp,
  Activity,
  Bot,
  Percent,
  Lock,
  Unlock,
} from "lucide-react";
import { TonConnectButton } from "@tonconnect/ui-react";

type MainButtonAPI = {
  setText: (t: string) => void;
  setParams: (p: { text?: string; color?: string; text_color?: string }) => void;
  onClick: (cb: () => void) => void;
  offClick: (cb: () => void) => void;
  show: () => void;
  hide: () => void;
};

function getMainButton(): MainButtonAPI | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Telegram?: { WebApp?: { MainButton?: MainButtonAPI } } }).Telegram?.WebApp?.MainButton ?? null;
}
import type { ScammerRecord, LineageSummary, WebsiteDriftSummary, ReputationSignals } from "@/lib/db/elephant";
import type { Claim } from "@/lib/claims";
import { strongestClaimSummary } from "@/lib/claims";

const TON_ADDRESS_REGEX = /^[a-zA-Z0-9_\-+/]{48}$/;

type FetchStatus = "idle" | "loading" | "done" | "error";

// =============================================================================
// TYPES
// =============================================================================

export interface FastResult {
  tokenAddress: string;
  tokenInfo: {
    decimals: number;
    supply: string;
    mintAuthority: string | null;
    freezeAuthority: string | null;
  };
  supply: number;
  market: {
    liquidity: number;
    volume24h: number;
    marketCap: number;
    buySellRatio: number;
    ageInHours: number;
    botActivity: string;
    anomalies: string[];
  } | null;
}

interface ScanResult {
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  trustScore: number;
  verdict: "Safe" | "Caution" | "Danger";
  summary: string;
  criminalProfile: string;
  veritasSays?: string;
  lies: string[];
  evidence: string[];
  analysis: string[];
  visualAnalysis?: string;
  degenComment: string;
  thoughtSummary?: string;
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
  market: {
    liquidity: number;
    volume24h: number;
    marketCap: number;
    buySellRatio: number;
    ageInHours: number;
    botActivity: string;
    anomalies: string[];
  } | null;
  rugCheck: {
    score: number;
    risks: Array<{ name: string; description: string; level: string; score: number }>;
  } | null;
  creatorHistory: {
    creatorAddress: string;
    previousTokens: number;
    isSerialLauncher: boolean;
  };
  socials: {
    website?: string;
    twitter?: string;
    telegram?: string;
    discord?: string;
  };
  visualEvidenceStatus?: "captured" | "not_captured";
  visualAssetReuse?: "YES" | "NO" | "UNKNOWN";
  visualEvidenceSummary?: string;
  elephantMemory: {
    isKnownScammer: boolean;
    previousFlags?: ScammerRecord;
  };
  claims?: Claim[];
  lineage?: LineageSummary;
  websiteDrift?: WebsiteDriftSummary;
  reputationSignals?: ReputationSignals;
  websiteDiscovery?: {
    status: string;
    selectedWebsite: string | null;
    sourceConfidence: string;
    statusReason?: string;
  };
  analyzedAt: string;
  analysisTimeMs: number;
}

// =============================================================================
// COMPONENT
// =============================================================================

function getInitData(): string {
  if (typeof window === "undefined") return "";
  return (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData ?? "";
}

export function TruthConsole() {
  const [address, setAddress] = useState("");
  const [websiteOverride, setWebsiteOverride] = useState("");
  const [fastResult, setFastResult] = useState<FastResult | null>(null);
  const [fastStatus, setFastStatus] = useState<FetchStatus>("idle");
  const [slowResult, setSlowResult] = useState<ScanResult | null>(null);
  const [slowStatus, setSlowStatus] = useState<FetchStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const handleScanRef = useRef<() => void>(() => {});
  const fastAbortRef = useRef<AbortController | null>(null);
  const slowAbortRef = useRef<AbortController | null>(null);
  const isValidAddress = TON_ADDRESS_REGEX.test(address.trim());

  useEffect(() => {
    const tg = typeof window !== "undefined" ? (window as unknown as { Telegram?: { WebApp?: { ready: () => void; expand: () => void; setHeaderColor: (c: string) => void; themeParams?: { bg_color?: string } } } }).Telegram?.WebApp : undefined;
    if (tg) {
      tg.ready();
      tg.expand();
      if (tg.themeParams?.bg_color) {
        tg.setHeaderColor(tg.themeParams.bg_color);
      }
    }
  }, []);

  async function fetchFast(addr: string, signal: AbortSignal) {
    try {
      const res = await fetch("/api/analyze-fast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": getInitData(),
        },
        body: JSON.stringify({ address: addr }),
        signal,
      });
      if (signal.aborted) return;
      const data = await res.json();
      if (signal.aborted) return;
      if (!res.ok || !data.success) throw new Error(data.error || "Fast scan failed");
      setFastResult(data.data as FastResult);
      setFastStatus("done");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setFastStatus("error");
      setError(err instanceof Error ? err.message : "Fast scan failed");
    }
  }

  async function fetchSlow(addr: string, signal: AbortSignal) {
    try {
      const res = await fetch("/api/analyze-unified", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": getInitData(),
        },
        body: JSON.stringify({
          address: addr,
          website: websiteOverride.trim() || undefined,
        }),
        signal,
      });
      if (signal.aborted) return;
      const data = await res.json();
      if (signal.aborted) return;
      if (!res.ok || !data.success) throw new Error(data.error || "Analysis failed");
      setSlowResult(data.data as ScanResult);
      setSlowStatus("done");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setSlowStatus("error");
      setError(err instanceof Error ? err.message : "Analysis failed");
    }
  }

  const handleScan = () => {
    const addr = address.trim();
    if (!addr || fastStatus === "loading" || slowStatus === "loading") return;
    if (!TON_ADDRESS_REGEX.test(addr)) {
      setError("Invalid TON Address Format. A valid TON address is exactly 48 characters (base64).");
      return;
    }

    fastAbortRef.current?.abort();
    slowAbortRef.current?.abort();

    const fastAbort = new AbortController();
    const slowAbort = new AbortController();
    fastAbortRef.current = fastAbort;
    slowAbortRef.current = slowAbort;

    setFastResult(null);
    setSlowResult(null);
    setFastStatus("loading");
    setSlowStatus("loading");
    setError(null);
    setCopied(false);

    fetchFast(addr, fastAbort.signal);
    fetchSlow(addr, slowAbort.signal);
  };
  handleScanRef.current = handleScan;

  useEffect(() => {
    const MainButton = getMainButton();
    if (!MainButton) return;
    MainButton.setText("Scan Token");
    if (typeof MainButton.setParams === "function") {
      MainButton.setParams({
        text: "Scan Token",
        color: "#2d4a6f",
        text_color: "#e2e8f0",
      });
    }
    const onMainClick = () => handleScanRef.current?.();
    MainButton.onClick(onMainClick);
    return () => {
      MainButton.offClick(onMainClick);
      MainButton.hide();
    };
  }, []);

  const isScanning = fastStatus === "loading" || slowStatus === "loading";
  const hasResults = fastStatus !== "idle" || slowStatus !== "idle";

  useEffect(() => {
    const MainButton = getMainButton();
    if (!MainButton) return;
    if (isValidAddress && !isScanning) {
      MainButton.show();
    } else {
      MainButton.hide();
    }
  }, [isValidAddress, isScanning]);

  const handleReset = () => {
    setAddress("");
    setWebsiteOverride("");
    setFastResult(null);
    setSlowResult(null);
    setFastStatus("idle");
    setSlowStatus("idle");
    setError(null);
    setCopied(false);
  };

  const handleCopyVerdict = () => {
    if (!slowResult) return;
    const text = slowResult.veritasSays ?? [slowResult.verdict, slowResult.summary].join("\n");
    void navigator.clipboard.writeText(text).then(() => setCopied(true));
  };

  return (
    <>
      <div className="fixed top-4 right-4 z-10">
        <TonConnectButton />
      </div>
      <div className="w-full max-w-2xl mx-auto px-3 flex flex-col gap-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-flex items-center px-2 py-0.5 rounded border text-xs font-mono uppercase tracking-wide"
              style={{
                backgroundColor: "var(--tg-theme-secondary-bg-color, #18181B)",
                borderColor: "var(--tg-theme-hint-color, #27272A)",
                color: "var(--tg-theme-hint-color, #A1A1AA)",
              }}
            >
              TON token
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleScan()}
              placeholder="Paste TON token/contract address (48 chars)"
              disabled={isScanning}
              className="flex-1 px-4 py-3 rounded-sm font-mono text-sm focus:outline-none transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "var(--tg-theme-secondary-bg-color, #0A0A0B)",
                border: "1px solid var(--tg-theme-hint-color, #27272A)",
                color: "var(--tg-theme-text-color, #FAFAFA)",
              }}
            />
            <button
              type="button"
              onClick={handleScan}
              disabled={isScanning || !address.trim()}
              className="px-5 py-3 rounded-sm text-sm font-medium uppercase tracking-wider whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              style={{
                backgroundColor: "var(--tg-theme-button-color, #2481cc)",
                color: "var(--tg-theme-button-text-color, #fff)",
                border: "1px solid var(--tg-theme-hint-color, transparent)",
              }}
            >
              {isScanning ? "…" : "Scan"}
            </button>
          </div>
          <p className="text-xs" style={{ color: textSecondary }}>
            Token contract/mint address, not your wallet
          </p>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider block mb-1" style={{ color: textSecondary }}>
              Website URL (optional)
            </label>
            <input
              type="url"
              value={websiteOverride}
              onChange={(e) => setWebsiteOverride(e.target.value)}
              placeholder="If no project site was found, add one"
              disabled={isScanning}
              className="w-full px-3 py-2 rounded-sm font-mono text-xs focus:outline-none transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "var(--tg-theme-secondary-bg-color, #0A0A0B)",
                border: "1px solid var(--tg-theme-hint-color, #27272A)",
                color: "var(--tg-theme-text-color, #FAFAFA)",
              }}
            />
          </div>

          {error && (
            <div
              className="p-3 rounded-sm border"
              style={{
                backgroundColor: "var(--tg-theme-secondary-bg-color, #18181B)",
                borderColor: "var(--tg-theme-destructive-text-color, #7F1D1D)",
              }}
            >
              <p className="text-xs font-mono" style={{ color: "var(--tg-theme-destructive-text-color, #FCA5A5)" }}>
                {error}
              </p>
            </div>
          )}
        </div>

        {hasResults && (
          <>
            {fastStatus === "loading" && <SkeletonFastHUD />}
            {fastStatus === "done" && fastResult && <FastHUD result={fastResult} />}
            {fastStatus === "error" && (
              <div className="p-3 rounded-sm border" style={{ borderColor: "var(--tg-theme-hint-color, #27272A)" }}>
                <p className="text-xs" style={{ color: "var(--tg-theme-hint-color)" }}>On-chain data unavailable</p>
              </div>
            )}

            {slowStatus === "loading" && <SkeletonSlowVision />}
            {slowStatus === "done" && slowResult && (
              <SlowVision result={slowResult} copied={copied} onCopy={handleCopyVerdict} onReset={handleReset} />
            )}
            {slowStatus === "error" && (
              <div className="p-3 rounded-sm border" style={{ borderColor: "var(--tg-theme-hint-color, #27272A)" }}>
                <p className="text-xs" style={{ color: "var(--tg-theme-hint-color)" }}>
                  AI analysis unavailable — on-chain data above is still valid
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

// =============================================================================
// PROGRESSIVE BLOCKS: Fast (on-chain) + Slow (AI)
// =============================================================================

function SkeletonFastHUD() {
  const borderStyle = { borderColor: "var(--tg-theme-hint-color, #27272A)" };
  const bgStyle = { backgroundColor: "var(--tg-theme-secondary-bg-color, #18181B)" };
  return (
    <div className="rounded-lg border overflow-hidden" style={borderStyle}>
      <div className="flex items-center justify-between px-4 py-2 border-b" style={borderStyle}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full animate-pulse" style={bgStyle} />
          <div className="h-2 w-24 rounded animate-pulse" style={bgStyle} />
        </div>
        <div className="h-2 w-12 rounded animate-pulse" style={bgStyle} />
      </div>
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-4 w-32 rounded animate-pulse" style={bgStyle} />
          <div className="h-3 w-16 rounded animate-pulse" style={bgStyle} />
        </div>
        <div className="grid grid-cols-4 gap-2">
          {["LIQ", "MCAP", "VOL", "AGE"].map((label) => (
            <div key={label} className="rounded p-2 border text-center space-y-1.5" style={borderStyle}>
              <div className="h-2 w-8 rounded mx-auto animate-pulse" style={bgStyle} />
              <div className="h-4 w-12 rounded mx-auto animate-pulse" style={bgStyle} />
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="h-9 flex-1 rounded border animate-pulse" style={{ ...borderStyle, ...bgStyle }} />
          <div className="h-9 flex-1 rounded border animate-pulse" style={{ ...borderStyle, ...bgStyle }} />
        </div>
      </div>
    </div>
  );
}

function FastHUD({ result }: { result: FastResult }) {
  const borderStyle = { borderColor: "var(--tg-theme-hint-color, #27272A)" };
  const cardStyle = {
    backgroundColor: "var(--tg-theme-secondary-bg-color, #0A0A0B)",
    ...borderStyle,
  };
  const m = result.market;
  return (
    <div className="rounded-lg border overflow-hidden" style={cardStyle}>
      <div className="flex items-center justify-between px-4 py-2 border-b" style={borderStyle}>
        <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "var(--tg-theme-hint-color)" }}>
          On-chain
        </span>
        <span className="text-[10px] font-mono" style={{ color: "var(--tg-theme-hint-color)" }}>Live</span>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <SecurityCard
            icon={result.tokenInfo.mintAuthority ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            label="Mint"
            enabled={!!result.tokenInfo.mintAuthority}
          />
          <SecurityCard
            icon={result.tokenInfo.freezeAuthority ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            label="Freeze"
            enabled={!!result.tokenInfo.freezeAuthority}
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MetricCard icon={<Droplets className="w-3.5 h-3.5" />} label="Liquidity" value={`$${formatNumber(m?.liquidity ?? 0)}`} />
          <MetricCard icon={<TrendingUp className="w-3.5 h-3.5" />} label="Market Cap" value={`$${formatNumber(m?.marketCap ?? 0)}`} />
          <MetricCard icon={<Activity className="w-3.5 h-3.5" />} label="24h Vol" value={`$${formatNumber(m?.volume24h ?? 0)}`} />
          <MetricCard
            icon={<Bot className="w-3.5 h-3.5" />}
            label="Bots"
            value={m?.botActivity ?? "N/A"}
            status={m?.botActivity === "Low" ? "safe" : "warning"}
          />
        </div>
        {m?.anomalies && m.anomalies.length > 0 && (
          <div className="rounded p-2.5 border space-y-1" style={{ ...cardStyle, borderColor: "var(--tg-theme-hint-color, #3F3F46)" }}>
            <span className="text-[10px] font-mono uppercase" style={{ color: textMuted }}>Anomalies</span>
            <ul className="space-y-0.5">
              {m.anomalies.slice(0, 3).map((a, i) => (
                <li key={i} className="text-xs font-mono" style={{ color: "#D4B483" }}>• {a}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function SkeletonSlowVision() {
  const borderStyle = { borderColor: "var(--tg-theme-hint-color, #27272A)" };
  const bgStyle = { backgroundColor: "var(--tg-theme-secondary-bg-color, #18181B)" };
  return (
    <div className="rounded-lg border overflow-hidden" style={borderStyle}>
      <div className="flex items-center justify-between px-4 py-2 border-b" style={borderStyle}>
        <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "var(--tg-theme-hint-color)" }}>Veritas Verdict</span>
        <span className="text-[10px] font-mono" style={{ color: "var(--tg-theme-hint-color)" }}>interrogating…</span>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex flex-col items-center justify-center py-6 space-y-3">
          <div className="px-6 py-2.5 rounded border" style={borderStyle}>
            <span className="font-mono text-sm tracking-widest" style={{ color: "var(--tg-theme-hint-color)" }}>[ INTERROGATING VISUALS ]</span>
          </div>
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--tg-theme-hint-color)" }}>
            <span>Gemini Vision</span><span>•</span><span>AI Analysis</span>
          </div>
        </div>
        <div className="rounded border p-4 min-h-[80px] space-y-2" style={{ backgroundColor: "var(--tg-theme-secondary-bg-color, #0A0A0B)", borderColor: "var(--tg-theme-hint-color, #27272A)" }}>
          <div className="h-2.5 w-full rounded animate-pulse" style={bgStyle} />
          <div className="h-2.5 w-4/5 rounded animate-pulse" style={bgStyle} />
        </div>
        <div className="px-4 py-1.5 border-t text-center" style={borderStyle}>
          <span className="text-[9px] font-mono" style={{ color: "var(--tg-theme-hint-color)" }}>Not financial advice. Powered by Gemini.</span>
        </div>
      </div>
    </div>
  );
}

const cardStyle = {
  backgroundColor: "var(--tg-theme-secondary-bg-color, #0A0A0B)",
  borderColor: "var(--tg-theme-hint-color, #27272A)",
};

/**
 * Contrast constants. Detail text uses brighter fallbacks for demo readability.
 */
const textPrimary = "var(--tg-theme-text-color, #F4F4F5)";
const textSecondary = "var(--tg-theme-subtitle-text-color, #D1D5DB)";
const textMuted = "var(--tg-theme-hint-color, #A8B0BC)";

/** One-line visual conclusion for main surface — result-oriented, not process-oriented. */
function getShortVisualSummary(result: ScanResult): string | null {
  if (result.visualEvidenceStatus !== "captured") return null;
  const raw = result.visualEvidenceSummary ?? result.visualAnalysis ?? "";
  if (/VISUAL ASSET REUSE:\s*YES/i.test(raw) && !/meme culture|pepe|wojak|doge|thematic|standard for/i.test(raw)) {
    return "Suspicious trust-signal reuse detected.";
  }
  if (result.visualAssetReuse === "YES" && !/meme culture|pepe|wojak|doge|thematic|standard for/i.test(raw)) {
    return "Suspicious trust-signal reuse detected.";
  }
  if (/VISUAL ASSET REUSE:\s*NO/i.test(raw) || /no major visual deception|no suspicious|branding appears original/i.test(raw) || result.visualAssetReuse === "NO") {
    return "No major visual deception detected in this scan.";
  }
  if (/inconclusive|could not be determined/i.test(raw)) return "Visual analysis inconclusive.";
  // Derive from visualAssetReuse when raw text is generic
  if (result.visualAssetReuse === "UNKNOWN") return "Visual analysis inconclusive.";
  return "Visual analysis complete.";
}

/**
 * Safe, professional assessment line for the main result surface.
 * Detects and replaces any cached degen/shill copy with a verdict-derived fallback.
 * Root cause: old ThreatLedger-cached scan results may still hold pre-prompt copy.
 */
const SHILL_PATTERN = /\b(frens|wen\b|gm\b|ser\b|ngmi|wagmi|degen|shill|aping|ape in|moon|mooning|based|clean as a|culture king|real deal|sending it|let'?s go|LFG\b|anon\b|fren\b|bro\b|chad\b|based af|king\b|whistl|whistle|top-tier find|gem\b|alpha\b)\b/i;

function buildCleanAssessment(result: ScanResult): string {
  if (result.verdict === "Caution") return "Some risk indicators present. Review the findings before any exposure.";
  if (result.verdict === "Danger") return "Multiple risk factors identified. Treat as high risk and do not invest.";
  const raw = (result.degenComment ?? "").replace(/\s+/g, " ").trim();
  const isShill = !raw || SHILL_PATTERN.test(raw) || /[🚀🔥💎🙏😤🤙]/.test(raw);
  if (isShill) {
    if (result.elephantMemory?.isKnownScammer) return "Authority previously flagged. Do not interact.";
    if (result.verdict === "Danger") return "Multiple risk factors identified. Treat as high risk and do not invest.";
    if (result.verdict === "Caution") return "Some risk indicators present. Review the findings before any exposure.";
    if (result.websiteDiscovery && result.websiteDiscovery.status !== "official_site_found") {
      return "No official project website was discovered from current metadata. This limits visual verification and weakens trust; other risks remain outside this assessment.";
    }
    return "No critical red flags identified in this scan. Other risks remain outside this assessment.";
  }
  return raw.length <= 160 ? raw : raw.slice(0, 157) + "…";
}

/** Overclaiming phrases that imply proof of legitimacy. Replace with careful wording. */
function hasOverclaimingProfileSummary(text: string): boolean {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return (
    /\b(?:confirm(?:ing|s)?\s+(?:this\s+is\s+)?(?:the\s+)?legitimate)/i.test(t) ||
    /\blegitimate\s+(?:ecosystem\s+)?token\b/i.test(t) ||
    /\bproves?\s+safety\b/i.test(t) ||
    /\bconfirmed\s+legitimate\b/i.test(t) ||
    /\bappears?\s+to\s+be\s+(?:the\s+)?legitimate\b/i.test(t) ||
    /\blegitimate\s+project\s+token\b/i.test(t) ||
    /\bverified\s+as\s+legitimate\b/i.test(t)
  );
}

function sanitizeProfileSummary(text: string, verdict: string): string {
  if (!text?.trim()) return text ?? "";
  const t = text.replace(/\s+/g, " ").trim();
  if (hasOverclaimingProfileSummary(t)) {
    if (verdict === "Danger") return "Multiple risk factors identified. Treat as high risk.";
    if (verdict === "Caution") return "Some risk indicators present. Review findings before any exposure.";
    return "Website and on-chain data are consistent with the established project presence observed in this scan. Supports a lower-risk assessment; does not prove safety on its own.";
  }
  return t;
}

/** Verdict-first: when Caution/Danger, always show consistent profile label (no raw AI). */
function profileLabelForVerdict(verdict: string): string | null {
  if (verdict === "Caution") return "Some risk indicators";
  if (verdict === "Danger") return "High-risk profile";
  return null;
}

/** Verdict-first: when Caution/Danger, always show consistent summary (no raw AI). */
function summaryForVerdict(verdict: string): string | null {
  if (verdict === "Caution") return "Some risk indicators present. Review the findings before any exposure.";
  if (verdict === "Danger") return "Multiple risk factors identified. Treat as high risk.";
  return null;
}

/** Verdict-first: when Caution/Danger, "Why" bullets must not contradict verdict (no lower-risk / high transparency). */
function whyBulletsForVerdict(verdict: string): string[] | null {
  if (verdict === "Caution") {
    return [
      "Some trust claims could not be independently verified in this scan.",
      "Review unverified claims and findings before any exposure.",
    ];
  }
  if (verdict === "Danger") {
    return [
      "Multiple risk factors or unverified trust claims identified.",
      "Do not rely on this project for investment; treat as high risk.",
    ];
  }
  return null;
}

function hasMeaningfulDrift(drift: ScanResult["websiteDrift"]): boolean {
  return !!drift?.priorSnapshotExists && (drift.materialChangesDetected || (drift.keyChanges?.length ?? 0) > 0);
}

function hasMeaningfulReputation(rep: ScanResult["reputationSignals"]): boolean {
  return !!(
    rep?.sameDomainInPriorFlagged ||
    rep?.repeatedClaimMotif ||
    rep?.repeatedVisualPattern ||
    rep?.authorityPlusPattern
  );
}

function hasMeaningfulLineage(lineage: ScanResult["lineage"]): boolean {
  return !!lineage?.hasPriorHistory;
}

function SlowVision({
  result,
  copied,
  onCopy,
  onReset,
}: {
  result: ScanResult;
  copied: boolean;
  onCopy: () => void;
  onReset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const borderStyle = { borderColor: "var(--tg-theme-hint-color, #27272A)" };
  return (
    <div className="rounded-lg border overflow-hidden" style={{ ...cardStyle, border: "1px solid var(--tg-theme-hint-color, #27272A)" }}>
      <div className="flex items-center justify-between px-4 py-2 border-b" style={borderStyle}>
        <div className="flex items-center gap-2">
          <VerdictBadge verdict={result.verdict} isKnownScammer={result.elephantMemory?.isKnownScammer} />
        </div>
        <span className="text-[10px] font-mono" style={{ color: textSecondary }}>
          {(result.analysisTimeMs / 1000).toFixed(1)}s
        </span>
      </div>
      <div className="p-4 space-y-3">
        {(result.reputationSignals?.strongestReputationFinding || (result.websiteDrift?.materialChangesDetected && result.websiteDrift?.strongestFinding) || (result.lineage?.lineageIdentityConfidence !== "low" && result.lineage?.strongestLineageFinding) || strongestClaimSummary(result.claims ?? [])) && (
          <div className="rounded border p-2.5" style={{ ...cardStyle, borderColor: "var(--tg-theme-hint-color, #27272A)" }}>
            <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: textSecondary }}>Finding</span>
            <p className="mt-0.5 text-xs font-mono leading-relaxed" style={{ color: textPrimary }}>
              {result.reputationSignals?.strongestReputationFinding
                ?? (result.websiteDrift?.materialChangesDetected && result.websiteDrift?.strongestFinding
                  ? result.websiteDrift.strongestFinding
                  : result.lineage?.lineageIdentityConfidence !== "low" && result.lineage?.strongestLineageFinding
                    ? result.lineage.strongestLineageFinding
                    : strongestClaimSummary(result.claims ?? []))}
            </p>
          </div>
        )}
        {((result.evidence?.length > 0 || result.analysis?.length > 0) || whyBulletsForVerdict(result.verdict)) && (
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: textSecondary }}>Why</span>
            <ul className="mt-1 space-y-0.5">
              {(whyBulletsForVerdict(result.verdict) ?? (result.evidence?.length ? result.evidence : result.analysis)?.slice(0, 3) ?? []).map((line, i) => (
                <li key={i} className="text-xs font-mono" style={{ color: textPrimary }}>• {line}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-xs font-mono leading-relaxed" style={{ color: textPrimary }}>
          {buildCleanAssessment(result)}
        </p>
        {(result.visualEvidenceStatus === "not_captured" || !result.market || result.market.liquidity === 0) && (
          <p className="text-[10px] font-mono" style={{ color: textSecondary }}>
            Limitations: {[result.visualEvidenceStatus === "not_captured" && "Visual not captured", (!result.market || result.market.liquidity === 0) && "Limited market data"].filter(Boolean).join("; ")}
          </p>
        )}
        {getShortVisualSummary(result) && (
          <p className="text-xs font-mono" style={{ color: textSecondary }}>{getShortVisualSummary(result)}</p>
        )}
        {result.websiteDiscovery && (
          <p className="text-[10px] font-mono" style={{ color: textSecondary }}>
            Website: {result.websiteDiscovery.statusReason ?? result.websiteDiscovery.status}
            {result.websiteDiscovery.selectedWebsite && (
              <span className="block mt-0.5 truncate" title={result.websiteDiscovery.selectedWebsite}>
                {result.websiteDiscovery.selectedWebsite}
              </span>
            )}
          </p>
        )}
        {(result.claims?.length ?? 0) > 0 && (
          <div className="rounded border p-3" style={cardStyle}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-mono uppercase" style={{ color: textSecondary }}>Claims check</span>
            </div>
            <ul className="space-y-2">
              {(result.claims ?? []).map((c, i) => (
                <li key={i} className="text-xs font-mono">
                  <span style={{ color: textPrimary }}>{c.rawClaim.slice(0, 80)}{c.rawClaim.length > 80 ? "…" : ""}</span>
                  <span className="ml-1.5 px-1.5 py-0.5 rounded border text-[10px] uppercase" style={{
                    borderColor: c.verificationStatus === "verified" ? "var(--tg-theme-link-color, #22C55E)" : c.verificationStatus === "contradicted" ? "var(--tg-theme-destructive-text-color, #EF4444)" : textMuted,
                    color: c.verificationStatus === "verified" ? "var(--tg-theme-link-color, #22C55E)" : c.verificationStatus === "contradicted" ? "var(--tg-theme-destructive-text-color, #EF4444)" : textSecondary,
                  }}>{c.verificationStatus}</span>
                  <p className="mt-0.5" style={{ color: textSecondary }}>{c.evidence.slice(0, 120)}{c.evidence.length > 120 ? "…" : ""}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
        {hasMeaningfulLineage(result.lineage) && result.lineage != null && (
          <div className="rounded border p-3" style={cardStyle}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-mono uppercase" style={{ color: textSecondary }}>Authority history</span>
            </div>
            <p className="text-[10px] font-mono mb-1.5" style={{ color: textSecondary }}>
              Based on prior Veritas scans. Authority is mint/freeze control; it may not be the deployer.
              {result.lineage.identitySource && <> Identity: {result.lineage.identitySource.replace("_", " ")}.</>}
              {result.lineage.lineageIdentityConfidence === "low" && <> Confidence limited.</>}
            </p>
            <p className="text-xs font-mono" style={{ color: textPrimary }}>
              This authority appears in {result.lineage.priorLaunchCount} prior token(s).
              {result.lineage.priorSuspiciousOrHighRiskCount > 0 && <> {result.lineage.priorSuspiciousOrHighRiskCount} prior suspicious or high-risk.</>}
              {result.lineage.priorCannotVerifyCount > 0 && <> {result.lineage.priorCannotVerifyCount} prior with insufficient data.</>}
              {result.lineage.priorSuspiciousOrHighRiskCount === 0 && result.lineage.priorCannotVerifyCount === 0 && <> No prior suspicious history found.</>}
            </p>
            {result.lineage.priorLaunches.length > 0 && (
              <ul className="mt-2 space-y-1">
                {result.lineage.priorLaunches.slice(0, 5).map((p, i) => (
                  <li key={i} className="text-[10px] font-mono" style={{ color: textSecondary }}>
                    {p.tokenName} (${p.tokenSymbol}) — previously assessed as {p.displayLabel} — {p.scannedAt.slice(0, 10)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {hasMeaningfulDrift(result.websiteDrift) && result.websiteDrift && (
          <div className="rounded border p-3" style={cardStyle}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-mono uppercase" style={{ color: textSecondary }}>Website drift</span>
            </div>
            <p className="text-xs font-mono" style={{ color: textPrimary }}>
              Compared with prior snapshot from {result.websiteDrift.priorScannedAt?.slice(0, 10) ?? "unknown date"}{" "}
              {result.websiteDrift.comparisonBasis === "token"
                ? "(same token)."
                : result.websiteDrift.comparisonBasis === "domain"
                  ? "(same domain; may be reused)."
                  : ""}
              {result.websiteDrift.materialChangesDetected
                ? " Material trust-signal changes detected."
                : " No material changes detected."}
            </p>
            {result.websiteDrift.keyChanges.length > 0 && (
              <ul className="mt-2 space-y-1">
                {result.websiteDrift.keyChanges.slice(0, 3).map((c, i) => (
                  <li key={i} className="text-[10px] font-mono" style={{ color: textSecondary }}>{c}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {hasMeaningfulReputation(result.reputationSignals) && result.reputationSignals && (
          <div className="rounded border p-3" style={cardStyle}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-mono uppercase" style={{ color: textSecondary }}>Reputation signals</span>
            </div>
            <div className="space-y-2">
              {result.reputationSignals.authorityPlusPattern && (
                <p className="text-xs font-mono" style={{ color: textPrimary }}>{result.reputationSignals.authorityPlusPattern.patternDescription}</p>
              )}
              {result.reputationSignals.sameDomainInPriorFlagged && (
                <p className="text-xs font-mono" style={{ color: textPrimary }}>
                  Same domain ({result.reputationSignals.sameDomainInPriorFlagged.domain}) in prior suspicious scans: {result.reputationSignals.sameDomainInPriorFlagged.priorScanCount} prior scan(s), {result.reputationSignals.sameDomainInPriorFlagged.priorFlaggedCount} flagged.
                </p>
              )}
              {result.reputationSignals.repeatedClaimMotif && (
                <p className="text-xs font-mono" style={{ color: result.reputationSignals.repeatedClaimMotif.strength === "weak" ? textSecondary : textPrimary }}>
                  Repeated trust-claim motif ({result.reputationSignals.repeatedClaimMotif.claimTypes.join(", ")}) in prior flagged scans.
                  {result.reputationSignals.repeatedClaimMotif.strength === "weak" && <span className="block mt-0.5" style={{ color: textMuted }}>Weaker signal.</span>}
                </p>
              )}
              {result.reputationSignals.repeatedVisualPattern && (
                <p className="text-xs font-mono" style={{ color: textSecondary }}>Similar visual pattern in prior flagged scans. Weaker signal.</p>
              )}
            </div>
          </div>
        )}
        {result.lies && result.lies.length > 0 && !/^(none|no\s|no explicit)/i.test(result.lies[0]?.trim() ?? "") && (
          <div className="rounded border p-3" style={cardStyle}>
            <span className="text-[10px] font-mono uppercase" style={{ color: textSecondary }}>Contradictions</span>
            <ul className="mt-1.5 space-y-1">
              {result.lies.slice(0, 3).map((lie, i) => (
                <li key={i} className="text-xs font-mono flex items-start gap-2" style={{ color: "var(--tg-theme-destructive-text-color, #FCA5A5)" }}><span>×</span><span>{lie}</span></li>
              ))}
            </ul>
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="w-full py-1.5 text-[10px] font-mono uppercase tracking-widest border-t"
          style={{ color: textPrimary, ...borderStyle }}
        >
          {showDetails ? "Hide details" : "Details"}
        </button>
        {showDetails && (
          <div className="space-y-3 pt-1 border-t" style={borderStyle}>
            <div className="grid grid-cols-2 gap-2 pt-3">
              <MetricCard icon={<Shield className="w-3.5 h-3.5" />} label="Trust score" value={`${result.trustScore}/100`} status={getTrustStatus(result.trustScore)} />
              <MetricCard icon={<TrendingUp className="w-3.5 h-3.5" />} label="Market Cap" value={`$${formatNumber(result.market?.marketCap ?? 0)}`} />
              <MetricCard icon={<Percent className="w-3.5 h-3.5" />} label="Top 10%" value={`${result.onChain.top10Percentage.toFixed(1)}%`} status={result.onChain.top10Percentage > 60 ? "danger" : "safe"} />
              <MetricCard icon={<Bot className="w-3.5 h-3.5" />} label="Bots" value={result.market?.botActivity ?? "N/A"} />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: textSecondary }}>Profile</span>
              <p className="mt-0.5 text-xs font-mono" style={{ color: textPrimary }}>
                {profileLabelForVerdict(result.verdict) ?? (hasOverclaimingProfileSummary(result.criminalProfile)
                  ? (result.verdict === "Safe" ? "Lower-risk profile" : result.verdict === "Caution" ? "Some risk indicators" : "High-risk profile")
                  : result.criminalProfile)}
              </p>
              <p className="mt-1 text-xs font-mono leading-relaxed" style={{ color: textPrimary }}>
                {summaryForVerdict(result.verdict) ?? sanitizeProfileSummary(result.summary, result.verdict)}
              </p>
            </div>
            {result.thoughtSummary && (
              <details className="group">
                <summary className="cursor-pointer list-none text-[10px] font-mono uppercase tracking-wider" style={{ color: textSecondary }}>Reasoning trace</summary>
                <p className="mt-2 text-xs font-mono whitespace-pre-wrap leading-relaxed" style={{ color: textPrimary }}>{result.thoughtSummary}</p>
              </details>
            )}
            {(result.visualAnalysis ?? result.visualEvidenceSummary) && (
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: textSecondary }}>AI Vision (full)</span>
                <p className="mt-1 text-xs font-mono whitespace-pre-wrap leading-relaxed" style={{ color: textPrimary }}>{result.visualAnalysis ?? result.visualEvidenceSummary ?? ""}</p>
              </div>
            )}
            {result.websiteDrift && !hasMeaningfulDrift(result.websiteDrift) && (
              <p className="text-[10px] font-mono" style={{ color: textSecondary }}>Website drift: {result.websiteDrift.priorSnapshotExists ? "No material changes." : "No prior snapshot for comparison."}</p>
            )}
            {result.reputationSignals != null && !hasMeaningfulReputation(result.reputationSignals) && (
              <p className="text-[10px] font-mono" style={{ color: textSecondary }}>Reputation: No repeated trust pattern in prior scans.</p>
            )}
            {result.lineage != null && !hasMeaningfulLineage(result.lineage) && (
              <p className="text-[10px] font-mono" style={{ color: textSecondary }}>Authority history: No prior launches in our records.</p>
            )}
            {result.rugCheck && result.rugCheck.risks.length > 0 && (
              <div className="rounded border p-3" style={cardStyle}>
                <span className="text-[10px] font-mono uppercase" style={{ color: textSecondary }}>Audit risks</span>
                <ul className="mt-1.5 space-y-1">
                  {result.rugCheck.risks.slice(0, 4).map((r, i) => (
                    <li key={i} className="text-xs font-mono flex items-start gap-2" style={{ color: textSecondary }}><span>•</span>{r.name}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono uppercase" style={{ color: textSecondary }}>Sources</span>
              {(result.websiteDiscovery?.selectedWebsite ?? result.socials?.website) && (
                <a href={result.websiteDiscovery?.selectedWebsite ?? result.socials?.website ?? "#"} target="_blank" rel="noopener noreferrer" className="text-[10px] font-mono" style={{ color: "var(--tg-theme-link-color)" }}>Website</a>
              )}
              {result.socials?.twitter && <a href={result.socials.twitter} target="_blank" rel="noopener noreferrer" className="text-[10px] font-mono" style={{ color: "var(--tg-theme-link-color)" }}>Twitter</a>}
              <span className="text-[10px] font-mono" style={{ color: textSecondary }}>On-chain</span>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReset}
            className="flex-1 py-2 rounded border text-xs font-mono uppercase flex items-center justify-center gap-1.5"
            style={{ color: "var(--tg-theme-hint-color)", ...borderStyle }}
          >
            <ArrowLeft className="w-3 h-3" /> New scan
          </button>
          <button
            type="button"
            onClick={onCopy}
            className="flex-1 py-2 rounded text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2"
            style={{
              backgroundColor: "var(--tg-theme-button-color, #2481cc)",
              color: "var(--tg-theme-button-text-color, #fff)",
              border: "1px solid transparent",
            }}
          >
            {copied ? "Copied" : "Share Verdict"}
          </button>
        </div>
      </div>
      <div className="px-4 py-1.5 border-t text-center" style={borderStyle}>
        <span className="text-[9px] font-mono" style={{ color: textSecondary }}>Not financial advice. Veritas uses on-chain data and AI analysis.</span>
      </div>
    </div>
  );
}


// =============================================================================
// SUBCOMPONENTS
// =============================================================================

function getDisplayVerdict(verdict: string, isKnownScammer?: boolean): string {
  if (isKnownScammer) return "Known scammer";
  const v = verdict.toLowerCase();
  if (v === "safe") return "Likely legitimate";
  if (v === "caution") return "Suspicious";
  if (v === "danger") return "High risk";
  return verdict;
}

function VerdictBadge({ verdict, isKnownScammer }: { verdict: string; isKnownScammer?: boolean }) {
  const config: Record<
    string,
    { bg: string; border: string; color: string; icon: React.ReactNode }
  > = {
    SAFE: {
      bg: "#052E16",
      border: "#166534",
      color: "var(--tg-theme-link-color, #22C55E)",
      icon: <Shield className="w-4 h-4" />,
    },
    CAUTION: {
      bg: "#422006",
      border: "#854D0E",
      color: "#EAB308",
      icon: <ShieldAlert className="w-4 h-4" />,
    },
    DANGER: {
      bg: "#450A0A",
      border: "#7F1D1D",
      color: "var(--tg-theme-destructive-text-color, #EF4444)",
      icon: <ShieldX className="w-4 h-4" />,
    },
    SCAM: {
      bg: "#450A0A",
      border: "#991B1B",
      color: "var(--tg-theme-destructive-text-color, #FCA5A5)",
      icon: <Skull className="w-4 h-4" />,
    },
  };
  const styleKey = isKnownScammer ? "SCAM" : verdict.toUpperCase();
  const c = config[styleKey] || config.CAUTION;
  const label = getDisplayVerdict(verdict, isKnownScammer);

  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-sm border"
      style={{ backgroundColor: c.bg, borderColor: c.border }}
    >
      <span style={{ color: c.color }}>{c.icon}</span>
      <span className="text-sm font-medium tracking-wide" style={{ color: c.color }}>
        {label}
      </span>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  status,
  large = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  status?: "safe" | "warning" | "danger";
  large?: boolean;
}) {
  const statusColors = {
    safe: "var(--tg-theme-link-color, #22C55E)",
    warning: "#EAB308",
    danger: "var(--tg-theme-destructive-text-color, #EF4444)",
  };

  return (
    <div
      className={`rounded-sm ${large ? "p-4" : "p-3"} border`}
      style={{
        backgroundColor: "var(--tg-theme-secondary-bg-color, #0A0A0B)",
        borderColor: "var(--tg-theme-hint-color, #27272A)",
      }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span style={{ color: "var(--tg-theme-hint-color, #52525B)" }}>{icon}</span>
        <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--tg-theme-hint-color, #52525B)" }}>
          {label}
        </span>
      </div>
      <p
        className={`font-mono ${large ? "text-lg" : "text-sm"}`}
        style={{ color: status ? statusColors[status] : "var(--tg-theme-text-color, #FAFAFA)" }}
      >
        {value}
      </p>
    </div>
  );
}

function SecurityCard({
  icon,
  label,
  enabled,
}: {
  icon: React.ReactNode;
  label: string;
  enabled: boolean;
}) {
  return (
    <div
      className="p-3 rounded-sm border"
      style={{
        backgroundColor: enabled ? "#450A0A" : "#052E16",
        borderColor: enabled ? "var(--tg-theme-destructive-text-color, #7F1D1D)" : "#166534",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            style={{
              color: enabled ? "var(--tg-theme-destructive-text-color, #EF4444)" : "var(--tg-theme-link-color, #22C55E)",
            }}
          >
            {icon}
          </span>
          <span className="text-xs" style={{ color: "var(--tg-theme-hint-color, #A1A1AA)" }}>
            {label}
          </span>
        </div>
        <span
          className="text-xs font-mono"
          style={{
            color: enabled ? "var(--tg-theme-destructive-text-color, #EF4444)" : "var(--tg-theme-link-color, #22C55E)",
          }}
        >
          {enabled ? "ENABLED" : "DISABLED"}
        </span>
      </div>
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toFixed(0);
}

function getTrustStatus(score: number): "safe" | "warning" | "danger" {
  if (score >= 70) return "safe";
  if (score >= 40) return "warning";
  return "danger";
}
