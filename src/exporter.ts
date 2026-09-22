/**
 * خروجی گزارشی از تسک‌ها — HTML تک‌فایل با سه تب (لیستی / گزارش‌طور / داشبورد)
 *
 *  - تک‌فایل و کاملاً self-contained: فونت Vazirmatn متغیر embed شده، بدون CDN، بدون JS
 *  - تب‌ها و «تم روشن/تیره» با input + label + CSS خالص کار می‌کنند (بدون اسکریپت)
 *  - تم پیش‌فرض از تنظیمات سیستم (prefers-color-scheme)؛ کلید در هدر برعکسش می‌کند
 *  - آیکون‌ها SVG خطیِ inline (به جای ایموجی)؛ انیمیشن‌های نرم + احترام به reduced-motion
 *  - دیزاین «Bold Editorial»: تک‌رنگ + یک لهجه‌ی داده؛ فاصله‌بندی ۸px؛ چاپ = فقط تبِ فعال، همیشه روشن
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
// آیکون‌های خطی SVG (بدون ایموجی — stroke: currentColor)
// ============================================================

const PATHS: Record<string, string> = {
  mark: `<rect x="4" y="4" width="16" height="16" rx="5"/><path d="M9.2 12.3l2.1 2.1 4.4-4.8"/>`,
  list: `<path d="M4 6h16M4 12h16M4 18h10"/>`,
  doc: `<path d="M6.5 3h7.6l4.4 4.4V20a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/><path d="M9 13.5h6M9 17h4"/>`,
  chart: `<path d="M5 20v-6M11 20V7M17 20v-10M3 20h18"/>`,
  sun: `<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.8 4.8l1.4 1.4M17.8 17.8l1.4 1.4M2.5 12h2M19.5 12h2M4.8 19.2l1.4-1.4M17.8 6.2l1.4-1.4"/>`,
  moon: `<path d="M20.6 13.2A8.5 8.5 0 1 1 10.8 3.4a7 7 0 0 0 9.8 9.8z"/>`,
  checkc: `<circle cx="12" cy="12" r="8.5"/><path d="M8.4 12.3l2.4 2.4 4.8-5.1"/>`,
  playc: `<circle cx="12" cy="12" r="8.5"/><path d="M10.2 8.7v6.6l5.6-3.3z" fill="currentColor" stroke="none"/>`,
  circle: `<circle cx="12" cy="12" r="8.5"/>`,
  calendar: `<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M8 3v4M16 3v4M4 10.5h16"/>`,
  clock: `<circle cx="12" cy="12" r="8.5"/><path d="M12 7.2v5l3.1 1.9"/>`,
  alert: `<path d="M12 4.2L2.9 19.4a1 1 0 0 0 .9 1.6h16.4a1 1 0 0 0 .9-1.6L12 4.2z"/><path d="M12 10.2v4M12 17.4v.1"/>`,
  user: `<circle cx="12" cy="8.2" r="3.7"/><path d="M4.8 20.5c1.4-3.3 4.1-4.9 7.2-4.9s5.8 1.6 7.2 4.9"/>`,
  hash: `<path d="M5 9.2h14M5 14.8h14M9.4 4.2L8 19.8M16 4.2l-1.4 15.6"/>`,
  inbox: `<path d="M4.5 13h3.6l1.8 2.8h4.2l1.8-2.8h3.6"/><path d="M6.5 5h11l2 8v4.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2V13z"/>`,
  layers: `<path d="M12 3.5l8.5 4.7L12 12.9 3.5 8.2z"/><path d="M3.5 13.2l8.5 4.7 8.5-4.7"/>`,
};

/** svg خطی — اندازه با کلاس تعیین می‌شود */
const I = (name: string, cls = "ic"): string =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;

// ============================================================
// اجزای مشترک
// ============================================================

const dueText = (t: TaskRow) =>
  t.due_date ? `${fmtDate(t.due_date)}${t.due_at ? ` — ${fmtTimeTehran(t.due_at)}` : ""}` : "—";

const isOverdue = (m: ReportModel, t: TaskRow) => m.overdue.some((o) => o.id === t.id);

