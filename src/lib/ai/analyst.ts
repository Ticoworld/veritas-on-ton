/**
 * Veritas AI Analyst
 * Token risk analysis powered by Google Gemini (Official GenAI SDK)
 * Now with TRUE MULTIMODAL VISION - Gemini actually sees the website
 */

import { getGeminiClient, isGeminiAvailable } from "@/lib/gemini";
import { fetchScreenshotAsBase64 } from "@/lib/api/screenshot";
import { TokenData } from "@/types";

/**
 * Token data input for AI analysis
 */
export interface TokenAnalysisInput {
  mintAuth: string | null;
  freezeAuth: string | null;
  top10Percentage: number;
  supply?: number;
  decimals?: number;
  // Creator analysis
  creatorAddress?: string;
  creatorPercentage?: number;
  isDumped?: boolean;
  isWhale?: boolean;
  // Visual analysis
  screenshotUrl?: string;
  // The Historian data
  creatorHistory?: { tokenName: string; mint: string; date: string }[];
  // The Market Watcher data
  marketAnalysis?: {
    liquidity: number;
    marketCap: number;
    volume24h: number;
    buys24h: number;
    sells24h: number;
    liquidityRatio: number;
    buySellRatio: number;
    washTradeScore: number;
    botActivity: "Low" | "Medium" | "High";
  } | null;
  // Website text content for cross-examination
  websiteText?: string;
}

/**
 * AI-generated risk analysis response (with optional thought process)
 */
export interface AIAnalysisResult {
  riskScore: number; // 0-100, where 100 is Safe
  verdict: "Safe" | "Caution" | "Danger";
  summary: string;
  analysis: string[];
  thought_process?: string; // Gemini thinking reasoning
  visualAnalysis?: string; // What Gemini saw in the screenshot
}

/**
 * Sherlock's Deep Investigation Report
 */
export interface SherlockReport {
  criminalProfile: string;
  sentiment: "Positive" | "Neutral" | "Negative" | "Suspicious";
  verdict: string;
  evidence: string[];
}

/**
 * Fetch screenshot and convert to Base64
 */
// Screenshot logic moved to lib/api/screenshot.ts

/**
 * Build the analysis prompt (with optional visual analysis instructions)
 */
