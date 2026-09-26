/* ═══════════════════════════════════════════════════════════
   QA خودکار وب‌اپ — هر نما، دو تم، موبایل/دسکتاپ
   خروجی: shots/*.png + گزارش issues.json
   ═══════════════════════════════════════════════════════════ */
import { chromium } from "playwright";
import fs from "fs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8787";
const TOKEN = fs.readFileSync(".local-token", "utf-8").trim();
const OUT = "shots";
const issues = [];
const note = (state, msg, sev = "warn") => issues.push({ state, msg, sev });

// ---------- چک‌های درون‌صفحه ----------
const AUDIT_JS = (mobile) => ({
  overflowX: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth,
  fontLoaded: document.fonts.check('16px Vazirmatn'),
  viewport: { w: innerWidth, h: innerHeight },
  smallTaps: [...document.querySelectorAll("button, input, select, a")]
    .filter((el) => el.offsetParent !== null)
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.height > 0 && r.height < (mobile ? 40 : 30);
    })
    .map((el) => ({ tag: el.tagName, cls: el.className?.toString().slice(0, 40), h: Math.round(el.getBoundingClientRect().height) })),
  outOfView: [...document.querySelectorAll("main *, .sidebar *, .auth-card *")]
    .filter((el) => el.offsetParent !== null && !el.closest(".chat-scroll"))
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.left < -2 || r.right > innerWidth + 2);
    })
    .slice(0, 5)
    .map((el) => el.className?.toString().slice(0, 40) || el.tagName),
  // کنتراست متن‌های کلیدی (تقریبی WCAG)
  contrasts: (() => {
    function lum(c) {
      const m = c.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/);
      if (!m) return null;
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(+m[1]) + 0.7152 * f(+m[2]) + 0.0722 * f(+m[3]);
    }
    function bgOf(el) {
      let e = el;
      while (e) {
        const cs = getComputedStyle(e);
        // پس‌زمینه‌ی گرادیانی → رنگ میانگین را نمی‌شود قطعی گفت؛ رد کن
        if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
        const bg = cs.backgroundColor;
        if (bg && !/rgba?\(0[, ]+0[, ]+0[, ]+0\)|rgba\(0, 0, 0, 0\)/.test(bg)) return bg;
        e = e.parentElement;
      }
      return "rgb(255,255,255)";
    }
    const sels = [".muted", ".task-title", ".chip", ".auth-sub", ".chat-hint", "h2", ".group-head h3", ".stat-card .lbl", ".u-meta"];
    const out = {};
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const fg = getComputedStyle(el).color;
      const bg = bgOf(el);
      const l1 = lum(fg), l2 = bg === null ? null : lum(bg);
      if (l1 == null || l2 == null) { out[sel] = -1; continue; } // گرادیان/color-mix — قابل محاسبه نیست
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      out[sel] = Math.round(ratio * 100) / 100;
    }
    return out;
  })(),
  // فاصله‌ها مضرب ۴ هستند؟ (نمونه از کارت تسک)
  spacing: (() => {
    const el = document.querySelector(".task-card") || document.querySelector(".panel") || document.querySelector(".auth-card");
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { pad: [cs.paddingTop, cs.paddingInlineStart], radius: cs.borderRadius, gap: cs.rowGap };
  })(),
});

async function newPage(browser, { theme, mobile, cookie }) {
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    isMobile: !!mobile,
    hasTouch: !!mobile,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (m.text().includes("/api/me") || m.text().includes("401")) return; // بررسیِ نشست — بی‌خطر
    errors.push(m.text().slice(0, 160));
  });
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  page.on("requestfailed", (r) => errors.push("REQFAIL " + r.url().slice(-60)));
  await page.addInitScript((t) => { try { localStorage.setItem("ah_theme", t); } catch {} }, theme);
  if (cookie) await ctx.addCookies([{ name: "ah_session", value: cookie, url: BASE, httpOnly: true }]);
  return { ctx, page, errors };
}

async function audit(page, state, mobile, tag) {
  await page.waitForTimeout(600); // پایان انیمیشن‌ها
  const r = await page.evaluate(AUDIT_JS, mobile);
  if (r.overflowX > 0) note(tag, `اسکرول افقی: ${r.overflowX}px`, "high");
  if (!r.fontLoaded) note(tag, "فونت وزیرمتن لود نشده", "high");
  if (r.smallTaps.length) note(tag, `هدف‌های لمسی کوچک: ${JSON.stringify(r.smallTaps.slice(0, 3))}`, mobile ? "high" : "low");
  if (r.outOfView.length) note(tag, `خارج از کادر: ${r.outOfView.join(", ")}`, "high");
  for (const [sel, ratio] of Object.entries(r.contrasts)) {
    if (ratio > 0 && ratio < 4.0 && !sel.includes("chat-hint")) note(tag, `کنتراست ${sel} = ${ratio}`, ratio < 3 ? "high" : "med");
  }
  if (r.spacing) {
    for (const p of r.spacing.pad) {
      const v = parseFloat(p);
      if (!Number.isNaN(v) && v > 0 && Math.round(v) % 4 !== 0) note(tag, `پدینگ ${p} مضرب ۴ نیست`, "low");
    }
  }
  return r;
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: !name.includes("modal") && !name.includes("chat") });
}