/** نشان وضعیت — آیکون + برچسب، پس‌زمینه‌ی ملایم از توکن */
function statusChip(t: TaskRow): string {
  const c = t.status === "done" ? "done" : t.status === "in_progress" ? "doing" : "todo";
  const ic = t.status === "done" ? "checkc" : t.status === "in_progress" ? "playc" : "circle";
  return `<span class="chip ${c}">${I(ic, "ic ci")}<span>${STATUS_LABEL[t.status]}</span></span>`;
}

const userName = (m: ReportModel, t: TaskRow) => m.users.find((x) => x.id === t.assignee_id)?.name ?? "—";

const dueCell = (m: ReportModel, t: TaskRow) =>
  t.due_date
    ? `<span class="due${isOverdue(m, t) ? " over" : ""}">${I("clock", "ic ci")}${dueText(t)}</span>`
    : `<span class="mut">—</span>`;

const stagger = (i: number) => ` style="--i:${Math.min(i, 14)}"`;

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
    .map((t, i) => {
      const cells = [
        `<td class="num">${faDigits(t.id)}</td>`,
        `<td class="ttl">${escapeHtml(t.title)}${t.description ? `<div class="desc">${escapeHtml(t.description)}</div>` : ""}</td>`,
        `<td>${statusChip(t)}</td>`,
        `<td class="dt">${t.start_date ? fmtDate(t.start_date) : "—"}</td>`,
        `<td>${dueCell(m, t)}</td>`,
        ...(m.multiUser
          ? [`<td class="dt">${escapeHtml(userName(m, t))}</td>`]
          : []),
      ];
      return `<tr${stagger(i)}>${cells.join("")}</tr>`;
    })
    .join("\n");
  return {
    css: `
    .tblwrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{font-size:11px;font-weight:600;color:var(--ink-3);text-align:right;padding:var(--sp-1);border-bottom:1.5px solid var(--ink);white-space:nowrap}
    td{padding:12px var(--sp-1);border-bottom:1px solid var(--line);vertical-align:top}
    tbody tr{transition:background .16s ease-out}
    tbody tr:hover{background:var(--surface)}
    .num{color:var(--ink-3);font-size:12px;white-space:nowrap;font-variant-numeric:tabular-nums}
    .ttl{font-weight:600;min-width:220px;line-height:1.7}
    .desc{color:var(--ink-3);font-size:12px;font-weight:400;margin-top:3px;line-height:1.7}
    .dt{white-space:nowrap;color:var(--ink-2)}
    .due{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
    .mut{color:var(--ink-3)}
    .empty{padding:var(--sp-5) var(--sp-3);text-align:center;color:var(--ink-3);border:1.5px dashed var(--line-strong);border-radius:var(--r-m)}
    .empty .ic{width:28px;height:28px;margin-bottom:var(--sp-1)}`,
    html: m.tasks.length
      ? `<div class="tblwrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`
      : `<div class="empty">${I("checkc")}<div>تسکی نیست — از زندگی لذت ببر</div></div>`,
  };
}

// ============================================================
// تب ۲: گزارش‌طور (تحریریه‌ای)
// ============================================================

