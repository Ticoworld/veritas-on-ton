/**
 * Veritas Unified Analyzer v2.0
 * Single call to Gemini with URL Context + Google Search grounding
 * Replaces the two-phase Scanner + Sherlock flow
 */

import {
  createPartFromBase64,
  PartMediaResolutionLevel,
  ThinkingLevel,
} from "@google/genai";
import { getGeminiClient, isGeminiAvailable } from "@/lib/gemini";
import type { Claim, ClaimType, VerificationStatus } from "@/lib/claims";

export type { Claim, ClaimType, VerificationStatus };

/**
 * Complete analysis result - unified verdict
 */
export interface UnifiedAnalysisResult {
  // Core Verdict
  trustScore: number; // 0-100, where 100 is safest
  verdict: "Safe" | "Caution" | "Danger";
  summary: string;

  // Sherlock-style profiling
  criminalProfile: string;

  // Evidence and reasoning
  lies: string[];      // False claims found
  evidence: string[];  // Key findings
  analysis: string[];  // Security check results

  // Structured claims (Phase 1: trust investigation)
  claims: Claim[];

  // Visual analysis (if screenshot provided)
  visualAnalysis?: string;

  // Short professional assessment (no slang, no emojis)
  degenComment: string;

  // Metadata
  urlsAnalyzed?: string[];

  /** Thought summary from Gemini (includeThoughts: true) — reasoning trace for UI */
  thoughtSummary?: string;
}

/**
 * Input data for unified analysis
 */
export interface UnifiedAnalysisInput {
  // Token info
  tokenName: string;
  tokenSymbol: string;
  tokenAddress: string;
  
  // On-chain security data
  mintAuth: string | null;
  freezeAuth: string | null;
  top10Percentage: number;
  creatorPercentage?: number;
  isDumped?: boolean;
  isWhale?: boolean;
  
  // URLs to analyze
  websiteUrl?: string;
  twitterUrl?: string;
  
  // Market data
  marketData?: {
    liquidity: number;
    volume24h: number;
    marketCap: number;
    buySellRatio: number;
    ageInHours: number;
  };
  
  // Screenshot for vision analysis (project website only)
  websiteScreenshot?: { base64: string; mimeType: string };

  /** Injected when no website URL — critical risk flag for Gemini */
  missingWebsiteFlag?: string;
}

/**
 * Build the unified investigation prompt
 * PRIORITY: Vision analysis of screenshot > On-chain facts > Market data
 */
