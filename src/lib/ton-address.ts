/**
 * TON-aware address parsing and normalization for jetton/contract addresses.
 * Rejects invalid addresses before scan execution; returns normalized form for use.
 */

import { Address } from "@ton/core";

/**
 * Parses a TON address (friendly base64 or raw) and returns the normalized
 * friendly form, or null if invalid.
 * Use this at API/bot boundaries to reject bad input and normalize before use.
 */
export function parseAndNormalizeTonAddress(input: string): string | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  try {
    const addr = Address.parse(trimmed);
    return addr.toString();
  } catch {
    return null;
  }
}

/**
 * Returns true only if the input is a valid TON address (parseable).
 */
export function isValidTonAddress(input: string): boolean {
  return parseAndNormalizeTonAddress(input) !== null;
}