function renderReport(m: ReportModel): Fragment {
  const entry = (t: TaskRow, i: number) => `
      <article class="entry"${stagger(i)}>
        <div class="no">${faDigits(i + 1)}</div>
        <div class="body">
          <h3>${escapeHtml(t.title)}</h3>
          ${t.description ? `<p>${escapeHtml(t.description)}</p>` : ""}
          <div class="meta">
            ${statusChip(t)}
            <span>${I("calendar", "ic ci")}شروع: ${t.start_date ? fmtDate(t.start_date) : "—"}</span>
            <span class="${isOverdue(m, t) ? "over" : ""}">${I("clock", "ic ci")}پایان: ${dueText(t)}</span>
            <span>${I("hash", "ic ci")}${faDigits(t.id)}</span>
            ${m.multiUser ? `<span>${I("user", "ic ci")}${escapeHtml(userName(m, t))}</span>` : ""}
          </div>
        </div>
      </article>`;

  const section = (icon: string, label: string, rows: TaskRow[]) =>
    rows.length
      ? `\n      <section class="rsec"><h3 class="rh">${I(icon, "ic rhc")}<span>${label}</span><span class="count">${faDigits(rows.length)}</span></h3>${rows.map(entry).join("")}</section>`
      : "";

  return {
    css: `
    .summary{border:1.5px solid var(--ink);border-radius:var(--r-m);padding:var(--sp-2) var(--sp-3);font-size:14px;margin-bottom:var(--sp-3);display:flex;flex-wrap:wrap;gap:var(--sp-1) var(--sp-2);align-items:center}
    .summary b{font-variant-numeric:tabular-nums}
    .rsec{margin-bottom:var(--sp-3)}
    .rh{font-size:15px;font-weight:700;margin-bottom:var(--sp-1);display:flex;align-items:center;gap:8px}
    .rhc{color:var(--ink-3)}
    .count{border:1px solid var(--line-strong);border-radius:999px;font-size:11px;font-weight:600;padding:1px 10px;color:var(--ink-2);font-variant-numeric:tabular-nums}
    .entry{display:flex;gap:var(--sp-2);padding:var(--sp-2) 0;border-bottom:1px solid var(--line)}
    .entry:last-child{border-bottom:0}
    .no{font-size:22px;font-weight:300;color:var(--ink-3);min-width:34px;line-height:1.3;font-variant-numeric:tabular-nums}
    .entry h3{font-size:15px;line-height:1.7}
    .entry .body p{color:var(--ink-2);font-size:13px;margin-top:3px;line-height:1.8}
    .meta{display:flex;flex-wrap:wrap;align-items:center;gap:var(--sp-1) var(--sp-2);margin-top:var(--sp-1);font-size:12px;color:var(--ink-3)}
    .meta span{display:inline-flex;align-items:center;gap:5px}`,
    html: `
    <div class="summary">
      <span>${faDigits(m.total)} تسک</span><span class="sep"></span>
      <span>${faDigits(m.inProgress.length)} در حال انجام</span><span class="sep"></span>
      <span>${faDigits(m.notStarted.length)} شروع‌نشده</span><span class="sep"></span>
      <span>${faDigits(m.done.length)} تمام‌شده</span>
      ${m.overdue.length ? `<span class="sep"></span><span class="over">${I("alert", "ic ci")}${faDigits(m.overdue.length)} سررسید گذشته</span>` : ""}
    </div>
    ${section("playc", "در حال انجام", m.inProgress)}
    ${section("circle", "شروع‌نشده", m.notStarted)}
    ${section("checkc", "تمام‌شده", m.done)}`,
  };
}

// ============================================================
// تب ۳: داشبورد (KPI + نمودار SVG)
// ============================================================

