/**
 * Fetch market data and derive lightweight risk signals from GeckoTerminal.
 */

const GECKO_TERMINAL_API =
  "https://api.geckoterminal.com/api/v2/networks/ton/tokens";

/**
 * Bot activity level based on market anomalies.
 */
export type BotActivityLevel = "Low" | "Medium" | "High";

/**
 * Market analysis result with derived anomaly signals.
 */
export interface MarketAnalysis {
  liquidity: number;
  marketCap: number;
  volume24h: number;
  buys24h: number;
  sells24h: number;
  priceChange24h: number;
  pairCreatedAt: number;
  ageInHours: number;
  liquidityRatio: number;
  buySellRatio: number;
  washTradeScore: number;
  botActivity: BotActivityLevel;
  anomalies: string[];
}

interface GeckoPoolAttributes {
  reserve_in_usd?: string | null;
  volume_usd?: string | { h24?: string } | null;
  fdv_usd?: string | null;
  price_change_percentage?: { h24?: string | null } | null;
  created_at?: string | null;
  tx_count?: number | null;
}

interface GeckoPoolData {
  id?: string;
  type?: string;
  attributes?: GeckoPoolAttributes;
}

interface GeckoPoolsResponse {
  data?: GeckoPoolData[] | null;
}

function detectBotActivity(
  liquidityRatio: number,
  buySellRatio: number,
  washTradeScore: number,
): { level: BotActivityLevel; anomalies: string[] } {
  const anomalies: string[] = [];
  let riskPoints = 0;

  if (liquidityRatio < 1 && liquidityRatio > 0) {
    anomalies.push(
      "Low liquidity relative to market cap (<1%). This signal alone does not indicate a scam.",
    );
    riskPoints += 2;
  } else if (liquidityRatio < 5 && liquidityRatio > 0) {
    anomalies.push(
      `Liquidity-to-market-cap ratio is low (${liquidityRatio.toFixed(1)}%). Consider with other factors.`,
    );
    riskPoints += 1;
  }

  if (buySellRatio > 20) {
    anomalies.push(
      `Honeypot risk: Buy/Sell ratio ${buySellRatio.toFixed(0)}:1 (sells may be restricted).`,
    );
    riskPoints += 3;
  } else if (buySellRatio > 10) {
    anomalies.push(
      `Abnormal trading: Buy/Sell ratio ${buySellRatio.toFixed(1)}:1.`,
    );
    riskPoints += 2;
  }

  if (washTradeScore > 100 && liquidityRatio > 0) {
    anomalies.push(
      `High volume relative to liquidity (${washTradeScore.toFixed(0)}x in 24h). Possible wash trading or bot activity.`,
    );
    riskPoints += 3;
  } else if (washTradeScore > 50 && liquidityRatio > 0) {
    anomalies.push(
      `Elevated volume: ${washTradeScore.toFixed(0)}x liquidity in 24h.`,
    );
    riskPoints += 2;
  }

  let level: BotActivityLevel;
  if (riskPoints >= 5) {
    level = "High";
  } else if (riskPoints >= 2) {
    level = "Medium";
  } else {
    level = "Low";
  }

  return { level, anomalies };
}

export async function getMarketAnalysis(
  tokenAddress: string,
): Promise<MarketAnalysis | null> {
  try {
    console.log(
      `[Market] Fetching TON pool data for ${tokenAddress.slice(0, 12)}...`,
    );

    const url = `${GECKO_TERMINAL_API}/${encodeURIComponent(tokenAddress)}/pools`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.log("[Market] GeckoTerminal response not ok:", response.status);
      return null;
    }

    const json = (await response.json()) as GeckoPoolsResponse;
    const pools = json?.data;

    if (!pools || !Array.isArray(pools) || pools.length === 0) {
      console.log("[Market] No pools found for this token");
      return null;
    }

    const mainPool = pools.reduce((best, pool) => {
      const reserve = parseFloat(pool?.attributes?.reserve_in_usd ?? "0") || 0;
      const bestReserve =
        parseFloat(best?.attributes?.reserve_in_usd ?? "0") || 0;
      return reserve >= bestReserve ? pool : best;
    }, pools[0]);

    const attrs = mainPool?.attributes ?? {};
    const liquidity = parseFloat(attrs.reserve_in_usd ?? "0") || 0;
    const volumeUsdRaw = attrs.volume_usd;
    const volume24h =
      typeof volumeUsdRaw === "string"
        ? parseFloat(volumeUsdRaw) || 0
        : parseFloat(volumeUsdRaw?.h24 ?? "0") || 0;
    const marketCap = parseFloat(attrs.fdv_usd ?? "0") || 0;
    const priceChange24h =
      parseFloat(attrs.price_change_percentage?.h24 ?? "0") || 0;

    // GeckoTerminal may not expose buy/sell counts. Use neutral defaults
    // instead of inventing stronger precision than the source gives us.
    const buys24h = 0;
    const sells24h = 0;
    const buySellRatio = 1;
    const washTradeScore = liquidity > 0 ? volume24h / liquidity : 0;
    const liquidityRatio = marketCap > 0 ? (liquidity / marketCap) * 100 : 0;

    const { level: botActivity, anomalies } = detectBotActivity(
      liquidityRatio,
      buySellRatio,
      washTradeScore,
    );

    const pairCreatedAt = attrs.created_at
      ? new Date(attrs.created_at).getTime()
      : 0;
    const ageInHours =
      pairCreatedAt > 0
        ? Math.max(0, (Date.now() - pairCreatedAt) / (1000 * 60 * 60))
        : 0;

    console.log(
      `[Market] Bot Activity: ${botActivity} | Liquidity: $${liquidity.toLocaleString()} | Volume 24h: $${volume24h.toLocaleString()}`,
    );

    return {
      liquidity,
      marketCap,
      volume24h,
      buys24h,
      sells24h,
      priceChange24h,
      pairCreatedAt,
      ageInHours,
      liquidityRatio,
      buySellRatio,
      washTradeScore,
      botActivity,
      anomalies,
    };
  } catch (error) {
    console.error("[Market] Failed to fetch GeckoTerminal data:", error);
    return null;
  }
}
