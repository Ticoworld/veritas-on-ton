/**
 * POST /api/analyze-unified
 * Main investigation route for the Mini App.
 */

import { NextRequest, NextResponse } from "next/server";
import { VeritasInvestigator } from "@/lib/services/VeritasInvestigator";
import { parseAndNormalizeTonAddress } from "@/lib/ton-address";
import {
  checkRateLimit,
  RateLimitExceededError,
} from "@/lib/security/RateLimiter";
import { validateTelegramData } from "@/lib/security/telegram";

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const real = request.headers.get("x-real-ip");
  return forwarded?.split(",")[0]?.trim() || real || "unknown";
}

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

    checkRateLimit(getClientIp(request));

    const body = await request.json();
    const { address, website: websiteOverride } = body as {
      address?: string;
      website?: string;
    };

    if (!address || typeof address !== "string") {
      return NextResponse.json(
        { success: false, error: "Token address is required" },
        { status: 400 },
      );
    }

    const normalizedAddress = parseAndNormalizeTonAddress(address.trim());
    if (!normalizedAddress) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid TON address. Send the jetton contract address in TON-friendly format (base64).",
        },
        { status: 400 },
      );
    }

    console.log(
      `[Unified API] Investigation request for ${normalizedAddress.slice(0, 8)}...`,
    );

    const investigator = new VeritasInvestigator();
    const result = await investigator.investigate(normalizedAddress, {
      websiteOverride:
        typeof websiteOverride === "string" && websiteOverride.trim()
          ? websiteOverride.trim()
          : undefined,
    });

    return NextResponse.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return NextResponse.json(
        { success: false, error: error.message },
        {
          status: 429,
          headers: { "Retry-After": String(error.retryAfterSeconds) },
        },
      );
    }

    console.error("[Unified API] Investigation error:", error);
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
