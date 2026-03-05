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
import { CryptoLoader } from "@/components/ui/CryptoLoader";

function getMainButton() {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Telegram?: { WebApp?: { MainButton?: { setText: (t: string) => void; onClick: (cb: () => void) => void; offClick: (cb: () => void) => void; show: () => void; hide: () => void } } } }).Telegram?.WebApp?.MainButton ?? null;
}
import type { ScammerRecord } from "@/lib/db/elephant";

const TON_ADDRESS_REGEX = /^[a-zA-Z0-9_\-+/]{48}$/;

// =============================================================================
// TYPES
// =============================================================================

interface ScanResult {
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  trustScore: number;
  verdict: "Safe" | "Caution" | "Danger";
  summary: string;
  criminalProfile: string;
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

export function TruthConsole() {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handleScanRef = useRef<() => void>(() => {});
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

  const handleScan = async () => {
    if (!address.trim()) return;
    if (!TON_ADDRESS_REGEX.test(address.trim())) {
      setError("Invalid TON Address Format. A valid TON address is exactly 48 characters (base64).");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const initData =
        (typeof window !== "undefined" &&
          (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData) ||
        "";
      const response = await fetch("/api/analyze-unified", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": initData,
        },
        body: JSON.stringify({ address: address.trim() }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Analysis failed");
      }

      setResult(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
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

  useEffect(() => {
    const MainButton = getMainButton();
    if (!MainButton) return;
    if (isValidAddress && !loading) {
      MainButton.show();
    } else {
      MainButton.hide();
    }
  }, [isValidAddress, loading]);

  const handleReset = () => {
    setAddress("");
    setResult(null);
    setError(null);
  };

  return (
    <>
      <div className="fixed top-4 right-4 z-10">
        <TonConnectButton />
      </div>
      <div className="w-full max-w-lg mx-auto px-3 flex flex-col gap-4">
      <div className="space-y-3">
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
        <div className="relative">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleScan()}
            placeholder="Paste TON token/contract address (48 chars)"
            disabled={loading}
            className="w-full px-4 py-3 rounded-sm font-mono text-sm focus:outline-none transition-colors disabled:opacity-50"
            style={{
              backgroundColor: "var(--tg-theme-secondary-bg-color, #0A0A0B)",
              border: "1px solid var(--tg-theme-hint-color, #27272A)",
              color: "var(--tg-theme-text-color, #FAFAFA)",
            }}
          />
          <p
            className="mt-1.5 text-xs"
            style={{ color: "var(--tg-theme-hint-color, #52525B)" }}
          >
            Token contract/mint address, not your wallet
          </p>
        </div>

        {error && (
          <div
            className="p-3 rounded-sm border"
            style={{
              backgroundColor: "var(--tg-theme-secondary-bg-color, #18181B)",
              borderColor: "var(--tg-theme-destructive-text-color, #7F1D1D)",
            }}
          >
            <p
              className="text-xs font-mono"
              style={{ color: "var(--tg-theme-destructive-text-color, #FCA5A5)" }}
            >
              {error}
            </p>
          </div>
        )}
      </div>

      {loading && (
        <CryptoLoader message="Veritas is analyzing the contract..." />
      )}

      {result && !loading && (
        <div className="flex flex-col gap-4">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs transition-colors"
            style={{ color: "var(--tg-theme-hint-color, #71717A)" }}
          >
            <ArrowLeft className="w-3 h-3" />
            New scan
          </button>

          <div
            className="rounded-sm p-5 border"
            style={{
              backgroundColor: "var(--tg-theme-secondary-bg-color, #0A0A0B)",
              borderColor: "var(--tg-theme-hint-color, #27272A)",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <VerdictBadge verdict={result.verdict.toUpperCase()} />
              {result.elephantMemory?.isKnownScammer && (
                <span
                  className="text-xs font-mono uppercase"
                  style={{ color: "var(--tg-theme-destructive-text-color, #FCA5A5)" }}
                >
                  Known Criminal
                </span>
              )}
            </div>
            <h2
              className="text-lg font-medium mb-2"
              style={{ color: "var(--tg-theme-text-color, #FAFAFA)" }}
            >
              {result.criminalProfile}
            </h2>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--tg-theme-hint-color, #A1A1AA)" }}
            >
              {result.summary}
            </p>
            {result.thoughtSummary && (
              <details
                className="mt-4 pt-4 border-t group"
                style={{ borderColor: "var(--tg-theme-hint-color, #27272A)" }}
              >
                <summary
                  className="flex items-center gap-2 cursor-pointer list-none text-xs font-mono uppercase tracking-wide"
                  style={{ color: "var(--tg-theme-hint-color, #71717A)" }}
                >
                  <Brain className="w-3.5 h-3.5" />
                  <span>Reasoning Trace</span>
                  <span className="group-open:hidden">▶</span>
                  <span className="hidden group-open:inline">▼</span>
                </summary>
                <p
                  className="mt-3 text-sm font-mono leading-relaxed whitespace-pre-wrap"
                  style={{ color: "var(--tg-theme-hint-color, #A1A1AA)" }}
                >
                  {result.thoughtSummary}
                </p>
              </details>
            )}
            <div
              className="flex items-center gap-2 mt-4 pt-4 border-t"
              style={{ borderColor: "var(--tg-theme-hint-color, #27272A)" }}
            >
              <span className="text-xs" style={{ color: "var(--tg-theme-hint-color, #52525B)" }}>
                📸 Sources:
              </span>
              <div className="flex gap-2">
                {result.socials?.website && (
                  <a
                    href={result.socials.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono hover:underline"
                    style={{ color: "var(--tg-theme-link-color, #10B981)" }}
                  >
                    Website ✓
                  </a>
                )}
                {result.socials?.twitter && (
                  <a
                    href={result.socials.twitter}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono hover:underline"
                    style={{ color: "var(--tg-theme-link-color, #10B981)" }}
                  >
                    Twitter ✓
                  </a>
                )}
                <span className="text-xs font-mono" style={{ color: "var(--tg-theme-link-color, #10B981)" }}>
                  On-chain ✓
                </span>
              </div>
            </div>
          </div>

          {result.lies && result.lies.length > 0 && (() => {
            const text = result.lies.join(" ").toLowerCase();
            const isNoneIdentified =
              /^(none|no\s|no explicit|no deception|no lies)/i.test(result.lies[0]?.trim() ?? "") ||
              /none identified|no explicit lies|no deception detected/.test(text);
            const isGood = isNoneIdentified;
            return (
              <div
                className="rounded-sm p-4 border"
                style={{
                  backgroundColor: "var(--tg-theme-secondary-bg-color, #0A0A0B)",
                  borderColor: isGood ? "var(--tg-theme-hint-color, #27272A)" : "var(--tg-theme-destructive-text-color, #7F1D1D)",
                }}
              >
                <h3
                  className={`text-xs font-medium uppercase tracking-wide mb-3 ${
                    isGood ? "" : ""
                  }`}
                  style={{
                    color: isGood ? "var(--tg-theme-link-color, #22C55E)" : "var(--tg-theme-destructive-text-color, #FCA5A5)",
                  }}
                >
                  {isGood ? "No Deception Detected" : "Deception Detected"}
                </h3>
                <ul className="space-y-2">
                  {result.lies.map((lie, i) => (
                    <li
                      key={i}
                      className="text-sm flex items-start gap-2"
                      style={{
                        color: isGood ? "var(--tg-theme-hint-color, #A1A1AA)" : "var(--tg-theme-destructive-text-color, #FCA5A5)",
                      }}
                    >
                      <span style={{ color: isGood ? "var(--tg-theme-link-color, #22C55E)" : "var(--tg-theme-destructive-text-color, #EF4444)" }}>•</span>
                      {lie}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}

          {result.creatorHistory?.isSerialLauncher && (
            <div
              className="rounded-sm p-4 border"
              style={{
                backgroundColor: "var(--tg-theme-secondary-bg-color, #0A0A0B)",
                borderColor: "var(--tg-theme-destructive-text-color, #78350F)",
              }}
            >
              <h3
                className="text-xs font-medium uppercase tracking-wide mb-3"
                style={{ color: "var(--tg-theme-destructive-text-color, #FCD34D)" }}
              >
                ⚠️ Serial Launcher ({result.creatorHistory.previousTokens} previous tokens)
              </h3>
              <p className="text-sm" style={{ color: "var(--tg-theme-destructive-text-color, #FCD34D)" }}>
                This creator has launched {result.creatorHistory.previousTokens} other tokens.
              </p>
            </div>
          )}

          {result.market?.anomalies && result.market.anomalies.length > 0 && (
            <div
              className="rounded-sm p-4 border"
              style={{
                backgroundColor: "var(--tg-theme-secondary-bg-color, #0A0A0B)",
                borderColor: "var(--tg-theme-destructive-text-color, #78350F)",
              }}
            >
              <h3
                className="text-xs font-medium uppercase tracking-wide mb-3"
                style={{ color: "var(--tg-theme-destructive-text-color, #FCD34D)" }}
              >
                Market Anomalies
              </h3>
              <ul className="space-y-2">
                {result.market.anomalies.map((anomaly, i) => (
                  <li key={i} className="text-sm" style={{ color: "var(--tg-theme-destructive-text-color, #FCD34D)" }}>
                    {anomaly}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <MetricCard
              icon={<Shield className="w-4 h-4" />}
              label="Trust Score"
              value={`${result.trustScore}/100`}
              status={getTrustStatus(result.trustScore)}
              large
            />
            <MetricCard
              icon={<TrendingUp className="w-4 h-4" />}
              label="Market Cap"
              value={`$${formatNumber(result.market?.marketCap || 0)}`}
              large
            />
          </div>

          {result.rugCheck && (
            <div
              className="rounded-sm p-4 border"
              style={{
                backgroundColor: "var(--tg-theme-secondary-bg-color, #0A0A0B)",
                borderColor: "var(--tg-theme-hint-color, #27272A)",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4" style={{ color: "var(--tg-theme-hint-color, #71717A)" }} />
                  <span className="text-xs font-mono uppercase" style={{ color: "var(--tg-theme-hint-color, #71717A)" }}>
                    Contract Audit
                  </span>
                </div>
                <span
                  className="text-sm font-mono"
                  style={{
                    color:
                      result.rugCheck.score <= 20
                        ? "var(--tg-theme-link-color, #22C55E)"
                        : result.rugCheck.score <= 50
                          ? "#EAB308"
                          : "var(--tg-theme-destructive-text-color, #EF4444)",
                  }}
                >
                  Risk: {result.rugCheck.score}/100
                </span>
              </div>
              {result.rugCheck.risks.length > 0 && (
                <ul className="space-y-1 mt-2">
                  {result.rugCheck.risks.slice(0, 3).map((risk, i) => (
                    <li key={i} className="text-xs flex items-start gap-2" style={{ color: "var(--tg-theme-hint-color, #A1A1AA)" }}>
                      <span
                        style={{
                          color:
                            risk.level === "danger"
                              ? "var(--tg-theme-destructive-text-color, #EF4444)"
                              : risk.level === "warn"
                                ? "#EAB308"
                                : "var(--tg-theme-hint-color, #71717A)",
                        }}
                      >
                        •
                      </span>
                      <span>{risk.name}</span>
                    </li>
                  ))}
                  {result.rugCheck.risks.length > 3 && (
                    <li className="text-xs ml-3" style={{ color: "var(--tg-theme-hint-color, #52525B)" }}>
                      +{result.rugCheck.risks.length - 3} more risks
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <MetricCard
              icon={<Droplets className="w-3.5 h-3.5" />}
              label="Liquidity"
              value={`$${formatNumber(result.market?.liquidity || 0)}`}
            />
            <MetricCard
              icon={<Activity className="w-3.5 h-3.5" />}
              label="24h Vol"
              value={`$${formatNumber(result.market?.volume24h || 0)}`}
            />
            <MetricCard
              icon={<Percent className="w-3.5 h-3.5" />}
              label="Top 10%"
              value={`${result.onChain.top10Percentage.toFixed(1)}%`}
              status={result.onChain.top10Percentage > 60 ? "danger" : "safe"}
            />
            <MetricCard
              icon={<Bot className="w-3.5 h-3.5" />}
              label="Bot Activity"
              value={result.market?.botActivity || "N/A"}
              status={result.market?.botActivity === "Low" ? "safe" : "warning"}
            />
          </div>

          <div className="flex flex-col gap-2">
            <SecurityCard
              icon={result.onChain.mintAuth ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              label="Mint Authority"
              enabled={!!result.onChain.mintAuth}
            />
            <SecurityCard
              icon={result.onChain.freezeAuth ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              label="Freeze Authority"
              enabled={!!result.onChain.freezeAuth}
            />
          </div>

          {(result.visualEvidenceStatus || result.visualAnalysis) && (
            <div
              className="rounded-sm p-4 border"
              style={{
                backgroundColor: "var(--tg-theme-secondary-bg-color, #0A0A0B)",
                borderColor:
                  result.visualEvidenceStatus === "captured"
                    ? "var(--tg-theme-hint-color, #27272A)"
                    : "var(--tg-theme-hint-color, #3F3F46)",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg" style={{ color: "var(--tg-theme-hint-color, #71717A)" }}>👁</span>
                  <span className="text-xs font-mono uppercase tracking-wide" style={{ color: "var(--tg-theme-hint-color, #71717A)" }}>
                    Visual Forensics
                  </span>
                </div>
                <span
                  className="text-[10px] font-mono uppercase tracking-wide px-2 py-0.5 rounded-sm border"
                  style={
                    result.visualEvidenceStatus === "captured"
                      ? { color: "var(--tg-theme-link-color, #22C55E)", borderColor: "#166534", backgroundColor: "#052E16" }
                      : { color: "var(--tg-theme-hint-color, #71717A)", borderColor: "#3F3F46", backgroundColor: "#18181B" }
                  }
                >
                  {result.visualEvidenceStatus === "captured" ? "Screenshot ✓" : "Screenshot ✗"}
                </span>
              </div>
              {result.visualAssetReuse && result.visualAssetReuse !== "UNKNOWN" && (
                <div
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-sm border mb-3"
                  style={
                    result.visualAssetReuse === "YES"
                      ? { backgroundColor: "#450A0A", borderColor: "#7F1D1D", color: "var(--tg-theme-destructive-text-color, #EF4444)" }
                      : { backgroundColor: "#052E16", borderColor: "#166534", color: "var(--tg-theme-link-color, #22C55E)" }
                  }
                >
                  <span className="text-sm">{result.visualAssetReuse === "YES" ? "🚨" : "✅"}</span>
                  <span className="text-xs font-mono uppercase tracking-wide">Visual Asset Reuse: {result.visualAssetReuse}</span>
                </div>
              )}
              {result.visualAssetReuse === "UNKNOWN" && (
                <div
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-sm border mb-3"
                  style={{ backgroundColor: "#18181B", borderColor: "#3F3F46", color: "var(--tg-theme-hint-color, #71717A)" }}
                >
                  <span className="text-xs font-mono uppercase tracking-wide">Visual Asset Reuse: UNKNOWN</span>
                </div>
              )}
              {result.visualAnalysis && (
                <p
                  className="text-sm font-mono leading-relaxed whitespace-pre-wrap"
                  style={{ color: "var(--tg-theme-hint-color, #A1A1AA)" }}
                >
                  {result.visualAnalysis}
                </p>
              )}
              {!result.visualAnalysis && result.visualEvidenceStatus !== "captured" && (
                <p className="text-xs font-mono" style={{ color: "var(--tg-theme-hint-color, #52525B)" }}>
                  Screenshot capture failed — visual forensics unavailable.
                </p>
              )}
            </div>
          )}

          {result.degenComment && (
            <div
              className="rounded-sm p-4 border"
              style={{
                backgroundColor: "var(--tg-theme-secondary-bg-color, #0A0A0B)",
                borderColor: "var(--tg-theme-hint-color, #27272A)",
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Terminal className="w-4 h-4" style={{ color: "var(--tg-theme-link-color, #22C55E)" }} />
                <span className="text-xs font-mono uppercase tracking-wide" style={{ color: "var(--tg-theme-link-color, #22C55E)" }}>
                  Veritas Says
                </span>
              </div>
              <p
                className="text-base font-mono leading-relaxed"
                style={{ color: "var(--tg-theme-text-color, #FAFAFA)" }}
              >
                {result.degenComment}
              </p>
            </div>
          )}

          {result.analysis && result.analysis.length > 0 && (
            <div
              className="rounded-sm p-4 border"
              style={{
                backgroundColor: "var(--tg-theme-secondary-bg-color, #0A0A0B)",
                borderColor: "var(--tg-theme-hint-color, #27272A)",
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="w-3.5 h-3.5" style={{ color: "var(--tg-theme-hint-color, #71717A)" }} />
                <span className="text-xs font-mono uppercase" style={{ color: "var(--tg-theme-hint-color, #71717A)" }}>
                  Forensic Analysis
                </span>
              </div>
              <ul className="space-y-2">
                {result.analysis.map((point, i) => (
                  <li
                    key={i}
                    className="text-sm font-mono leading-relaxed"
                    style={{ color: "var(--tg-theme-hint-color, #A1A1AA)" }}
                  >
                    • {point}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-center text-xs font-mono pt-2" style={{ color: "var(--tg-theme-hint-color, #52525B)" }}>
            Analyzed in {result.analysisTimeMs}ms
          </div>
        </div>
      )}
      </div>
    </>
  );
}

// =============================================================================
// SUBCOMPONENTS
// =============================================================================

function VerdictBadge({ verdict }: { verdict: string }) {
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

  const c = config[verdict] || config.CAUTION;

  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-sm border"
      style={{ backgroundColor: c.bg, borderColor: c.border }}
    >
      <span style={{ color: c.color }}>{c.icon}</span>
      <span className="text-sm font-medium uppercase tracking-wide" style={{ color: c.color }}>
        {verdict}
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