/** دوناتِ وضعیت — رنگ‌ها فقط از توکن‌های داده */
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
      const el = `<circle r="${R}" cx="60" cy="60" fill="none" stroke="${sg.c}" stroke-width="13"
        stroke-linecap="butt" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}"
        transform="rotate(-90 60 60)"/>`;
      acc += len;
      return el;
    })
    .join("");
  return `<svg viewBox="0 0 120 120" class="donut" role="img" aria-label="توزیع وضعیت تسک‌ها">
    ${circles}
    <text x="60" y="57" text-anchor="middle" class="dt">${faDigits(m.total)}</text>
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
      return `<div class="brow"${stagger(i)}>
        <span class="blabel">${escapeHtml(r.label)}</span>
        <span class="btrack"><span class="bfill" style="width:${w}%"></span></span>
        <span class="bval">${faDigits(r.n)}</span>
      </div>`;
    })
    .join("");
  return { title: m.multiUser ? "تسک به ازای هر کاربر" : "توزیع وضعیت", html: bars };
}

function renderDash(m: ReportModel): Fragment {
  const kpis = [
    { icon: "layers", label: "مجموع", n: m.total },
    { icon: "inbox", label: "باز", n: m.open.length },
    { icon: "playc", label: "در حال انجام", n: m.inProgress.length },
    { icon: "checkc", label: "تمام‌شده", n: m.done.length },
  ];
  const kpiHtml = kpis
    .map((k, i) => `<div class="kpi"${stagger(i)}>${I(k.icon, "ic kic")}<div class="kn">${faDigits(k.n)}</div><div class="kl">${k.label}</div></div>`)
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
          (t, i) =>
            `<tr${stagger(i)}><td class="mttl">${escapeHtml(t.title)}</td><td>${dueCell(m, t)}</td></tr>`
        )
        .join("")}</tbody></table>`
    : `<div class="empty2">ددلاینِ پیش‌رویی نیست</div>`;

  const overdueBox = m.overdue.length
    ? `<div class="alert">${I("alert", "ic ci")}<span><b>${faDigits(m.overdue.length)}</b> تسک از سررسیدشان گذشته‌اند</span></div>`
    : "";

  return {
    css: `
    .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:var(--sp-1);margin-bottom:var(--sp-2)}
    .kpi{border:1px solid var(--line);border-radius:var(--r-m);padding:var(--sp-2);display:flex;flex-direction:column;gap:2px;transition:transform .18s ease-out,border-color .18s ease-out,box-shadow .18s ease-out}
    .kpi:hover{transform:translateY(-2px);border-color:var(--line-strong);box-shadow:0 4px 14px var(--shadow)}
    .kic{width:18px;height:18px;color:var(--ink-3);margin-bottom:4px}
    .kn{font-size:30px;font-weight:800;line-height:1.25;font-variant-numeric:tabular-nums}
    .kl{font-size:12px;color:var(--ink-2)}
    .alert{display:flex;align-items:center;gap:10px;border:1px solid var(--c-over);background:var(--c-over-bg);color:var(--c-over);border-radius:var(--r-m);padding:10px var(--sp-2);margin-bottom:var(--sp-2);font-size:13px}
    .dgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:var(--sp-2);margin-bottom:var(--sp-2)}
    .panel{border:1px solid var(--line);border-radius:var(--r-m);padding:var(--sp-2) var(--sp-3)}
    .panel h3{font-size:14px;font-weight:700;margin-bottom:var(--sp-2);display:flex;align-items:center;gap:8px}
    .donutwrap{display:flex;align-items:center;gap:var(--sp-3);flex-wrap:wrap;justify-content:center}
    .donut{width:150px;height:150px;animation:spin .8s cubic-bezier(.22,.61,.36,1) both}
    .donut .dt{font-size:26px;font-weight:800;fill:var(--ink);animation:pop .5s .45s ease-out both}
    .donut .dl{font-size:10px;fill:var(--ink-3)}
    .legend{list-style:none;font-size:13px;display:grid;gap:8px}
    .legend li{display:flex;align-items:center}
    .legend b{font-variant-numeric:tabular-nums}
    .dot{width:9px;height:9px;border-radius:50%;display:inline-block;margin-inline-end:8px}
    .dot.done{background:var(--c-done)} .dot.doing{background:var(--c-doing)} .dot.todo{background:var(--c-todo)}
    .brow{display:grid;grid-template-columns:minmax(72px,96px) 1fr 30px;align-items:center;gap:var(--sp-1);margin-bottom:12px;font-size:12px}
    .blabel{color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .btrack{background:var(--bg);border:1px solid var(--line);border-radius:999px;height:12px;overflow:hidden}
    .bfill{display:block;height:100%;border-radius:999px;background:var(--bar);transform-origin:100% 50%;animation:grow .8s cubic-bezier(.22,.61,.36,1) both;animation-delay:calc(120ms + var(--i,0) * 60ms)}
    .bval{font-weight:700;text-align:left;font-variant-numeric:tabular-nums}
    .mini{width:100%;border-collapse:collapse;font-size:13px}
    .mini td{padding:10px 0;border-bottom:1px solid var(--line)}
    .mini tr:last-child td{border-bottom:0}
    .mttl{font-weight:600}
    .empty2{color:var(--ink-3);padding:var(--sp-2) 0}`,
    html: `
    <div class="kpis">${kpiHtml}</div>
    ${overdueBox}
    <div class="dgrid">
      <div class="panel">
        <h3>${I("chart", "ic ci")}توزیع وضعیت</h3>
        <div class="donutwrap">${donutSvg(m)}<ul class="legend">${legend}</ul></div>
      </div>
      <div class="panel">
        <h3>${I("chart", "ic ci")}${bars.title}</h3>
        ${bars.html}
      </div>
    </div>
    <div class="panel">
      <h3>${I("clock", "ic ci")}نزدیک‌ترین ددلاین‌ها</h3>
      ${nearestHtml}
    </div>`,
  };
}

// ============================================================
// توکن‌های تم (روشن/تیره) — UI تک‌رنگ؛ رنگ فقط برای داده
// ============================================================

