import crypto from "node:crypto";

/**
 * Validates Telegram Web App initData per https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * Returns true iff the hash in initData matches HMAC-SHA256(secret_key, data_check_string)
 * where secret_key = HMAC-SHA256("WebAppData", bot_token).
 */
export function validateTelegramData(
  telegramInitData: string,
  botToken: string,
): boolean {
  if (!telegramInitData?.trim() || !botToken?.trim()) {
    return false;
  }

  const params = new URLSearchParams(telegramInitData.trim());
  const hash = params.get("hash");
  if (!hash) return false;

  params.delete("hash");
  const sortedKeys = [...params.keys()].sort();
  const dataCheckString = sortedKeys
    .map((key) => `${key}=${params.get(key)}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  return signature === hash;
}
