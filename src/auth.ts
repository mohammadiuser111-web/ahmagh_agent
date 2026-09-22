/**
 * ثبت‌نام و نقش‌ها: admin (با مشخصات ادمین) یا user (عادی)
 * مشخصات ادمین از سیکرت‌های ورکر می‌آید (ADMIN_USERNAME / ADMIN_PASSWORD).
 */
import type { Env } from "./types";
import { findUserByLogin, getUser, promoteAdmin, setAlias, setUserCredentials } from "./db";
import { escapeHtml, sendMessage } from "./telegram";
import { setUserRole } from "./db";

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function cmdRegister(env: Env, msg: any, arg: string): Promise<void> {
  const parts = arg.trim().split(/\s+/);
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    await sendMessage(
      env,
      msg.chat.id,
      "📝 شکل درست: <code>/register &lt;نام‌کاربری&gt; &lt;رمز‌عبور&gt; [اسم مستعار]</code>\n\n" +
        "نام کاربری: ۳ تا ۳۲ کاراکتر لاتین/عدد/زیرخط\n" +
        "اسم مستعار: چیزی که ادمین به جای @ برای واگذاری تسک به تو می‌بیند (مثلاً: ایمان)\n" +
        "با مشخصات ادمین ثبت‌نام کنی → نقشت <b>ادمین</b> می‌شه 👑"
    );
    return;
  }
  const [username, password] = parts;
  const alias = parts.slice(2).join(" ").trim() || null;

  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
    await sendMessage(env, msg.chat.id, "❌ نام کاربری باید ۳ تا ۳۲ کاراکتر لاتین، عدد یا _ باشد.");
    return;
  }
  if (password.length < 4) {
    await sendMessage(env, msg.chat.id, "❌ رمز عبور باید حداقل ۴ کاراکتر باشد.");
    return;
  }

  const lower = username.toLowerCase();
  const adminUser = (env.ADMIN_USERNAME || "admin").toLowerCase();
  const adminPass = env.ADMIN_PASSWORD || "";

  // 👑 ادمین: admin/1234 — چند ادمین مجاز است؛ نام «admin» را هیچ‌کس تصاحب نمی‌کند
  if (lower === adminUser) {
    if (!adminPass || password !== adminPass) {
      await sendMessage(env, msg.chat.id, "❌ رمز عبور برای این نام کاربری درست نیست.");
      return;
    }
    const hash = await sha256Hex(password);
    await promoteAdmin(env, msg.from.id, hash);
    if (alias) await setAlias(env, msg.from.id, alias);
    await sendMessage(
      env,
      msg.chat.id,
      "👑 <b>ثبت‌نام ادمین انجام شد!</b>\nحالا می‌تونی برای خودت و بقیه‌ی کاربرها تسک بسازی." +
        (alias ? `\n🎭 اسم مستعارت: <b>${escapeHtml(alias)}</b>` : "")
    );
    return;
  }

  const existing = await findUserByLogin(env, lower);
  if (existing && existing.user_id !== msg.from.id) {
    await sendMessage(env, msg.chat.id, "❌ این نام کاربری قبلاً گرفته شده. یکی دیگه انتخاب کن.");
    return;
  }

  const hash = await sha256Hex(password);
  await setUserCredentials(env, msg.from.id, username, hash, "user", alias);
  await sendMessage(
    env,
    msg.chat.id,
    "👤 ثبت‌نام شدی (<b>کاربر عادی</b>).\nبرای خودت تسک بساز، لیست کن و خروجی بگیر!" +
      (alias ? `\n🎭 اسم مستعارت: <b>${escapeHtml(alias)}</b>` : "\n🎭 بعداً با /alias می‌تونی اسم مستعار بگیری.")
  );
}

export function validateAuthUsername(u: string): boolean {
  return /^[a-zA-Z0-9_]{3,32}$/.test(u);
}