const LIGHT_TOKENS = `
    --bg:#fafafa; --surface:#ffffff; --ink:#18181b; --ink-2:#52525b; --ink-3:#71717a;
    --line:#e4e4e7; --line-strong:#d4d4d8; --shadow:rgba(24,24,27,.06);
    --c-done:#15803d; --c-done-bg:rgba(21,128,61,.10);
    --c-doing:#1d4ed8; --c-doing-bg:rgba(29,78,216,.09);
    --c-todo:#52525b; --c-todo-bg:rgba(82,82,91,.10);
    --c-over:#b91c1c; --c-over-bg:rgba(185,28,28,.07);
    --c-warn:#b45309; --c-warn-bg:rgba(180,83,9,.10);
    --bar:#3f3f46;
    color-scheme:light;`;

const DARK_TOKENS = `
    --bg:#0c0c0e; --surface:#17171c; --ink:#f4f4f5; --ink-2:#b0b0b8; --ink-3:#8b8b94;
    --line:#26262b; --line-strong:#3d3d45; --shadow:rgba(0,0,0,.45);
    --c-done:#4ade80; --c-done-bg:rgba(74,222,128,.13);
    --c-doing:#60a5fa; --c-doing-bg:rgba(96,165,250,.13);
    --c-todo:#a1a1aa; --c-todo-bg:rgba(161,161,170,.14);
    --c-over:#f87171; --c-over-bg:rgba(248,113,113,.11);
    --c-warn:#fbbf24; --c-warn-bg:rgba(251,191,36,.12);
    --bar:#d4d4d8;
    color-scheme:dark;`;

/**
 * تم: پیش‌فرض از سیستم؛ کلیدِ #tg آن را معکوس می‌کند (چهار حالت با CSS خالص)
 * چاپ همیشه روشن است (صرفه‌جویی جوهر + خوانایی)
 */
const THEME_CSS = `
  .wrap{${LIGHT_TOKENS}}
  @media (prefers-color-scheme: dark){ .wrap{${DARK_TOKENS}} }
  #tg:checked ~ .wrap{${DARK_TOKENS}}
  @media (prefers-color-scheme: dark){ #tg:checked ~ .wrap{${LIGHT_TOKENS}} }`;

// ============================================================
// اسکلت صفحه: هدر + تب‌ها + تم — همه CSS-only
// ============================================================

const FONT_CSS = `@font-face{
    font-family:"Vazirmatn";
    src:url(data:font/woff2;base64,${VAZIRMATN_WOFF2_B64}) format("woff2");
    font-weight:100 900;font-style:normal;font-display:swap;
  }`;

