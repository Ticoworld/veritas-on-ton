/**
 * Elephant Memory - Known Scammer Database
 * Stores deployer addresses flagged as scammers for instant detection
 * ThreatLedger: scan_ledger collection caches investigation results (24h TTL)
 * Lineage: deployer_lineage collection stores authority-linked token scan history (key = mint/freeze authority address, not proven deployer)
 */

import { createHash } from "crypto";
import { getDatabase } from "./mongodb";
import type { InvestigationResult } from "@/lib/services/VeritasInvestigator";
import type { Claim } from "@/lib/claims";

export interface ScammerRecord {
  deployerAddress: string;
  tokenAddress: string;
  tokenName?: string;
  verdict: string;
  reason: string;
  flaggedAt: Date;
  scanCount: number; // How many times this scammer was detected
}

/** Display verdict at persist time — aligns with product labels and separates cannot-verify from suspicious/high-risk. */
export type LineageDisplayVerdict =
  | "Likely legitimate"
  | "Suspicious"
  | "High risk"
  | "Cannot verify";

/** How we identified the authority for lineage (mint/freeze from contract; authority is not necessarily the deployer). */
export type LineageIdentitySource = "mint_authority" | "freeze_authority" | "both";

/** Phase 2: One record per (authority address, token). Key is mint/freeze authority, not proven deployer. */
export interface LineageRecord {
  /** Mint or freeze authority address (stored as deployerAddress for DB compatibility). */
  deployerAddress: string;
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  scannedAt: Date;
  /** Historical verdict at time of that scan (not current token state). */
  verdict: "Safe" | "Caution" | "Danger";
  /** Historical display verdict at scan time. Surface as "previously assessed as …" in UI. */
  displayVerdict?: LineageDisplayVerdict;
  /** How this address was derived (mint/freeze authority). */
  identitySource?: LineageIdentitySource;
  keyFlags: {
    isDumped?: boolean;
    isWhale?: boolean;
    visualAssetReuse?: "YES" | "NO" | "UNKNOWN";
  };
  websiteDomain?: string;
  claimSummary?: string;
}

/** Confidence in lineage identity (do not overstate when weak). */
export type LineageIdentityConfidence = "high" | "medium" | "low";

/** Summary of prior launches linked to this authority (for UI). Truthful: based on Veritas records only; authority ≠ deployer. */
export interface LineageSummary {
  /** Authority address (mint/freeze). Stored as deployerAddress for DB compatibility. */
  deployerAddress: string;
  priorLaunchCount: number;
  /** Prior launches that were Suspicious or High risk (not Cannot verify). */
  priorSuspiciousOrHighRiskCount: number;
  /** Prior launches that were Cannot verify (insufficient data). */
  priorCannotVerifyCount: number;
  /** @deprecated Use priorSuspiciousOrHighRiskCount for suspicious/high-risk; priorCannotVerifyCount for cannot-verify. */
  priorFlaggedCount: number;
  priorLaunches: Array<{
    tokenAddress: string;
    tokenName: string;
    tokenSymbol: string;
    verdict: "Safe" | "Caution" | "Danger";
    displayLabel: string;
    scannedAt: string;
  }>;
  hasPriorHistory: boolean;
  /** How we identified this authority (mint/freeze). */
  identitySource?: LineageIdentitySource;
  /** Confidence in authority identity — do not overstate history when low. */
  lineageIdentityConfidence?: LineageIdentityConfidence;
  /** Short finding for top-level summary. Uses "in our records"; never implies deployer identity. */
  strongestLineageFinding?: string;
}

const COLLECTION_NAME = "scammers";
const LEDGER_COLLECTION = "scan_ledger";
const LINEAGE_COLLECTION = "deployer_lineage";
const WEBSITE_SNAPSHOT_COLLECTION = "website_snapshots";