/**
 * گام آخرِ ثبت‌نام/ورود دکمه‌ای: یوزرنیم + رمز آماده است.
 * خروجی: پیام نتیجه — اگر با ❌ شروع شود یعنی خطا (همان گام دوباره پرسیده می‌شود).
 */
export async function completeAuth(
  env: Env,
  userId: number,
  mode: "register" | "login",
  username: string,
  password: string,
  alias?: string | null
): Promise<string> {
  const lower = username.toLowerCase();
  const adminUser = (env.ADMIN_USERNAME || "admin").toLowerCase();
  const adminPass = env.ADMIN_PASSWORD || "";
  const hash = await sha256Hex(password);

  if (mode === "register") {
    if (!validateAuthUsername(username)) return "❌ نام کاربری باید ۳ تا ۳۲ کاراکتر لاتین، عدد یا _ باشد. دوباره بگو:";
    if (password.length < 4) return "❌ رمز عبور باید حداقل ۴ کاراکتر باشد. دوباره بگو:";
    // 👑 ادمین: چند ادمین مجاز — نام «admin» تصاحب نمی‌شود
    if (lower === adminUser) {
      if (!adminPass || password !== adminPass) return "❌ رمز عبور برای این نام کاربری درست نیست. دوباره بگو:";
      await promoteAdmin(env, userId, hash);
      if (alias) await setAlias(env, userId, alias);
      return "👑 <b>ثبت‌نام ادمین انجام شد!</b>\nحالا می‌تونی برای خودت و بقیه‌ی کاربرها تسک بسازی.";
    }
    const existing = await findUserByLogin(env, lower);
    if (existing && existing.user_id !== userId) return "❌ این نام کاربری قبلاً گرفته شده. یوزرنیم دیگری بگو:";
    try {
      await setUserCredentials(env, userId, username, hash, "user", alias ?? null);
    } catch {
      return "❌ این نام کاربری قبلاً گرفته شده. یوزرنیم دیگری بگو:";
    }
    return `🎉 <b>ثبت‌نام کامل شد!</b> خوش اومدی <b>${escapeHtml(username)}</b>.\nاز همین حالا هرجور که راحتی بگو تا کارهات رو مدیریت کنم 👇`;
  }

  // ورود
  // 👑 چند ادمین: هر کس admin/1234 بزند ادمین می‌شود — ثبت‌نامِ شخصی‌اش دست نمی‌خورد
  if (lower === adminUser && adminPass && password === adminPass) {
    await promoteAdmin(env, userId, hash);
    return "👑 <b>خوش برگشتی ادمین!</b>";
  }
  const u = await findUserByLogin(env, lower);
  if (!u || !u.password_hash || u.password_hash !== hash) {
    return "❌ نام کاربری یا رمز عبور درست نیست. دوباره بگو:";
  }
  let role = u.role;
  if (lower === adminUser && adminPass && password === adminPass) role = "admin";
  // اگر از یک اکانت تلگرام دیگری وارد شده، اعتبارنامه به همین اکانت وصل می‌شود
  if (u.user_id !== userId) await setUserCredentials(env, userId, username, hash, role);
  else if (role !== u.role) await setUserRole(env, userId, role);
  return role === "admin" ? "👑 <b>خوش برگشتی ادمین!</b>" : `👋 <b>خوش برگشتی ${escapeHtml(username)}!</b>`;
}

export async function cmdWhoami(env: Env, msg: any): Promise<void> {
  const u = await getUser(env, msg.from.id);
  if (!u) {
    await sendMessage(env, msg.chat.id, "هنوز ثبت‌نام نکردی! /register <نام‌کاربری> <رمز>");
    return;
  }
  const role = u.role === "admin" ? "👑 ادمین" : "👤 کاربر عادی";
  const name = u.username_login ? `@${u.username_login}` : "—";
  await sendMessage(
    env,
    msg.chat.id,
    `🪪 <b>پروفایل من</b>\n\nنام کاربری: <b>${name}</b>\nنقش: <b>${role}</b>\nشناسه تلگرام: <code>${u.user_id}</code>`
  );
}
