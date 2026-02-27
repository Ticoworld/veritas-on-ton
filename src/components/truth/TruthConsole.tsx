"use client";

import { useState } from "react";
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
  Brain
} from "lucide-react";
import { CryptoLoader } from "@/components/ui/CryptoLoader";
import type { ScammerRecord } from "@/lib/db/elephant";

// =============================================================================
// TYPES (Updated for Unified API)
// =============================================================================

interface ScanResult {
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  
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
  
  // Degen Commentary
  degenComment: string;
  
  /** Thought summary from Gemini — Reasoning Trace for judges */
  thoughtSummary?: string;
  
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
  
  // Visual forensics
  visualEvidenceStatus?: "captured" | "not_captured";
  visualAssetReuse?: "YES" | "NO" | "UNKNOWN";

  // Metadata
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

  const handleScan = async () => {
    if (!address.trim()) return;

    // Client-side guard: reject before any network call
    // TON user-friendly addresses: 48 chars, standard or URL-safe base64
    const TON_ADDRESS_REGEX = /^[a-zA-Z0-9_\-+/]{48}$/;
    if (!TON_ADDRESS_REGEX.test(address.trim())) {
      setError("Invalid TON Address Format. A valid TON address is exactly 48 characters (base64).");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/analyze-unified", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  const handleReset = () => {
    setAddress("");
    setResult(null);
    setError(null);
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Search Input (Always Available) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center px-2 py-0.5 rounded bg-[#18181B] border border-[#27272A] text-[#A1A1AA] text-xs font-mono uppercase tracking-wide">
            TON token
          </span>
        </div>
        <div className="relative">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleScan()}
            placeholder="Paste TON token/contract address or DexScreener URL"
            disabled={loading}
            className="w-full px-4 py-3 bg-[#0A0A0B] border border-[#27272A] rounded-sm
                       text-[#FAFAFA] placeholder-[#52525B] font-mono text-sm
                       focus:outline-none focus:border-[#3F3F46]
                       disabled:opacity-50 transition-colors"
          />
          <p className="mt-1.5 text-[#52525B] text-xs">
            Not your wallet address — use the token&apos;s contract/mint address
          </p>
        </div>

        <button
          onClick={handleScan}
          disabled={loading || !address.trim()}
          className="w-full py-3 px-4 bg-[#18181B] border border-[#27272A] 
                     hover:bg-[#27272A] hover:border-[#3F3F46]
                     disabled:opacity-40 disabled:cursor-not-allowed
                     text-[#FAFAFA] font-medium text-sm rounded-sm
                     transition-colors uppercase tracking-wide"
        >
          {result ? "Analyze Another" : "Analyze Token"}
        </button>

        {error && (
          <div className="p-3 bg-[#18181B] border border-[#7F1D1D] rounded-sm">
            <p className="text-[#FCA5A5] text-xs font-mono">{error}</p>
          </div>
        )}
      </div>

      {/* Loading State - Premium CryptoLoader */}
      {loading && (
        <CryptoLoader message="Veritas is analyzing the contract..." />
      )}

      {/* Result Card */}
      {result && !loading && (
        <div className="space-y-4">
          {/* Back Button */}
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-[#71717A] hover:text-[#A1A1AA] 
                       text-xs transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            New scan
          </button>

          {/* Verdict Section */}
          <div className="bg-[#0A0A0B] border border-[#27272A] rounded-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <VerdictBadge verdict={result.verdict.toUpperCase()} />
              {result.elephantMemory?.isKnownScammer && (
                <span className="text-[#FCA5A5] text-xs font-mono uppercase">
                  Known Criminal
                </span>
              )}
            </div>
            
            <h2 className="text-[#FAFAFA] text-lg font-medium mb-2">
              {result.criminalProfile}
            </h2>
            
            <p className="text-[#A1A1AA] text-sm leading-relaxed">
              {result.summary}
            </p>
            
            {/* Reasoning Trace — thought summary from Gemini (proves AI is thinking, not summarising) */}
            {result.thoughtSummary && (
              <details className="mt-4 pt-4 border-t border-[#27272A] group">
                <summary className="flex items-center gap-2 cursor-pointer list-none text-[#71717A] hover:text-[#A1A1AA] text-xs font-mono uppercase tracking-wide">
                  <Brain className="w-3.5 h-3.5" />
                  <span>Reasoning Trace</span>
                  <span className="text-[#52525B] group-open:hidden">▶</span>
                  <span className="text-[#52525B] hidden group-open:inline">▼</span>
                </summary>
                <p className="mt-3 text-[#A1A1AA] text-sm font-mono leading-relaxed whitespace-pre-wrap">
                  {result.thoughtSummary}
                </p>
              </details>
            )}

            {/* Sources Analyzed Badge */}
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[#27272A]">
              <span className="text-[#52525B] text-xs">📸 Sources:</span>
              <div className="flex gap-2">
                {result.socials?.website && (
                  <a 
                    href={result.socials.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#10B981] text-xs font-mono hover:underline cursor-pointer"
                  >
                    Website ✓
                  </a>
                )}
                {result.socials?.twitter && (
                  <a 
                    href={result.socials.twitter}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#10B981] text-xs font-mono hover:underline cursor-pointer"
                  >
                    Twitter ✓
                  </a>
                )}
                <span className="text-[#10B981] text-xs font-mono">On-chain ✓</span>
              </div>
            </div>
          </div>

          {/* Deception Detected — red when lies found, neutral/green when "None identified" */}
          {result.lies && result.lies.length > 0 && (() => {
            const text = result.lies.join(" ").toLowerCase();
            const isNoneIdentified = /^(none|no\s|no explicit|no deception|no lies)/i.test(result.lies[0]?.trim() ?? "") ||
              /none identified|no explicit lies|no deception detected/.test(text);
            const isGood = isNoneIdentified;
            return (
              <div className={`rounded-sm p-4 border ${
                isGood ? "bg-[#0A0A0B] border-[#27272A]" : "bg-[#0A0A0B] border-[#7F1D1D]"
              }`}>
                <h3 className={`text-xs font-medium uppercase tracking-wide mb-3 ${
                  isGood ? "text-[#22C55E]" : "text-[#FCA5A5]"
                }`}>
                  {isGood ? "No Deception Detected" : "Deception Detected"}
                </h3>
                <ul className="space-y-2">
                  {result.lies.map((lie, i) => (
                    <li key={i} className={`text-sm flex items-start gap-2 ${
                      isGood ? "text-[#A1A1AA]" : "text-[#FCA5A5]"
                    }`}>
                      <span className={`mt-1 ${isGood ? "text-[#22C55E]" : "text-[#EF4444]"}`}>•</span>
                      {lie}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}

          {/* Creator History - Serial Launcher Detection */}
          {result.creatorHistory?.isSerialLauncher && (
            <div className="bg-[#0A0A0B] border border-[#78350F] rounded-sm p-4">
              <h3 className="text-[#FCD34D] text-xs font-medium uppercase tracking-wide mb-3">
                ⚠️ Serial Launcher Detected ({result.creatorHistory.previousTokens} previous tokens)
              </h3>
              <p className="text-[#FCD34D] text-sm">
                This creator has launched {result.creatorHistory.previousTokens} other tokens.
              </p>
            </div>
          )}

          {/* Market Anomalies */}
          {result.market?.anomalies && result.market.anomalies.length > 0 && (
            <div className="bg-[#0A0A0B] border border-[#78350F] rounded-sm p-4">
              <h3 className="text-[#FCD34D] text-xs font-medium uppercase tracking-wide mb-3">
                Market Anomalies
              </h3>
              <ul className="space-y-2">
                {result.market.anomalies.map((anomaly, i) => (
                  <li key={i} className="text-[#FCD34D] text-sm">
                    {anomaly}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Bento Grid - Main Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Large Cards */}
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

          {/* RugCheck Score */}
          {result.rugCheck && (
            <div className="bg-[#0A0A0B] border border-[#27272A] rounded-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#71717A]" />
                  <span className="text-[#71717A] text-xs font-mono uppercase">Contract Audit</span>
                </div>
                <span className={`text-sm font-mono ${
                  result.rugCheck.score <= 20 ? "text-[#22C55E]" :
                  result.rugCheck.score <= 50 ? "text-[#EAB308]" :
                  "text-[#EF4444]"
                }`}>
                  Risk: {result.rugCheck.score}/100
                </span>
              </div>
              {result.rugCheck.risks.length > 0 && (
                <ul className="space-y-1 mt-2">
                  {result.rugCheck.risks.slice(0, 3).map((risk, i) => (
                    <li key={i} className="text-[#A1A1AA] text-xs flex items-start gap-2">
                      <span className={
                        risk.level === "danger" ? "text-[#EF4444]" :
                        risk.level === "warn" ? "text-[#EAB308]" :
                        "text-[#71717A]"
                      }>•</span>
                      <span>{risk.name}</span>
                    </li>
                  ))}
                  {result.rugCheck.risks.length > 3 && (
                    <li className="text-[#52525B] text-xs ml-3">
                      +{result.rugCheck.risks.length - 3} more risks
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}

          {/* Bento Grid - Secondary Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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

          {/* Security Flags */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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

          {/* Visual Forensics Block */}
          {(result.visualEvidenceStatus || result.visualAnalysis) && (
            <div className={`bg-[#0A0A0B] rounded-sm p-4 border ${
              result.visualEvidenceStatus === "captured"
                ? "border-[#27272A]"
                : "border-[#3F3F46]"
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-[#71717A] text-lg">👁</span>
                  <span className="text-[#71717A] text-xs font-mono uppercase tracking-wide">Visual Forensics</span>
                </div>

                {/* Screenshot status pill */}
                <span className={`text-[10px] font-mono uppercase tracking-wide px-2 py-0.5 rounded-sm border ${
                  result.visualEvidenceStatus === "captured"
                    ? "text-[#22C55E] border-[#166534] bg-[#052E16]"
                    : "text-[#71717A] border-[#3F3F46] bg-[#18181B]"
                }`}>
                  {result.visualEvidenceStatus === "captured" ? "Screenshot ✓" : "Screenshot ✗"}
                </span>
              </div>

              {/* Visual Asset Reuse badge — the key forensics signal */}
              {result.visualAssetReuse && result.visualAssetReuse !== "UNKNOWN" && (
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-sm border mb-3 ${
                  result.visualAssetReuse === "YES"
                    ? "bg-[#450A0A] border-[#7F1D1D] text-[#EF4444]"
                    : "bg-[#052E16] border-[#166534] text-[#22C55E]"
                }`}>
                  <span className="text-sm">{result.visualAssetReuse === "YES" ? "🚨" : "✅"}</span>
                  <span className="text-xs font-mono uppercase tracking-wide">
                    Visual Asset Reuse: {result.visualAssetReuse}
                  </span>
                </div>
              )}
              {result.visualAssetReuse === "UNKNOWN" && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-sm border mb-3 bg-[#18181B] border-[#3F3F46] text-[#71717A]">
                  <span className="text-xs font-mono uppercase tracking-wide">Visual Asset Reuse: UNKNOWN</span>
                </div>
              )}

              {/* Full AI visual analysis reasoning trace */}
              {result.visualAnalysis && (
                <p className="text-[#A1A1AA] text-sm font-mono leading-relaxed whitespace-pre-wrap">
                  {result.visualAnalysis}
                </p>
              )}

              {!result.visualAnalysis && result.visualEvidenceStatus !== "captured" && (
                <p className="text-[#52525B] text-xs font-mono">Screenshot capture failed — visual forensics unavailable.</p>
              )}
            </div>
          )}

          {/* Degen Comment - Featured */}
          {result.degenComment && (
            <div className="bg-[#0A0A0B] border border-[#27272A] rounded-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <Terminal className="w-4 h-4 text-[#22C55E]" />
                <span className="text-[#22C55E] text-xs font-mono uppercase tracking-wide">Veritas Says</span>
              </div>
              <p className="text-[#FAFAFA] text-base font-mono leading-relaxed">
                {result.degenComment}
              </p>
            </div>
          )}

          {/* Analysis Points */}
          {result.analysis && result.analysis.length > 0 && (
            <div className="bg-[#0A0A0B] border border-[#27272A] rounded-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="w-3.5 h-3.5 text-[#71717A]" />
                <span className="text-[#71717A] text-xs font-mono uppercase">Forensic Analysis</span>
              </div>
              <ul className="space-y-2">
                {result.analysis.map((point, i) => (
                  <li key={i} className="text-[#A1A1AA] text-sm font-mono leading-relaxed">
                    • {point}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Footer */}
          <div className="text-center text-[#52525B] text-xs font-mono pt-2">
            Analyzed in {result.analysisTimeMs}ms
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// SUBCOMPONENTS
// =============================================================================

function VerdictBadge({ verdict }: { verdict: string }) {
  const config: Record<string, { 
    bg: string; 
    text: string; 
    border: string;
    icon: React.ReactNode;
  }> = {
    SAFE: { 
      bg: "bg-[#052E16]", 
      text: "text-[#22C55E]", 
      border: "border-[#166534]",
      icon: <Shield className="w-4 h-4" />
    },
    CAUTION: { 
      bg: "bg-[#422006]", 
      text: "text-[#EAB308]", 
      border: "border-[#854D0E]",
      icon: <ShieldAlert className="w-4 h-4" />
    },
    DANGER: { 
      bg: "bg-[#450A0A]", 
      text: "text-[#EF4444]", 
      border: "border-[#7F1D1D]",
      icon: <ShieldX className="w-4 h-4" />
    },
    SCAM: { 
      bg: "bg-[#450A0A]", 
      text: "text-[#FCA5A5]", 
      border: "border-[#991B1B]",
      icon: <Skull className="w-4 h-4" />
    },
  };

  const c = config[verdict] || config.CAUTION;

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-sm border ${c.bg} ${c.border}`}>
      <span className={c.text}>{c.icon}</span>
      <span className={`${c.text} text-sm font-medium uppercase tracking-wide`}>
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
    safe: "text-[#22C55E]",
    warning: "text-[#EAB308]",
    danger: "text-[#EF4444]",
  };

  return (
    <div className={`bg-[#0A0A0B] border border-[#27272A] rounded-sm ${large ? "p-4" : "p-3"}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[#52525B]">{icon}</span>
        <span className="text-[#52525B] text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className={`font-mono ${large ? "text-lg" : "text-sm"} ${status ? statusColors[status] : "text-[#FAFAFA]"}`}>
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
    <div className={`p-3 rounded-sm border ${
      enabled 
        ? "bg-[#450A0A] border-[#7F1D1D]" 
        : "bg-[#052E16] border-[#166534]"
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={enabled ? "text-[#EF4444]" : "text-[#22C55E]"}>
            {icon}
          </span>
          <span className="text-[#A1A1AA] text-xs">{label}</span>
        </div>
        <span className={`text-xs font-mono ${enabled ? "text-[#EF4444]" : "text-[#22C55E]"}`}>
          {enabled ? "ENABLED" : "DISABLED"}
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// HELPERS
// =============================================================================

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toFixed(0);
}

/**
 * Convert trust score (0-100) to status color
 * Higher score = safer token
 */
function getTrustStatus(score: number): "safe" | "warning" | "danger" {
  if (score >= 70) return "safe";
  if (score >= 40) return "warning";
  return "danger";
}