function buildUnifiedPrompt(data: UnifiedAnalysisInput, hasScreenshot: boolean): string {
  let creatorStatus = "Unknown";
  if (data.isDumped) {
    creatorStatus = "DEV SOLD ALL — dumped tokens";
  } else if (data.isWhale) {
    creatorStatus = `WHALE — dev holds ${data.creatorPercentage?.toFixed(1)}%`;
  } else if (data.creatorPercentage !== undefined) {
    creatorStatus = `Holding ${data.creatorPercentage.toFixed(2)}%`;
  }

  const ageHours = data.marketData?.ageInHours ?? 0;
  const ageDisplay = ageHours >= 48
    ? `${Math.floor(ageHours / 24)} days old`
    : ageHours >= 1
    ? `${Math.floor(ageHours)} hours old`
    : "brand new (<1h)";

  const marketSection = data.marketData ? `
## MARKET DATA
- Liquidity: $${data.marketData.liquidity.toLocaleString()}
- 24h Volume: $${data.marketData.volume24h.toLocaleString()}
- Market Cap: $${data.marketData.marketCap.toLocaleString()}
- Buy/Sell Ratio: ${data.marketData.buySellRatio.toFixed(2)}:1
- Age: ${ageDisplay}
` : '';

  // Vision instructions — forensic output only; no page-structure narration
  const visionInstructions = hasScreenshot ? `
## VISUAL FORENSICS (PRIMARY)
I have attached ONE screenshot (the project website). Use the image to assess visual trust signals only.

DO NOT narrate page structure (e.g. "header, hero, footer"). Output ONLY decision-relevant findings.

In visualAnalysis you MUST:
1. State exactly: "VISUAL ASSET REUSE: YES" or "VISUAL ASSET REUSE: NO".
2. In 1-3 short sentences, give forensic meaning only:
   - If NO: e.g. "No major visual deception detected. Branding appears original in this scan." or "No suspicious trust-badge or partner-claim reuse observed."
   - If YES: what was detected (e.g. template match to known scam layouts, fake partnership logos, recycled branding).
   - If unclear: "Visual analysis inconclusive; asset reuse could not be determined."
3. Meme culture imagery (Pepe, Wojak, Doge, community art) = NEUTRAL. Do not treat as scam signal.
` : '';

  const noScreenshotInstructions = !hasScreenshot ? `
## NO SCREENSHOT — TEXT-ONLY ANALYSIS
Screenshot capture failed or no real website URL was found. You have NO image data.
- Do NOT describe, infer, or hallucinate any visual content.
- Leave visualAnalysis as an empty string — the system will handle it.
` : '';

  const missingWebsiteFlagSection = data.missingWebsiteFlag ? `
## CRITICAL RISK FLAG (AUTO-INJECTED)
**${data.missingWebsiteFlag}**
` : '';

  const investigationSteps = hasScreenshot ? `
# INVESTIGATION STEPS

## Step 1: VISION ANALYSIS (PRIMARY)
Assess the screenshot for template reuse and deceptive visuals only. Do not narrate layout.
Cross-check: if the site claims "renounced" or contract address, does on-chain confirm? Lies = claims that contradict on-chain facts.

## Step 2: GOOGLE SEARCH (OPTIONAL)
Search "${data.tokenName} TON scam" or "rugpull" if useful.
` : `
# INVESTIGATION STEPS (TEXT-ONLY — NO SCREENSHOT)

## Step 1: METADATA ANALYSIS (ONLY SOURCE)
Use ONLY the on-chain and market data above. Do NOT claim to have seen any website.
Leave visualAnalysis empty.

## Step 2: GOOGLE SEARCH (OPTIONAL)
Search "${data.tokenName} TON scam" or "rugpull" if useful.
`;

  return `
You are VERITAS — a security-focused analyst for TON tokens. Use evidence-based language only. No hype, no slang, no emojis.

YOUR MINDSET:
- Reserve strong warnings for actual red flags: scam templates, fake websites, honeypot patterns, coordinated dumps.
- Clean contract and reasonable distribution = state so. Do not manufacture risk when data is clean.
- Do not overclaim. Matching a website does not "confirm" legitimacy — it can "support a lower-risk assessment" or "is consistent with the project's official presence in this scan." Never say that visual or website match "proves" or "confirms" safety.

# TOKEN UNDER INVESTIGATION
- Name: ${data.tokenName} (${data.tokenSymbol})
- Contract: ${data.tokenAddress}

## ON-CHAIN FACTS (GROUND TRUTH)
- Mint Authority: ${data.mintAuth ? "ENABLED (supply can be changed)" : "Disabled (renounced)"}
- Freeze Authority: ${data.freezeAuth ? "ENABLED (holder balances can be frozen)" : "Disabled (renounced)"}
- Top 10 Holders: ${data.top10Percentage.toFixed(2)}% ${data.top10Percentage > 50 ? "(high concentration)" : ""}
- Creator: ${creatorStatus}
${marketSection}
${visionInstructions}
${noScreenshotInstructions}
${missingWebsiteFlagSection}
${data.websiteUrl ? `Website: ${data.websiteUrl}` : 'No website (high risk flag for TON)'}
${data.twitterUrl ? `Twitter/X: ${data.twitterUrl}` : ''}
${investigationSteps}

# CLAIMS EXTRACTION (REQUIRED)
Extract website trust claims into a structured "claims" array. For each claim found on the site or in the screenshot, add one object.
Claim types (use exactly): audit | partner | sponsor | ecosystem | renounced | listing
Verification status (use exactly): verified | unverified | contradicted | unknown
- verified: you found independent support (e.g. audit report, official listing, on-chain matches).
- unverified: claim is present but no independent support found in this scan (do NOT use "fake" or "fraudulent").
- contradicted: claim is directly contradicted by on-chain data or a reliable source (e.g. "renounced" but mint/freeze enabled).
- unknown: could not determine (e.g. no search result, ambiguous).
Do not overclaim. If evidence is weak, use unverified or unknown. For "renounced" / "immutable" / "safe contract" claims, set status based on ON-CHAIN FACTS above (mint/freeze). For audit/partner/sponsor/ecosystem/listing, use Google Search or URL context when helpful; if no public support found, mark unverified.

# OUTPUT FORMAT — Respond with ONLY this JSON:
{
  "trustScore": <0-100>,
  "verdict": "<Safe | Caution | Danger>",
  "summary": "<2 sentences max. Professional, evidence-based. Do not overclaim. Website match can support lower-risk assessment but does not prove safety.>",
  "criminalProfile": "<Max 8 words. e.g. 'Template launcher' or 'Clean contract, no red flags'>",
  "lies": ["<Specific lie found>", "<Another if any>"],
  "evidence": ["<Key finding 1>", "<Key finding 2>", "<Key finding 3>"],
  "analysis": ["<Security check>", "<Market read>", "<Website assessment>"],
  "claims": [
    { "type": "<audit|partner|sponsor|ecosystem|renounced|listing>", "rawClaim": "<short claim text>", "sourceContext": "<optional>", "verificationStatus": "<verified|unverified|contradicted|unknown>", "evidence": "<short reason>" }
  ],
  "visualAnalysis": "${hasScreenshot ? "MANDATORY: Start with 'VISUAL ASSET REUSE: YES' or 'VISUAL ASSET REUSE: NO'. Then 1-3 short forensic sentences only (no page-structure narration)." : ""}",
  "degenComment": "<One short, security-grade takeaway. Concise. No slang, no emojis, no hype. E.g. 'On-chain and visual checks support a lower-risk read; other risks remain outside this scan.' or 'Multiple risk factors; treat as high risk.'>"
}

# SCORING RULES (trustScore must respect these caps)
- Mint/Freeze ENABLED = Max 30
- Creator DUMPED ALL = Max 45
- Template/scam website = Max 50
- VISUAL ASSET REUSE detected (non-meme culture) = trustScore -25
- Meme culture reuse (Pepe, Wojak, Doge, iconic meme imagery) = NEUTRAL, does not lower score
- Clean on-chain + no website = 55-70 (Caution — not enough info for Safe)
- Clean on-chain + legit website = 70-88
- Don't score above 88 for ANY meme coin.
- CRITICAL RISK FLAG "No Website Detected" = Max 30, verdict MUST be Danger.

# LIES FIELD RULES
- Only list ACTUAL lies (website claims vs on-chain reality).
- If you found NO lies, return ["None identified"].
- Do NOT manufacture lies. Clean token = say so.

# CLAIMS ARRAY RULES
- If no trust claims are visible on the site, return "claims": [].
- Each claim must have type, rawClaim, verificationStatus, evidence. sourceContext is optional.
- Use only the verification statuses above. Never use "fake", "fraudulent", or "scam" in verificationStatus or evidence.
`;
}

