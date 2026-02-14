/**
 * Blockchain data layer (TON)
 * TODO: Replace with TON API - blockchain data layer for TON.
 */

export interface TokenInfoStub {
  decimals: number;
  supply: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
}

export interface HolderStub {
  address: string;
  balance: number;
  percentage: number;
}

/**
 * Validates token/contract address.
 * TODO: Replace with TON API - use TON address validation (e.g. base64url or raw format).
 */
export function validateAddress(address: string): boolean {
  if (!address || typeof address !== "string") return false;
  const trimmed = address.trim();
  // Accept non-empty string for now so the rest of the pipeline (DexScreener, Microlink, AI) can run.
  return trimmed.length >= 8 && trimmed.length <= 128;
}

/**
 * Fetches token mint/contract info (decimals, supply, authorities).
 * TODO: Replace with TON API - fetch jetton/token metadata and contract state from TON.
 */
export async function getTokenInfo(address: string): Promise<TokenInfoStub> {
  // TODO: Replace with TON API
  return {
    decimals: 9,
    supply: "0",
    mintAuthority: null,
    freezeAuthority: null,
  };
}

/**
 * Fetches top token holders and their share of supply.
 * TODO: Replace with TON API - fetch jetton holders or equivalent from TON.
 */
export async function getHolderDistribution(
  _address: string,
  _supply: number,
  _decimals: number
): Promise<{ topHolders: HolderStub[]; top10Percentage: number }> {
  // TODO: Replace with TON API
  return { topHolders: [], top10Percentage: 0 };
}
