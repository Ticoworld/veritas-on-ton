import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines class names using clsx and tailwind-merge.
 * This allows for conditional classes and proper Tailwind CSS class merging.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a wallet/contract address to a shortened display format.
 * Example: "7xKX...4hEv"
 */
export function formatAddress(address: string, chars: number = 4): string {
  if (!address || address.length < chars * 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Calculates percentage with optional decimal places.
 */
export function calculatePercentage(
  value: number,
  total: number,
  decimals: number = 2
): number {
  if (total === 0) return 0;
  return Number(((value / total) * 100).toFixed(decimals));
}

/**
 * Formats a number with commas and optional decimal places.
 */
export function formatNumber(
  value: number,
  decimals: number = 2
): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Formats native chain amount (e.g. TON / nanoTON) with proper decimals.
 */
export function formatNative(nanoUnits: number): string {
  const units = nanoUnits / 1_000_000_000;
  return formatNumber(units, 4);
}
