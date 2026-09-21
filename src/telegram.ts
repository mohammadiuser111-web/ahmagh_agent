/**
 * کلاینت سبک Bot API تلگرام
 */
import type { Env } from "./types";

async function call(env: Env, method: string, payload: Record<string, unknown>): Promise<any> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`[telegram] ${method} → HTTP ${res.status}: ${await res.text()}`);
    }
    return await res.json().catch(() => null);
  } catch (err) {
    console.error(`[telegram] ${method} failed:`, err);
    return null;
  }
}

/** ارسال فایل (سند) به چت — data: بایت‌ها یا رشته */
export async function sendDocument(
  env: Env,
  chatId: number,
  data: Uint8Array | string,
  filename: string,
  mimeType: string,
  caption = ""
): Promise<any> {
  try {
    const blob = new Blob([data as unknown as ArrayBuffer], { type: mimeType });
    const fd = new FormData();
    fd.append("chat_id", String(chatId));
    if (caption) fd.append("caption", caption);
    fd.append("document", blob, filename);
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      console.error(`[telegram] sendDocument → HTTP ${res.status}: ${await res.text()}`);
    }
    return await res.json().catch(() => null);
  } catch (err) {
    console.error("[telegram] sendDocument failed:", err);
    return null;
  }
}

export function sendMessage(env: Env, chatId: number, text: string, extra: Record<string, unknown> = {}) {
  return call(env, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...extra,
  });
}

export function editMessageText(
  env: Env,
  chatId: number,
  messageId: number,
  text: string,
  extra: Record<string, unknown> = {}
) {
  return call(env, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...extra,
  });
}

export function answerCallbackQuery(env: Env, callbackQueryId: string | number, text: string) {
  return call(env, "answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

export function setWebhook(env: Env, url: string, secret: string) {
  return call(env, "setWebhook", {
    url,
    secret_token: secret,
    drop_pending_updates: true,
    allowed_updates: ["message", "callback_query"],
  });
}

/** escape کردن متن برای parse_mode=HTML */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
