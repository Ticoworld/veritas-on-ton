"use client";

import { useState, useCallback } from "react";
import { useScanHistory } from "@/hooks/useScanHistory";

/**
 * Unified result type - single verdict, no Sherlock phase
 */
export interface UnifiedScanResult {
  // Core verdict
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  trustScore: number;
  verdict: "Safe" | "Caution" | "Danger";
  summary: string;
  criminalProfile: string;
  
  // Evidence
  lies: string[];
  evidence: string[];
  analysis: string[];
  visualAnalysis?: string;
  
  // On-chain data
  onChain: {
    mintAuth: string;
    freezeAuth: string;
    top10Percentage: number;
    creatorPercentage: number;
    isDumped: boolean;
    isWhale: boolean;
  };
  
  // Market data
  market?: {
    liquidity: number;
    volume24h: number;
    marketCap: number;
    buySellRatio: number;
    botActivity?: string;
    washTradingRatio?: number;
  };
  
  // Social links
  socials?: {
    website?: string;
    twitter?: string;
    telegram?: string;
    discord?: string;
    imageUrl?: string;
  };
  
  // Metadata
  analyzedAt: string;
  analysisTimeSeconds: string;
}

interface UseScannerReturn {
  loading: boolean;
  error: string | null;
  result: UnifiedScanResult | null;
  scanToken: (address: string) => Promise<void>;
  reset: () => void;
}

/**
 * Validates token/contract address.
 * TODO: Replace with TON API - use TON address format validation.
 */
function isValidTokenAddress(address: string): boolean {
  if (!address || address.length < 8) return false;
  return address.length <= 128;
}

/**
 * Extracts token address from various input formats.
 * TODO: Replace with TON API - add TON explorer/dex URL patterns (e.g. tonviewer, dexscreener/ton).
 */
function extractAddress(input: string): string {
  const cleaned = input.trim();

  // TODO: Replace with TON API - add TON-specific URL patterns
  // Example: dexscreener.com/ton/..., tonviewer.com/...
  return cleaned;
}

export function useScanner(): UseScannerReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UnifiedScanResult | null>(null);
  const { addScan } = useScanHistory();

  const scanToken = useCallback(async (input: string) => {
    // Reset previous state
    setError(null);
    setResult(null);

    // Extract and validate address
    const address = extractAddress(input);

    if (!isValidTokenAddress(address)) {
      setError("Invalid token address. Please enter a valid TON token/contract address or URL.");
      return;
    }

    setLoading(true);
    console.log("[Veritas] 🚀 Starting unified analysis...");

    try {
      // ═══════════════════════════════════════════════════════════════════════
      // SINGLE UNIFIED CALL - No two-phase display!
      // Uses URL Context + Google Search for comprehensive investigation
      // ═══════════════════════════════════════════════════════════════════════
      
      const response = await fetch("/api/analyze-unified", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Analysis failed");
      }

      const scanResult: UnifiedScanResult = data.data;
      
      console.log(`[Veritas] ✅ Analysis complete: ${scanResult.verdict} (Trust: ${scanResult.trustScore})`);
      console.log(`[Veritas] 👤 Criminal Profile: ${scanResult.criminalProfile}`);

      setResult(scanResult);
      
      // Add to history (adapt format for history)
      addScan({
        tokenAddress: scanResult.tokenAddress,
        tokenData: {
          address: scanResult.tokenAddress,
          name: scanResult.tokenName,
          symbol: scanResult.tokenSymbol,
          decimals: 9,
          totalSupply: 0,
          creatorAddress: "",
          createdAt: new Date(),
        },
        overallRiskLevel: scanResult.verdict === "Safe" ? "low" : scanResult.verdict === "Danger" ? "critical" : "medium",
        riskScore: 100 - scanResult.trustScore,
        auditedAt: new Date(scanResult.analyzedAt),
        recommendations: [scanResult.summary, ...scanResult.evidence],
        bondingCurve: { isComplete: true, progress: 100, virtualSolReserves: 0, virtualTokenReserves: 0, realSolReserves: 0, realTokenReserves: 0 },
        creatorAnalysis: { address: "", totalTokensCreated: 0, rugPullCount: 0, successfulTokens: 0, avgHoldTime: 0, totalSolExtracted: 0, firstActivityDate: new Date(), riskScore: 0 },
        creatorStatus: { creatorAddress: "", creatorPercentage: scanResult.onChain.creatorPercentage, creatorBalance: 0, isDumped: scanResult.onChain.isDumped, isWhale: scanResult.onChain.isWhale },
        riskFactors: [],
      });
      
      setLoading(false);

    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred";
      
      // Provide more helpful error messages
      if (message.includes("not found") || message.includes("not exist")) {
        setError("Token not found. This address may not exist on-chain.");
      } else if (message.includes("not a valid") || message.includes("not a standard")) {
        setError("Not a valid token. This may be a wallet or contract address.");
      } else if (message.includes("fetch") || message.includes("network")) {
        setError("Network error. Please check your connection and try again.");
      } else {
        setError(message);
      }
      setLoading(false);
    }
  }, [addScan]);

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setResult(null);
  }, []);

  return { loading, error, result, scanToken, reset };
}
