/**
 * Telegram Bot webhook handler.
 * Track 2 user-facing agent: /start, token address scan, inline Rescan / Full Report / Why risky?
 * Reuses VeritasInvestigator; no duplicate scan logic.
 */

import { NextRequest, NextResponse } from "next/server";
import { VeritasInvestigator } from "@/lib/services/VeritasInvestigator";
import { investigationResultToBotResult } from "@/lib/bot/normalized-result";
import { sendMessage, editMessageText, sendPhoto, answerCallbackQuery } from "@/lib/bot/telegram-api";
import {
  formatVerdictCard,
  formatFullReport,
  formatWhyRisky,
  verdictInlineKeyboard,
  getScreenshotFullUrl,
  formatScreenshotCaption,
} from "@/lib/bot/format-messages";
import { parseAndNormalizeTonAddress } from "@/lib/ton-address";

/** Minimal Telegram Update shape */
interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: { id: number };
    text?: string;
  };
  callback_query?: {
    id: string;
    from?: { id: number };
    message?: { message_id: number; chat: { id: number } };
    data?: string;
  };
}

/** Parse and normalize TON address; returns null if invalid. */
function parseAddress(text: string): string | null {
  return parseAndNormalizeTonAddress(text);
}

/** Run scan and return normalized bot result; throws on invalid address or investigator error. */
async function runScan(address: string) {
  const investigator = new VeritasInvestigator();
  const result = await investigator.investigate(address);
  return investigationResultToBotResult(result);
}

export async function POST(request: NextRequest) {
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secretToken) {
    const header = request.headers.get("x-telegram-bot-api-secret-token");
    if (header !== secretToken) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  let body: TelegramUpdate;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const updateId = body.update_id;

  try {
    if (body.message) {
      const chatId = body.message.chat.id;
      const text = body.message.text?.trim() ?? "";

      if (text === "/start") {
        await sendMessage(
          chatId,
          "Veritas — TON token security assessment for the TON ecosystem.\n\nSend a TON jetton contract address (48 characters, base64, for example from a block explorer or DexScreener). Veritas will run a visual, on-chain, and market analysis and return a structured risk verdict.\n\nURLs or token names are not accepted."
        );
        return NextResponse.json({ ok: true });
      }

      const address = parseAddress(text);
      if (!address) {
        await sendMessage(
          chatId,
          "That input is not a valid TON address. Send the jetton contract address in TON-friendly format (base64, as shown in a block explorer or DexScreener). URLs and token names are not accepted."
        );
        return NextResponse.json({ ok: true });
      }

      const statusMsg = await sendMessage(chatId, "Scanning token…");
      const statusMessageId = statusMsg.result?.message_id;

      try {
        const botResult = await runScan(address);
        const cardText = formatVerdictCard(botResult);
        const keyboard = verdictInlineKeyboard(address);

        if (statusMessageId) {
          await editMessageText(chatId, statusMessageId, cardText, { inline_keyboard: keyboard });
        } else {
          await sendMessage(chatId, cardText, { inline_keyboard: keyboard });
        }

        const screenshotUrl = getScreenshotFullUrl(botResult);
        if (screenshotUrl) {
          try {
            await sendPhoto(chatId, screenshotUrl, {
              caption: formatScreenshotCaption(botResult),
            });
          } catch (photoErr) {
            console.warn("[Telegram webhook] sendPhoto failed:", photoErr);
          }
        }
      } catch (err) {
        const errMessage = err instanceof Error ? err.message : "Scan failed.";
        const fallback = `Scan failed. ${errMessage}`;
        if (statusMessageId) {
          await editMessageText(chatId, statusMessageId, fallback);
        } else {
          await sendMessage(chatId, fallback);
        }
      }
      return NextResponse.json({ ok: true });
    }

    if (body.callback_query) {
      const cq = body.callback_query;
      const data = cq.data ?? "";
      const chatId = cq.message?.chat?.id;
      const messageId = cq.message?.message_id;

      await answerCallbackQuery(cq.id);

      const match = data.match(/^(rescan|full|why):(.+)$/);
      if (!match || !chatId) {
        return NextResponse.json({ ok: true });
      }
      const [, action, rawAddress] = match;
      const address = parseAndNormalizeTonAddress(rawAddress.trim());
      if (!address) {
        await sendMessage(chatId, "The address for this action could not be validated. Send a valid TON jetton address to run a new scan.");
        return NextResponse.json({ ok: true });
      }

      try {
        const botResult = await runScan(address);
        if (action === "rescan" && messageId !== undefined) {
          await editMessageText(chatId, messageId, formatVerdictCard(botResult), {
            inline_keyboard: verdictInlineKeyboard(address),
          });
          const screenshotUrl = getScreenshotFullUrl(botResult);
          if (screenshotUrl) {
            try {
              await sendPhoto(chatId, screenshotUrl, {
                caption: formatScreenshotCaption(botResult),
              });
            } catch (photoErr) {
              console.warn("[Telegram webhook] sendPhoto failed (rescan):", photoErr);
            }
          }
        } else if (action === "full") {
          await sendMessage(chatId, formatFullReport(botResult));
        } else if (action === "why") {
          await sendMessage(chatId, formatWhyRisky(botResult));
        }
      } catch (err) {
        const errMessage = err instanceof Error ? err.message : "Request failed.";
        await sendMessage(chatId, `Request failed. ${errMessage}`);
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Telegram webhook] error processing update", updateId, err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
