/**
 * خروجی گزارشی از تسک‌ها — HTML تک‌فایل با سه تب (لیستی / گزارش‌طور / داشبورد)
 *
 *  - تک‌فایل و کاملاً self-contained: فونت Vazirmatn متغیر embed شده، بدون CDN، بدون JS
 *  - تب‌ها با radio + CSS خالص کار می‌کنند (بدون اسکریپت — امن و سبک)
 *  - پارامتر style فقط «تبِ پیش‌فرض» را تعیین می‌کند
 *
 * دیزاین (طبق استاندارد frontend-design):
 *  - توکن‌های CSS (رنگ/فاصله/شعاع) — بدون مقدار هاردکد خارج از توکن‌ها
 *  - تم سیاه‌وسفید؛ رنگ فقط برای نمودار و نشانِ وضعیت
 *  - فاصله‌بندی ۸px، شعاع ۴/۸/۱۲، line-height ≥۱.۶، بدون سایه‌ی سنگین
 *  - واکنش‌گرا و مناسب چاپ (در چاپ فقط تبِ فعال)
 */
import type { TaskRow } from "./types";
import { STATUS_LABEL } from "./format";
import { escapeHtml } from "./telegram";
import { faDigits, fmtDate, fmtTimeTehran, todayTehranISO } from "./dates";
import { VAZIRMATN_WOFF2_B64 } from "./fonts/vazirmatn";

export type ExportStyle = "list" | "report" | "dash";

export const STYLE_LABEL: Record<ExportStyle, string> = {
  list: "لیستی (جدول)",
  report: "گزارش‌طور",
  dash: "داشبورد",
};

// ============================================================
// داده‌ی مشترک
// ============================================================

export interface ReportUser {
  id: number;
  name: string;
  tasks: TaskRow[];
}

export interface ReportModel {
  scopeName: string;
  nowFa: string;
  multiUser: boolean;
  tasks: TaskRow[];
  users: ReportUser[];
  total: number;
  open: TaskRow[];
  inProgress: TaskRow[];
  notStarted: TaskRow[];
  done: TaskRow[];
  overdue: TaskRow[];
}

/** ساخت مدل — users فقط برای خروجیِ «همه» (گروه‌بندی بر اساس مسئول) */
export function buildReportModel(
  tasks: TaskRow[],
  scopeName: string,
  users?: { id: number; name: string }[]
): ReportModel {
  const now = Date.now();
  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");
  const overdue = open.filter((t) => {
    const due = t.due_at ? Date.parse(t.due_at) : t.due_date ? Date.parse(`${t.due_date}T23:59:59+03:30`) : 0;
    return due > 0 && now > due;
  });
  const byUser = new Map<number, ReportUser>();
  if (users?.length) {
    for (const u of users) byUser.set(u.id, { id: u.id, name: u.name, tasks: [] });
    for (const t of tasks) {
      const g = byUser.get(t.assignee_id);
      if (g) g.tasks.push(t);
      else byUser.set(t.assignee_id, { id: t.assignee_id, name: "ناشناس", tasks: [t] });
    }
  }
  return {
    scopeName,
    nowFa: `${fmtDate(todayTehranISO())} — ${fmtTimeTehran(new Date().toISOString())}`,
    multiUser: !!users?.length,
    tasks,
    users: [...byUser.values()].sort((a, b) => b.tasks.length - a.tasks.length),
    total: tasks.length,
    open,
    inProgress: open.filter((t) => t.status === "in_progress"),
    notStarted: open.filter((t) => t.status === "not_started"),
    done,
    overdue,
  };
}

// ============================================================
// اجزای مشترک
// ============================================================

const dueText = (t: TaskRow) =>
  t.due_date ? `${fmtDate(t.due_date)}${t.due_at ? ` — ${fmtTimeTehran(t.due_at)}` : ""}` : "—";

const isOverdue = (m: ReportModel, t: TaskRow) => m.overdue.some((o) => o.id === t.id);

/** چیپ وضعیت — نقطه‌ی رنگی + متن (رنگ فقط همین‌جا و در نمودار) */
function statusChip(t: TaskRow): string {
  const cls = t.status === "done" ? "done" : t.status === "in_progress" ? "doing" : "todo";
  return `<span class="chip ${cls}"><i></i>${STATUS_LABEL[t.status]}</span>`;
}