function buildPrompt(data: TokenAnalysisInput, hasImage: boolean): string {
  // Build creator status string
  let creatorStatus = "Unknown";
  if (data.isDumped) {
    creatorStatus = "⚠️ DEV SOLD OUT - Creator has sold all tokens";
  } else if (data.isWhale) {
    creatorStatus = "⚠️ WHALE - Creator holds >20% (centralization risk)";
  } else if (data.creatorPercentage !== undefined) {
    creatorStatus = `Holding ${data.creatorPercentage.toFixed(2)}% of supply`;
  }

  const visualSection = hasImage ? `
**Step 4: VISUAL ANALYSIS (CRITICAL)**
Look at the attached screenshot of the project's website.
- Does it claim "Locked Liquidity"?
- Does it promise "Rewards" or "Staking"?
- Does it advertise "0% Tax" or "No Fees"?
- Are there fake partnership logos (Binance, CoinGecko, etc.)?
- Does it look like a template scam site?
COMPARE these visual marketing claims to the on-chain code reality above.
` : '';

  const visualScoring = hasImage ? `
- Website makes false claims (e.g., "Locked" but code shows unlocked) → DANGER, reduce riskScore by 40 points
- Website looks like a scam template → Reduce riskScore by 20 points
- Professional website with honest information → No penalty
` : '';

  return `You are Veritas, a specialized anti-fraud AI designed to detect crypto scams (TON).

**REASON THROUGH THE FOLLOWING DATA STEP-BY-STEP:**

**Step 1: Creator Analysis (CRITICAL)**
- Creator Wallet: ${data.creatorAddress ?? "Unknown"}
- Creator Balance: ${data.creatorPercentage?.toFixed(2) ?? "0.00"}%
- Dev Dump Threshold: <1%
- COMPARE: Is ${data.creatorPercentage?.toFixed(2) ?? "0.00"}% < 1%? If YES → This is a DEV DUMP.

**Step 2: Holder Distribution**
- Top 10 Holders Own: ${data.top10Percentage.toFixed(2)}%
- Centralization Threshold: >60%
- ANALYZE: Is supply dangerously concentrated?

**Step 3: Authority Checks**
- Mint Authority: ${data.mintAuth ?? "Disabled (Renounced)"}
- Freeze Authority: ${data.freezeAuth ?? "Disabled (Renounced)"}
- EVALUATE: Can creator inflate supply or freeze accounts?

**Step 4: Creator History Analysis (The Historian)**
- Creator has launched ${data.creatorHistory?.length ?? 0} other tokens recently.
- Previous tokens: ${data.creatorHistory?.length ? data.creatorHistory.map(t => t.mint.slice(0, 8) + '...').join(', ') : 'None found'}
- REASONING:
  - If > 5 launches in short time → FLAG as 'Serial Launcher/Farmer' (High Risk)
  - If 0 launches → 'New Creator' (Neutral/Caution - first project)
  - If 1-2 launches → 'Standard Behavior'

**Step 5: Market Forensics (The Market Watcher)**
- Liquidity: $${data.marketAnalysis?.liquidity?.toLocaleString() ?? 'Unknown'} (Ratio: ${data.marketAnalysis?.liquidityRatio?.toFixed(1) ?? '?'}%)
- Volume 24h: $${data.marketAnalysis?.volume24h?.toLocaleString() ?? 'Unknown'} (Wash Score: ${data.marketAnalysis?.washTradeScore?.toFixed(1) ?? '?'}x)
- Buy/Sell: ${data.marketAnalysis?.buys24h ?? 0}/${data.marketAnalysis?.sells24h ?? 0} (Ratio: ${data.marketAnalysis?.buySellRatio?.toFixed(1) ?? '?'}:1)
- Bot Activity: ${data.marketAnalysis?.botActivity ?? 'Unknown'}
- REASONING:
  - IF Liquidity Ratio < 1% → FLAG 'Liquidity Scam / Rug Risk'
  - IF Buy/Sell Ratio > 20 → FLAG 'Honeypot Risk (Cannot Sell)'
  - IF Wash Score > 100 → FLAG 'Fake Volume / Bot Activity'

**Step 6: Website Cross-Examination (The Lie Detector)**
Below is the ACTUAL TEXT scraped from the project website. Compare it to the on-chain data above.
--- WEBSITE TEXT START ---
${data.websiteText ?? 'No website text available'}
--- WEBSITE TEXT END ---
CRITICAL ANALYSIS:
- Does the text claim "Locked Liquidity" but mint authority is active?
- Does it promise "0% Tax" but we see different on-chain?
- Does it claim "Team tokens locked" but creator is a whale?
- Look for contradictions between marketing claims and code reality.
${visualSection}
**SCORING RULES:**
- DEV DUMP detected (creator <1%) → DANGER, max riskScore of 20
- Whale creator (>20%) → Reduce riskScore by 25 points
- Active Mint Authority → Reduce riskScore by 30 points
- Active Freeze Authority → Reduce riskScore by 20 points
- Healthy distribution (<40% top 10) → Increase riskScore by 20 points
- Serial Launcher (>5 tokens) → DANGER, reduce riskScore by 35 points
- New Creator (0 history) → Caution, slight risk reduction
- Honeypot (Buy/Sell > 20) → DANGER, reduce riskScore by 40 points
- Fake Volume (Wash > 100) → Reduce riskScore by 25 points
- Low Liquidity (<1%) → DANGER, reduce riskScore by 30 points
- Website claims contradict on-chain reality → DANGER, reduce riskScore by 40 points${visualScoring}

**OUTPUT FORMAT:**
Respond ONLY with a valid JSON object (no markdown, no code blocks):
{
  "thought_process": "<your step-by-step reasoning>",
  "riskScore": <number 0-100, where 100 is SAFE and 0 is DANGEROUS>,
  "verdict": "<one of: Safe, Caution, Danger>",
  "summary": "<one sentence conclusion>",
  "analysis": ["<key finding 1>", "<key finding 2>", "<key finding 3>"]${hasImage ? ',\n  "visualAnalysis": "<what you observed in the website screenshot>"' : ''}
}`;
}

/**
 * Parse Gemini response to extract JSON
 */
function parseResponse(text: string | null | undefined): AIAnalysisResult | null {
  if (!text) return null;
  
  const cleanedText = text
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  try {
    const parsed = JSON.parse(cleanedText) as AIAnalysisResult;

    // Validate the response structure
    if (
      typeof parsed.riskScore !== "number" ||
      typeof parsed.verdict !== "string" ||
      typeof parsed.summary !== "string" ||
      !Array.isArray(parsed.analysis)
    ) {
      console.error("[Veritas AI] Invalid response structure from Gemini");
      return null;
    }

    // Clamp risk score to valid range
    parsed.riskScore = Math.max(0, Math.min(100, parsed.riskScore));

    return parsed;
  } catch (err) {
    console.error("[Veritas AI] Failed to parse JSON response:", err);
    return null;
  }
}

