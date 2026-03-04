/**
 * TON Security - Contract audit integration for TON tokens.
 */

export interface TonSecurityRisk {
  name: string;
  description: string;
  level: "info" | "warn" | "danger";
  score: number;
}

export interface TonSecurityReport {
  score: number; // 0-100, higher = riskier (this is a RISK score, not safety score)
  risks: TonSecurityRisk[];
  creator?: string; // Deployer wallet address
  mint?: string;
  tokenMeta?: {
    name?: string;
    symbol?: string;
  };
}

/**
 * Fetches jetton metadata from TonAPI. Maps to TonSecurityReport shape.
 * TonAPI jettons endpoint returns metadata; risk score/risks are derived or default.
 *
 * @param tokenAddress - TON token/jetton address
 * @returns TonSecurityReport or null if unavailable
 */
export async function fetchTonSecurity(tokenAddress: string): Promise<TonSecurityReport | null> {
  try {
    const res = await fetch(`https://tonapi.io/v2/jettons/${tokenAddress}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      metadata?: { name?: string; symbol?: string };
      [key: string]: unknown;
    };
    const metadata = data?.metadata ?? {};
    return {
      score: 0,
      risks: [],
      tokenMeta: {
        name: typeof metadata.name === "string" ? metadata.name : undefined,
        symbol: typeof metadata.symbol === "string" ? metadata.symbol : undefined,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Helper: Check if a specific risk type exists in the report
 */
export function hasRisk(report: TonSecurityReport | null, riskName: string): boolean {
  if (!report) return false;
  return report.risks.some(r => r.name.toLowerCase().includes(riskName.toLowerCase()));
}

/**
 * Helper: Get all high-severity risks
 */
export function getHighRisks(report: TonSecurityReport | null): TonSecurityRisk[] {
  if (!report) return [];
  return report.risks.filter(r => r.level === "danger");
}
