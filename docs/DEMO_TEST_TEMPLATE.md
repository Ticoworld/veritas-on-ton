# Veritas Track 2 — Demo test template and runbook

**Purpose:** Lock a repeatable demo set with real results. Fill this by running the Telegram bot (or API) against real tokens; do not invent data.

---

## How to run the tests

1. **Production or staging:** Deploy the app with the env checklist below. Ensure the Telegram webhook points to your deployment.
2. **Open Telegram** and start a chat with your bot.
3. **For each token:** Send the jetton contract address (friendly base64, e.g. from DexScreener or a block explorer). Record what the bot returns.
4. **Fill one row per token:** Actual verdict, whether a screenshot photo appeared, strongest evidence from the card/report, and any confusing or weak output.

---

## Token set (fill with real results)

| # | Token address | Expected verdict | Expected screenshot | Strongest evidence | Actual verdict | Screenshot shown? | Issues |
|---|---------------|------------------|---------------------|-------------------|----------------|-------------------|--------|
| 1 | | Likely legitimate | Yes | | | | |
| 2 | | Likely legitimate | Yes | | | | |
| 3 | | Likely legitimate | No / Yes | | | | |
| 4 | | Suspicious | Yes | | | | |
| 5 | | Suspicious | Yes | | | | |
| 6 | | Suspicious | No / Yes | | | | |
| 7 | | High risk | Yes | | | | |
| 8 | | High risk | No / Yes | | | | |
| 9 | | Cannot verify | No | | | | |
| 10 | | Cannot verify | No | | | | |

**Fields:**

- **Token address:** TON jetton contract address (friendly base64). Use tokens you have verified on-chain or on DexScreener.
- **Expected verdict:** What you expect before running (Likely legitimate | Suspicious | High risk | Cannot verify).
- **Expected screenshot:** Yes if token has a real project website (not t.me/x.com) and env is set for saving + base URL.
- **Strongest evidence:** 1–2 bullets from the bot’s card or Full Report (e.g. "Mint disabled, no visual reuse", "Template reuse, creator dumped").
- **Actual verdict:** Exact verdict text the bot returned.
- **Screenshot shown?:** Yes / No — did a photo message appear after the verdict card?
- **Issues:** Wrong verdict, missing photo, unclear copy, or slow response.

---

## Final 3-token shortlist (fill after testing)

Pick exactly three tokens from the table above for the live demo. Record addresses and reasons below.

### Demo token 1 — Likely legitimate

- **Address:** 
- **Chosen because:** (e.g. Clean verdict, screenshot appeared, strong on-chain + visual “no deception” message.)

### Demo token 2 — Suspicious or high risk with screenshot

- **Address:** 
- **Chosen because:** (e.g. Clear risky verdict, screenshot photo in chat with evidence-based caption, obvious visual/on-chain signals.)

### Demo token 3 — Cannot verify

- **Address:** 
- **Chosen because:** (e.g. Explicit “Cannot verify”, “Visual: not captured”, no screenshot, proves honest handling of missing data.)

---

## Rehearse order

1. Send **demo token 1** (legit) → fast clean verdict + screenshot proof.
2. Send **demo token 2** (suspicious/high risk) → risky verdict + visual evidence in chat.
3. Send **demo token 3** (cannot verify) → Cannot verify + explicit missing coverage, no photo.

---

## Blunt report (fill after testing)

### Completed 10-token table

- **Location:** Table above, filled with real addresses and results.
- **Summary:** X/10 matched expected verdict; X/10 showed screenshot when expected; list any repeated issues (e.g. “screenshot missing for tokens with website”).

### Final 3-token shortlist and reasons

- **Token 1 (legit):** Address + exact reason chosen (e.g. “Only legit token where screenshot appeared and caption said ‘no major visual deception’.”).
- **Token 2 (suspicious/high risk):** Address + exact reason chosen (e.g. “Strongest visual proof: photo + caption mentioned scam template reuse.”).
- **Token 3 (cannot verify):** Address + exact reason chosen (e.g. “Clear ‘Visual: not captured’ and ‘Cannot verify’; no false certainty.”).

### Product behavior that still risks live demo failure

- (List anything that failed or was fragile during testing, e.g. “Screenshot sometimes missing when website is slow”, “Verdict card too long for token X”, “Caption was generic for token Y”.)

### Exact env checklist for production demo readiness

Use this checklist before every demo run. All must be true for screenshot-backed flows.

- [ ] **GEMINI_API_KEY** — set and valid (required for analysis).
- [ ] **TELEGRAM_BOT_TOKEN** — set and webhook set to this app’s `/api/telegram/webhook`.
- [ ] **VERITAS_SAVE_SCREENSHOTS=true** — so screenshot is written and `screenshotPublicUrl` is set.
- [ ] **VERITAS_PUBLIC_BASE_URL** or **VERCEL_URL** — set to the public base URL of the deployment (e.g. `https://your-app.vercel.app`) so Telegram can fetch the screenshot image.
- [ ] **SCREENSHOTONE_ACCESS_KEY** — set (primary capture); or accept Microlink-only and no key.
- [ ] **MONGODB_URI** — optional but recommended (Elephant Memory / known scammer blocking).
- [ ] Webhook URL is reachable from the internet (no localhost for production).
- [ ] `GET {base}/screenshots/scan-website-{uuid}.jpg` is publicly reachable (no auth) so Telegram’s servers can download the photo.
- [ ] Demo tokens chosen have been tested at least once on this deployment (verdict + screenshot as expected).

---

## Notes

- Screenshot photo appears only when: capture succeeded, `VERITAS_SAVE_SCREENSHOTS=true`, and a public base URL is set. Otherwise the card still shows “Visual: not captured” or “Visual: captured and analyzed” but no photo.
- For “Cannot verify” you want tokens with no real project website (or failed capture) and/or missing market/on-chain data so the bot correctly withholds a confident verdict.