/** Phase 3: Website snapshot persisted per scan when a website exists. */
export interface WebsiteSnapshotRecord {
  tokenAddress: string;
  websiteUrl: string;
  websiteDomain: string;
  scannedAt: Date;
  screenshotPublicUrl?: string;
  screenshotAvailable: boolean;
  visualSummary: string;
  claims: Claim[];
  contentFingerprint?: string;
  trustSectionSummary?: string;
  socials?: {
    twitter?: string;
    telegram?: string;
    discord?: string;
  };
  /** Phase 4: Historical verdict at time of that scan (for reputation counts). Not current truth. */
  verdictAtScan?: "Safe" | "Caution" | "Danger";
  /** Phase 4: Historical display verdict at time of that scan. Use "previously assessed as …" in UI. */
  displayVerdictAtScan?: LineageDisplayVerdict;
  /** Phase 4: Hash of normalized visual summary for repeated-pattern lookup. */
  visualSummaryHash?: string;
}

/** Phase 4: Strong vs weak reputation signals. Strong = specific; weak = generic/brittle. Top summary uses only strong. */
export type ReputationSignalStrength = "strong" | "weak";

/** Phase 4: Repeated-pattern signals across prior scans. Copy: do not imply proof of fraud from repetition alone. */
export interface ReputationSignals {
  /** Same website domain seen in prior scans; some of those scans were flagged. STRONG. */
  sameDomainInPriorFlagged?: {
    domain: string;
    priorScanCount: number;
    priorFlaggedCount: number;
    /** How many of those scans had verdict data (old snapshots lack verdictAtScan). */
    scansWithVerdictCount?: number;
  };
  /**
   * Repeated trust-claim motif in prior flagged scans.
   * STRONG when: (1) repeated combination of 2+ claim types, or (2) repeated unsupported/contradicted claim motif.
   * WEAK when: single generic claim-type repetition only.
   */
  repeatedClaimMotif?: {
    claimTypes: string[];
    priorScanCount: number;
    priorFlaggedCount: number;
    strength: ReputationSignalStrength;
    /** True when pattern is based on contradicted/unverified claims in prior flagged scans. */
    unsupportedContradicted?: boolean;
  };
  /** Same or very similar visual trust summary in prior flagged scans. WEAK only; never dominates summary. */
  repeatedVisualPattern?: {
    priorScanCount: number;
    priorFlaggedCount: number;
    strength: "weak";
  };
  /** When this authority has prior flagged launches AND same domain or strong claim motif. STRONG. */
  authorityPlusPattern?: {
    priorFlaggedLaunches: number;
    patternDescription: string;
  };
  /** One-line strongest finding for top summary. Only from strong signals. Careful copy: no "scam confirmed". */
  strongestReputationFinding?: string;
}

/** Phase 3: Practical website drift summary for UI/bot. */
export interface WebsiteDriftSummary {
  priorSnapshotExists: boolean;
  comparisonBasis?: "token" | "domain";
  priorScannedAt?: string;
  priorWebsiteUrl?: string;
  currentWebsiteUrl?: string;
  materialChangesDetected: boolean;
  keyChanges: string[];
  strongestFinding?: string;
}

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

// =============================================================================
// LINEAGE (Phase 2: authority-linked launch history)
// =============================================================================

/**
 * Persist one lineage record after a completed scan.
 * Upserts by (authority address, tokenAddress). Key is mint/freeze authority, not proven deployer.
 */
export async function saveLineageRecord(record: LineageRecord): Promise<void> {
  const db = await getDatabase();
  if (!db) return;

  try {
    const collection = db.collection<LineageRecord>(LINEAGE_COLLECTION);
    await collection.updateOne(
      { deployerAddress: record.deployerAddress, tokenAddress: record.tokenAddress },
      { $set: record },
      { upsert: true },
    );
  } catch (error) {
    console.error("[Lineage] saveLineageRecord failed:", error);
  }
}

/**
 * Fetch all lineage records for an authority address, optionally excluding one token (e.g. current scan).
 * Returns records sorted by scannedAt desc. Authority = mint/freeze address, not proven deployer.
 */
