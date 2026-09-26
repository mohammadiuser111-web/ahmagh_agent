/* ═══════════════════════════════════════════════════════════
   احمق‌ایجنت — وب‌اپ (بدون فریم‌ورک؛ همان مغز بات از طریق /api)
   ═══════════════════════════════════════════════════════════ */
"use strict";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const state = {
  user: null,
  tasks: [],
  history: [],
  users: [],
  view: "tasks",
  pendingText: "", // متن ساخت سریع تا تأیید
};

/* ---------------- ابزار ---------------- */
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok && res.status !== 422) {
    if (res.status === 401 && state.user) { showAuth(); throw new Error("unauthorized"); }
    const msg = data?.error && data.error !== "unauthorized" ? data.error : `خطا (${res.status})`;
    throw new Error(msg);
  }
  return { status: res.status, ...data };
}

function toast(msg, kind = "ok") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = `toast t-${kind}`;
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.add("hidden"), 2600);
}

function loader(on) { $("#loader").classList.toggle("hidden", !on); }

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const STATUS_FA = { not_started: "شروع‌نشده", in_progress: "در حال انجام", done: "تمام‌شده" };

function faDigits(n) { return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]); }

function dueChip(t) {
  if (!t.dueLabel) return "";
  const time = t.dueAt ? ` — ساعت ${faDigits(t.dueAt.slice(11, 16))}` : "";
  return `<span class="chip ${t.overdue ? "c-over" : "c-due"}">${t.overdue ? "سررسید گذشته" : "سررسید"}: ${esc(t.dueLabel)}${time}</span>`;
}

function taskCard(t) {
  const chips = [
    dueChip(t),
    t.reminderLabel ? `<span class="chip c-rem">🔔 ${esc(t.reminderLabel)}</span>` : "",
    t.startDate && t.status === "not_started" ? `<span class="chip">شروع: ${esc(t.startDate)}</span>` : "",
    state.user.role === "admin" || t.assigneeId !== state.user.id
      ? `<span class="chip c-asg">مسئول: ${esc(t.assigneeName)}</span>` : "",
  ].filter(Boolean).join("");
  const act =
    t.status === "not_started"
      ? `<button class="btn btn-sm" data-act="start" data-id="${t.id}">شروعش می‌کنم</button>`
      : t.status === "in_progress"
        ? `<button class="btn btn-sm btn-primary" data-act="done" data-id="${t.id}">تمومش کردم</button>`
        : `<button class="btn btn-sm" data-act="reopen" data-id="${t.id}">برگرد به شروع‌نشده</button>`;
  return `
  <article class="task-card st-${t.status} ${t.status === "done" ? "done" : ""}" data-id="${t.id}">
    <div class="task-top">
      <span class="task-title">${esc(t.title)}</span>
      <span class="task-id">شناسه ${faDigits(t.id)}</span>
    </div>
    ${chips ? `<div class="task-chips">${chips}</div>` : ""}
    <div class="task-actions">${act}</div>
  </article>`;
}

function group(title, cls, tasks, emptyMsg) {
  return `
  <section class="group">
    <div class="group-head"><span class="dot ${cls}"></span><h3>${title}</h3><span class="count">${faDigits(tasks.length)}</span></div>
    <div class="task-list">${
      tasks.length ? tasks.map(taskCard).join("") : `<div class="empty">${emptyMsg}</div>`
    }</div>
  </section>`;
}

/* ---------------- نماها ---------------- */
async function loadTasks() {
  const r = await api("/api/tasks?scope=mine&filter=open");
  state.tasks = r.tasks;
}

async function loadHistory() {
  const r = await api("/api/tasks?scope=mine&filter=done");
  state.history = r.tasks;
}

function renderTasks() {
  const open = state.tasks;
  const over = open.filter((t) => t.overdue);
  const doing = open.filter((t) => !t.overdue && t.status === "in_progress");
  const todo = open.filter((t) => !t.overdue && t.status === "not_started");

  $("#greet").textContent = `سلام، ${state.user.name}`;
  $("#statsRow").innerHTML = `
    <span class="stat-chip">باز <b>${faDigits(open.length)}</b></span>
    <span class="stat-chip">در حال انجام <b>${faDigits(doing.length)}</b></span>
    ${over.length ? `<span class="stat-chip bad">گذشته <b>${faDigits(over.length)}</b></span>` : ""}
    <span class="stat-chip ok">تمام‌شده <b>${faDigits(state.history.length)}</b></span>`;

  $("#taskGroups").innerHTML =
    group("سررسید گذشته", "g-over", over, "چیزی از سررسیدش نگذشته — آفرین") +
    group("در حال انجام", "g-doing", doing, "فعلاً چیزی در دست انجام نیست") +
    group("شروع‌نشده", "g-todo", todo, "تسک بازی نیست — از بالا یکی بساز");
}