/**
 * Build multimodal content parts (text + optional image)
 */
function buildContentParts(prompt: string, imageData: { base64: string; mimeType: string } | null) {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: prompt }
  ];

  if (imageData) {
    parts.push({
      inlineData: {
        mimeType: imageData.mimeType,
        data: imageData.base64
      }
    });
  }

  return parts;
}

/**
 * Analyze token risk using Gemini AI (New SDK)
 * NOW WITH TRUE MULTIMODAL VISION
 * Waterfall Strategy:
 * 1. Gemini 3 Pro Preview (Deep Think + Vision)
 * 2. Gemini 3 Flash Preview (Deep Think + Vision)
 * 3. Gemini 2.5 Flash (Standard)
 */
export async function analyzeTokenRisk(
  data: TokenAnalysisInput,
  modelName?: string
): Promise<AIAnalysisResult | null> {
  if (!isGeminiAvailable()) {
    console.log("[Veritas AI] Gemini not available, skipping AI analysis");
    return null;
  }

  const ai = getGeminiClient();
  if (!ai) return null;

  // Fetch screenshot if URL provided
  let imageData: { base64: string; mimeType: string } | null = null;
  if (data.screenshotUrl) {
    imageData = await fetchScreenshotAsBase64(data.screenshotUrl);
    if (imageData) {
      console.log("[Veritas AI] 👁️ VISION MODE ENABLED - Gemini will analyze the screenshot");
    }
  }

  const hasImage = !!imageData;
  const prompt = buildPrompt(data, hasImage);
  const contentParts = buildContentParts(prompt, imageData);

  // If a specific model is requested, use it directly (no waterfall)
  if (modelName) {
    try {
      console.log(`[Veritas AI] Using forced model: ${modelName}${hasImage ? ' + Vision' : ''}...`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: contentParts }]
      });
      const text = response.text || "";
      return parseResponse(text);
    } catch (error) {
      console.error(`[Veritas AI] Forced model ${modelName} failed:`, error);
      return null;
    }
  }

  // Helper to add timeout to model calls (fail fast on rate limits)
  const withTimeout = <T>(promise: Promise<T>, ms: number, name: string): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(`${name} timed out after ${ms}ms`)), ms)
      )
    ]);
  };

  const MODEL_TIMEOUT = 8000; // 8 seconds max per model attempt

  // DEMO MODE: Skip rate-limited models entirely during hackathon
  // Set to true to go straight to Gemini 2.5 Flash (no waterfall delays)
  const DEMO_MODE = true;

  if (DEMO_MODE) {
    console.log("[Veritas AI] 🚀 DEMO MODE: Using Gemini 2.5 Flash directly...");
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview', 
        contents: [{ role: 'user', parts: contentParts }]
      });
      const text = response.text || "";
      return parseResponse(text);
    } catch (error) {
      console.error("[Veritas AI] Demo mode failed:", error);
      return null;
    }
  }

  // 1. Primary Attempt: Gemini 3 Pro Preview
  try {
    console.log(`[Veritas AI] Trying Gemini 3 Pro Preview (Deep Think${hasImage ? ' + Vision' : ''})...`);
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3-flash-preview', 
        config: {
          thinkingConfig: { includeThoughts: true } 
        },
        contents: [{ role: 'user', parts: contentParts }]
      }),
      MODEL_TIMEOUT,
      'Gemini 3 Pro'
    );

    const text = response.text || "";
    const parsed = parseResponse(text);
    
    if (parsed) {
      if (parsed.thought_process) {
        console.log("[Veritas AI] Gemini 3 Pro Thoughts:", parsed.thought_process.slice(0, 100) + "...");
      }
      if (parsed.visualAnalysis) {
        console.log("[Veritas AI] 👁️ Visual Analysis:", parsed.visualAnalysis.slice(0, 100) + "...");
      }
      return parsed;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`[Veritas AI] Gemini 3 Pro unavailable (${errorMessage.slice(0, 80)}...). Switching to Flash...`);
  }

  // 2. First Fallback: Gemini 3 Flash Preview (The Sweet Spot)
  try {
    console.log(`[Veritas AI] Trying Gemini 3 Flash Preview (Deep Think${hasImage ? ' + Vision' : ''})...`);
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3-flash-preview', 
        config: {
          thinkingConfig: { includeThoughts: true } 
        },
        contents: [{ role: 'user', parts: contentParts }]
      }),
      MODEL_TIMEOUT,
      'Gemini 3 Flash'
    );

    const text = response.text || "";
    const parsed = parseResponse(text);
    
    if (parsed) {
      if (parsed.thought_process) {
        console.log("[Veritas AI] Gemini 3 Flash Thoughts:", parsed.thought_process.slice(0, 100) + "...");
      }
      if (parsed.visualAnalysis) {
        console.log("[Veritas AI] 👁️ Visual Analysis:", parsed.visualAnalysis.slice(0, 100) + "...");
      }
      return parsed;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`[Veritas AI] Gemini 3 Flash unavailable (${errorMessage.slice(0, 80)}...). Switching to Standard Flash...`);
  }

  // 3. Final Fallback: Gemini 2.5 Flash (Standard - reliable)
  try {
    console.log("[Veritas AI] Using Gemini 2.5 Flash fallback...");
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: [{ role: 'user', parts: contentParts }]
    });

    const text = response.text || "";
    return parseResponse(text);
  } catch (error) {
    console.error("[Veritas AI] All analysis models failed:", error);
    return null;
  }
}