const userName = (m: ReportModel, t: TaskRow) => m.users.find((x) => x.id === t.assignee_id)?.name ?? "—";

interface Fragment {
  css: string;
  html: string;
}

// ============================================================
// تب ۱: لیستی (جدولی)
// ============================================================

function renderList(m: ReportModel): Fragment {
  const head = [
    "<th>شناسه</th>",
    "<th>عنوان</th>",
    "<th>وضعیت</th>",
    "<th>شروع</th>",
    "<th>پایان</th>",
    ...(m.multiUser ? ["<th>مسئول</th>"] : []),
  ].join("");
  const rows = m.tasks
    .map((t) => {
      const cells = [
        `<td class="num">${faDigits(t.id)}</td>`,
        `<td class="ttl">${escapeHtml(t.title)}${t.description ? `<div class="desc">${escapeHtml(t.description)}</div>` : ""}</td>`,
        `<td>${statusChip(t)}</td>`,
        `<td>${t.start_date ? fmtDate(t.start_date) : "—"}</td>`,
        `<td class="${isOverdue(m, t) ? "over" : ""}">${dueText(t)}</td>`,
        ...(m.multiUser ? [`<td>${escapeHtml(userName(m, t))}</td>`] : []),
      ];
      return `<tr>${cells.join("")}</tr>`;
    })
    .join("\n");
  return {
    css: `
    .tblwrap{overflow-x:auto}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{font-size:12px;color:var(--ink-2);text-align:right;padding:var(--sp-1);border-bottom:2px solid var(--ink)}
    td{padding:10px var(--sp-1);border-bottom:1px solid var(--line);vertical-align:top}
    tbody tr:hover{background:var(--surface)}
    .num{color:var(--ink-3);font-size:12px;white-space:nowrap}
    .ttl{font-weight:600;min-width:200px}
    .desc{color:var(--ink-3);font-size:12px;font-weight:400;margin-top:2px}
    .empty{padding:var(--sp-4);text-align:center;color:var(--ink-3)}`,
    html: m.tasks.length
      ? `<div class="tblwrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`
      : `<div class="empty">تسکی نیست — از زندگی لذت ببر 🎉</div>`,
  };
}

// ============================================================
// تب ۲: گزارش‌طور (تحریریه‌ای)
// ============================================================

function renderReport(m: ReportModel): Fragment {
  const entry = (t: TaskRow, i: number) => `
      <article class="entry">
        <div class="no">${faDigits(i)}</div>
        <div class="body">
          <h3>${escapeHtml(t.title)}</h3>
          ${t.description ? `<p>${escapeHtml(t.description)}</p>` : ""}
          <div class="meta">
            ${statusChip(t)}
            <span>شروع: ${t.start_date ? fmtDate(t.start_date) : "—"}</span>
            <span class="${isOverdue(m, t) ? "over" : ""}">پایان: ${dueText(t)}</span>
            <span>شناسه: ${faDigits(t.id)}</span>
            ${m.multiUser ? `<span>مسئول: ${escapeHtml(userName(m, t))}</span>` : ""}
          </div>
        </div>
      </article>`;

  const section = (label: string, rows: TaskRow[]) =>
    rows.length
      ? `\n      <section class="rsec"><h3 class="rh">${label} <span class="count">${faDigits(rows.length)}</span></h3>${rows.map(entry).join("")}</section>`
      : "";

  return {
    css: `
    .summary{border:1px solid var(--ink);border-radius:var(--r-m);padding:var(--sp-2);font-size:14px;margin-bottom:var(--sp-2)}
    .rsec{margin-bottom:var(--sp-3)}
    .rh{font-size:16px;margin-bottom:var(--sp-2);display:flex;align-items:center;gap:var(--sp-1)}
    .count{border:1px solid var(--line-strong);border-radius:999px;font-size:12px;padding:0 10px;color:var(--ink-2)}
    .entry{display:flex;gap:var(--sp-2);padding:var(--sp-2) 0;border-bottom:1px solid var(--line)}
    .no{font-size:20px;font-weight:800;color:var(--ink-3);min-width:32px;line-height:1.2}
    .entry h3{font-size:15px}
    .entry .body p{color:var(--ink-2);font-size:13px;margin-top:2px}
    .meta{display:flex;flex-wrap:wrap;gap:var(--sp-1) var(--sp-2);margin-top:var(--sp-1);font-size:12px;color:var(--ink-3)}`,
    html: `
    <div class="summary">
      جمع‌بندی: <b>${faDigits(m.total)}</b> تسک —
      <b>${faDigits(m.inProgress.length)}</b> در حال انجام،
      <b>${faDigits(m.notStarted.length)}</b> شروع‌نشده،
      <b>${faDigits(m.done.length)}</b> تمام‌شده
      ${m.overdue.length ? `· <span class="over">${faDigits(m.overdue.length)} سررسید گذشته</span>` : ""}
    </div>
    ${section("⏳ در حال انجام", m.inProgress)}
    ${section("🔓 شروع‌نشده", m.notStarted)}
    ${section("✅ تمام‌شده", m.done)}`,
  };
}

