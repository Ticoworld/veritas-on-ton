/**
 * Gemini AI Client
 * Official Google GenAI SDK integration for Veritas
 */

import { GoogleGenAI } from "@google/genai";

// Initialize the Gemini client
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn("[Veritas AI] GEMINI_API_KEY not found. AI analysis will be disabled.");
}

/**
 * Get the Google GenAI client instance
 */
export function getGeminiClient(): GoogleGenAI | null {
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

/**
 * Check if Gemini AI is available
 */
export function isGeminiAvailable(): boolean {
  return !!apiKey;
}
