/**
 * Telegram Bot API helpers for webhook handler.
 * Uses fetch to https://api.telegram.org/bot<token>/...
 */

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token.trim() === "") {
    throw new Error("TELEGRAM_BOT_TOKEN is not set");
  }
  return token.trim();
}

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export async function sendMessage(
  chatId: number,
  text: string,
  options?: {
    parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
    reply_to_message_id?: number;
    inline_keyboard?: InlineKeyboardButton[][];
    disable_web_page_preview?: boolean;
  }
): Promise<{ ok: boolean; result?: { message_id: number }; description?: string }> {
  const token = getBotToken();
  const url = `${TELEGRAM_API_BASE}${token}/sendMessage`;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...options,
  };
  if (options?.inline_keyboard) {
    body.reply_markup = { inline_keyboard: options.inline_keyboard };
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<{ ok: boolean; result?: { message_id: number }; description?: string }>;
}

export async function editMessageText(
  chatId: number,
  messageId: number,
  text: string,
  options?: {
    parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
    inline_keyboard?: InlineKeyboardButton[][];
  }
): Promise<{ ok: boolean; result?: { message_id: number }; description?: string }> {
  const token = getBotToken();
  const url = `${TELEGRAM_API_BASE}${token}/editMessageText`;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
    disable_web_page_preview: true,
    ...options,
  };
  if (options?.inline_keyboard) {
    body.reply_markup = { inline_keyboard: options.inline_keyboard };
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<{ ok: boolean; result?: { message_id: number }; description?: string }>;
}

/**
 * Sends a photo by URL. Telegram fetches the image from the URL.
 * Use when screenshot evidence is available at a public URL.
 * Caption max 1024 characters.
 */
export async function sendPhoto(
  chatId: number,
  photoUrl: string,
  options?: { caption?: string }
): Promise<{ ok: boolean; result?: { message_id: number }; description?: string }> {
  const token = getBotToken();
  const url = `${TELEGRAM_API_BASE}${token}/sendPhoto`;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    photo: photoUrl,
    ...options,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<{ ok: boolean; result?: { message_id: number }; description?: string }>;
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  options?: { text?: string; show_alert?: boolean }
): Promise<{ ok: boolean }> {
  const token = getBotToken();
  const url = `${TELEGRAM_API_BASE}${token}/answerCallbackQuery`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, ...options }),
  });
  return res.json() as Promise<{ ok: boolean }>;
}