// ============================================================
// تب ۳: داشبورد (KPI + نمودار SVG)
// ============================================================

/** دوناتِ وضعیت — رنگ‌ها فقط اینجا */
function donutSvg(m: ReportModel): string {
  const segs = [
    { n: m.done.length, c: "var(--c-done)" },
    { n: m.inProgress.length, c: "var(--c-doing)" },
    { n: m.notStarted.length, c: "var(--c-todo)" },
  ];
  const total = Math.max(m.total, 1);
  const R = 44;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const circles = segs
    .map((sg) => {
      const frac = sg.n / total;
      const len = frac * C;
      const el = `<circle r="${R}" cx="60" cy="60" fill="none" stroke="${sg.c}" stroke-width="14"
        stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}"
        transform="rotate(-90 60 60)"/>`;
      acc += len;
      return el;
    })
    .join("");
  return `<svg viewBox="0 0 120 120" class="donut" role="img" aria-label="توزیع وضعیت تسک‌ها">
    ${circles}
    <text x="60" y="56" text-anchor="middle" class="dt">${faDigits(m.total)}</text>
    <text x="60" y="74" text-anchor="middle" class="dl">تسک</text>
  </svg>`;
}

/** نمودار میله‌ای افقی — به ازای کاربر (یا وضعیت در حالت تک‌کاربر) */
function barsBlock(m: ReportModel): { title: string; html: string } {
  const rows = m.multiUser
    ? m.users.slice(0, 8).map((u) => ({ label: u.name, n: u.tasks.length }))
    : [
        { label: "در حال انجام", n: m.inProgress.length },
        { label: "شروع‌نشده", n: m.notStarted.length },
        { label: "تمام‌شده", n: m.done.length },
      ];
  const max = Math.max(...rows.map((r) => r.n), 1);
  const bars = rows
    .map((r, i) => {
      const w = Math.round((r.n / max) * 100);
      return `<div class="brow">
        <span class="blabel">${escapeHtml(r.label)}</span>
        <span class="btrack"><span class="bfill c${i % 3}" style="width:${w}%"></span></span>
        <span class="bval">${faDigits(r.n)}</span>
      </div>`;
    })
    .join("");
  return { title: m.multiUser ? "تسک به ازای هر کاربر" : "توزیع وضعیت", html: bars };
}

