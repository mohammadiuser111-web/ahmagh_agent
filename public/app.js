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
  taskScope: "mine",
  pendingText: "",
  chatBusy: false,
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
const VIEW_TITLES = { tasks: "تسک‌ها", chat: "چت", history: "تاریخچه", report: "گزارش", admin: "ادمین" };
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

function faToday() {
  try { return new Intl.DateTimeFormat("fa-IR", { weekday: "long", day: "numeric", month: "long" }).format(new Date()); }
  catch { return ""; }
}

/** شمارنده‌ی نرم اعداد آمار */
function countUp(el, to) {
  if (REDUCED || !to) { el.textContent = faDigits(to); return; }
  const t0 = performance.now(), dur = 550;
  const tick = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    el.textContent = faDigits(Math.round(to * (1 - (1 - k) ** 3)));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

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
    state.taskScope === "all" || t.assigneeId !== state.user.id
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

const EMPTY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4"/></svg>';

function group(title, cls, tasks, emptyMsg, cta) {
  return `
  <section class="group">
    <div class="group-head"><span class="dot ${cls}"></span><h3>${title}</h3><span class="count">${faDigits(tasks.length)}</span></div>
    <div class="task-list">${
      tasks.length
        ? tasks.map(taskCard).join("")
        : `<div class="empty">${EMPTY_SVG}<div>${emptyMsg}</div>${cta ? `<button class="btn btn-primary btn-sm" data-cta="${cta.id}">${cta.label}</button>` : ""}</div>`
    }</div>
  </section>`;
}

/* ---------------- نماها ---------------- */
async function loadTasks() {
  const r = await api(`/api/tasks?scope=${state.taskScope}&filter=open`);
  state.tasks = r.tasks;
}

async function loadHistory() {
  const r = await api(`/api/tasks?scope=${state.taskScope}&filter=done`);
  state.history = r.tasks;
}

function renderTasks() {
  const open = state.tasks;
  const over = open.filter((t) => t.overdue);
  const doing = open.filter((t) => !t.overdue && t.status === "in_progress");
  const todo = open.filter((t) => !t.overdue && t.status === "not_started");
  const doneN = state.history.length;
  const total = open.length + doneN;

  $("#greet").textContent = state.taskScope === "all" ? "تسک‌های همه" : `سلام، ${state.user.name}`;
  $("#todayLine").textContent = faToday();

  $("#statsRow").innerHTML = `
    <div class="stat-card"><span class="ic i-blue">📋</span><div><span class="num" data-n="${open.length}">۰</span><span class="lbl">تسک باز</span></div></div>
    <div class="stat-card"><span class="ic i-amber">⚡</span><div><span class="num" data-n="${doing.length}">۰</span><span class="lbl">در حال انجام</span></div></div>
    ${over.length ? `<div class="stat-card"><span class="ic i-red">⏰</span><div><span class="num" data-n="${over.length}">۰</span><span class="lbl">سررسید گذشته</span></div></div>` : ""}
    <div class="stat-card"><span class="ic i-green">✓</span><div><span class="num" data-n="${doneN}">۰</span><span class="lbl">تمام‌شده</span></div></div>`;
  $$("#statsRow .num").forEach((el) => countUp(el, Number(el.dataset.n || 0)));

  $("#progressBar").style.width = (total ? Math.round((doneN / total) * 100) : 0) + "%";

  $("#taskGroups").innerHTML =
    group("سررسید گذشته", "g-over", over, "چیزی از سررسیدش نگذشته — آفرین") +
    group("در حال انجام", "g-doing", doing, "فعلاً چیزی در دست انجام نیست") +
    group("شروع‌نشده", "g-todo", todo, "تسک بازی نیست", { id: "quick", label: "ساخت اولین تسک" });
}

function renderHistory() {
  $("#historyCount").textContent = state.history.length ? `${faDigits(state.history.length)} تسکِ تمام‌شده` : "هنوز چیزی تمام نکردی";
  $("#historyList").innerHTML = group("تمام‌شده‌ها", "g-done", state.history, "اولین قبرستانِ تسک‌ها هنوز خالی است!", { id: "quick", label: "برو بساز" });
}

async function showView(v) {
  state.view = v;
  document.title = `${VIEW_TITLES[v] || "احمق‌ایجنت"} · احمق‌ایجنت`;
  $$(".view").forEach((el) => el.classList.add("hidden"));
  $(`#view-${v}`).classList.remove("hidden");
  $$("[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
  window.scrollTo({ top: 0, behavior: REDUCED ? "auto" : "smooth" });
  if (v === "tasks") $("#quickInput")?.focus({ preventScroll: true });
  if (v === "chat") setTimeout(() => $("#chatInput")?.focus({ preventScroll: true }), 60);
  if (v === "tasks") {
    // اسکلتون تا رسیدن داده
    $("#taskGroups").innerHTML = `<div class="task-list">${'<div class="skel"></div>'.repeat(3)}</div>`;
    $("#statsRow").innerHTML = `<div class="skel" style="height:64px"></div>`.repeat(0);
  }
  try {
    if (v === "tasks") { await loadTasks(); await loadHistory(); renderTasks(); }
    if (v === "history") { await loadHistory(); renderHistory(); }
    if (v === "report") await loadReport($("#reportScope .seg-item.active")?.dataset.scope || "mine");
    if (v === "admin") await loadAdmin();
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

/* ---------------- چت ---------------- */
function addMsg(kind, html) {
  const el = document.createElement("div");
  el.className = `msg ${kind}`;
  el.innerHTML = html;
  $("#chatScroll").appendChild(el);
  $("#chatScroll").scrollTop = $("#chatScroll").scrollHeight;
  return el;
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

async function sendChat() {
  const input = $("#chatInput");
  const text = input.value.trim();
  if (!text || state.chatBusy) return;
  state.chatBusy = true;
  input.value = "";
  addMsg("user", esc(text));
  if (!$("#chatScroll").children.length) {
    addMsg("bot", `<span class="msg-tag">احمق</span>سلام ${esc(state.user.name)}! من همونم که تو تلگرام می‌شناسی — اینجا هم هرچی بخوای در خدمتم. بگو چه خبر؟`);
  }
  const typing = addMsg("bot typing", "<i></i><i></i><i></i>");
  try {
    const r = await api("/api/chat", { method: "POST", body: { text } });
    typing.remove();
    if (r.type === "draft" && r.draft) {
      const d = r.draft;
      addMsg("bot", `<span class="msg-tag">احمق</span>اینطوری فهمیدمش:<div class="draft-box">
        <div class="kv"><span>عنوان</span><div><b>${esc(d.title)}</b></div>
        ${d.dueDate ? `<span>سررسید</span><div>${esc(d.dueDate)}</div>` : ""}
        ${d.startDate ? `<span>شروع</span><div>${esc(d.startDate)}</div>` : ""}
        ${reminderLabel(d) ? `<span>یادآوری</span><div>${esc(reminderLabel(d))}</div>` : ""}
        </div>
        <button class="btn btn-sm btn-primary" id="chatDraftBtn">بسازش</button>
        ${!d.dueDate ? `<span class="muted" style="font-size:.75rem"> — فقط تاریخ پایانش را نگفتی؛ موقع ثبت می‌پرسم</span>` : ""}
      </div>`);
      const btn = $("#chatDraftBtn");
      if (btn) btn.onclick = () => { state.pendingText = r.originalText; openParseModal(d); };
    } else {
      addMsg("bot", `<span class="msg-tag">احمق</span>${esc(r.text || "…")}`);
    }
  } catch (e) {
    typing.remove();
    addMsg("bot", esc(e.message));
  } finally {
    state.chatBusy = false;
    input.focus();
  }
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
      <span>سررسید</span><div>${d.dueDate ? `<b>${esc(d.dueDate)}</b>${d.dueAt ? ` — ساعت ${faDigits(d.dueAt.slice(11, 16))}` : ""}` : `<span class="muted">نگفتی!</span>`}</div>
      <span>یادآوری</span><div>${reminderLabel(d) ? `🔔 ${esc(reminderLabel(d))}` : `<span class="muted">ساکت (فقط با خواسته‌ی تو)</span>`}</div>
      ${isAdmin && state.users.length ? `<span>مسئول</span><div><select id="asgSelect">
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

/* ---------------- ادمین ---------------- */
async function loadAdmin() {
  if (state.user.role !== "admin") return;
  loader(true);
  try {
    const r = await api("/api/users");
    state.users = r.users;
    $("#usersList").innerHTML = state.users
      .map(
        (u) => `
      <div class="user-row">
        <div class="u-line">
          <div class="avatar s">${esc((u.name || "؟").trim().charAt(0))}</div>
          <div>
            <div class="u-name">${esc(u.name)} ${u.role === "admin" ? '<span class="badge">ادمین</span>' : ""}</div>
            <div class="u-meta">${esc(u.username || "—")}</div>
          </div>
        </div>
        ${u.id !== state.user.id ? `<button class="btn btn-sm btn-danger" data-deluser="${u.id}">حذف</button>` : `<span class="muted" style="font-size:.75rem">خودت</span>`}
      </div>`
      )
      .join("");
    const u = await api("/api/admin/usage");
    $("#usageFrame").srcdoc = u.html;
  } catch (e) { toast(e.message, "bad"); }
  finally { loader(false); }
}

/* ---------------- ورود/خروج ---------------- */
function showApp() {
  $("#authView").classList.add("hidden");
  $("#appView").classList.remove("hidden");
  const isAdmin = state.user.role === "admin";
  const initial = (state.user.name || "ا").trim().charAt(0);
  $("#whoBox").innerHTML = `<div class="avatar">${esc(initial)}</div><div><b>${esc(state.user.name)}</b>${isAdmin ? ` <span class="role">ادمین</span>` : ""}<br><span class="muted" dir="ltr">${esc(state.user.username || "")}</span></div>`;
  $("#reportAllBtn").classList.toggle("hidden", !isAdmin);
  $("#taskScope").classList.toggle("hidden", !isAdmin);
  $("#adminNavBtn").classList.toggle("hidden", !isAdmin);
  $("#adminNavBtnM").classList.toggle("hidden", !isAdmin);
  state.taskScope = "mine";
  $$("#taskScope .seg-item").forEach((x) => x.classList.toggle("active", x.dataset.scope === "mine"));
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

/** ورود با کد تلگرام — برای رفقایی که رمزشان را یادشان نیست */
async function tgLogin(e) {
  e.preventDefault();
  const err = $("#tgError");
  const sent = $("#tgSent");
  err.classList.add("hidden");
  const btn = $("#tgBtn");
  btn.disabled = true;
  try {
    const handle = $("#tgHandle").value.trim();
    const code = $("#tgCode").value.trim();
    if (!handle) throw new Error("اسمت داخل بات را بنویس.");
    if (!$("#codeFieldWrap").classList.contains("hidden") && !code) throw new Error("کد را بنویس.");
    if ($("#codeFieldWrap").classList.contains("hidden")) {
      // مرحله‌ی ۱: درخواست کد
      const r = await api("/api/auth/tg-code", { method: "POST", body: { handle } });
      sent.textContent = `کد به تلگرامِ «${r.sentTo}» فرستاده شد — چکش کن ✉️`;
      sent.classList.remove("hidden");
      $("#codeFieldWrap").classList.remove("hidden");
      $("#tgHandle").disabled = true;
      btn.textContent = "ورود";
      $("#tgCode").focus();
    } else {
      // مرحله‌ی ۲: تأیید کد
      const r = await api("/api/auth/tg-verify", { method: "POST", body: { handle, code } });
      state.user = r.user;
      showApp();
    }
  } catch (e2) {
    err.textContent = e2.message;
    err.classList.remove("hidden");
    // اگر کد منقضی/خراب شد، برگرد به مرحله‌ی اول
    if (/منقضی|خیلی تلاش/.test(e2.message)) {
      $("#codeFieldWrap").classList.add("hidden");
      $("#tgHandle").disabled = false;
      btn.textContent = "کد بفرست";
      sent.classList.add("hidden");
    }
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
function loadTelegramScript() {
  return new Promise((resolve) => {
    if (window.Telegram?.WebApp) return resolve();
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-web-app.js";
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  applyTheme(localStorage.getItem("ah_theme") || "light");
  $("#themeBtn").onclick = () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  $("#loginForm").addEventListener("submit", login);
  $("#tgForm").addEventListener("submit", tgLogin);
  $$(".auth-tab").forEach((t) =>
    (t.onclick = () => {
      $$(".auth-tab").forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      const tab = t.dataset.tab;
      $("#loginForm").classList.toggle("hidden", tab !== "pass");
      $("#tgForm").classList.toggle("hidden", tab !== "tgcode");
    })
  );
  $("#logoutBtn").onclick = logout;
  $("#quickBtn").onclick = quickAdd;
  $("#quickInput").addEventListener("keydown", (e) => { if (e.key === "Enter") quickAdd(); });
  $("#chatSend").onclick = sendChat;
  $("#chatInput").addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });
  $$("[data-view]").forEach((b) => (b.onclick = () => showView(b.dataset.view)));
  $("#taskScope").addEventListener("click", (e) => {
    const b = e.target.closest(".seg-item"); if (!b) return;
    $$("#taskScope .seg-item").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    state.taskScope = b.dataset.scope;
    showView("tasks");
  });
  $("#reportScope").addEventListener("click", (e) => {
    const b = e.target.closest(".seg-item"); if (!b) return;
    $$("#reportScope .seg-item").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    loadReport(b.dataset.scope);
  });
  document.addEventListener("click", async (e) => {
    const del = e.target.closest("[data-deluser]");
    if (del) {
      e.stopPropagation();
      const name = del.closest(".user-row")?.querySelector(".u-name")?.textContent || "این کاربر";
      if (!confirm(`مطمئنی؟ همه‌ی تسک‌های «${name}» هم حذف می‌شود.`)) return;
      loader(true);
      try { await api(`/api/admin/users/${del.dataset.deluser}`, { method: "DELETE" }); toast("حذف شد"); await loadAdmin(); }
      catch (e2) { toast(e2.message, "bad"); }
      finally { loader(false); }
      return;
    }
    const cta = e.target.closest("[data-cta]");
    if (cta) {
      e.stopPropagation();
      if (cta.dataset.cta === "quick") $("#quickInput")?.focus();
      return;
    }
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
