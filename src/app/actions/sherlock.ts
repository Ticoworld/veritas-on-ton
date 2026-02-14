"use server";

import { runDeepInvestigation, type SherlockReport } from "@/lib/ai/analyst";
import { type TokenData } from "@/types";

/**
 * Server Action to trigger Sherlock's Deep Investigation
 * This runs on the server, so it has access to the GEMINI_API_KEY.
 */
export async function investigateToken(
  tokenData: TokenData,
  websiteUrl: string,
  twitterUrl?: string,
  websiteText?: string
): Promise<SherlockReport | null> {
  try {
    console.log(`[Sherlock Action] requesting investigation for ${tokenData.symbol}`);
    
    const report = await runDeepInvestigation(
      tokenData,
      websiteUrl,
      twitterUrl,
      websiteText
    );
    
    return report;
  } catch (error) {
    console.error("[Sherlock Action] Failed:", error);
    return null;
  }
}