function renderDash(m: ReportModel): Fragment {
  const kpis = [
    { label: "مجموع", n: m.total },
    { label: "باز", n: m.open.length },
    { label: "در حال انجام", n: m.inProgress.length },
    { label: "تمام‌شده", n: m.done.length },
  ];
  const kpiHtml = kpis
    .map((k) => `<div class="kpi"><div class="kn">${faDigits(k.n)}</div><div class="kl">${k.label}</div></div>`)
    .join("");

  const legend = [
    { c: "done", label: "تمام‌شده", n: m.done.length },
    { c: "doing", label: "در حال انجام", n: m.inProgress.length },
    { c: "todo", label: "شروع‌نشده", n: m.notStarted.length },
  ]
    .map((l) => `<li><i class="dot ${l.c}"></i>${l.label} — <b>${faDigits(l.n)}</b></li>`)
    .join("");

  const bars = barsBlock(m);

  const nearest = [...m.open]
    .filter((t) => t.due_date)
    .sort((a, b) => {
      const f = (t: TaskRow) => (t.due_at ? Date.parse(t.due_at) : Date.parse(`${t.due_date}T23:59:59+03:30`));
      return f(a) - f(b);
    })
    .slice(0, 5);
  const nearestHtml = nearest.length
    ? `<table class="mini"><tbody>${nearest
        .map(
          (t) =>
            `<tr><td class="mttl">${escapeHtml(t.title)}</td><td class="${isOverdue(m, t) ? "over" : ""}">${dueText(t)}</td></tr>`
        )
        .join("")}</tbody></table>`
    : `<div class="empty2">ددلاینِ پیش‌رویی نیست 🎉</div>`;

  const overdueBox = m.overdue.length
    ? `<div class="alert">⚠️ ${faDigits(m.overdue.length)} تسک از سررسیدشان گذشته‌اند!</div>`
    : "";

  return {
    css: `
    .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:var(--sp-1);margin-bottom:var(--sp-2)}
    .kpi{border:1px solid var(--line);border-radius:var(--r-m);padding:var(--sp-2);text-align:center}
    .kn{font-size:30px;font-weight:800;line-height:1.2}
    .kl{font-size:12px;color:var(--ink-2)}
    .alert{border:1px solid var(--c-over);color:var(--c-over);border-radius:var(--r-m);padding:10px var(--sp-2);margin-bottom:var(--sp-2);font-weight:700}
    .dgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:var(--sp-2);margin-bottom:var(--sp-2)}
    .panel{border:1px solid var(--line);border-radius:var(--r-m);padding:var(--sp-2)}
    .panel h3{font-size:14px;margin-bottom:var(--sp-2)}
    .donutwrap{display:flex;align-items:center;gap:var(--sp-3);flex-wrap:wrap;justify-content:center}
    .donut{width:150px;height:150px}
    .donut .dt{font-size:26px;font-weight:800;fill:var(--ink)}
    .donut .dl{font-size:10px;fill:var(--ink-3)}
    .legend{list-style:none;font-size:13px;display:grid;gap:6px}
    .dot{width:10px;height:10px;border-radius:50%;display:inline-block;margin-inline-end:6px}
    .dot.done{background:var(--c-done)} .dot.doing{background:var(--c-doing)} .dot.todo{background:var(--c-todo)}
    .brow{display:grid;grid-template-columns:96px 1fr 32px;align-items:center;gap:var(--sp-1);margin-bottom:10px;font-size:12px}
    .blabel{color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .btrack{background:var(--surface);border:1px solid var(--line);border-radius:999px;height:14px;overflow:hidden}
    .bfill{display:block;height:100%;border-radius:999px}
    .bfill.c0{background:var(--c-doing)} .bfill.c1{background:var(--c-done)} .bfill.c2{background:var(--c-warn)}
    .bval{font-weight:700;text-align:left}
    .mini{width:100%;border-collapse:collapse;font-size:13px}
    .mini td{padding:8px 0;border-bottom:1px solid var(--line)}
    .mttl{font-weight:600}
    .empty2{color:var(--ink-3);padding:var(--sp-2) 0}`,
    html: `
    <div class="kpis">${kpiHtml}</div>
    ${overdueBox}
    <div class="dgrid">
      <div class="panel">
        <h3>توزیع وضعیت</h3>
        <div class="donutwrap">${donutSvg(m)}<ul class="legend">${legend}</ul></div>
      </div>
      <div class="panel">
        <h3>${bars.title}</h3>
        ${bars.html}
      </div>
    </div>
    <div class="panel">
      <h3>⏰ نزدیک‌ترین ددلاین‌ها</h3>
      ${nearestHtml}
    </div>`,
  };
}

// ============================================================
// صفحه‌ی تک‌فایل با سه تب (radio + CSS، بدون JS)
// ============================================================

