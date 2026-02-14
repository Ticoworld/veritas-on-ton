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
 * Fetches token/contract security report for TON.
 *
 * @param tokenAddress - TON token/contract address
 * @returns TonSecurityReport or null if unavailable
 */
export async function fetchTonSecurity(_tokenAddress: string): Promise<TonSecurityReport | null> {
  // TODO: Integrate TON contract audit or risk API when available.
  return null;
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
