/**
 * ahmagh_agent — AI Task/Workflow Manager برای تلگرام، روی Cloudflare Workers
 *
 * مسیرها:
 * - POST /webhook              ← وبهوک تلگرام (محافظت‌شده با X-Telegram-Bot-Api-Secret-Token)
 * - GET  /set-webhook?key=…    ← ثبت خودکار وبهوک روی آدرس همین ورکر
 * - GET  /health (یا /)        ← سلامت‌سنجی
 *
 * رویداد scheduled (Cron Trigger هر ۱۰ دقیقه) ← موتور یادآوری
 */
import type { Env } from "./types";
import { handleUpdate } from "./handlers";
import { cleanupPendingTasks } from "./db";
import { runAutoStart, runReminders } from "./reminders";
import { setWebhook } from "./telegram";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/webhook") {
      if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

      // تأیید اینکه واقعاً تلگرام پیام فرستاده
      const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (!env.WEBHOOK_SECRET || secret !== env.WEBHOOK_SECRET) {
        return new Response("Forbidden", { status: 403 });
      }

      let update: unknown;
      try {
        update = await request.json();
      } catch {
        return new Response("Bad Request", { status: 400 });
      }

      // جواب سریع به تلگرام؛ پردازش بعد از پاسخ ادامه پیدا می‌کند
      ctx.waitUntil(handleUpdate(env, update));
      return new Response("OK");
    }

    if (url.pathname === "/set-webhook") return handleSetWebhook(request, env, url);

    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json({
        ok: true,
        bot: "ahmagh_agent",
        phase: 1,
        time: new Date().toISOString(),
      });
    }

    return new Response("Not Found 🤖", { status: 404 });
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        await runReminders(env); // موتور یادآوری
        await runAutoStart(env); // شروع خودکار تسک‌هایی که تاریخ شروعشان رسیده
        await cleanupPendingTasks(env); // پاک‌سازی پیش‌نویس‌های بی‌جواب
      })()
    );
  },
} satisfies ExportedHandler<Env>;

/** ثبت وبهوک تلگرام روی آدرس همین ورکر: GET /set-webhook?key=<WEBHOOK_SECRET> */
async function handleSetWebhook(request: Request, env: Env, url: URL): Promise<Response> {
  const key = url.searchParams.get("key");
  if (!key || key !== env.WEBHOOK_SECRET) {
    return Response.json(
      { ok: false, error: "invalid or missing ?key= — باید دقیقاً برابر WEBHOOK_SECRET باشد" },
      { status: 403 }
    );
  }
  const webhookUrl = `${url.origin}/webhook`;
  const result = await setWebhook(env, webhookUrl, env.WEBHOOK_SECRET);
  return Response.json({ ok: !!result?.ok, webhook_url: webhookUrl, telegram_response: result });
}
