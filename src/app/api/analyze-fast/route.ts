/**
 * VERITAS FAST API - On-chain + market only (progressive UI)
 *
 * POST /api/analyze-fast
 * Lightweight: getTokenInfo + getMarketAnalysis in parallel.
 * Same Telegram initData validation as /api/analyze-unified.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTokenInfo } from "@/lib/blockchain";
import { getMarketAnalysis } from "@/lib/api/market";
import { validateTelegramData } from "@/lib/security/telegram";

const TON_ADDRESS_REGEX = /^[a-zA-Z0-9_\-+/]{48}$/;

export async function POST(request: NextRequest) {
  try {
    const initData = request.headers.get("x-telegram-init-data");
    if (initData === null || initData === undefined) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }
    const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
    if (!validateTelegramData(initData, botToken)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { address } = body;

    if (!address || typeof address !== "string") {
      return NextResponse.json(
        { success: false, error: "Token address is required" },
        { status: 400 },
      );
    }

    if (!TON_ADDRESS_REGEX.test(address.trim())) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid TON Address Format. A valid TON address is exactly 48 characters (base64).",
        },
        { status: 400 },
      );
    }

    const [tokenInfo, market] = await Promise.all([
      getTokenInfo(address.trim()),
      getMarketAnalysis(address.trim()),
    ]);

    const supply = Number(tokenInfo.supply) / Math.pow(10, tokenInfo.decimals || 0);

    return NextResponse.json({
      success: true,
      data: {
        tokenAddress: address.trim(),
        tokenInfo: {
          decimals: tokenInfo.decimals,
          supply: tokenInfo.supply,
          mintAuthority: tokenInfo.mintAuthority,
          freezeAuthority: tokenInfo.freezeAuthority,
        },
        supply,
        market: market
          ? {
              liquidity: market.liquidity,
              volume24h: market.volume24h,
              marketCap: market.marketCap,
              buySellRatio: market.buySellRatio,
              ageInHours: market.ageInHours,
              botActivity: market.botActivity,
              anomalies: market.anomalies,
            }
          : null,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Analyze Fast] Error:", error);
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