export async function getLineageByDeployer(
  deployerAddress: string,
  options?: { excludeTokenAddress?: string },
): Promise<LineageRecord[]> {
  const db = await getDatabase();
  if (!db) return [];

  try {
    const filter: { deployerAddress: string; tokenAddress?: { $ne: string } } = {
      deployerAddress,
    };
    if (options?.excludeTokenAddress) {
      filter.tokenAddress = { $ne: options.excludeTokenAddress };
    }
    const collection = db.collection<LineageRecord>(LINEAGE_COLLECTION);
    return await collection
      .find(filter)
      .sort({ scannedAt: -1 })
      .limit(50)
      .toArray();
  } catch (error) {
    console.error("[Lineage] getLineageByDeployer failed:", error);
    return [];
  }
}

function displayLabelFromRecord(r: LineageRecord): string {
  if (r.displayVerdict) return r.displayVerdict;
  if (r.verdict === "Safe") return "Likely legitimate";
  if (r.verdict === "Caution") return "Suspicious";
  if (r.verdict === "Danger") return "High risk";
  return "Unknown";
}

/**
 * Build lineage summary for an authority from stored records (excluding current token).
 * Splits prior suspicious/high-risk from prior cannot-verify. Never implies deployer identity.
 */
export function buildLineageSummary(
  deployerAddress: string,
  records: LineageRecord[],
  options?: {
    identitySource?: LineageIdentitySource;
    lineageIdentityConfidence?: LineageIdentityConfidence;
  },
): LineageSummary {
  const priorLaunches = records.slice(0, 10).map((r) => ({
    tokenAddress: r.tokenAddress,
    tokenName: r.tokenName,
    tokenSymbol: r.tokenSymbol,
    verdict: r.verdict,
    displayLabel: displayLabelFromRecord(r),
    scannedAt: r.scannedAt instanceof Date ? r.scannedAt.toISOString() : String(r.scannedAt),
  }));

  // Prior suspicious or high-risk: verdict was Caution/Danger and was NOT "Cannot verify" (weak coverage)
  const priorSuspiciousOrHighRiskCount = records.filter(
    (r) => r.verdict !== "Safe" && r.displayVerdict !== "Cannot verify",
  ).length;
  // Prior cannot-verify: scan had insufficient data (do not mix with suspicious/high-risk)
  const priorCannotVerifyCount = records.filter((r) => r.displayVerdict === "Cannot verify").length;
  const priorFlaggedCount = priorSuspiciousOrHighRiskCount;

  let strongestLineageFinding: string | undefined;
  if (records.length === 0) {
    strongestLineageFinding = undefined;
  } else if (priorSuspiciousOrHighRiskCount > 0) {
    strongestLineageFinding = `Among previously scanned launches in our records, this authority appears in ${records.length} prior tokens, including ${priorSuspiciousOrHighRiskCount} flagged suspicious or high-risk.`;
  } else if (priorCannotVerifyCount > 0 && priorCannotVerifyCount === records.length) {
    strongestLineageFinding = `Among previously scanned launches in our records, this authority appears in ${records.length} prior tokens; all had insufficient data to verify (not counted as suspicious).`;
  } else {
    strongestLineageFinding = `Among previously scanned launches in our records, this authority appears in ${records.length} prior tokens; no prior suspicious or high-risk history found.`;
  }

  return {
    deployerAddress,
    priorLaunchCount: records.length,
    priorSuspiciousOrHighRiskCount,
    priorCannotVerifyCount,
    priorFlaggedCount,
    priorLaunches,
    hasPriorHistory: records.length > 0,
    identitySource: options?.identitySource,
    lineageIdentityConfidence: options?.lineageIdentityConfidence,
    strongestLineageFinding,
  };
}

// =============================================================================
// WEBSITE SNAPSHOTS (Phase 3: drift tracking)
// =============================================================================

/** Persist website snapshot per scan. */
export async function saveWebsiteSnapshot(record: WebsiteSnapshotRecord): Promise<void> {
  const db = await getDatabase();
  if (!db) return;
  try {
    const collection = db.collection<WebsiteSnapshotRecord>(WEBSITE_SNAPSHOT_COLLECTION);
    await collection.insertOne(record);
  } catch (error) {
    console.error("[WebsiteSnapshot] saveWebsiteSnapshot failed:", error);
  }
}