function renderHistory() {
  $("#historyCount").textContent = state.history.length ? `${faDigits(state.history.length)} تسکِ تمام‌شده` : "";
  $("#historyList").innerHTML = group("تمام‌شده‌ها", "g-done", state.history, "هنوز هیچی تمام نکردی!");
}

async function showView(v) {
  state.view = v;
  $$(".view").forEach((el) => el.classList.add("hidden"));
  $(`#view-${v}`).classList.remove("hidden");
  $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
  try {
    if (v === "tasks") { await loadTasks(); await loadHistory(); renderTasks(); }
    if (v === "history") { await loadHistory(); renderHistory(); }
    if (v === "report") await loadReport($("#reportScope .seg-item.active")?.dataset.scope || "mine");
  } catch (e) { toast(e.message, "bad"); }
}

/* ---------------- گزارش ---------------- */
async function loadReport(scope) {
  loader(true);
  try {
    const r = await api(`/api/report?scope=${scope}`);
    $("#reportFrame").srcdoc = r.html;
  } catch (e) { toast(e.message, "bad"); }
  finally { loader(false); }
}

/* ---------------- ساخت سریع با AI ---------------- */
async function quickAdd() {
  const text = $("#quickInput").value.trim();
  if (!text) return;
  state.pendingText = text;
  loader(true);
  try {
    const r = await api("/api/parse", { method: "POST", body: { text } });
    if (r.status === 422) { toast(r.error, "bad"); return; }
    openParseModal(r.draft);
  } catch (e) { toast(e.message, "bad"); }
  finally { loader(false); }
}

function reminderLabel(d) {
  if (!d.reminder || d.reminder.type === "none") return null;
  const t = d.reminder;
  if (t.type === "daily") return `هر روز ساعت ${faDigits(t.time)}`;
  if (t.type === "every_hours") return `هر ${faDigits(t.interval_hours)} ساعت`;
  if (t.type === "before_deadline") return `${faDigits(t.lead_minutes / 60)} ساعت قبل از ددلاین`;
  if (t.type === "once") return `یک‌بار ساعت ${faDigits(t.time)}`;
  return null;
}

async function openParseModal(d) {
  const needDue = !d.dueDate;
  const isAdmin = state.user.role === "admin";
  if (isAdmin && !state.users.length) {
    try { state.users = (await api("/api/users")).users; } catch {}
  }
  $("#parseBody").innerHTML = `
    <div class="kv">
      <span>عنوان</span><div><b>${esc(d.title)}</b></div>
      ${d.description ? `<span>توضیح</span><div>${esc(d.description)}</div>` : ""}
      <span>شروع</span><div>${esc(d.startDate)}${d.startAt ? ` — ساعت ${faDigits(d.startAt.slice(11, 16))}` : ""}</div>
      <span>سررسید</span><div id="dueCell">${d.dueDate ? `<b>${esc(d.dueDate)}</b>${d.dueAt ? ` — ساعت ${faDigits(d.dueAt.slice(11, 16))}` : ""}` : `<span class="muted">نگفتی!</span>`}</div>
      <span>یادآوری</span><div>${reminderLabel(d) ? `🔔 ${esc(reminderLabel(d))}` : `<span class="muted">ساکت (فقط با خواسته‌ی تو)</span>`}</div>
      ${isAdmin && state.users.length ? `<span>مسئول</span><div id="asgCell"><select id="asgSelect">
        ${state.users.map((u) => `<option value="${u.id}" ${u.id === d.assigneeId ? "selected" : ""}>${esc(u.name)}</option>`).join("")}
      </select></div>` : ""}
    </div>
    ${needDue ? `
    <label class="field"><span>تا کی باید تموم بشه؟</span>
      <input id="dueInput" placeholder="مثلاً: پنجشنبه / ۱۵ مهر / فردا ساعت ۶">
    </label>` : ""}
    <div class="row-actions">
      <button class="btn btn-primary" id="parseConfirm">ثبت تسک</button>
      <button class="btn" id="parseCancel">بی‌خیال</button>
    </div>`;
  $("#parseModal").classList.remove("hidden");
  $("#parseCancel").onclick = () => $("#parseModal").classList.add("hidden");
  $("#parseConfirm").onclick = async () => {
    const dueText = $("#dueInput")?.value.trim() || "";
    if (!d.dueDate && !dueText) { toast("تاریخ پایان لازم است", "bad"); return; }
    loader(true);
    try {
      const body = { text: state.pendingText, dueText };
      if (isAdmin && state.users.length) {
        const sel = $("#asgSelect");
        if (sel && sel.value) body.assigneeId = Number(sel.value);
      }
      const r = await api("/api/tasks", { method: "POST", body });
      if (r.needDue) { toast("تاریخ پایان را بنویس", "bad"); return; }
      if (r.status === 422) { toast(r.error, "bad"); return; }
      $("#parseModal").classList.add("hidden");
      $("#quickInput").value = "";
      toast("تسک ساخته شد");
      await showView("tasks");
    } catch (e) { toast(e.message, "bad"); }
    finally { loader(false); }
  };
}