const CLAIM_TYPES_SET = new Set<string>(["audit", "partner", "sponsor", "ecosystem", "renounced", "listing"]);
const STATUS_SET = new Set<string>(["verified", "unverified", "contradicted", "unknown"]);

function parseClaims(raw: unknown): Claim[] {
  if (!Array.isArray(raw)) return [];
  const out: Claim[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const type = String((item as { type?: string }).type ?? "").toLowerCase().trim();
    const verificationStatus = String((item as { verificationStatus?: string }).verificationStatus ?? "unknown").toLowerCase().trim();
    const rawClaim = String((item as { rawClaim?: string }).rawClaim ?? "").trim();
    const evidence = String((item as { evidence?: string }).evidence ?? "").trim();
    if (!rawClaim || !CLAIM_TYPES_SET.has(type)) continue;
    out.push({
      type: type as ClaimType,
      rawClaim,
      sourceContext: typeof (item as { sourceContext?: string }).sourceContext === "string" ? (item as { sourceContext: string }).sourceContext.trim() || undefined : undefined,
      verificationStatus: STATUS_SET.has(verificationStatus) ? (verificationStatus as VerificationStatus) : "unknown",
      evidence: evidence || "No evidence provided.",
    });
  }
  return out;
}

/**
 * Parse the AI response into structured result
 * Handles cases where Gemini includes text before/after JSON
 */