/** توکن‌های دیزاین — تم سیاه‌وسفید؛ رنگ فقط برای داده */
const TOKENS_CSS = `
  :root{
    /* تایپوگرافی و رنگ‌های خنثی */
    --bg:#ffffff; --ink:#111111; --ink-2:#555555; --ink-3:#8a8a8a;
    --line:#e6e6e6; --line-strong:#cfcfcf; --surface:#fafafa;
    /* رنگ داده — فقط نمودار و نشان وضعیت */
    --c-done:#16a34a; --c-doing:#2563eb; --c-todo:#9ca3af; --c-over:#dc2626; --c-warn:#d97706;
    /* فاصله (پایه ۸px) */
    --sp-1:8px; --sp-2:16px; --sp-3:24px; --sp-4:32px;
    /* شعاع */
    --r-s:4px; --r-m:8px; --r-l:12px;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{
    font-family:"Vazirmatn",Tahoma,"Segoe UI",sans-serif;
    background:var(--bg);color:var(--ink);
    line-height:1.7;font-size:14px;
    padding:var(--sp-3) var(--sp-2) var(--sp-4);
  }
  .wrap{max-width:880px;margin:0 auto}
  h1{font-size:26px;font-weight:800;letter-spacing:-.5px;line-height:1.3}
  .sub{color:var(--ink-2);font-size:13px;margin-top:var(--sp-1)}
  .rule{border:0;border-top:3px solid var(--ink);margin:var(--sp-2) 0 var(--sp-3)}
  .chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-2);white-space:nowrap}
  .chip i{width:8px;height:8px;border-radius:50%;display:inline-block}
  .chip.done i{background:var(--c-done)} .chip.doing i{background:var(--c-doing)} .chip.todo i{background:var(--c-todo)}
  .over{color:var(--c-over);font-weight:700}
  footer{margin-top:var(--sp-4);text-align:center;color:var(--ink-3);font-size:12px}
`;

const FONT_CSS = `@font-face{
    font-family:"Vazirmatn";
    src:url(data:font/woff2;base64,${VAZIRMATN_WOFF2_B64}) format("woff2");
    font-weight:100 900;font-style:normal;font-display:swap;
  }`;

const TABS_CSS = `
  /* تب‌ها: input مخفی + label؛ انتخاب با :checked — بدون JS */
  .tabs input{position:absolute;opacity:0;pointer-events:none}
  .tabbar{display:flex;gap:var(--sp-1);border-bottom:2px solid var(--ink);flex-wrap:wrap}
  .tabbar label{
    padding:8px 18px;font-size:13px;font-weight:700;color:var(--ink-3);
    cursor:pointer;border:1px solid transparent;border-bottom:0;border-radius:var(--r-m) var(--r-m) 0 0;
    user-select:none;transition:color .15s ease-out,background .15s ease-out;
  }
  .tabbar label:hover{color:var(--ink)}
  #t-list:checked ~ .tabbar label[for=t-list],
  #t-report:checked ~ .tabbar label[for=t-report],
  #t-dash:checked ~ .tabbar label[for=t-dash]{
    color:var(--ink);background:var(--surface);border-color:var(--line);
    border-bottom:2px solid var(--bg);margin-bottom:-2px;
  }
  .panels>section{display:none;padding-top:var(--sp-3)}
  #t-list:checked ~ .panels .p-list{display:block}
  #t-report:checked ~ .panels .p-report{display:block}
  #t-dash:checked ~ .panels .p-dash{display:block}
  @media print{
    body{padding:0}
    .tabbar label{display:none}
    .panels>section{display:none}
    #t-list:checked ~ .panels .p-list,
    #t-report:checked ~ .panels .p-report,
    #t-dash:checked ~ .panels .p-dash{display:block}
  }`;

export function buildHtmlReport(m: ReportModel, defaultTab: ExportStyle): string {
  const list = renderList(m);
  const report = renderReport(m);
  const dash = renderDash(m);
  const tab = (id: ExportStyle) => (id === defaultTab ? " checked" : "");
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>گزارش تسک‌ها — ${escapeHtml(m.scopeName)}</title>
<style>${FONT_CSS}${TOKENS_CSS}${TABS_CSS}${list.css}${report.css}${dash.css}</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>📊 گزارش تسک‌ها</h1>
    <div class="sub">برای: <b>${escapeHtml(m.scopeName)}</b> · ${m.nowFa} · ${faDigits(m.total)} تسک</div>
    <hr class="rule">
  </header>
  <div class="tabs">
    <input type="radio" name="tab" id="t-list"${tab("list")}>
    <input type="radio" name="tab" id="t-report"${tab("report")}>
    <input type="radio" name="tab" id="t-dash"${tab("dash")}>
    <nav class="tabbar">
      <label for="t-list">📋 لیستی</label>
      <label for="t-report">📄 گزارش</label>
      <label for="t-dash">📊 داشبورد</label>
    </nav>
    <div class="panels">
      <section class="p-list">${list.html}</section>
      <section class="p-report">${report.html}</section>
      <section class="p-dash">${dash.html}</section>
    </div>
  </div>
  <footer>ساخته‌شده توسط احمق‌ایجنت 🤖</footer>
</div>
</body>
</html>`;
}
