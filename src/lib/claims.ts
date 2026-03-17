/**
 * Phase 1: Structured claim verification for trust investigation.
 * Claim types and verification status model. No accusation-heavy language.
 */

export const CLAIM_TYPES = [
  "audit",
  "partner",
  "sponsor",
  "ecosystem",
  "renounced",
  "listing",
  "implied_affiliation",
] as const;

export type ClaimType = (typeof CLAIM_TYPES)[number];

export const VERIFICATION_STATUSES = [
  "verified",
  "unverified",
  "contradicted",
  "unknown",
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export interface Claim {
  type: ClaimType;
  /** Raw claim text or short summary from website/screenshot */
  rawClaim: string;
  /** Source context if available (e.g. "footer badge", "hero section") */
  sourceContext?: string;
  /** Verification outcome */
  verificationStatus: VerificationStatus;
  /** Short evidence or reason for the status */
  evidence: string;
}

/**
 * Apply on-chain verification for renounced/immutable/safe contract claims.
 * Called from Investigator after AI returns claims; overwrites status when we have ground truth.
 */
export function applyOnChainClaimVerification(
  claims: Claim[],
  mintAuth: string | null,
  freezeAuth: string | null
): Claim[] {
  return claims.map((c) => {
    if (c.type !== "renounced") return c;
    const mintEnabled = !!mintAuth;
    const freezeEnabled = !!freezeAuth;
    const anyEnabled = mintEnabled || freezeEnabled;
    if (anyEnabled) {
      const parts: string[] = [];
      if (mintEnabled) parts.push("mint authority enabled");
      if (freezeEnabled) parts.push("freeze authority enabled");
      return {
        ...c,
        verificationStatus: "contradicted" as const,
        evidence: `On-chain: ${parts.join("; ")}. Contract can still be changed.`,
      };
    }
    return {
      ...c,
      verificationStatus: "verified" as const,
      evidence: "On-chain: mint and freeze authority disabled.",
    };
  });
}

/**
 * Pick the single strongest claim-based finding for top-level summary.
 * Prefer contradicted > unverified > unknown > verified (only show verified if we want to highlight good signal).
 */
export function strongestClaimSummary(claims: Claim[]): string | undefined {
  if (!claims?.length) return undefined;
  const contradicted = claims.find((c) => c.verificationStatus === "contradicted");
  if (contradicted) {
    return `${contradicted.type} claim contradicted: ${contradicted.evidence.slice(0, 80)}${contradicted.evidence.length > 80 ? "…" : ""}`;
  }
  const unverified = claims.find((c) => c.verificationStatus === "unverified");
  if (unverified) {
    return `${unverified.type} claim detected but not independently verified`;
  }
  const unknown = claims.find((c) => c.verificationStatus === "unknown");
  if (unknown) {
    return `${unknown.type} claim could not be verified`;
  }
  return undefined;
}