/**
 * RUN DEEP INVESTIGATION (Sherlock Mode)
 * Uses multi-modal vision to analyze Website + Twitter simultaneously.
 * NOW UPGRADED (v3.1): Analyzes Text + Vision
 */
export async function runDeepInvestigation(
  tokenData: TokenData,
  websiteUrl: string,
  twitterUrl?: string,
  websiteText?: string,
  modelName?: string
): Promise<SherlockReport | null> {
  if (!isGeminiAvailable()) return null;

  const ai = getGeminiClient();
  if (!ai) return null;

  console.log(`[Veritas Sherlock] 🕵️‍♂️ Starting deep investigation for ${tokenData.name}...`);

  // 1. Fetch Evidence (Screenshots)
  const evidence: any[] = [];
  let websiteImage: { base64: string; mimeType: string } | null = null;
  let twitterImage: { base64: string; mimeType: string } | null = null;

  if (websiteUrl) {
    websiteImage = await fetchScreenshotAsBase64(websiteUrl, { fullPage: true });
  }

  // Twitter screenshots removed — no security value (same UI for all profiles)

  // 2. Build the Case File (Prompt)
  const prompt = `
  You are Sherlock, a legendary Web3 Detective. I need you to profile the creator of this token based on the evidence provided.

  **SUBJECT:** ${tokenData.name} (${tokenData.symbol})
  **ADDRESS:** ${tokenData.address}

  **EVIDENCE ATTACHED:**
  1. Website Screenshot (Full Page) ${websiteImage ? "✅" : "❌"}
  2. Twitter Profile Screenshot ${twitterImage ? "✅" : "❌"}
  3. Scraped Website Text ${websiteText ? "✅" : "❌"}

  **YOUR MISSION:**
  Analyze the Visuals AND the Text to build a "Criminal Profile" of the creator.

  **INVESTIGATION STEPS:**
  
  1. **Copycat Check (Visuals):**
     - Does the website logo look like a cheap rip-off of a famous brand or meme?
     - Is the art style consistent, or does it look like stolen assets mixed together?

  2. **Forensic Document Examination (Text & Visuals):**
     - Zoom in on the footer (Image) and read the Disclaimers.
     - CROSS-EXAMINE: Does the text claim "0% Tax" or "Locked Liquidity"? 
     - Does the text contain standard rug-pull phrases like "No expectation of profit"?
      - Does the website look like a recycled scam template?

  3. **Social Background Check (Twitter Image):**
     - Look at the Follower Count in the screenshot. Is it < 50? (Burner account).
     - Look at the Join Date (if visible). Is it brand new?
     - Read the Bio in the screenshot. Does it link to other suspicious projects?
     
  4. **The "Lie Detector" (Text vs Reality):**
     - If website text says "Long term roadmap" but the site is a single page template -> RED FLAG.
     - If website text says "Team Tokens Locked" but you see no proof -> NOTE IT.

  **WEBSITE TEXT EVIDENCE:**
  """
  ${websiteText ? websiteText.slice(0, 2000) : "No text evidence found."}
  """

  **OUTPUT FORMAT:**
  Respond ONLY with this JSON structure:
  {
    "criminalProfile": "A short, punchy description of the creator (e.g., 'The Serial Copycat', 'The Lazy Dev', 'The Professional Scammer', 'The High-Effort Visionary').",
    "sentiment": "One of: Positive, Neutral, Negative, Suspicious",
    "verdict": "A 1-sentence final verdict on whether this project feels authentic or fabricated.",
    "evidence": [
      "Point 1 (e.g., 'Website footer contains standard rug-pull disclaimer')",
      "Point 2 (e.g., 'Twitter account created 2 days ago with 0 followers')",
      "Point 3 (e.g., 'Text claims 0% tax but on-chain data shows otherwise')"
    ]
  }
  `;

  // 3. Assemble the Evidence Bag
  const parts: any[] = [{ text: prompt }];
  
  if (websiteImage) {
    parts.push({
      inlineData: {
        mimeType: websiteImage.mimeType,
        data: websiteImage.base64
      }
    });
  }

  if (twitterImage) {
    const timg: any = twitterImage;
    parts.push({
      inlineData: {
        mimeType: timg.mimeType,
        data: timg.base64,
      },
    });
  }

  // If a specific model is requested, use it directly (no waterfall)
  if (modelName) {
    try {
      console.log(`[Veritas Sherlock] 🕵️‍♂️ Using forced model: ${modelName}...`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts }]
      });
      return parseSherlockResponse(response.text);
    } catch (error) {
      console.error(`[Veritas Sherlock] Forced model ${modelName} failed:`, error);
      return null;
    }
  }

  // Helper to add timeout to model calls (fail fast on rate limits)
  const withTimeout = <T>(promise: Promise<T>, ms: number, name: string): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(`${name} timed out after ${ms}ms`)), ms)
      )
    ]);
  };
  const MODEL_TIMEOUT = 8000; // 8 seconds max per model attempt

  // DEMO MODE: Skip rate-limited models entirely during hackathon
  const DEMO_MODE = true;

  if (DEMO_MODE) {
    console.log("[Veritas Sherlock] 🚀 DEMO MODE: Using Gemini 2.5 Flash directly...");
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts }]
      });
      return parseSherlockResponse(response.text);
    } catch (error) {
      console.error("[Veritas Sherlock] Demo mode failed:", error);
      return null;
    }
  }

  // 4. Consult the Detective (Waterfall: Pro -> Flash -> Standard)
  
  // Attempt 1: Gemini 3 Pro (The Mastermind)
  try {
    console.log("[Veritas Sherlock] 🕵️‍♂️ Consulting Gemini 3 Pro...");
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        config: { thinkingConfig: { includeThoughts: true } },
        contents: [{ role: 'user', parts }]
      }),
      MODEL_TIMEOUT,
      'Sherlock Pro'
    );
    return parseSherlockResponse(response.text);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[Veritas Sherlock] Pro unavailable (${msg.slice(0, 60)}...). Switching to Flash...`);
    
    // Attempt 2: Gemini 3 Flash (The Apprentice)
    try {
      console.log("[Veritas Sherlock] 🕵️‍♂️ Consulting Gemini 3 Flash...");
      const response = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          config: { thinkingConfig: { includeThoughts: true } },
          contents: [{ role: 'user', parts }]
        }),
        MODEL_TIMEOUT,
        'Sherlock Flash'
      );
      return parseSherlockResponse(response.text);
    } catch (flashError) {
      const flashMsg = flashError instanceof Error ? flashError.message : String(flashError);
      console.warn(`[Veritas Sherlock] Flash unavailable (${flashMsg.slice(0, 60)}...). Switching to Standard...`);
      
      // Attempt 3: Gemini 2.5 Flash (The Rookie)
      try {
        console.log("[Veritas Sherlock] 🕵️‍♂️ Consulting Gemini 2.5 Flash...");
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [{ role: 'user', parts }]
        });
        return parseSherlockResponse(response.text);
      } catch (finalError) {
        console.error("[Veritas Sherlock] All detective models failed:", finalError);
        return null;
      }
    }
  }
}

/**
 * Helper to parse Sherlock's JSON response
 */
function parseSherlockResponse(text: string | undefined): SherlockReport | null {
  if (!text) return null;
  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned) as SherlockReport;
  } catch (e) {
    console.error("[Veritas Sherlock] JSON Parse failed:", e);
    return null;
  }
}
