/**
 * Creator token history lookup.
 * Fetches prior jetton mint events for an authority address from TonAPI.
 */

export interface CreatorTokenHistory {
  tokenName: string;
  mint: string;
  date: string;
}

/**
 * Fetches account events from TonAPI and maps them to creator token history.
 */
export async function getCreatorHistory(
  creatorAddress: string,
): Promise<CreatorTokenHistory[]> {
  try {
    const res = await fetch(
      `https://tonapi.io/v2/accounts/${creatorAddress}/events?limit=100`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return [];

    const data = (await res.json()) as {
      events?: Array<{
        timestamp?: number;
        actions?: Array<Record<string, unknown>>;
      }>;
    };
    const events = Array.isArray(data.events) ? data.events : [];

    const out: CreatorTokenHistory[] = [];
    const seen = new Set<string>();
    for (const ev of events) {
      const ts = Number(ev.timestamp) || 0;
      const date =
        ts > 0 ? new Date(ts * 1000).toISOString().split("T")[0] ?? "" : "";
      const actions = Array.isArray(ev.actions) ? ev.actions : [];

      for (const action of actions) {
        const jetton =
          (
            action as {
              JettonMint?: { jetton?: { name?: string; address?: string } };
              jetton?: { name?: string; address?: string };
            }
          ).JettonMint?.jetton ??
          (
            action as {
              jetton?: { name?: string; address?: string };
            }
          ).jetton;

        const mint = (jetton?.address ?? "") as string;
        const tokenName = (jetton?.name ?? "Unknown") as string;
        if (mint && !seen.has(mint)) {
          seen.add(mint);
          out.push({ tokenName, mint, date });
        }
      }
    }

    return out;
  } catch {
    return [];
  }
}
