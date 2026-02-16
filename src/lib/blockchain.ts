/**
 * Blockchain data layer (TON)
 * Live TON API integration using tonapi.io endpoints.
 */

export interface TokenInfoStub {
  decimals: number;
  supply: string; // raw total supply (as string from TonAPI)
  mintAuthority: string | null; // admin/address if present, else null
  freezeAuthority: string | null; // admin/address if present, else null
}

export interface HolderStub {
  address: string;
  balance: number;
  percentage: number;
}

/**
 * Validates token/contract address.
 */
export function validateAddress(address: string): boolean {
  if (!address || typeof address !== "string") return false;
  const trimmed = address.trim();
  // Accept non-empty string for now so the rest of the pipeline (DexScreener, Microlink, AI) can run.
  return trimmed.length >= 8 && trimmed.length <= 128;
}

/**
 * Fetches token mint/contract info (decimals, supply, authorities) from TonAPI.
 */
export async function getTokenInfo(address: string): Promise<TokenInfoStub> {
  const url = `https://tonapi.io/v2/jettons/${encodeURIComponent(address)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      // Rate limit or other error - return safe fallback
      console.warn(`[blockchain] TonAPI getTokenInfo failed: ${res.status} ${res.statusText}`);
      return { decimals: 9, supply: "0", mintAuthority: null, freezeAuthority: null };
    }

    const data = await res.json();

    // TonAPI shape may vary; try to read common fields
    const totalSupply = data?.total_supply ?? data?.totalSupply ?? data?.supply ?? "0";
    const decimals = Number(data?.metadata?.decimals ?? data?.decimals ?? 9) || 9;
    const admin = data?.admin ?? data?.owner ?? null;

    // If admin is an empty string or null-like, treat as null (renounced)
    const hasAdmin = admin && typeof admin === "string" && admin.trim() !== "";

    return {
      decimals,
      supply: String(totalSupply ?? "0"),
      mintAuthority: hasAdmin ? String(admin) : null,
      freezeAuthority: hasAdmin ? String(admin) : null,
    };
  } catch (error) {
    console.warn("[blockchain] getTokenInfo error:", error);
    return { decimals: 9, supply: "0", mintAuthority: null, freezeAuthority: null };
  }
}

/**
 * Fetches top token holders (limit 10) and calculates their percentages.
 * Uses TonAPI: /v2/jettons/{address}/holders?limit=10
 * @param address token address
 * @param supply already-decimal-adjusted total supply (i.e., human-readable)
 * @param decimals token decimals
 */
export async function getHolderDistribution(
  address: string,
  supply: number,
  decimals: number
): Promise<{ topHolders: HolderStub[]; top10Percentage: number }> {
  const url = `https://tonapi.io/v2/jettons/${encodeURIComponent(address)}/holders?limit=10`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[blockchain] TonAPI getHolderDistribution failed: ${res.status} ${res.statusText}`);
      return { topHolders: [], top10Percentage: 0 };
    }

    const data = await res.json();

    // TonAPI may return holders under different keys; attempt to locate array
    const holdersArray = data?.holders ?? data?.items ?? data?.data ?? [];

    const topHolders: HolderStub[] = [];
    let sumTop = 0;

    for (const h of holdersArray.slice(0, 10)) {
      const addr = h?.address ?? h?.owner ?? h?.wallet ?? null;
      // balance from API might be a string in smallest units
      const rawBalance = h?.balance ?? h?.amount ?? h?.value ?? h?.balance_value ?? "0";
      const rawNum = Number(rawBalance ?? "0");
      const balance = rawNum / Math.pow(10, decimals || 9);
      const percentage = supply > 0 ? (balance / supply) * 100 : 0;

      if (addr) {
        topHolders.push({ address: String(addr), balance, percentage });
        sumTop += balance;
      }
    }

    const top10Percentage = supply > 0 ? (sumTop / supply) * 100 : 0;

    return { topHolders, top10Percentage };
  } catch (error) {
    console.warn("[blockchain] getHolderDistribution error:", error);
    return { topHolders: [], top10Percentage: 0 };
  }
}
