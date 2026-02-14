"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Shield,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  ArrowLeft,
  Globe,
  ChevronDown,
  ChevronUp,
  Skull
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { UnifiedScanResult } from "@/hooks/useScanner";

interface UnifiedResultCardProps {
  result: UnifiedScanResult;
  onReset: () => void;
}

export function UnifiedResultCard({ result, onReset }: UnifiedResultCardProps) {
  const [copied, setCopied] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);

  // Determine badge/colors based on verdict
  const verdictConfig = {
    Safe: {
      color: "text-success",
      bgColor: "bg-success/10",
      borderColor: "border-success/30",
      icon: Shield,
      label: "Safe",
    },
    Caution: {
      color: "text-warning",
      bgColor: "bg-warning/10",
      borderColor: "border-warning/30",
      icon: AlertTriangle,
      label: "Caution",
    },
    Danger: {
      color: "text-danger",
      bgColor: "bg-danger/10",
      borderColor: "border-danger/30",
      icon: Skull,
      label: "Danger",
    },
  };

  const config = verdictConfig[result.verdict] || verdictConfig.Caution;
  const VerdictIcon = config.icon;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(result.tokenAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shortAddress = `${result.tokenAddress.slice(0, 8)}...${result.tokenAddress.slice(-8)}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onReset}>
            <ArrowLeft className="w-4 h-4" />
            New Scan
          </Button>
        </div>
        <Badge variant={result.verdict === "Safe" ? "safe" : result.verdict === "Danger" ? "danger" : "warning"}>
          {result.verdict}
        </Badge>
      </div>

      {/* Main Card */}
      <div className={`p-6 rounded-xl border ${config.borderColor} ${config.bgColor}`}>
        {/* Token Info */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">{result.tokenName}</h2>
            <p className="text-muted font-mono text-sm">{result.tokenSymbol}</p>
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-light transition-colors"
          >
            <span className="font-mono text-sm">{shortAddress}</span>
            {copied ? (
              <Check className="w-4 h-4 text-success" />
            ) : (
              <Copy className="w-4 h-4 text-muted" />
            )}
          </button>
        </div>

        {/* Trust Score Circle */}
        <div className="flex items-center gap-8 mb-6">
          <div className="relative w-32 h-32">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-surface"
              />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeDasharray={`${result.trustScore * 2.83} 283`}
                className={config.color}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-3xl font-bold ${config.color}`}>{result.trustScore}</span>
              <span className="text-xs text-muted uppercase tracking-wider">Trust</span>
            </div>
          </div>

          {/* Criminal Profile */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <VerdictIcon className={`w-5 h-5 ${config.color}`} />
              <span className={`font-semibold ${config.color}`}>Criminal Profile</span>
            </div>
            <p className="text-lg font-mono">"{result.criminalProfile}"</p>
            <p className="text-muted text-sm mt-2">{result.summary}</p>
          </div>
        </div>

        {/* On-Chain Security */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 rounded-lg bg-surface/50">
          <SecurityItem
            label="Mint Authority"
            value={result.onChain.mintAuth}
            isGood={result.onChain.mintAuth === "Disabled"}
          />
          <SecurityItem
            label="Freeze Authority"
            value={result.onChain.freezeAuth}
            isGood={result.onChain.freezeAuth === "Disabled"}
          />
          <SecurityItem
            label="Top 10 Holders"
            value={`${result.onChain.top10Percentage.toFixed(1)}%`}
            isGood={result.onChain.top10Percentage < 50}
          />
          <SecurityItem
            label="Creator Status"
            value={result.onChain.isDumped ? "DUMPED" : result.onChain.isWhale ? "WHALE" : "Holding"}
            isGood={!result.onChain.isDumped && !result.onChain.isWhale}
          />
        </div>

        {/* Lies Found */}
        {result.lies && result.lies.length > 0 && (
          <div className="mb-6 p-4 rounded-lg bg-danger/10 border border-danger/30">
            <h3 className="font-semibold text-danger mb-3 flex items-center gap-2">
              <Skull className="w-4 h-4" />
              Lies Detected
            </h3>
            <ul className="space-y-2">
              {result.lies.map((lie, i) => (
                <li key={i} className="text-sm text-danger/90 flex items-start gap-2">
                  <span className="text-danger">•</span>
                  {lie}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Evidence Toggle */}
        <button
          onClick={() => setShowEvidence(!showEvidence)}
          className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors"
        >
          {showEvidence ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {showEvidence ? "Hide Evidence" : "Show Evidence"} ({result.evidence?.length || 0} findings)
        </button>

        {showEvidence && result.evidence && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            className="mt-4 p-4 rounded-lg bg-surface/50"
          >
            <ul className="space-y-2">
              {result.evidence.map((item, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="text-muted">◦</span>
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </div>

      {/* Market Data */}
      {result.market && (
        <div className="p-4 rounded-xl border border-border bg-surface/30">
          <h3 className="font-semibold mb-4">Market Forensics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricItem label="Liquidity" value={`$${(result.market.liquidity / 1000).toFixed(1)}K`} />
            <MetricItem label="Volume 24h" value={`$${(result.market.volume24h / 1000).toFixed(1)}K`} />
            <MetricItem label="Market Cap" value={`$${(result.market.marketCap / 1000).toFixed(1)}K`} />
            <MetricItem label="Buy/Sell" value={`${result.market.buySellRatio.toFixed(2)}:1`} />
          </div>
        </div>
      )}

      {/* Social Links */}
      {result.socials && (result.socials.website || result.socials.twitter) && (
        <div className="flex gap-3">
          {result.socials.website && (
            <a
              href={result.socials.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface hover:bg-surface-light transition-colors"
            >
              <Globe className="w-4 h-4" />
              Website
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {result.socials.twitter && (
            <a
              href={result.socials.twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface hover:bg-surface-light transition-colors"
            >
              𝕏
              Twitter
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}

      {/* Analysis Time */}
      <p className="text-xs text-muted text-center">
        Analysis completed in {result.analysisTimeSeconds}s
      </p>
    </motion.div>
  );
}

function SecurityItem({ label, value, isGood }: { label: string; value: string; isGood: boolean }) {
  return (
    <div className="text-center">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className={`font-mono text-sm ${isGood ? "text-success" : "text-danger"}`}>{value}</p>
    </div>
  );
}

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className="font-mono text-sm">{value}</p>
    </div>
  );
}