/** Latest snapshot for this token (before current run). */
export async function getLatestWebsiteSnapshotByToken(
  tokenAddress: string,
): Promise<WebsiteSnapshotRecord | null> {
  const db = await getDatabase();
  if (!db) return null;
  try {
    const collection = db.collection<WebsiteSnapshotRecord>(WEBSITE_SNAPSHOT_COLLECTION);
    const doc = await collection.findOne(
      { tokenAddress },
      { sort: { scannedAt: -1 } },
    );
    return doc ?? null;
  } catch (error) {
    console.error("[WebsiteSnapshot] getLatestWebsiteSnapshotByToken failed:", error);
    return null;
  }
}

/** Latest snapshot by website domain, optionally excluding current token. */
export async function getLatestWebsiteSnapshotByDomain(
  websiteDomain: string,
  options?: { excludeTokenAddress?: string },
): Promise<WebsiteSnapshotRecord | null> {
  const db = await getDatabase();
  if (!db) return null;
  try {
    const filter: { websiteDomain: string; tokenAddress?: { $ne: string } } = { websiteDomain };
    if (options?.excludeTokenAddress) {
      filter.tokenAddress = { $ne: options.excludeTokenAddress };
    }
    const collection = db.collection<WebsiteSnapshotRecord>(WEBSITE_SNAPSHOT_COLLECTION);
    const doc = await collection.findOne(filter, { sort: { scannedAt: -1 } });
    return doc ?? null;
  } catch (error) {
    console.error("[WebsiteSnapshot] getLatestWebsiteSnapshotByDomain failed:", error);
    return null;
  }
}

/** All snapshots for a domain (other tokens), for Phase 4 reputation. */
export async function getWebsiteSnapshotsByDomain(
  websiteDomain: string,
  options?: { excludeTokenAddress?: string },
): Promise<WebsiteSnapshotRecord[]> {
  const db = await getDatabase();
  if (!db) return [];
  try {
    const filter: { websiteDomain: string; tokenAddress?: { $ne: string } } = { websiteDomain };
    if (options?.excludeTokenAddress) {
      filter.tokenAddress = { $ne: options.excludeTokenAddress };
    }
    const collection = db.collection<WebsiteSnapshotRecord>(WEBSITE_SNAPSHOT_COLLECTION);
    return await collection.find(filter).sort({ scannedAt: -1 }).limit(100).toArray();
  } catch (error) {
    console.error("[WebsiteSnapshot] getWebsiteSnapshotsByDomain failed:", error);
    return [];
  }
}

/** Recent snapshots across tokens (for Phase 4 claim/visual pattern lookup). */
export async function getRecentWebsiteSnapshots(
  limit: number,
  options?: { excludeTokenAddress?: string },
): Promise<WebsiteSnapshotRecord[]> {
  const db = await getDatabase();
  if (!db) return [];
  try {
    const filter: { tokenAddress?: { $ne: string } } = {};
    if (options?.excludeTokenAddress) {
      filter.tokenAddress = { $ne: options.excludeTokenAddress };
    }
    const collection = db.collection<WebsiteSnapshotRecord>(WEBSITE_SNAPSHOT_COLLECTION);
    return await collection.find(filter).sort({ scannedAt: -1 }).limit(limit).toArray();
  } catch (error) {
    console.error("[WebsiteSnapshot] getRecentWebsiteSnapshots failed:", error);
    return [];
  }
}

// =============================================================================
// REPUTATION (Phase 4: repeated-pattern signals from prior scans)
// =============================================================================

function isFlaggedVerdict(v?: string): boolean {
  return v === "Caution" || v === "Danger";
}

