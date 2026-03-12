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
  Terminal,
  Brain,
} from "lucide-react";
import { TonConnectButton } from "@tonconnect/ui-react";

function getMainButton() {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Telegram?: { WebApp?: { MainButton?: { setText: (t: string) => void; onClick: (cb: () => void) => void; offClick: (cb: () => void) => void; show: () => void; hide: () => void } } } }).Telegram?.WebApp?.MainButton ?? null;
}
import type { ScammerRecord } from "@/lib/db/elephant";

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
  elephantMemory: {
    isKnownScammer: boolean;
    previousFlags?: ScammerRecord;
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
        body: JSON.stringify({ address: addr }),
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
          <p className="text-xs" style={{ color: "var(--tg-theme-hint-color, #52525B)" }}>
            Token contract/mint address, not your wallet
          </p>

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
          <div className="rounded p-3 border space-y-1" style={cardStyle}>
            <span className="text-[10px] font-mono uppercase" style={{ color: "var(--tg-theme-hint-color)" }}>Anomalies</span>
            <ul className="space-y-0.5">
              {m.anomalies.slice(0, 3).map((a, i) => (
                <li key={i} className="text-xs font-mono" style={{ color: "var(--tg-theme-destructive-text-color, #FCD34D)" }}>• {a}</li>
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
        <span className="text-[10px] font-mono" style={{ color: "var(--tg-theme-hint-color)" }}>
          {(result.analysisTimeMs / 1000).toFixed(1)}s
        </span>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono" style={{ color: "var(--tg-theme-hint-color)" }}>Trust score</span>
          <span className="font-mono font-medium" style={{ color: "var(--tg-theme-text-color)" }}>{result.trustScore}/100</span>
        </div>
        {(result.evidence?.length > 0 || result.analysis?.length > 0) && (
          <div>
            <span className="text-[10px] font-mono uppercase" style={{ color: "var(--tg-theme-hint-color)" }}>Top reasons</span>
            <ul className="mt-1 space-y-0.5">
              {(result.evidence?.length ? result.evidence : result.analysis)?.slice(0, 3).map((line, i) => (
                <li key={i} className="text-xs font-mono" style={{ color: "var(--tg-theme-text-color)" }}>• {line}</li>
              ))}
            </ul>
          </div>
        )}
        {(result.visualEvidenceStatus === "not_captured" || !result.market || result.market.liquidity === 0) && (
          <p className="text-[10px] font-mono" style={{ color: "var(--tg-theme-hint-color)" }}>
            Limitations: {[result.visualEvidenceStatus === "not_captured" && "Visual not captured", (!result.market || result.market.liquidity === 0) && "Limited market data"].filter(Boolean).join("; ")}
          </p>
        )}
        <h2 className="text-sm font-medium" style={{ color: "var(--tg-theme-text-color)" }}>{result.criminalProfile}</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--tg-theme-hint-color, #A1A1AA)" }}>{result.summary}</p>
        {result.thoughtSummary && (
          <details className="pt-4 border-t group" style={borderStyle}>
            <summary className="flex items-center gap-2 cursor-pointer list-none text-xs font-mono uppercase" style={{ color: "var(--tg-theme-hint-color)" }}>
              <Brain className="w-3.5 h-3.5" /> Reasoning Trace <span className="group-open:hidden">▶</span><span className="hidden group-open:inline">▼</span>
            </summary>
            <p className="mt-3 text-sm font-mono whitespace-pre-wrap" style={{ color: "var(--tg-theme-hint-color, #A1A1AA)" }}>{result.thoughtSummary}</p>
          </details>
        )}
        <div className="rounded border p-3" style={cardStyle}>
          <div className="flex items-center gap-2 mb-2">
            <Terminal className="w-4 h-4" style={{ color: "var(--tg-theme-link-color, #22C55E)" }} />
            <span className="text-xs font-mono uppercase" style={{ color: "var(--tg-theme-link-color, #22C55E)" }}>Assessment</span>
          </div>
          <p className="font-mono text-sm leading-relaxed" style={{ color: "var(--tg-theme-text-color)" }}>{result.degenComment}</p>
        </div>
        {(result.visualEvidenceStatus || result.visualAnalysis) && (
          <div className="rounded border p-3" style={cardStyle}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-mono uppercase" style={{ color: "var(--tg-theme-hint-color)" }}>AI Vision</span>
            </div>
            <p className="text-xs font-mono whitespace-pre-wrap" style={{ color: "var(--tg-theme-hint-color, #A1A1AA)" }}>
              {result.visualAnalysis ?? "No visual analysis."}
            </p>
          </div>
        )}
        {result.lies && result.lies.length > 0 && !/^(none|no\s|no explicit)/i.test(result.lies[0]?.trim() ?? "") && (
          <div className="rounded border p-3" style={cardStyle}>
            <span className="text-[10px] font-mono uppercase" style={{ color: "var(--tg-theme-hint-color)" }}>Lies Detected</span>
            <ul className="mt-1.5 space-y-1">
              {result.lies.slice(0, 3).map((lie, i) => (
                <li key={i} className="text-xs font-mono flex items-start gap-2" style={{ color: "var(--tg-theme-destructive-text-color, #FCA5A5)" }}>
                  <span>×</span><span>{lie}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="w-full py-1.5 text-[10px] font-mono uppercase tracking-widest border-t"
          style={{ color: "var(--tg-theme-hint-color)", ...borderStyle }}
        >
          {showDetails ? "Hide Details ▲" : "Details ▼"}
        </button>
        {showDetails && (
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <MetricCard icon={<Shield className="w-3.5 h-3.5" />} label="Trust" value={`${result.trustScore}/100`} status={getTrustStatus(result.trustScore)} />
              <MetricCard icon={<TrendingUp className="w-3.5 h-3.5" />} label="Market Cap" value={`$${formatNumber(result.market?.marketCap ?? 0)}`} />
              <MetricCard icon={<Percent className="w-3.5 h-3.5" />} label="Top 10%" value={`${result.onChain.top10Percentage.toFixed(1)}%`} status={result.onChain.top10Percentage > 60 ? "danger" : "safe"} />
              <MetricCard icon={<Bot className="w-3.5 h-3.5" />} label="Bots" value={result.market?.botActivity ?? "N/A"} />
            </div>
            {result.rugCheck && result.rugCheck.risks.length > 0 && (
              <div className="rounded border p-3" style={cardStyle}>
                <span className="text-[10px] font-mono uppercase" style={{ color: "var(--tg-theme-hint-color)" }}>Audit Risks</span>
                <ul className="mt-1.5 space-y-1">
                  {result.rugCheck.risks.slice(0, 4).map((r, i) => (
                    <li key={i} className="text-xs font-mono flex items-start gap-2" style={{ color: "var(--tg-theme-hint-color, #A1A1AA)" }}><span>•</span>{r.name}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono uppercase" style={{ color: "var(--tg-theme-hint-color)" }}>Sources:</span>
              {result.socials?.website && <a href={result.socials.website} target="_blank" rel="noopener noreferrer" className="text-[10px] font-mono" style={{ color: "var(--tg-theme-link-color)" }}>Website ↗</a>}
              {result.socials?.twitter && <a href={result.socials.twitter} target="_blank" rel="noopener noreferrer" className="text-[10px] font-mono" style={{ color: "var(--tg-theme-link-color)" }}>Twitter ↗</a>}
              <span className="text-[10px] font-mono" style={{ color: "var(--tg-theme-link-color)" }}>On-chain ✓</span>
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
        <span className="text-[9px] font-mono" style={{ color: "var(--tg-theme-hint-color)" }}>Not financial advice. Powered by Gemini.</span>
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
