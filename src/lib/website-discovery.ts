/**
 * Lightweight website discovery and classification.
 * Uses only current low-cost sources (token metadata, socials, prior snapshot).
 * Rejects social/aggregator URLs as official website candidates.
 */

export type LinkKind = "website" | "social" | "docs" | "aggregator" | "unknown";

export type WebsiteDiscoveryStatus =
  | "official_site_found"
  | "site_found_low_confidence"
  | "social_only"
  | "multiple_candidates"
  | "no_site_found";

export interface ClassifiedLink {
  url: string;
  kind: LinkKind;
  label?: string;
  isOfficialCandidate: boolean;
}

export interface WebsiteDiscoveryResult {
  status: WebsiteDiscoveryStatus;
  /** Selected URL for investigation (best official candidate, or undefined). */
  selectedWebsite: string | null;
  /** Confidence: high when single clear official site; low when inferred or multiple. */
  sourceConfidence: "high" | "low" | "none";
  /** All classified links from token metadata. */
  candidateLinks: ClassifiedLink[];
  /** Human-readable reason (e.g. "Single project website from token metadata"). */
  statusReason?: string;
}

const SOCIAL_DOMAINS = [
  "x.com",
  "twitter.com",
  "t.me",
  "telegram.me",
  "telegram.dog",
  "discord.gg",
  "discord.com",
  "medium.com",
];

const AGGREGATOR_DOMAINS = ["linktr.ee", "linktree.com", "bio.link", "links.fyi"];

function hostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function classifyUrl(url: string, label?: string): ClassifiedLink {
  const h = hostname(url);
  if (!h) return { url, kind: "unknown", label, isOfficialCandidate: false };

  if (SOCIAL_DOMAINS.some((d) => h === d || h.endsWith("." + d)))
    return { url, kind: "social", label, isOfficialCandidate: false };
  if (AGGREGATOR_DOMAINS.some((d) => h === d || h.endsWith("." + d)))
    return { url, kind: "aggregator", label, isOfficialCandidate: false };

  const lowerLabel = (label ?? "").toLowerCase();
  if (lowerLabel.includes("doc") || lowerLabel.includes("gitbook") || h.includes("gitbook") || h.includes("docs."))
    return { url, kind: "docs", label, isOfficialCandidate: true };
  if (lowerLabel.includes("web") || lowerLabel === "website" || lowerLabel === "site")
    return { url, kind: "website", label, isOfficialCandidate: true };

  return { url, kind: "website", label, isOfficialCandidate: true };
}

/**
 * Run website discovery from token socials and optional prior snapshot.
 */
export function discoverWebsite(sources: {
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  /** From DexScreener etc.: [{ label, url }] */
  websites?: Array<{ label?: string; url: string }>;
  /** Prior snapshot URL if same token was scanned before. */
  priorSnapshotUrl?: string | null;
}): WebsiteDiscoveryResult {
  const candidates: ClassifiedLink[] = [];

  if (sources.website && sources.website.trim() && sources.website.trim().toLowerCase() !== "none") {
    candidates.push(classifyUrl(sources.website.trim(), "website"));
  }
  if (sources.twitter) candidates.push(classifyUrl(sources.twitter, "twitter"));
  if (sources.telegram) candidates.push(classifyUrl(sources.telegram, "telegram"));
  if (sources.discord) candidates.push(classifyUrl(sources.discord, "discord"));
  if (sources.websites) {
    for (const w of sources.websites) {
      if (w?.url && w.url.trim()) candidates.push(classifyUrl(w.url.trim(), w.label));
    }
  }
  if (sources.priorSnapshotUrl && sources.priorSnapshotUrl.trim()) {
    const c = classifyUrl(sources.priorSnapshotUrl.trim(), "prior");
    if (!candidates.some((x) => hostname(x.url) === hostname(c.url))) candidates.push(c);
  }

  const officialCandidates = candidates.filter((c) => c.isOfficialCandidate);
  const websiteCandidates = candidates.filter((c) => c.kind === "website");

  if (officialCandidates.length === 0 && websiteCandidates.length === 0) {
    const hasSocial = candidates.some((c) => c.kind === "social");
    return {
      status: hasSocial ? "social_only" : "no_site_found",
      selectedWebsite: null,
      sourceConfidence: "none",
      candidateLinks: candidates,
      statusReason: hasSocial
        ? "Only social links found from available metadata; no independent project website identified. You can optionally add a website URL in the app and rescan if there is an official site."
        : "No website or social links discovered from available metadata. If you know the official project website, add it in the app and rescan.",
    };
  }

  if (officialCandidates.length > 1) {
    const first = officialCandidates[0];
    return {
      status: "multiple_candidates",
      selectedWebsite: first.url,
      sourceConfidence: "low",
      candidateLinks: candidates,
      statusReason: "Multiple website candidates; first used for investigation.",
    };
  }

  if (officialCandidates.length === 1) {
    const label = officialCandidates[0].label?.toLowerCase() ?? "";
    const isExplicitWebsite = label.includes("web") || label === "website" || label === "site";
    return {
      status: isExplicitWebsite ? "official_site_found" : "site_found_low_confidence",
      selectedWebsite: officialCandidates[0].url,
      sourceConfidence: isExplicitWebsite ? "high" : "low",
      candidateLinks: candidates,
      statusReason: isExplicitWebsite
        ? "Official project website discovered from available token metadata."
        : "Website candidate inferred from current token metadata; treat as lower confidence.",
    };
  }

  const fallback = websiteCandidates[0];
  return {
    status: "site_found_low_confidence",
    selectedWebsite: fallback?.url ?? null,
    sourceConfidence: "low",
    candidateLinks: candidates,
    statusReason: "Single link used as website candidate from available metadata; confidence is limited.",
  };
}