const browser = await chromium.launch();
const results = {};

async function runState(name, { theme, mobile, cookie, flow }) {
  const tag = `${name}[${theme}${mobile ? "/m" : ""}]`;
  const { ctx, page, errors } = await newPage(browser, { theme, mobile, cookie });
  try {
    await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    await flow(page, tag);
    results[tag] = await audit(page, tag, mobile, tag);
    await shot(page, name + (theme === "dark" ? "-dark" : "") + (mobile ? "-m" : ""));
    if (errors.length) note(tag, `کنسول: ${errors[0]}`, "med");
  } catch (e) {
    note(tag, "FLOW ERROR: " + String(e).slice(0, 200), "high");
  } finally { await ctx.close(); }
}

const C = TOKEN;

// ---------- ورود ----------
await runState("login", { theme: "light", mobile: false, flow: async (p) => { await p.waitForSelector("#loginForm", { state: "visible" }); } });
await runState("login", { theme: "dark", mobile: true, flow: async (p) => { await p.waitForSelector("#loginForm", { state: "visible" }); } });
await runState("login-tg", { theme: "light", mobile: false, flow: async (p) => {
  await p.waitForSelector("#loginForm", { state: "visible" });
  await p.click('[data-tab="tgcode"]');
  await p.waitForSelector("#tgForm", { state: "visible" });
} });

// ---------- تسک‌ها (دسکتاپ روشن/تاریک + موبایل) ----------
const openTasks = async (p) => { await p.waitForSelector(".task-card", { timeout: 8000 }); };
await runState("tasks", { theme: "light", mobile: false, cookie: C, flow: openTasks });
await runState("tasks", { theme: "dark", mobile: false, cookie: C, flow: openTasks });
await runState("tasks", { theme: "light", mobile: true, cookie: C, flow: openTasks });

// ---------- مودال ساخت سریع ----------
await runState("quickadd", { theme: "light", mobile: false, cookie: C, flow: async (p) => {
  await p.waitForSelector("#quickInput");
  await p.fill("#quickInput", "یه تسک بساز: تمرین ورزش، تا فردا ساعت ۷ صبح، هر روز ساعت ۶ یادم بنداز");
  await p.click("#quickBtn");
  await p.waitForSelector("#parseModal:not(.hidden)", { timeout: 15000 });
  await p.waitForTimeout(300);
} });

// ---------- مودال جزئیات ----------
await runState("taskdetail", { theme: "light", mobile: true, cookie: C, flow: async (p) => {
  await p.waitForSelector(".task-card");
  await p.click(".task-card >> nth=0");
  await p.waitForSelector("#taskModal:not(.hidden)");
  await p.waitForTimeout(300);
} });

// ---------- چت ----------
await runState("chat", { theme: "light", mobile: false, cookie: C, flow: async (p) => {
  await p.waitForSelector(".task-card");
  await p.click('[data-view="chat"]');
  await p.waitForSelector("#chatInput", { state: "visible" });
  await p.fill("#chatInput", "تسک‌هامو نشون بده");
  await p.click("#chatSend");
  await p.waitForSelector(".msg.bot:not(.typing)", { timeout: 20000 });
  await p.fill("#chatInput", "احمق یه تسک بساز: مطالعه کتاب، تا جمعه");
  await p.click("#chatSend");
  await p.waitForSelector("#chatDraftBtn", { timeout: 20000 });
} });

// ---------- تاریخچه / گزارش / ادمین ----------
await runState("history", { theme: "light", mobile: false, cookie: C, flow: async (p) => {
  await p.waitForSelector(".task-card");
  await p.click('[data-view="history"]');
  await p.waitForSelector("#view-history:not(.hidden)");
} });
await runState("report", { theme: "light", mobile: false, cookie: C, flow: async (p) => {
  await p.waitForSelector(".task-card");
  await p.click('[data-view="report"]');
  await p.waitForTimeout(1200);
} });
await runState("admin", { theme: "light", mobile: false, cookie: C, flow: async (p) => {
  await p.waitForSelector(".task-card");
  await p.click('[data-view="admin"]');
  await p.waitForSelector("#usersList .user-row", { timeout: 10000 });
  await p.waitForTimeout(800);
} });
await runState("tasks-all", { theme: "light", mobile: false, cookie: C, flow: async (p) => {
  await p.waitForSelector(".task-card");
  await p.click('#taskScope [data-scope="all"]');
  await p.waitForTimeout(600);
} });

await browser.close();
fs.writeFileSync("issues.json", JSON.stringify(issues, null, 1));
fs.writeFileSync("audit-results.json", JSON.stringify(results, null, 1));
console.log("ISSUES:", issues.length);
for (const i of issues) console.log(` [${i.sev}] ${i.state}: ${i.msg}`);
