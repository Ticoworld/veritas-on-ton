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
  };
  
  // Screenshots for vision analysis (PRIMARY evidence source)
  websiteScreenshot?: { base64: string; mimeType: string };
  twitterScreenshot?: { base64: string; mimeType: string };

  // Pump.fun context (mint ends with "pump")
  isPumpFun?: boolean;
}

/**
 * Build the unified investigation prompt
 * PRIORITY: Vision analysis of screenshot > URL Context > Google Search
 */
function buildUnifiedPrompt(data: UnifiedAnalysisInput, hasScreenshot: boolean): string {
  // Build creator status
  let creatorStatus = "Unknown";
  if (data.isDumped) {
    creatorStatus = "⚠️ DEV SOLD ALL - Creator dumped tokens";
  } else if (data.isWhale) {
    creatorStatus = `⚠️ WHALE - Creator holds ${data.creatorPercentage?.toFixed(1)}% (centralization risk)`;
  } else if (data.creatorPercentage !== undefined) {
    creatorStatus = `Holding ${data.creatorPercentage.toFixed(2)}% of supply`;
  }

  // Build market data section
  const marketSection = data.marketData ? `
## MARKET DATA
- Liquidity: $${data.marketData.liquidity.toLocaleString()}
- 24h Volume: $${data.marketData.volume24h.toLocaleString()}
- Market Cap: $${data.marketData.marketCap.toLocaleString()}
- Buy/Sell Ratio: ${data.marketData.buySellRatio.toFixed(2)}:1
` : '';

  const pumpFunSection = data.isPumpFun ? `
## 🟢 PUMP.FUN TOKEN (Standard bonding-curve contract)
This mint ends in "pump" — it is a **Pump.fun launch**. The contract is the same standardized bonding-curve for all Pump.fun tokens.
- **Assume contract safety is HIGH.** Do not flag "honeypot" or generic contract risks.
- **Focus ~90% of your analysis on:** Dev holdings (did they dump?), top-holder concentration, bundle/sniper patterns, and social vibes.
- Low-effort websites are common for meme coins; judge memes by community and distribution, not by "professional" site quality.
` : '';

  // Vision instructions - CRITICAL for when URL Context fails
  // TIER S FEATURE: Visual Asset Reuse Detection via Gemini Vision
  const visionInstructions = hasScreenshot ? `
## ⚠️ CRITICAL: VISUAL ASSET REUSE DETECTION (TIER S - GEMINI VISION)
I have attached up to TWO screenshots. URL Context will FAIL - ignore that. USE THE SCREENSHOTS.
**YOU ARE PERFORMING COMPUTER VISION ANALYSIS.** Your visualAnalysis field proves Gemini actually saw and analyzed the images.

### STEP 1: ENUMERATE EVERY SECTION YOU SEE
Go through the website screenshot FROM TOP TO BOTTOM and list out EVERY section:
- What's at the top (hero)?
- Scroll down - is there a TOKENOMICS section? What text is there?
- Is there a SOCIALS section? List all social links you see
- Is there a footer? Any disclaimers?

### STEP 2: VISUAL ASSET REUSE DETECTION (MANDATORY)
**Detect if this site uses recycled/scam template design:**
- Does it resemble a KNOWN scam landing page? (e.g. generic "Buy $TOKEN" hero, copy-paste layout)
- Are there FAKE partnership logos? (Binance, CoinGecko, CertiK, etc. that look pasted on)
- Does the imagery look STOLEN or recycled from other projects?
- Generic "Locked Liquidity" or "0% Tax" badges with no substance?
- Same layout/colors/fonts as typical pump.fun scam sites?
- Stock images or AI-generated art that looks templated?
**State explicitly in visualAnalysis: "VISUAL ASSET REUSE: [YES/NO]. [Specific evidence from what you SEE in the screenshot]."**

### STEP 3: READ THE TWITTER SCREENSHOT  
- Account name, bio, verified status
- Follower/following count
- Join date
- Pinned tweet content

**DO NOT SUMMARIZE AS "MINIMALIST" UNLESS YOU HAVE ENUMERATED EVERY SECTION AND CONFIRMED THERE IS NOTHING BELOW THE HERO.**
` : '';

  return `
You are **VERITAS**, a forensic crypto investigator who combines the deductive reasoning of Sherlock Holmes with the street smarts of a veteran degen who has survived 1,000 rug pulls.

Your dual nature:
- **ANALYZE like a scientist:** Use logic, cross-examination, and forensic evidence to find lies and contradictions.
- **SPEAK like a degen:** Give your final commentary in short, punchy sentences with slang and emojis. Keep it real.

Your mission: Investigate this token and **FIND LIES, CONTRADICTIONS, and RED FLAGS**.

# TOKEN UNDER INVESTIGATION
- Name: ${data.tokenName} (${data.tokenSymbol})
- Contract: ${data.tokenAddress}

## ON-CHAIN EVIDENCE (VERIFIED FACTS - THESE ARE GROUND TRUTH)
- Mint Authority: ${data.mintAuth ? "🚨 ENABLED - Creator can mint infinite tokens!" : "✅ Disabled (renounced)"}
- Freeze Authority: ${data.freezeAuth ? "🚨 ENABLED - Creator can freeze your tokens!" : "✅ Disabled (renounced)"}
- Top 10 Holders: ${data.top10Percentage.toFixed(2)}% of supply ${data.top10Percentage > 50 ? "⚠️ HIGH CONCENTRATION" : ""}
- Creator Status: ${creatorStatus}
${marketSection}
${pumpFunSection}
${visionInstructions}

## WEBSITES (URLs provided, but they will likely fail - USE SCREENSHOTS)
${data.websiteUrl ? `- Project Website: ${data.websiteUrl}` : '- No website provided (RED FLAG)'}
${data.twitterUrl ? `- Twitter/X: ${data.twitterUrl}` : '- No Twitter provided'}

# INVESTIGATION STEPS

## Step 1: VISION ANALYSIS (PRIMARY - MANDATORY)
**READ EVERY WORD IN THE SCREENSHOTS.**
For the WEBSITE screenshot, go section by section from top to bottom:
1. Hero section - what's visible?
2. **Scroll down mentally** - is there a section titled "TOKENOMICS"? If yes, what does it say?
3. Is there a section titled "SOCIALS"? If yes, list the social platforms
4. Any other sections (About, Roadmap, Team)?
5. Footer - any disclaimers or warnings?

For the TWITTER screenshot:
1. Read the profile name, bio, follower count
2. Read the join date
3. Read any pinned tweets or recent posts visible

## Step 2: URL CONTEXT (Will probably fail - don't penalize for this)
Try to access the URLs if you want, but they will likely return ERROR.

## Step 3: GOOGLE SEARCH (VERIFY)
Search for:
- "${data.tokenName} scam" or "rugpull"
- Any news or reports about this project

## Step 4: CROSS-EXAMINE
Compare what the SCREENSHOTS show vs ON-CHAIN TRUTH.
- If screenshot shows contract address, does it match ${data.tokenAddress}?
- If website claims "renounced", does on-chain confirm this?
- Lies = website claims contradict on-chain data

# OUTPUT FORMAT

Respond with ONLY this JSON:
{
  "trustScore": <0-100, where 100 is safest>,
  "verdict": "<Safe | Caution | Danger>",
  "summary": "<One paragraph investigation summary - professional tone>",
  "criminalProfile": "<Profile like 'The Low-Effort Launcher' or 'The Legitimate Builder'>",
  "lies": [
    "<Specific lie found, if any>",
    "<Another lie, if any>"
  ],
  "evidence": [
    "<Key finding 1 from screenshot or URL>",
    "<Key finding 2>",
    "<Key finding 3>"
  ],
  "analysis": [
    "<Security check result>",
    "<Market analysis>",
    "<Website assessment>"
  ],
  "visualAnalysis": "<MANDATORY when screenshots provided: Describe exactly what you SAW. MUST include 'VISUAL ASSET REUSE: [YES/NO]' and specific evidence (template design, fake logos, recycled imagery, layout) - this proves Gemini Vision analyzed the image>",
  "degenComment": "<NOW SWITCH TO DEGEN MODE: 2-3 short sentences. Use slang. Use emojis. Be brutally honest. Give street-level advice. Examples: 'Ser this is a honeypot fr. You can buy but can't sell 🚫' or 'Template site, dev dumped, it's giving rug energy ngl' or 'Actually looks solid. Low risk, just volatile af 📊'>"
}

# SCORING RULES
- Mint/Freeze ENABLED = Maximum 30 trust score
- Creator DUMPED = Maximum 20 trust score  
- Website is just "BUY NOW" button = Maximum 50 trust score
- No roadmap/team/utility = Maximum 55 trust score
- Claims contradict on-chain = -20 from trust score
- Template/low-effort site = -15 from trust score
- VISUAL ASSET REUSE DETECTED (scam template, fake logos, recycled design) = -25 from trust score, flag in lies
- Healthy on-chain + minimal website = 45-60 trust score (Caution)
- Don't give 100% to meme coins with template sites!
${data.isPumpFun ? '- PUMP.FUN: Ignore honeypot/contract risk. Score mainly on dev holdings, distribution, and social vibes.' : ''}
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

  const hasScreenshot = !!(data.websiteScreenshot || data.twitterScreenshot);
  const prompt = buildUnifiedPrompt(data, hasScreenshot);
  
  // Build content parts — text first, then images with media_resolution medium (speed + vision)
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
  
  if (data.twitterScreenshot) {
    console.log("[Unified Analyzer] 🐦 Including TWITTER screenshot (media_resolution: medium)");
    contentParts.push(
      createPartFromBase64(
        data.twitterScreenshot.base64,
        data.twitterScreenshot.mimeType,
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
        tools: [
          { urlContext: {} },
          { googleSearch: {} },
        ],
        thinkingConfig: {
          includeThoughts: true,
          thinkingLevel: ThinkingLevel.MEDIUM,
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