function parseUnifiedResponse(text: string): UnifiedAnalysisResult | null {
  try {
    let jsonString = text.trim();

    // Try to find JSON block in markdown code fence
    const jsonBlockMatch = jsonString.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      jsonString = jsonBlockMatch[1].trim();
    } else {
      // Try to find JSON object directly (from first { to last })
      const firstBrace = jsonString.indexOf('{');
      const lastBrace = jsonString.lastIndexOf('}');

      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonString = jsonString.slice(firstBrace, lastBrace + 1);
      }
    }

    const parsed = JSON.parse(jsonString);

    return {
      trustScore: Math.min(100, Math.max(0, Number(parsed.trustScore) || 50)),
      verdict: parsed.verdict || "Caution",
      summary: parsed.summary || "Analysis complete.",
      criminalProfile: parsed.criminalProfile || "Unknown Entity",
      lies: Array.isArray(parsed.lies) ? parsed.lies : [],
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
      analysis: Array.isArray(parsed.analysis) ? parsed.analysis : [],
      claims: parseClaims(parsed.claims),
      visualAnalysis: parsed.visualAnalysis,
      degenComment: parsed.degenComment || "Assessment complete. Other risks remain outside this scan.",
    };
  } catch (error) {
    console.error("[Unified Analyzer] Failed to parse response:", error);
    console.error("[Unified Analyzer] Raw text:", text.slice(0, 500));
    return null;
  }
}

/**
 * Run unified analysis with URL Context + Google Search
 * This is the new single-call approach
 */
export async function runUnifiedAnalysis(
  data: UnifiedAnalysisInput
): Promise<UnifiedAnalysisResult | null> {
  if (!isGeminiAvailable()) {
    console.error("[Unified Analyzer] Gemini API key not configured");
    return null;
  }

  const ai = getGeminiClient();
  if (!ai) return null;

  console.log(`[Unified Analyzer] 🕵️ Starting investigation for ${data.tokenName}...`);
  console.log(`[Unified Analyzer] URLs: Website=${data.websiteUrl || 'none'}, Twitter=${data.twitterUrl || 'none'}`);

  const hasScreenshot = !!data.websiteScreenshot;
  const prompt = buildUnifiedPrompt(data, hasScreenshot);
  
  // Build content parts — text first, then website screenshot only
  const contentParts: any[] = [{ text: prompt }];
  
  if (data.websiteScreenshot) {
    console.log("[Unified Analyzer] 📸 Including WEBSITE screenshot (media_resolution: medium)");
    contentParts.push(
      createPartFromBase64(
        data.websiteScreenshot.base64,
        data.websiteScreenshot.mimeType,
        PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM
      )
    );
  }

  try {
    console.log("[Unified Analyzer] 🔍 Calling Gemini (thinking: medium, includeThoughts) + URL Context + Google Search...");
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: contentParts }],
      config: {
        temperature: 0,
        tools: [
          { urlContext: {} },
          { googleSearch: {} },
        ],
        thinkingConfig: {
          includeThoughts: true,
          thinkingLevel: ThinkingLevel.LOW,
        },
      },
    });
    
    // Split thought summary vs main answer (for JSON parsing + Reasoning Trace UI)
    let mainText = "";
    let thoughtSummary = "";
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      const t = (part as { text?: string; thought?: boolean }).text ?? "";
      if (!t) continue;
      if ((part as { thought?: boolean }).thought) {
        thoughtSummary += t;
      } else {
        mainText += t;
      }
    }
    if (!mainText && response.text) mainText = response.text;
    
    console.log("[Unified Analyzer] ✅ Response received, parsing...");
    if (thoughtSummary) {
      console.log("[Unified Analyzer] 🧠 Thought summary captured for Reasoning Trace");
    }
    
    if (response.candidates?.[0]?.urlContextMetadata) {
      console.log("[Unified Analyzer] 🌐 URLs analyzed:", response.candidates[0].urlContextMetadata);
    }
    
    const result = parseUnifiedResponse(mainText);
    if (result) {
      result.thoughtSummary = thoughtSummary || undefined;
      console.log(`[Unified Analyzer] 🎯 Verdict: ${result.verdict} (Trust: ${result.trustScore})`);
      console.log(`[Unified Analyzer] 👤 Profile: ${result.criminalProfile}`);
    }

    return result;
  } catch (error) {
    console.error("[Unified Analyzer] ❌ Analysis failed:", error);
    return null;
  }
}