/** Normalize and hash visual summary for repeated-pattern lookup. */
export function hashVisualSummary(visualSummary: string): string {
  const normalized = String(visualSummary ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(normalized).digest("hex");
}

export interface BuildReputationSignalsParams {
  tokenAddress: string;
  websiteDomain?: string;
  claims: Claim[];
  /** Normalized visual summary (or raw); will be hashed inside. */
  visualSummary?: string;
}

/** Claims in snapshot have verificationStatus; only contradicted/unverified count as "unsupported" motif. */
function isUnsupportedStatus(status?: string): boolean {
  return status === "contradicted" || status === "unverified";
}

/**
 * Build reputation signals from prior scan data. Reuses website_snapshots only.
 * Strong signals: same domain in prior flagged; repeated claim motif (combination or unsupported/contradicted).
 * Weak signals: single claim-type repetition; visual hash match. Strongest finding only from strong.
 */
export async function buildReputationSignals(
  params: BuildReputationSignalsParams,
): Promise<ReputationSignals> {
  const { tokenAddress, websiteDomain, claims, visualSummary } = params;
  const out: ReputationSignals = {};
  const claimTypes = [...new Set((claims ?? []).map((c) => c.type))];
  const currentUnsupportedTypes = new Set(
    (claims ?? []).filter((c) => isUnsupportedStatus(c.verificationStatus)).map((c) => c.type),
  );
  const typeComboKey = (types: Set<string>) => [...types].sort().join("+");

  const recent = await getRecentWebsiteSnapshots(400, { excludeTokenAddress: tokenAddress });
  // verdictAtScan is historical (at time of that scan); used only for prior-flagged counts
  const flagged = recent.filter((s) => isFlaggedVerdict(s.verdictAtScan));

  // Same domain in prior scans; how many had verdict data and how many were flagged
  if (websiteDomain && websiteDomain.trim()) {
    const byDomain = await getWebsiteSnapshotsByDomain(websiteDomain, { excludeTokenAddress: tokenAddress });
    const priorScanCount = byDomain.length;
    const withVerdict = byDomain.filter((s) => s.verdictAtScan != null);
    const priorFlaggedCount = withVerdict.filter((s) => isFlaggedVerdict(s.verdictAtScan)).length;
    const scansWithVerdictCount = withVerdict.length;
    if (priorScanCount >= 1 && priorFlaggedCount >= 1) {
      out.sameDomainInPriorFlagged = {
        domain: websiteDomain,
        priorScanCount,
        priorFlaggedCount,
        scansWithVerdictCount: scansWithVerdictCount > 0 ? scansWithVerdictCount : undefined,
      };
    }
  }

  // Claim motif: strong when (1) repeated combination of 2+ types, or (2) repeated unsupported/contradicted type; weak when single type only
  const snapshotKey = (s: WebsiteSnapshotRecord) => s.tokenAddress + String(s.scannedAt);
  const snapshotTypes = new Map<string, Set<string>>();
  const snapshotUnsupportedTypes = new Map<string, Set<string>>();
  for (const s of recent) {
    const types = new Set((s.claims ?? []).map((c) => c.type));
    const unsupported = new Set(
      (s.claims ?? []).filter((c) => isUnsupportedStatus(c.verificationStatus)).map((c) => c.type),
    );
    if (types.size > 0) snapshotTypes.set(snapshotKey(s), types);
    if (unsupported.size > 0) snapshotUnsupportedTypes.set(snapshotKey(s), unsupported);
  }

  const currentCombo = claimTypes.length >= 2 ? typeComboKey(new Set(claimTypes)) : null;
  const comboCount: Record<string, number> = {};
  const unsupportedTypeCount: Record<string, number> = {};
  const singleTypeCount: Record<string, number> = {};
  for (const s of flagged) {
    const key = snapshotKey(s);
    const types = snapshotTypes.get(key);
    const unsupported = snapshotUnsupportedTypes.get(key);
    if (types && types.size > 0) {
      const combo = types.size >= 2 ? typeComboKey(types) : null;
      if (combo) comboCount[combo] = (comboCount[combo] ?? 0) + 1;
      for (const t of types) singleTypeCount[t] = (singleTypeCount[t] ?? 0) + 1;
    }
    if (unsupported) for (const t of unsupported) unsupportedTypeCount[t] = (unsupportedTypeCount[t] ?? 0) + 1;
  }

  // Strong: repeated combination (2+ types) in 2+ prior flagged
  if (currentCombo && (comboCount[currentCombo] ?? 0) >= 2) {
    const priorFlaggedCount = comboCount[currentCombo] ?? 0;
    const priorScanCount = flagged.filter((s) => {
      const types = snapshotTypes.get(snapshotKey(s));
      return types && types.size >= 2 && typeComboKey(types) === currentCombo;
    }).length;
    out.repeatedClaimMotif = {
      claimTypes: [...claimTypes].sort(),
      priorScanCount,
      priorFlaggedCount,
      strength: "strong",
    };
  }
  // Strong: same unsupported/contradicted type in 2+ prior flagged
  else if (currentUnsupportedTypes.size > 0) {
    const repeatedUnsupported = [...currentUnsupportedTypes].filter((t) => (unsupportedTypeCount[t] ?? 0) >= 2);
    if (repeatedUnsupported.length > 0) {
      const priorFlaggedCount = Math.max(...repeatedUnsupported.map((t) => unsupportedTypeCount[t] ?? 0), 0);
      const priorScanCount = flagged.filter((s) => {
        const unsupported = snapshotUnsupportedTypes.get(snapshotKey(s));
        return unsupported && repeatedUnsupported.some((t) => unsupported.has(t));
      }).length;
      out.repeatedClaimMotif = {
        claimTypes: repeatedUnsupported,
        priorScanCount,
        priorFlaggedCount,
        strength: "strong",
        unsupportedContradicted: true,
      };
    }
  }

  // Weak: single generic claim-type repetition (only if we didn't already set strong motif)
  if (!out.repeatedClaimMotif && claimTypes.length > 0) {
    const repeatedSingle = claimTypes.filter((t) => (singleTypeCount[t] ?? 0) >= 2);
    if (repeatedSingle.length > 0) {
      const priorFlaggedCount = Math.max(...repeatedSingle.map((t) => singleTypeCount[t] ?? 0), 0);
      const priorScanCount = flagged.filter((s) => {
        const types = snapshotTypes.get(snapshotKey(s));
        return types && repeatedSingle.some((t) => types.has(t));
      }).length;
      out.repeatedClaimMotif = {
        claimTypes: repeatedSingle,
        priorScanCount,
        priorFlaggedCount,
        strength: "weak",
      };
    }
  }

  // Visual: always weak; never used for strongest finding
  if (visualSummary && String(visualSummary).trim()) {
    const currentHash = hashVisualSummary(visualSummary);
    const withSameHash = recent.filter(
      (s) => s.visualSummaryHash === currentHash && s.tokenAddress !== tokenAddress,
    );
    const priorScanCount = withSameHash.length;
    const priorFlaggedCount = withSameHash.filter((s) => isFlaggedVerdict(s.verdictAtScan)).length;
    if (priorScanCount >= 2 && priorFlaggedCount >= 1) {
      out.repeatedVisualPattern = { priorScanCount, priorFlaggedCount, strength: "weak" };
    }
  }

  // Strongest one-line finding: only from strong signals (same domain, strong claim motif). Never from weak or visual.
  if (out.sameDomainInPriorFlagged) {
    out.strongestReputationFinding = `Same domain appeared in prior suspicious scans (${out.sameDomainInPriorFlagged.priorScanCount} prior scans, ${out.sameDomainInPriorFlagged.priorFlaggedCount} flagged).`;
  } else if (out.repeatedClaimMotif && out.repeatedClaimMotif.strength === "strong") {
    const types = out.repeatedClaimMotif.claimTypes.slice(0, 3).join(", ");
    const motif = out.repeatedClaimMotif.unsupportedContradicted
      ? "Repeated unsupported or contradicted trust-claim motif seen in prior flagged scans"
      : "Repeated trust-claim combination seen in prior flagged scans";
    out.strongestReputationFinding = `${motif} (${types}; ${out.repeatedClaimMotif.priorFlaggedCount} prior flagged).`;
  }
  // authorityPlusPattern is set by caller (Investigator) when lineage + pattern; then it takes precedence in strongest
  return out;
}
