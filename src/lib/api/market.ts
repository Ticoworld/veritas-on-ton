/**
 * The Market Watcher - Agent 2
 * Fetches market data and detects anomalies (Wash Trading, Honeypots)
 * Uses GeckoTerminal API v2 for TON token pool data
 */

const GECKO_TERMINAL_API = "https://api.geckoterminal.com/api/v2/networks/ton/tokens";

/**
 * Bot activity level based on market anomalies
 */
export type BotActivityLevel = "Low" | "Medium" | "High";

/**
 * Market analysis result with bot detection metrics
 */
export interface MarketAnalysis {
  // Raw metrics
  liquidity: number;       // USD liquidity (reserve_in_usd)
  marketCap: number;       // FDV in USD
  volume24h: number;       // 24h volume in USD (volume_usd)
  buys24h: number;         // Number of buy transactions
  sells24h: number;        // Number of sell transactions
  priceChange24h: number;  // Price change percentage
  pairCreatedAt: number;   // Timestamp in ms when pair was created
  ageInHours: number;      // Token age in hours (calculated)

  // Calculated ratios (Bot Detector)
  liquidityRatio: number;  // liquidity / marketCap (healthy > 10%)
  buySellRatio: number;    // buys / sells (abnormal if > 10:1)
  washTradeScore: number;  // volume / liquidity (suspicious if > 50x)

  // Final verdict
  botActivity: BotActivityLevel;
  anomalies: string[];     // List of detected anomalies
}

/**
 * GeckoTerminal API v2 pool attributes (from response)
 * volume_usd can be a string or object with time intervals (e.g. { h24: "..." })
 */
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

/**
 * Calculate bot activity level based on market metrics
 */
function detectBotActivity(
  liquidityRatio: number,
  buySellRatio: number,
  washTradeScore: number
): { level: BotActivityLevel; anomalies: string[] } {
  const anomalies: string[] = [];
  let riskPoints = 0;

  // Liquidity Ratio Check (< 1% is very suspicious)
  if (liquidityRatio < 1 && liquidityRatio > 0) {
    anomalies.push("⚠️ Liquidity Scam Risk: Liquidity < 1% of market cap");
    riskPoints += 3;
  } else if (liquidityRatio < 5 && liquidityRatio > 0) {
    anomalies.push("⚠️ Low Liquidity: Only " + liquidityRatio.toFixed(1) + "% of market cap");
    riskPoints += 1;
  }

  // Buy/Sell Ratio Check (> 20:1 = honeypot risk)
  if (buySellRatio > 20) {
    anomalies.push("🚨 Honeypot Risk: Buy/Sell ratio is " + buySellRatio.toFixed(0) + ":1 (Cannot sell?)");
    riskPoints += 3;
  } else if (buySellRatio > 10) {
    anomalies.push("⚠️ Abnormal Trading: Buy/Sell ratio is " + buySellRatio.toFixed(1) + ":1");
    riskPoints += 2;
  }

  // Wash Trade Score Check (> 100x volume/liquidity is fake)
  if (washTradeScore > 100 && liquidityRatio > 0) {
    anomalies.push("🚨 Fake Volume: Wash trade score " + washTradeScore.toFixed(0) + "x (Bot activity!)");
    riskPoints += 3;
  } else if (washTradeScore > 50 && liquidityRatio > 0) {
    anomalies.push("⚠️ Suspicious Volume: " + washTradeScore.toFixed(0) + "x liquidity in 24h");
    riskPoints += 2;
  }

  // Determine overall bot activity level
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

/**
 * Fetches pool data from GeckoTerminal API v2 for a TON token and maps to market analysis.
 * Endpoint: GET https://api.geckoterminal.com/api/v2/networks/ton/tokens/{token_address}/pools
 * Extracts reserve_in_usd (liquidity) and volume_usd (24h volume) from pool attributes.
 */
export async function getMarketAnalysis(tokenAddress: string): Promise<MarketAnalysis | null> {
  try {
    console.log(`[Market Watcher] 📊 Fetching TON pool data for ${tokenAddress.slice(0, 12)}...`);

    const url = `${GECKO_TERMINAL_API}/${encodeURIComponent(tokenAddress)}/pools`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.log("[Market Watcher] GeckoTerminal response not ok:", response.status);
      return null;
    }

    const json = (await response.json()) as GeckoPoolsResponse;
    const pools = json?.data;

    if (!pools || !Array.isArray(pools) || pools.length === 0) {
      console.log("[Market Watcher] No pools found for this token");
      return null;
    }

    // Use the pool with highest reserve (liquidity); first is often the main pool
    const mainPool = pools.reduce((best, p) => {
      const reserve = parseFloat(p?.attributes?.reserve_in_usd ?? "0") || 0;
      const bestReserve = parseFloat(best?.attributes?.reserve_in_usd ?? "0") || 0;
      return reserve >= bestReserve ? p : best;
    }, pools[0]);

    const attrs = mainPool?.attributes ?? {};
    const liquidity = parseFloat(attrs.reserve_in_usd ?? "0") || 0;
    const volumeUsdRaw = attrs.volume_usd;
    const volume24h = typeof volumeUsdRaw === "string"
      ? parseFloat(volumeUsdRaw) || 0
      : parseFloat(volumeUsdRaw?.h24 ?? "0") || 0;
    const marketCap = parseFloat(attrs.fdv_usd ?? "0") || 0;
    const priceChange24h = parseFloat(attrs.price_change_percentage?.h24 ?? "0") || 0;

    // GeckoTerminal may not expose buy/sell counts; use 0 to avoid false ratios
    const buys24h = 0;
    const sells24h = 0;
    const buySellRatio = 1;
    const washTradeScore = liquidity > 0 ? volume24h / liquidity : 0;
    const liquidityRatio = marketCap > 0 ? (liquidity / marketCap) * 100 : 0;

    const { level: botActivity, anomalies } = detectBotActivity(
      liquidityRatio,
      buySellRatio,
      washTradeScore
    );

    const pairCreatedAt = attrs.created_at ? new Date(attrs.created_at).getTime() : 0;
    const ageInHours = pairCreatedAt > 0
      ? Math.max(0, (Date.now() - pairCreatedAt) / (1000 * 60 * 60))
      : 0;

    console.log(`[Market Watcher] 🔍 Bot Activity: ${botActivity} | Liquidity: $${liquidity.toLocaleString()} | Volume 24h: $${volume24h.toLocaleString()}`);

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
    console.error("[Market Watcher] Failed to fetch GeckoTerminal data:", error);
    return null;
  }
}
