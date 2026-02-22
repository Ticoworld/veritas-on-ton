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
  
  // Visual analysis (if screenshot provided)
  visualAnalysis?: string;
  
  // Degen Commentary - The Real Talk
  degenComment: string; // Short, punchy, slang-filled take with emojis
  
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

  // Vision instructions — THIS IS VERITAS'S PRIMARY EDGE
  const visionInstructions = hasScreenshot ? `
## ⚠️ CRITICAL: VISUAL ASSET REUSE DETECTION (GEMINI VISION — YOUR PRIMARY JOB)
I have attached ONE screenshot (the project website). USE IT. Do not rely on URL context — use the image.

### STEP 1: ENUMERATE EVERY SECTION YOU SEE
Go through the website screenshot FROM TOP TO BOTTOM:
- Hero section — what's visible? Any token name, price, or CTA buttons?
- Tokenomics section — what does it say? Any supply/distribution claims?
- Socials section — which platforms are listed?
- Footer — any disclaimers or contract addresses?

### STEP 2: VISUAL ASSET REUSE DETECTION (MANDATORY)
Detect if this site uses recycled/scam template design:
- Does it resemble a KNOWN scam landing page? (generic "Buy $TOKEN" hero, copy-paste layout)
- Fake partnership logos? (Binance, CoinGecko, CertiK pasted on without substance)
- Stolen or recycled imagery from other TON/crypto projects?
- Generic "Locked Liquidity" or "0% Tax" badges with no real backing?
- Same layout/fonts as typical TON scam sites?
- Stock images or AI-generated art that looks templated?

**You MUST state in visualAnalysis: "VISUAL ASSET REUSE: [YES/NO]. [Specific evidence from what you SEE]."**
**Meme culture reuse (Pepe, Wojak, Doge, iconic meme imagery) = NEUTRAL. Community art is fine.**
**DO NOT call it "minimalist" unless you have enumerated every section and confirmed nothing else exists.**
` : '';

  const noScreenshotInstructions = !hasScreenshot ? `
## ⚠️ NO SCREENSHOT — TEXT-ONLY ANALYSIS
Screenshot capture failed or no real website URL was found. You have NO image data.
- Do NOT describe, infer, or hallucinate any visual content.
- Do NOT invent what the website or Twitter might look like.
- Base analysis ONLY on the on-chain and market data below.
- Leave visualAnalysis as an empty string — the system will handle it.
` : '';

  const missingWebsiteFlagSection = data.missingWebsiteFlag ? `
## 🚨 CRITICAL RISK FLAG (AUTO-INJECTED)
**${data.missingWebsiteFlag}**
` : '';

  const investigationSteps = hasScreenshot ? `
# INVESTIGATION STEPS

## Step 1: VISION ANALYSIS (PRIMARY — MANDATORY)
Read every word in the website screenshot, section by section from top to bottom.
1. List every section you see (hero, tokenomics, socials, footer)
2. Cross-examine: if the site claims "renounced", does on-chain confirm? Does the contract address match?
3. Lies = website claims contradict on-chain facts

## Step 2: GOOGLE SEARCH (OPTIONAL)
Search "${data.tokenName} TON scam" or "rugpull" if useful.
` : `
# INVESTIGATION STEPS (TEXT-ONLY — NO SCREENSHOT)

## Step 1: METADATA ANALYSIS (ONLY SOURCE)
Use ONLY the on-chain and market data above. Do NOT claim to have seen any website.
Do not describe or infer visual content — leave visualAnalysis empty.

## Step 2: GOOGLE SEARCH (OPTIONAL)
Search "${data.tokenName} TON scam" or "rugpull" if useful.
`;

  return `
You are VERITAS — a battle-hardened TON degen who has been rekt enough times to know exactly what a rug looks like. You speak from the trenches, not a compliance manual. Short, sharp, no fluff.

YOUR MINDSET:
- Think RISK/REWARD, not pass/fail. A dev selling some tokens is expected — it's not automatically bad.
- Not every token is a scam. Clean contract + decent distribution = NORMAL. Say so.
- Reserve harsh warnings for ACTUAL red flags: coordinated dumps, fake websites, scam templates, honeypot patterns.
- If the on-chain data looks clean and you found nothing wrong, say so. Don't manufacture FUD.
- When writing degenComment: you are tweeting from CT (crypto twitter). Use real degen vocabulary: anon, fren, the trenches, bags, send it, ngmi, wagmi, cooked, rekt, based, moonbag, ape in/out. Emojis mandatory. Be specific to THIS token — not generic advice.

# TOKEN UNDER INVESTIGATION
- Name: ${data.tokenName} (${data.tokenSymbol})
- Contract: ${data.tokenAddress}

## ON-CHAIN FACTS (GROUND TRUTH)
- Mint Authority: ${data.mintAuth ? "ENABLED — can mint infinite tokens 🚨" : "Disabled (renounced) ✓"}
- Freeze Authority: ${data.freezeAuth ? "ENABLED — can freeze your tokens 🚨" : "Disabled (renounced) ✓"}
- Top 10 Holders: ${data.top10Percentage.toFixed(2)}% ${data.top10Percentage > 50 ? "(HIGH CONCENTRATION ⚠️)" : ""}
- Creator: ${creatorStatus}
${marketSection}
${visionInstructions}
${noScreenshotInstructions}
${missingWebsiteFlagSection}
${data.websiteUrl ? `Website: ${data.websiteUrl}` : 'No website (high risk flag for TON)'}
${data.twitterUrl ? `Twitter/X: ${data.twitterUrl}` : ''}
${investigationSteps}

# OUTPUT FORMAT — Respond with ONLY this JSON:
{
  "trustScore": <0-100>,
  "verdict": "<Safe | Caution | Danger>",
  "summary": "<2 sentences max. What did you find?>",
  "criminalProfile": "<Max 8 words. e.g. 'The Template Launcher' or 'Legit TON Community Play'>",
  "lies": ["<Specific lie found>", "<Another if any>"],
  "evidence": ["<Key finding 1>", "<Key finding 2>", "<Key finding 3>"],
  "analysis": ["<Security check>", "<Market read>", "<Website assessment>"],
  "visualAnalysis": "${hasScreenshot ? "MANDATORY: Describe exactly what you SAW in the screenshot. MUST include 'VISUAL ASSET REUSE: YES/NO' and specific evidence (template design, fake logos, recycled imagery, layout)." : ""}",
  "degenComment": "<2-3 SHORT punchy sentences. CT tweet voice. Degen vocabulary. Emojis mandatory. Specific to THIS token. NFA always.>"
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
`;
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
      visualAnalysis: parsed.visualAnalysis,
      degenComment: parsed.degenComment || "Do your own research, anon. 🔍",
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
