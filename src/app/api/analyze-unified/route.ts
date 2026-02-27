/**
 * VERITAS UNIFIED API - Single Entry Point
 *
 * POST /api/analyze-unified
 *
 * Grand Unification: Replaces /api/scan and /api/analyze
 * Uses the VeritasInvestigator service for complete flow:
 * - Elephant Memory check
 * - Full data pipeline
 * - AI analysis (Sherlock)
 * - Scammer flagging
 */

import { NextRequest, NextResponse } from "next/server";
import { VeritasInvestigator } from "@/lib/services/VeritasInvestigator";
import {
  checkRateLimit,
  RateLimitExceededError,
} from "@/lib/security/RateLimiter";

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const real = request.headers.get("x-real-ip");
  const ip = forwarded?.split(",")[0]?.trim() || real || "unknown";
  return ip;
}

export async function POST(request: NextRequest) {
  try {
    // ═══════════════════════════════════════════════════════════════════
    // RATE LIMIT (The Bouncer) - before any work
    // ═══════════════════════════════════════════════════════════════════
    const ip = getClientIp(request);
    checkRateLimit(ip);

    const body = await request.json();
    const { address } = body;

    if (!address || typeof address !== "string") {
      return NextResponse.json(
        { success: false, error: "Token address is required" },
        { status: 400 },
      );
    }

    // ═══════════════════════════════════════════════════════════════════
    // ADDRESS FORMAT GUARD — stops garbage before it hits TonAPI / Gemini
    // TON user-friendly addresses are 36 bytes → 48 base64 chars (no padding).
    // Both standard base64 (+/) and URL-safe base64 (-_) are valid per TON spec.
    // ═══════════════════════════════════════════════════════════════════
    const TON_ADDRESS_REGEX = /^[a-zA-Z0-9_\-+/]{48}$/;
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

    console.log(
      `[Unified API] 🚀 Investigation request for ${address.slice(0, 8)}...`,
    );

    // ═══════════════════════════════════════════════════════════════════
    // GRAND UNIFICATION: Single Service Orchestrates Everything
    // ═══════════════════════════════════════════════════════════════════
    const investigator = new VeritasInvestigator();
    const result = await investigator.investigate(address);

    // Return standardized response
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

    console.error("[Unified API] ❌ Investigation error:", error);

    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