/* ---------------- جزئیات/ویرایش تسک ---------------- */
async function openTask(id) {
  loader(true);
  try {
    const r = await api(`/api/tasks/${id}`);
    const t = r.task;
    const isAdmin = state.user.role === "admin";
    if (isAdmin && !state.users.length) {
      try { state.users = (await api("/api/users")).users; } catch {}
    }
    $("#taskModalTitle").textContent = `تسک «${t.title.length > 24 ? t.title.slice(0, 24) + "…" : t.title}»`;
    $("#taskBody").innerHTML = `
      <div class="kv">
        <span>شناسه</span><div>${faDigits(t.id)}</div>
        <span>وضعیت</span><div>${STATUS_FA[t.status]}</div>
        <span>مسئول</span><div>${esc(t.assigneeName)}</div>
        <span>سازنده</span><div>${esc(t.creatorName)}</div>
      </div>
      <div class="edit-grid">
        <label class="field" style="margin:0"><span>عنوان</span><input id="eTitle" value="${esc(t.title)}"></label>
        <label class="field" style="margin:0"><span>توضیح</span><textarea id="eDesc" rows="2">${esc(t.description)}</textarea></label>
        <label class="field" style="margin:0"><span>سررسید — به زبان خودت</span>
          <input id="eDue" placeholder="مثلاً: پنجشنبه / ۱۵ مهر / فردا ساعت ۶" value="${t.dueDate ? esc(t.dueDate) : ""}">
          <div class="hint">تاریخ میلادی (2026-10-02) یا فارسی («پنجشنبه») — خالی = بدون تغییر</div>
        </label>
        <label class="field" style="margin:0"><span>یادآوری — به زبان خودت</span>
          <input id="eRem" placeholder="مثلاً: هر روز ساعت ۸ / هر ۳ ساعت / ۱ ساعت قبل از ددلاین / هیچ" value="${t.reminderLabel ? esc(t.reminderLabel) : ""}">
          <div class="hint">«هیچ» = خاموش. یادآوری فقط وقتی می‌آید که خودت بخواهی.</div>
        </label>
        ${isAdmin ? `<label class="field" style="margin:0"><span>واگذاری به</span>
          <select id="eAsg">
            <option value="">— بدون تغییر —</option>
            ${state.users.map((u) => `<option value="${u.id}" ${u.id === t.assigneeId ? "selected" : ""}>${esc(u.name)}</option>`).join("")}
          </select></label>` : ""}
      </div>
      <div class="row-actions">
        ${t.status !== "done" ? `<button class="btn btn-primary" id="eDone">تمومش کردم</button>` : `<button class="btn" id="eReopen">برگرد به شروع‌نشده</button>`}
        <button class="btn" id="eSave">ذخیره‌ی تغییرات</button>
        <button class="btn btn-danger" id="eDel">حذف</button>
      </div>`;
    $("#taskModal").classList.remove("hidden");
    const close = () => $("#taskModal").classList.add("hidden");
    $("#taskModalClose").onclick = close;
    $("#eSave").onclick = async () => {
      const body = {};
      const title = $("#eTitle").value.trim(); if (title && title !== t.title) body.title = title;
      const desc = $("#eDesc").value; if (desc !== (t.description || "")) body.description = desc;
      const due = $("#eDue").value.trim(); if (due && due !== t.dueDate) body.dueText = due;
      const rem = $("#eRem").value.trim();
      if ((t.reminderLabel || "") !== rem) body.reminderText = rem;
      const asg = $("#eAsg")?.value; if (asg) body.assigneeId = Number(asg);
      if (!Object.keys(body).length) { toast("چیزی تغییر نکرد"); return; }
      loader(true);
      try {
        const r2 = await api(`/api/tasks/${t.id}`, { method: "PATCH", body });
        if (r2.status === 422) { toast(r2.error, "bad"); return; }
        close(); toast("ذخیره شد"); await showView(state.view);
      } catch (e) { toast(e.message, "bad"); }
      finally { loader(false); }
    };
    $("#eDone") && ($("#eDone").onclick = () => actTask(t.id, "done"));
    $("#eReopen") && ($("#eReopen").onclick = () => actTask(t.id, "not_started"));
    $("#eDel").onclick = async () => {
      if (!confirm("مطمئنی؟ تسک برای همیشه حذف می‌شود.")) return;
      loader(true);
      try { await api(`/api/tasks/${t.id}`, { method: "DELETE" }); close(); toast("حذف شد"); await showView(state.view); }
      catch (e) { toast(e.message, "bad"); }
      finally { loader(false); }
    };
  } catch (e) { toast(e.message, "bad"); }
  finally { loader(false); }
}