const BASE_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  html{-webkit-text-size-adjust:100%}
  body{
    font-family:"Vazirmatn","Segoe UI",Tahoma,sans-serif;
    line-height:1.8;font-size:14px;
  }
  .vh{position:absolute;opacity:0;width:1px;height:1px;margin:-1px;pointer-events:none}
  .wrap{
    background:var(--bg);color:var(--ink);
    min-height:100vh;min-height:100dvh;
    padding:var(--sp-3) var(--sp-2) var(--sp-5);
    transition:background .3s ease-out,color .3s ease-out;
  }
  .inner{max-width:920px;margin:0 auto}

  /* ---------- آیکون ---------- */
  .ic{width:15px;height:15px;flex:none;vertical-align:-2px}
  .ci{width:13px;height:13px;color:currentColor;opacity:.9}

  /* ---------- هدر ---------- */
  .brandrow{display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-3)}
  .brand{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--ink-3)}
  .brand .ic{width:20px;height:20px;color:var(--ink)}
  .theme-btn{
    display:inline-flex;align-items:center;justify-content:center;
    width:44px;height:44px;border-radius:999px;
    border:1px solid var(--line);background:var(--surface);color:var(--ink-2);
    cursor:pointer;user-select:none;
    transition:border-color .18s ease-out,color .18s ease-out,transform .18s ease-out;
  }
  .theme-btn:hover{border-color:var(--ink);color:var(--ink);transform:translateY(-1px)}
  .theme-btn .ic{width:19px;height:19px;transition:transform .35s ease-out}
  .theme-btn:hover .ic{transform:rotate(18deg)}
  /* آیکونِ «حالت مقصد»: پیش‌فرض ماه (برو به تیره)؛ در سیستم تیره خورشید */
  .theme-btn .i-sun{display:none}
  #tg:checked ~ .wrap .theme-btn .i-sun{display:block}
  #tg:checked ~ .wrap .theme-btn .i-moon{display:none}
  @media (prefers-color-scheme: dark){
    .theme-btn .i-sun{display:block}
    .theme-btn .i-moon{display:none}
    #tg:checked ~ .wrap .theme-btn .i-sun{display:none}
    #tg:checked ~ .wrap .theme-btn .i-moon{display:block}
  }
  .kicker{font-size:12px;font-weight:600;color:var(--ink-3);margin-bottom:4px}
  h1{font-size:32px;font-weight:800;line-height:1.4;letter-spacing:0}
  .meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px var(--sp-2);color:var(--ink-2);font-size:13px;margin-top:6px}
  .meta span{display:inline-flex;align-items:center;gap:5px}
  .sep{width:3px;height:3px;border-radius:50%;background:var(--ink-3);display:inline-block!important;flex:none}

  /* ---------- نوار پیشرفت کل ---------- */
  .prog{display:flex;align-items:center;gap:var(--sp-1);margin-top:var(--sp-2)}
  .plabel{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-3);white-space:nowrap}
  .ptrack{flex:1;height:6px;border-radius:999px;background:var(--c-done-bg);overflow:hidden}
  .pfill{display:block;height:100%;border-radius:999px;background:var(--c-done);transform-origin:100% 50%;animation:grow .9s cubic-bezier(.22,.61,.36,1) .15s both}
  .pval{font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--ink-2);min-width:38px}
  .rule{border:0;border-top:1.5px solid var(--ink);margin:var(--sp-2) 0 0}

  /* ---------- تب‌ها ---------- */
  .tabbar{
    position:sticky;top:0;z-index:10;
    display:flex;gap:var(--sp-1);
    background:var(--bg);border-bottom:1.5px solid var(--ink);
    margin-bottom:var(--sp-3);
  }
  .tabbar label{
    position:relative;display:inline-flex;align-items:center;gap:8px;
    padding:12px 16px;min-height:44px;
    font-size:13px;font-weight:700;color:var(--ink-3);
    cursor:pointer;user-select:none;white-space:nowrap;
    transition:color .18s ease-out;
  }
  .tabbar label::after{
    content:"";position:absolute;right:12px;left:12px;bottom:-1.5px;height:2.5px;
    background:var(--ink);border-radius:2px;
    transform:scaleX(0);transform-origin:100% 50%;
    transition:transform .25s cubic-bezier(.22,.61,.36,1);
  }
  .tabbar label:hover{color:var(--ink)}
  #t-list:focus-visible ~ .wrap .tabbar label[for=t-list],
  #t-report:focus-visible ~ .wrap .tabbar label[for=t-report],
  #t-dash:focus-visible ~ .wrap .tabbar label[for=t-dash],
  #tg:focus-visible ~ .wrap .theme-btn{outline:2px solid var(--ink);outline-offset:2px}
  #t-list:checked ~ .wrap .tabbar label[for=t-list],
  #t-report:checked ~ .wrap .tabbar label[for=t-report],
  #t-dash:checked ~ .wrap .tabbar label[for=t-dash]{color:var(--ink)}
  #t-list:checked ~ .wrap .tabbar label[for=t-list]::after,
  #t-report:checked ~ .wrap .tabbar label[for=t-report]::after,
  #t-dash:checked ~ .wrap .tabbar label[for=t-dash]::after{transform:scaleX(1)}

  /* ---------- پنل‌ها + انیمیشن ورود ---------- */
  .panels>section{display:none}
  #t-list:checked ~ .wrap .p-list,
  #t-report:checked ~ .wrap .p-report,
  #t-dash:checked ~ .wrap .p-dash{display:block;animation:rise .4s cubic-bezier(.22,.61,.36,1) both}
  .p-list tbody tr,.p-report .entry,.p-dash .kpi,.p-dash .brow,.p-dash .mini tr{
    animation:rise .45s cubic-bezier(.22,.61,.36,1) both;
    animation-delay:calc(60ms + var(--i,0) * 40ms);
  }

  /* ---------- نشان وضعیت ---------- */
  .chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;white-space:nowrap;padding:2px 10px;border-radius:999px}
  .chip.done{color:var(--c-done);background:var(--c-done-bg)}
  .chip.doing{color:var(--c-doing);background:var(--c-doing-bg)}
  .chip.todo{color:var(--c-todo);background:var(--c-todo-bg)}
  .over{color:var(--c-over);font-weight:700}
  .over .ic{width:13px;height:13px}

  footer{margin-top:var(--sp-5);padding-top:var(--sp-2);border-top:1px solid var(--line);display:flex;align-items:center;justify-content:center;gap:8px;color:var(--ink-3);font-size:12px}
  footer .ic{width:16px;height:16px}

  /* ---------- انیمیشن‌ها ---------- */
  @keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  @keyframes grow{from{transform:scaleX(0)}}
  @keyframes pop{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:none}}
  @keyframes spin{from{opacity:0;transform:rotate(-36deg) scale(.94)}to{opacity:1;transform:none}}
  @media (prefers-reduced-motion: reduce){
    *,*::before,*::after{animation:none!important;transition:none!important}
  }

  /* ---------- چاپ: فقط تبِ فعال، همیشه تمِ روشن ---------- */
  @media print{
    .wrap,#tg:checked ~ .wrap{${LIGHT_TOKENS}}
    body{background:#fff}
    .wrap{min-height:auto;padding:0}
    .theme-btn,.tabbar{display:none}
    .panels>section{display:none}
    #t-list:checked ~ .wrap .p-list,
    #t-report:checked ~ .wrap .p-report,
    #t-dash:checked ~ .wrap .p-dash{display:block}
    .p-list tbody tr,.p-report .entry,.p-dash .kpi,.p-dash .brow,.p-dash .mini tr{animation:none!important}
    .bfill,.pfill,.donut{animation:none!important}
    .kpi:hover{transform:none;box-shadow:none}
    .tblwrap{overflow:visible}
  }`;

export function buildHtmlReport(m: ReportModel, defaultTab: ExportStyle): string {
  const list = renderList(m);
  const report = renderReport(m);
  const dash = renderDash(m);
  const tab = (id: ExportStyle) => (id === defaultTab ? " checked" : "");
  const pct = m.total ? Math.round((m.done.length / m.total) * 100) : 0;
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>گزارش تسک‌ها — ${escapeHtml(m.scopeName)}</title>
<style>${FONT_CSS}
  :root{--sp-1:8px;--sp-2:16px;--sp-3:24px;--sp-5:40px;--r-m:10px}${THEME_CSS}${BASE_CSS}${list.css}${report.css}${dash.css}</style>
</head>
<body>
<input type="checkbox" id="tg" class="vh">
<input type="radio" name="tab" id="t-list" class="vh"${tab("list")}>
<input type="radio" name="tab" id="t-report" class="vh"${tab("report")}>
<input type="radio" name="tab" id="t-dash" class="vh"${tab("dash")}>
<div class="wrap"><div class="inner">
  <header>
    <div class="brandrow">
      <div class="brand">${I("mark")}<span>احمق‌ایجنت</span></div>
      <label class="theme-btn" for="tg" title="تم روشن / تیره" aria-label="تغییر تم روشن یا تیره">${I("sun", "ic i-sun")}${I("moon", "ic i-moon")}</label>
    </div>
    <div class="kicker">گزارش تسک‌ها</div>
    <h1>${escapeHtml(m.scopeName)}</h1>
    <div class="meta">
      <span>${I("calendar", "ic ci")}${m.nowFa}</span><span class="sep"></span>
      <span>${I("hash", "ic ci")}${faDigits(m.total)} تسک</span>
      ${m.overdue.length ? `<span class="sep"></span><span class="over">${I("alert", "ic ci")}${faDigits(m.overdue.length)} سررسید گذشته</span>` : ""}
    </div>
    <div class="prog">
      <span class="plabel">${I("checkc", "ic ci")}پیشرفت کل</span>
      <div class="ptrack"><span class="pfill" style="width:${pct}%"></span></div>
      <span class="pval">٪${faDigits(pct)}</span>
    </div>
    <hr class="rule">
  </header>
  <nav class="tabbar" aria-label="نمایش گزارش">
    <label for="t-list">${I("list", "ic")}لیستی</label>
    <label for="t-report">${I("doc", "ic")}گزارش</label>
    <label for="t-dash">${I("chart", "ic")}داشبورد</label>
  </nav>
  <main class="panels">
    <section class="p-list">${list.html}</section>
    <section class="p-report">${report.html}</section>
    <section class="p-dash">${dash.html}</section>
  </main>
  <footer>${I("mark")}<span>ساخته‌شده با احمق‌ایجنت · خروجی آفلاین، بدون جاوااسکریپت</span></footer>
</div></div>
</body>
</html>`;
}
