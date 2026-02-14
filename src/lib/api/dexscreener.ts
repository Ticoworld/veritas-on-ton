/**
 * DexScreener API Client
 * Used to fetch token social links (Website, Twitter, Telegram).
 * TODO: Replace with TON API - use DexScreener TON chain or TON-specific data source when available.
 */

import type { TokenSocials } from "@/types";

interface DexScreenerPair {
  baseToken?: {
    name: string;
    symbol: string;
  };
  info?: {
    imageUrl?: string;
    websites?: Array<{ label: string; url: string }>;
    socials?: Array<{ type: string; url: string }>;
  };
}

interface DexScreenerResponse {
  pairs?: DexScreenerPair[];
}

/**
 * Fetch social links for a token address from DexScreener
 * @param address Token mint address
 */
export async function getTokenSocials(address: string): Promise<TokenSocials> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
    
    if (!response.ok) {
      console.warn("[DexScreener] Failed to fetch token data:", response.status);
      return {};
    }

    const data = (await response.json()) as DexScreenerResponse;
    
    if (!data.pairs || data.pairs.length === 0) {
      return {};
    }

    const pair = data.pairs[0];
    const info = pair.info || {};
    const socials: TokenSocials = {};

    // Basic Info
    if (pair.baseToken) {
      socials.name = pair.baseToken.name;
      socials.symbol = pair.baseToken.symbol;
    }
    if (info.imageUrl) {
      socials.imageUrl = info.imageUrl;
    }

    // Parse websites
    if (info.websites) {
      const mainWeb = info.websites.find(w => w.label.toLowerCase().includes("web") || w.label.toLowerCase() === "website");
      if (mainWeb) {
        socials.website = mainWeb.url;
      } else if (info.websites.length > 0) {
         // Fallback to first website if no specific label match
         socials.website = info.websites[0].url;
      }
    }

    // Parse socials
    if (info.socials) {
      const twitter = info.socials.find(s => s.type === "twitter");
      if (twitter) socials.twitter = twitter.url;

      const telegram = info.socials.find(s => s.type === "telegram");
      if (telegram) socials.telegram = telegram.url;

      const discord = info.socials.find(s => s.type === "discord");
      if (discord) socials.discord = discord.url;
    }

    return socials;

  } catch (error) {
    console.error("[DexScreener] Error fetching socials:", error);
    return {};
  }
}
