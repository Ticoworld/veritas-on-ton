/**
 * Elephant Memory - Known Scammer Database
 * Stores deployer addresses flagged as scammers for instant detection
 * ThreatLedger: scan_ledger collection caches investigation results (24h TTL)
 */

import { getDatabase } from "./mongodb";
import type { InvestigationResult } from "@/lib/services/VeritasInvestigator";

export interface ScammerRecord {
  deployerAddress: string;
  tokenAddress: string;
  tokenName?: string;
  verdict: string;
  reason: string;
  flaggedAt: Date;
  scanCount: number; // How many times this scammer was detected
}

const COLLECTION_NAME = "scammers";
const LEDGER_COLLECTION = "scan_ledger";

export interface ScanLedgerDoc {
  tokenAddress: string;
  chain: string;
  result: InvestigationResult;
  modelUsed: string;
  scannedAt: Date;
}

const TON_CHAIN = "TON";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function getCachedScan(
  address: string,
): Promise<InvestigationResult | null> {
  const db = await getDatabase();
  if (!db) return null;

  try {
    const collection = db.collection<ScanLedgerDoc>(LEDGER_COLLECTION);
    const doc = await collection.findOne({
      tokenAddress: address,
      chain: TON_CHAIN,
    });
    if (!doc?.result) return null;
    const scannedAt = doc.scannedAt instanceof Date ? doc.scannedAt : new Date(doc.scannedAt);
    if (Date.now() - scannedAt.getTime() >= CACHE_TTL_MS) return null;
    return doc.result as InvestigationResult;
  } catch (error) {
    console.error("[ThreatLedger] getCachedScan failed:", error);
    return null;
  }
}

export async function saveScanResult(
  address: string,
  result: InvestigationResult,
  model: string,
): Promise<void> {
  const db = await getDatabase();
  if (!db) return;

  try {
    const collection = db.collection<ScanLedgerDoc>(LEDGER_COLLECTION);
    await collection.updateOne(
      { tokenAddress: address, chain: TON_CHAIN },
      {
        $set: {
          tokenAddress: address,
          chain: TON_CHAIN,
          result,
          modelUsed: model,
          scannedAt: new Date(),
        },
      },
      { upsert: true },
    );
  } catch (error) {
    console.error("[ThreatLedger] saveScanResult failed:", error);
  }
}

/**
 * Check if a deployer address is a known scammer
 * Returns the scammer record if found, null otherwise
 */
export async function checkKnownScammer(
  deployerAddress: string,
): Promise<ScammerRecord | null> {
  const db = await getDatabase();
  if (!db) return null;

  try {
    const collection = db.collection<ScammerRecord>(COLLECTION_NAME);
    const scammer = await collection.findOne({ deployerAddress });

    if (scammer) {
      // Increment scan count - this scammer was detected again
      await collection.updateOne(
        { deployerAddress },
        { $inc: { scanCount: 1 } },
      );
      console.log(
        `[Elephant Memory] 🚨 KNOWN CRIMINAL DETECTED: ${deployerAddress.slice(0, 8)}...`,
      );
      return scammer;
    }

    return null;
  } catch (error) {
    console.error("[Elephant Memory] Check failed:", error);
    return null;
  }
}

/**
 * Flag a deployer as a known scammer
 */
export async function flagScammer(
  deployerAddress: string,
  tokenAddress: string,
  tokenName: string,
  verdict: string,
  reason: string,
): Promise<boolean> {
  const db = await getDatabase();
  if (!db) return false;

  try {
    const collection = db.collection<ScammerRecord>(COLLECTION_NAME);

    // Check if already exists
    const existing = await collection.findOne({ deployerAddress });
    if (existing) {
      console.log(
        `[Elephant Memory] Scammer already flagged: ${deployerAddress.slice(0, 8)}...`,
      );
      return true;
    }

    // Insert new scammer record
    await collection.insertOne({
      deployerAddress,
      tokenAddress,
      tokenName,
      verdict,
      reason,
      flaggedAt: new Date(),
      scanCount: 1,
    });

    console.log(
      `[Elephant Memory] 🐘 New scammer flagged: ${deployerAddress.slice(0, 8)}... (${tokenName})`,
    );
    return true;
  } catch (error) {
    console.error("[Elephant Memory] Flag failed:", error);
    return false;
  }
}

/**
 * Get all known scammers (for admin/stats)
 */
export async function getAllScammers(): Promise<ScammerRecord[]> {
  const db = await getDatabase();
  if (!db) return [];

  try {
    const collection = db.collection<ScammerRecord>(COLLECTION_NAME);
    return await collection
      .find({})
      .sort({ flaggedAt: -1 })
      .limit(100)
      .toArray();
  } catch (error) {
    console.error("[Elephant Memory] Get all failed:", error);
    return [];
  }
}
