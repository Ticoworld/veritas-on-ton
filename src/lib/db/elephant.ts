/**
 * Elephant Memory - Known Scammer Database
 * Stores deployer addresses flagged as scammers for instant detection
 */

import { getDatabase } from "./mongodb";

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

/**
 * Check if a deployer address is a known scammer
 * Returns the scammer record if found, null otherwise
 */
export async function checkKnownScammer(deployerAddress: string): Promise<ScammerRecord | null> {
  const db = await getDatabase();
  if (!db) return null;

  try {
    const collection = db.collection<ScammerRecord>(COLLECTION_NAME);
    const scammer = await collection.findOne({ deployerAddress });
    
    if (scammer) {
      // Increment scan count - this scammer was detected again
      await collection.updateOne(
        { deployerAddress },
        { $inc: { scanCount: 1 } }
      );
      console.log(`[Elephant Memory] 🚨 KNOWN CRIMINAL DETECTED: ${deployerAddress.slice(0, 8)}...`);
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
  reason: string
): Promise<boolean> {
  const db = await getDatabase();
  if (!db) return false;

  try {
    const collection = db.collection<ScammerRecord>(COLLECTION_NAME);
    
    // Check if already exists
    const existing = await collection.findOne({ deployerAddress });
    if (existing) {
      console.log(`[Elephant Memory] Scammer already flagged: ${deployerAddress.slice(0, 8)}...`);
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

    console.log(`[Elephant Memory] 🐘 New scammer flagged: ${deployerAddress.slice(0, 8)}... (${tokenName})`);
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
    return await collection.find({}).sort({ flaggedAt: -1 }).limit(100).toArray();
  } catch (error) {
    console.error("[Elephant Memory] Get all failed:", error);
    return [];
  }
}