async function actTask(id, status) {
  loader(true);
  try {
    await api(`/api/tasks/${id}`, { method: "PATCH", body: { status } });
    toast(status === "done" ? "آفرین! تموم شد" : "ثبت شد");
    $("#taskModal").classList.add("hidden");
    await showView(state.view);
  } catch (e) { toast(e.message, "bad"); }
  finally { loader(false); }
}

/* ---------------- ورود/خروج ---------------- */
function showApp() {
  $("#authView").classList.add("hidden");
  $("#appView").classList.remove("hidden");
  $("#whoBox").innerHTML = `<b>${esc(state.user.name)}</b>${state.user.role === "admin" ? ` <span class="role">ادمین</span>` : ""}<br><span class="muted" dir="ltr">${esc(state.user.username || "")}</span>`;
  $("#reportAllBtn").classList.toggle("hidden", state.user.role !== "admin");
  showView("tasks");
}

function showAuth() {
  state.user = null;
  $("#appView").classList.add("hidden");
  $("#authView").classList.remove("hidden");
}

async function tryMe() {
  try { const r = await api("/api/me"); state.user = r.user; showApp(); return true; }
  catch { return false; }
}

async function login(e) {
  e.preventDefault();
  const btn = $("#loginBtn");
  btn.disabled = true;
  $("#loginError").classList.add("hidden");
  try {
    const r = await api("/api/auth/login", {
      method: "POST",
      body: { username: $("#loginUser").value.trim(), password: $("#loginPass").value },
    });
    state.user = r.user;
    showApp();
  } catch (err) {
    const el = $("#loginError");
    el.textContent = err.message;
    el.classList.remove("hidden");
  } finally { btn.disabled = false; }
}

async function webappLogin() {
  const tg = window.Telegram?.WebApp;
  if (!tg?.initData) return false;
  try {
    tg.ready(); tg.expand();
    const r = await api("/api/auth/webapp", { method: "POST", body: { initData: tg.initData } });
    state.user = r.user;
    showApp();
    return true;
  } catch { return false; }
}

async function logout() {
  try { await api("/api/auth/logout", { method: "POST" }); } catch {}
  location.reload();
}

/* ---------------- تم ---------------- */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem("ah_theme", t);
}

/* ---------------- راه‌اندازی ---------------- */
/** اسکریپت تلگرام را بدون قفل‌کردن صفحه لود کن — داخل تلگرام سریع می‌آید، بیرونش مهم نیست */
function loadTelegramScript() {
  return new Promise((resolve) => {
    if (window.Telegram?.WebApp) return resolve();
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-web-app.js";
    s.onload = () => resolve();
    s.onerror = () => resolve(); // بیرون از تلگرام/بدون فیلتر — مهم نیست
    document.head.appendChild(s);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  applyTheme(localStorage.getItem("ah_theme") || "dark");
  $("#themeBtn").onclick = () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  $("#loginForm").addEventListener("submit", login);
  $("#logoutBtn").onclick = logout;
  $("#quickBtn").onclick = quickAdd;
  $("#quickInput").addEventListener("keydown", (e) => { if (e.key === "Enter") quickAdd(); });
  $$("[data-view]").forEach((b) => (b.onclick = () => showView(b.dataset.view)));
  $("#reportScope").addEventListener("click", (e) => {
    const b = e.target.closest(".seg-item"); if (!b) return;
    $$("#reportScope .seg-item").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    loadReport(b.dataset.scope);
  });
  document.addEventListener("click", (e) => {
    const card = e.target.closest(".task-card");
    const act = e.target.closest("[data-act]");
    if (act) { e.stopPropagation(); actTask(Number(act.dataset.id), act.dataset.act === "start" ? "in_progress" : act.dataset.act === "done" ? "done" : "not_started"); return; }
    if (card) openTask(Number(card.dataset.id));
  });
  $$(".modal").forEach((m) => m.addEventListener("click", (e) => { if (e.target === m) m.classList.add("hidden"); }));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $$(".modal").forEach((m) => m.classList.add("hidden")); });

  // ورود: اول تلگرام (دکمه‌ی 🌐 داخل بات)، بعد کوکی‌ی قبلی، بعد فرم
  // ⛔ مهم: در هر صورت یک ویو باز شود — صفحه‌ی خالی هرگز
  try {
    await Promise.race([loadTelegramScript(), new Promise((r) => setTimeout(r, 2500))]);
    if (!(await webappLogin())) {
      if (!(await tryMe())) showAuth();
    }
  } catch {
    showAuth();
  }
});
