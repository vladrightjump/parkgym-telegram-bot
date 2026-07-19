// Minimal helper over the Telegram Bot API — plain fetch, no dependencies.
// All methods are server-only (they read TELEGRAM_BOT_TOKEN from the env).

const API_BASE = "https://api.telegram.org";

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export type InlineKeyboard = InlineKeyboardButton[][];

interface TelegramResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN");
  return token;
}

async function call<T>(
  method: string,
  body: Record<string, unknown>,
): Promise<TelegramResponse<T>> {
  const res = await fetch(`${API_BASE}/bot${botToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as TelegramResponse<T>;
}

interface SentMessage {
  message_id: number;
}

// Send a message to a chat. Returns the sent message (message_id) on success.
export async function sendMessage(
  chatId: number | string,
  text: string,
  options?: { reply_markup?: { inline_keyboard: InlineKeyboard } },
): Promise<TelegramResponse<SentMessage>> {
  return call<SentMessage>("sendMessage", {
    chat_id: chatId,
    text,
    ...options,
  });
}

// Edit the text (and optionally keyboard) of an already-sent message.
export async function editMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
  options?: { reply_markup?: { inline_keyboard: InlineKeyboard } },
): Promise<TelegramResponse> {
  return call("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    ...options,
  });
}

// Acknowledge a callback query so Telegram stops the loading spinner; the
// optional text is shown as a toast to the user who tapped the button.
export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
): Promise<TelegramResponse> {
  return call("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}
