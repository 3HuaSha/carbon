import {
  getAppUrl,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_BOT_USERNAME
} from "@carbon/env";
import { getLogger } from "@carbon/logger";

const log = getLogger("lib", "telegram");

const TELEGRAM_API = "https://api.telegram.org";

export type TelegramInlineKeyboardButton = {
  text: string;
  callback_data?: string;
  url?: string;
};

export type TelegramReplyMarkup = {
  inline_keyboard: TelegramInlineKeyboardButton[][];
};

type TelegramApiResult<T> = {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
};

async function callTelegramApi<T>(
  method: string,
  body: Record<string, unknown>,
  token = TELEGRAM_BOT_TOKEN
): Promise<T> {
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const payload = (await response.json()) as TelegramApiResult<T>;
  if (!payload.ok) {
    const err = new Error(
      payload.description ?? `Telegram API ${method} failed`
    );
    (err as Error & { code?: number }).code = payload.error_code;
    throw err;
  }
  return payload.result as T;
}

/**
 * Posts a Telegram message. No-ops on localhost (mirrors Slack) unless
 * `force` is set — local webhook testing can opt in.
 */
export async function sendTelegramMessage(args: {
  chatId: string | number;
  text: string;
  replyMarkup?: TelegramReplyMarkup;
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  disableWebPagePreview?: boolean;
  force?: boolean;
  token?: string;
}): Promise<{ messageId: number } | null> {
  const appUrl = getAppUrl();
  if (!args.force && appUrl.includes("localhost")) {
    log.info("Skipping Telegram send on localhost", { chatId: args.chatId });
    return null;
  }

  const result = await callTelegramApi<{ message_id: number }>(
    "sendMessage",
    {
      chat_id: args.chatId,
      text: args.text,
      parse_mode: args.parseMode,
      disable_web_page_preview: args.disableWebPagePreview ?? true,
      reply_markup: args.replyMarkup
    },
    args.token
  );

  return { messageId: result.message_id };
}

export async function editTelegramMessage(args: {
  chatId: string | number;
  messageId: number;
  text: string;
  replyMarkup?: TelegramReplyMarkup | { inline_keyboard: never[] };
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  token?: string;
}): Promise<void> {
  await callTelegramApi(
    "editMessageText",
    {
      chat_id: args.chatId,
      message_id: args.messageId,
      text: args.text,
      parse_mode: args.parseMode,
      disable_web_page_preview: true,
      reply_markup: args.replyMarkup
    },
    args.token
  );
}

export async function answerTelegramCallbackQuery(args: {
  callbackQueryId: string;
  text?: string;
  showAlert?: boolean;
  token?: string;
}): Promise<void> {
  await callTelegramApi(
    "answerCallbackQuery",
    {
      callback_query_id: args.callbackQueryId,
      text: args.text,
      show_alert: args.showAlert ?? false
    },
    args.token
  );
}

export async function setTelegramWebhook(args: {
  url: string;
  secretToken: string;
  token?: string;
}): Promise<void> {
  await callTelegramApi(
    "setWebhook",
    {
      url: args.url,
      secret_token: args.secretToken,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true
    },
    args.token
  );
}

export async function getTelegramBotMe(token = TELEGRAM_BOT_TOKEN): Promise<{
  id: number;
  username?: string;
  first_name?: string;
}> {
  return callTelegramApi("getMe", {}, token);
}

export function getTelegramBotDeepLink(startPayload?: string): string {
  const username = TELEGRAM_BOT_USERNAME.replace(/^@/, "");
  if (!startPayload) return `https://t.me/${username}`;
  return `https://t.me/${username}?start=${encodeURIComponent(startPayload)}`;
}
