#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""تست زنده‌ی فاز ۳ — همه‌ی سناریوها علیه ورکر production."""
import json, time, sys, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone

WH   = "https://ahmagh-agent.nova-0e7442.workers.dev/webhook"
SEC  = open("/tmp/.gh/webhook_secret").read().strip()
TOK  = open("/tmp/.gh/cf_token").read().strip()
CF   = ("https://api.cloudflare.com/client/v4/accounts/4d67f0848c83ace5ffa115b98bb1b2ee"
        "/d1/database/dcf6cf3f-6fa5-4382-956c-ae4614ce7fb7/query")
U1, U2 = 777001, 777002
TEH = timezone(timedelta(hours=3, minutes=30))

PASS, FAIL = [], []
def ok(name):      PASS.append(name); print(f"  ✅ {name}")
def bad(name, info=""): FAIL.append((name, info)); print(f"  ❌ {name}  →  {info}")
def sec(s):        print(f"\n== {s} ==")

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"

def http(url, body=None, headers=None, method=None):
    h = {"User-Agent": UA}
    h.update(headers or {})
    req = urllib.request.Request(url, data=(json.dumps(body).encode() if body is not None else None),
                                 headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

def d1(sql):
    st, body = http(CF, {"sql": sql}, {"Authorization": f"Bearer {TOK}", "Content-Type": "application/json"})
    j = json.loads(body)
    if not j.get("success"):
        raise RuntimeError(f"D1 error: {body[:300]}")
    return j["result"][0]["results"]

uid = [900_000_100]
def send(update, expect=200):
    uid[0] += 1
    update["update_id"] = uid[0]
    st, body = http(WH, update, {"X-Telegram-Bot-Api-Secret-Token": SEC, "Content-Type": "application/json"})
    if st != 200:
        print(f"  ⚠️ webhook HTTP {st}: {body[:120]}")
    return st

def msg(uid_, text, first="تست", uname="ahmagh_tester1"):
    return {"message": {"message_id": uid[0] % 100000, "from": {"id": uid_, "is_bot": False,
            "first_name": first, "username": uname, "language_code": "fa"},
            "chat": {"id": uid_, "type": "private"}, "date": int(time.time()), "text": text}}

def cq(uid_, data, first="تست", uname="ahmagh_tester1"):
    return {"callback_query": {"id": str(uid[0]), "from": {"id": uid_, "is_bot": False,
            "first_name": first, "username": uname}, "message": {"message_id": 1,
            "chat": {"id": uid_, "type": "private"}}, "data": data}}

def wait_for(cond, timeout=45, desc=""):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if cond(): return True
        except Exception:
            pass
        time.sleep(2)
    return False

def task_row(tid):
    r = d1(f"SELECT * FROM tasks WHERE id = {tid}")
    return r[0] if r else None

def latest_task(creator=U1):
    r = d1(f"SELECT * FROM tasks WHERE creator_id = {creator} ORDER BY id DESC LIMIT 1")
    return r[0] if r else None

def new_task_id(prev_max):
    r = d1("SELECT MAX(id) AS m FROM tasks")
    m = r[0]["m"]
    return None if m is None or m <= prev_max else m

TODAY = datetime.now(TEH).strftime("%Y-%m-%d")
test_ids = []

# پاک‌سازی هر قبضه‌ی قبلی تست
d1(f"DELETE FROM tasks WHERE creator_id IN ({U1},{U2}) OR assignee_id IN ({U1},{U2})")
d1(f"DELETE FROM pending_tasks WHERE user_id IN ({U1},{U2})")
d1(f"DELETE FROM users WHERE user_id IN ({U1},{U2},777003,777004)")
print("(cleanup قبلی انجام شد)")

# ---------------- 0. امنیت ----------------
sec("S0: سیکرت غلط → 403")
st = http(WH, {"update_id": 1}, {"X-Telegram-Bot-Api-Secret-Token": "WRONG"})[0]
ok("403") if st == 403 else bad("403", f"got {st}")
st = http(WH, {"update_id": 1}, {})[0]
ok("بدون هدر → 403") if st == 403 else bad("بدون هدر → 403", f"got {st}")

# ---------------- 1. /start ----------------
sec("S1: /start هر دو کاربر فیک")
send(msg(U1, "/start")); send(msg(U2, "/start", first="علی", uname="ahmagh_tester2"))
if wait_for(lambda: len(d1("SELECT * FROM users WHERE user_id IN (777001,777002)")) == 2, 20):
    ok("users ساخته شدند")
else:
    bad("users ساخته شدند")

max_id_before = (d1("SELECT MAX(id) AS m FROM tasks")[0] or {"m": 0})["m"] or 0

# ---------------- 2. تسک ساده بدون ساعت ----------------
sec("S2: «تا فردا» — بدون ساعت")
send(msg(U1, "احمق این تسک رو ایجاد کن: تست فاز سه، تا فردا"))
tid = None
if wait_for(lambda: (lambda m: m and m > max_id_before)(new_task_id(max_id_before)), 60):
    tid = new_task_id(max_id_before); test_ids.append(tid)
    t = task_row(tid)
    if t["due_date"] == "2026-09-22" and t["due_at"] is None and t["start_date"] == TODAY and t["auto_start"] == 0:
        ok(f"task #{tid}: due=2026-09-22, due_at=NULL, start=today, auto_start=0")
    else:
        bad("فیلدهای تسک", json.dumps(t, ensure_ascii=False)[:250])
else:
    bad("ساخت تسک", "timeout")

# ---------------- 3. ساعت دقیق عصر ----------------
sec("S3: «تا فردا ساعت 10:30 عصر» → 22:30")
prev = new_task_id(max_id_before) or max_id_before
send(msg(U1, "احمق این تسک رو ایجاد کن: تست ساعت دقیق، تا فردا ساعت 10:30 عصر"))
if wait_for(lambda: new_task_id(prev) is not None, 60):
    tid3 = new_task_id(prev); test_ids.append(tid3)
    t = task_row(tid3)
    if t["due_at"] == "2026-09-22T22:30:00+03:30":
        ok(f"task #{tid3}: due_at=2026-09-22T22:30:00+03:30")
    else:
        bad("due_at عصر", f"due_at={t['due_at']} due_date={t['due_date']}")
else:
    bad("ساخت تسک", "timeout"); tid3 = None

# ---------------- 4. 12 ظهر ----------------
sec("S4: «تا شنبه ساعت 12 ظهر»")
prev = new_task_id(prev) or prev
send(msg(U1, "احمق این تسک رو ایجاد کن: تست نیم‌روز، تا شنبه ساعت 12 ظهر"))
if wait_for(lambda: new_task_id(prev) is not None, 60):
    tid4 = new_task_id(prev); test_ids.append(tid4)
    t = task_row(tid4)
    if t["due_date"] == "2026-09-26" and t["due_at"] == "2026-09-26T12:00:00+03:30":
        ok(f"task #{tid4}: شنبه 12:00 ظهر")
    else:
        bad("12 ظهر", f"due_date={t['due_date']} due_at={t['due_at']}")
else:
    bad("ساخت تسک", "timeout"); tid4 = None

# ---------------- 5. پندینگ + جواب با تاریخ و ساعت ----------------
sec("S5: بدون تاریخ پایان → سوال → «فردا ساعت 5 عصر»")
prev = new_task_id(prev) or prev
send(msg(U1, "احمق این تسک رو ایجاد کن: تست پندینگ با ساعت"))
if wait_for(lambda: len(d1(f"SELECT * FROM pending_tasks WHERE user_id = {U1}")) == 1, 30):
    ok("pending ثبت شد")
else:
    bad("pending ثبت شد")
send(msg(U1, "فردا ساعت 5 عصر"))
if wait_for(lambda: len(d1(f"SELECT * FROM pending_tasks WHERE user_id = {U1}")) == 0 and new_task_id(prev), 60):
    tid5 = new_task_id(prev); test_ids.append(tid5)
    t = task_row(tid5)
    if t["due_at"] == "2026-09-22T17:00:00+03:30":
        ok(f"task #{tid5}: due_at=2026-09-22T17:00:00+03:30 (فقط از متن جواب)")
    else:
        bad("due_at پندینگ", f"due_at={t['due_at']} due_date={t['due_date']}")
else:
    bad("تکمیل پندینگ", "timeout")

# ---------------- 5b. پندینگ + جواب فقط ساعت ----------------
sec("S5b: جواب فقط «ساعت 5 عصر» → امروز 17:00")
prev = new_task_id(prev) or prev
send(msg(U1, "احمق این تسک رو ایجاد کن: تست فقط ساعت"))
if not wait_for(lambda: len(d1(f"SELECT * FROM pending_tasks WHERE user_id = {U1}")) == 1, 30):
    bad("pending ثبت شد (5b)")
send(msg(U1, "ساعت 5 عصر"))
if wait_for(lambda: len(d1(f"SELECT * FROM pending_tasks WHERE user_id = {U1}")) == 0 and new_task_id(prev), 60):
    tid5b = new_task_id(prev); test_ids.append(tid5b)
    t = task_row(tid5b)
    if t["due_date"] == TODAY and t["due_at"] == f"{TODAY}T17:00:00+03:30":
        ok(f"task #{tid5b}: فقط ساعت → امروز 17:00")
    else:
        bad("فقط ساعت", f"due_date={t['due_date']} due_at={t['due_at']}")
else:
    bad("تکمیل پندینگ 5b", "timeout")

# ---------------- 6. لغو پندینگ ----------------
sec("S6: «بی‌خیال» → لغو")
send(msg(U1, "احمق این تسک رو ایجاد کن: تست لغو"))
if not wait_for(lambda: len(d1(f"SELECT * FROM pending_tasks WHERE user_id = {U1}")) == 1, 30):
    bad("pending ثبت شد (S6)")
prev = new_task_id(prev) or prev
send(msg(U1, "بی‌خیال"))
time.sleep(5)
if len(d1(f"SELECT * FROM pending_tasks WHERE user_id = {U1}")) == 0 and new_task_id(prev) is None:
    ok("پندینگ حذف شد و تسکی ساخته نشد")
else:
    bad("لغو", "pending باقی است یا تسک ساخته شد")

# ---------------- 7. شروع آینده + مسئول + AI فالبک ----------------
sec("S7: «از شنبه تا 5 مهر ... برای علی» → auto_start=1 + assignee=علی")
send(msg(U1, "احمق از شنبه تا 5 مهر گزارش مالی رو درست کن برای علی"))
if wait_for(lambda: new_task_id(prev) is not None, 90):
    tid7 = new_task_id(prev); test_ids.append(tid7)
    t = task_row(tid7)
    checks = [t["start_date"] == "2026-09-26", t["due_date"] == "2026-09-27",
              t["auto_start"] == 1, t["status"] == "not_started", t["assignee_id"] == U2]
    if all(checks):
        ok(f"task #{tid7}: شنبه→5مهر، auto_start=1، مسئول=علی (AI فالبک)")
    else:
        bad("S7", json.dumps({k: t[k] for k in ("start_date","due_date","auto_start","status","assignee_id","title")}, ensure_ascii=False))
else:
    bad("S7", "timeout — AI فالبک نکرد؟"); tid7 = None

# ---------------- 8. /edit ----------------
if tid3:
    sec("S8: /edit — همه‌ی فیلدها")
    prev = new_task_id(prev) or prev
    send(msg(U1, f"/edit {tid3} عنوان: عنوان ویرایش‌شده"))
    if wait_for(lambda: task_row(tid3)["title"] == "عنوان ویرایش‌شده", 20):
        ok("عنوان")
    else:
        bad("عنوان", task_row(tid3)["title"])

    send(msg(U1, f"/edit {tid3} توضیح: توضیح ویرایش‌شده"))
    if wait_for(lambda: task_row(tid3)["description"] == "توضیح ویرایش‌شده", 20):
        ok("توضیح")
    else:
        bad("توضیح", task_row(tid3)["description"])

    send(msg(U1, f"/edit {tid3} پایان: پنجشنبه ساعت ۸ صبح"))
    if wait_for(lambda: task_row(tid3)["due_at"] == "2026-09-24T08:00:00+03:30", 30):
        t = task_row(tid3)
        ok(f"پایان: پنجشنبه 08:00 (due_date={t['due_date']})")
        if t["reminder_count"] == 0:
            ok("reminder_count ریست شد")
        else:
            bad("reminder_count", str(t["reminder_count"]))
    else:
        t = task_row(tid3); bad("پایان", f"due_date={t['due_date']} due_at={t['due_at']}")

    send(msg(U1, f"/edit {tid3} وضعیت: در حال انجام"))
    if wait_for(lambda: task_row(tid3)["status"] == "in_progress", 20):
        t = task_row(tid3)
        ok("وضعیت → در حال انجام" + (" + started_at" if t["started_at"] else " (بدون started_at!)"))
        if not t["started_at"]: bad("started_at", "خالی است")
    else:
        bad("وضعیت", task_row(tid3)["status"])

    t_before = task_row(tid3)
    send(msg(U1, f"/edit {tid3} فیلد غلط: مقدار"))
    time.sleep(6)
    t_after = task_row(tid3)
    if json.dumps(t_before, sort_keys=True) == json.dumps(t_after, sort_keys=True):
        ok("فیلد غلط → بدون تغییر")
    else:
        bad("فیلد غلط", "تسک تغییر کرد!")

    send(msg(U1, "/edit 99999 عنوان: چیزی"))
    time.sleep(4)
    ok("99999 → بدون کرش (ورکر زنده است)" if http("https://ahmagh-agent.nova-0e7442.workers.dev/health")[0] == 200 else "کرش؟")

    send(msg(U1, f"/edit {tid3} مسئول: علی"))
    if wait_for(lambda: task_row(tid3)["assignee_id"] == U2, 20):
        ok("مسئول → علی")
    else:
        bad("مسئول", str(task_row(tid3)["assignee_id"]))

    # شروع فردا صبح — وضعیت in_progress است پس auto_start مسلح نمی‌شود
    send(msg(U1, f"/edit {tid3} شروع: فردا ساعت ۸ صبح"))
    if wait_for(lambda: task_row(tid3)["start_at"] == "2026-09-22T08:00:00+03:30", 20):
        t = task_row(tid3)
        ok(f"شروع: فردا 08:00 (auto_start={t['auto_start']} چون در حال انجام است)")
    else:
        t = task_row(tid3); bad("شروع", f"start_at={t['start_at']}")

# ---------------- 9. callback + /status ----------------
if tid3:
    sec("S9: دکمه شیشه‌ای done + /status ریست")
    send(cq(U1, f"st|{tid3}|done"))
    if wait_for(lambda: task_row(tid3)["status"] == "done", 20):
        t = task_row(tid3)
        ok("callback → done" + (" + completed_at" if t["completed_at"] else " (بدون completed_at!)"))
        if not t["completed_at"]: bad("completed_at", "خالی است")
    else:
        bad("callback done", task_row(tid3)["status"])
    send(msg(U1, f"/status {tid3} شروع نشده"))
    if wait_for(lambda: task_row(tid3)["status"] == "not_started", 20):
        ok("/status ریست → not_started")
    else:
        bad("/status", task_row(tid3)["status"])

# ---------------- 10. /assign و /delete ----------------
if tid4:
    sec("S10: /assign و /delete")
    send(msg(U1, f"/assign {tid4} @ahmagh_tester2"))
    if wait_for(lambda: task_row(tid4)["assignee_id"] == U2, 20):
        ok("/assign → علی")
    else:
        bad("/assign", str(task_row(tid4)["assignee_id"]))
    tid_del = tid5 if tid5 else tid4
    send(msg(U1, f"/delete {tid_del}"))
    if wait_for(lambda: task_row(tid_del) is None, 20):
        ok(f"/delete {tid_del}")
        if tid_del in test_ids: test_ids.remove(tid_del)
    else:
        bad("/delete", "حذف نشد")

# ---------------- 11. پیام غیرمرتبط و دستور ناشناخته ----------------
sec("S11: پیام عادی + دستور ناشناخته")
prev = new_task_id(prev) or prev
send(msg(U1, "سلام چطوری؟ داشتم تست می‌کردم"))
send(msg(U1, "/foo bar"))
time.sleep(6)
if new_task_id(prev) is None and len(d1(f"SELECT * FROM pending_tasks WHERE user_id = {U1}")) == 0:
    ok("هیچ تسک/پندینگی ساخته نشد")
else:
    bad("پیام عادی", "تسک یا پندینگ اضافه شد")

# ---------------- 12. تزریق HTML ----------------
sec("S12: عنوان با تگ HTML")
send(msg(U1, 'احمق این تسک رو ایجاد کن: <b>هک</b> & "تست"، تا فردا'))
if wait_for(lambda: new_task_id(prev) is not None, 60):
    tid12 = new_task_id(prev); test_ids.append(tid12)
    ok(f"task #{tid12} ساخته شد (تحویل escaped در لاگ بررسی می‌شود)")
else:
    bad("تسک HTML", "timeout")

# ---------------- 13. شروع خودکار زنده ----------------
sec("S13: شروع خودکار زنده — /edit شروع: امروز ساعت HH:MM")
prev = new_task_id(prev) or prev
send(msg(U1, "احمق این تسک رو ایجاد کن: تست شروع خودکار زنده، تا هفته آینده"))
tid13 = None
if wait_for(lambda: new_task_id(prev) is not None, 60):
    tid13 = new_task_id(prev); test_ids.append(tid13)
    t = task_row(tid13)
    if t["status"] == "not_started" and t["auto_start"] == 0:
        ok(f"task #{tid13}: not_started, auto_start=0 (پیش‌فرض)")
    else:
        bad("پیش‌فرض S13", f"auto_start={t['auto_start']}")

    now_utc = datetime.now(timezone.utc)
    next_tick = (now_utc.replace(second=0, microsecond=0) + timedelta(minutes=10))
    next_tick -= timedelta(minutes=next_tick.minute % 10)
    # هدف: بین الان و تیکِ بعدی
    target_utc = now_utc + timedelta(seconds=75)
    if target_utc >= next_tick - timedelta(seconds=20):
        target_utc = next_tick + timedelta(seconds=60)  # برای تیکِ بعد از آن
        next_tick += timedelta(minutes=10)
    target_teh = target_utc.astimezone(TEH)
    hh, mm = target_teh.strftime("%H:%M").split(":")
    fa_h, fa_m = "".join("۰۱۲۳۴۵۶۷۸۹"[int(c)] for c in hh), "".join("۰۱۲۳۴۵۶۷۸۹"[int(c)] for c in mm)
    print(f"   ⏰ هدف: {target_teh:%H:%M} تهران | تیک کرون: {next_tick:%H:%M} UTC")
    send(msg(U1, f"/edit {tid13} شروع: امروز ساعت {fa_h}:{fa_m}"))
    exp_at = f"{TODAY}T{hh}:{mm}:00+03:30"
    if wait_for(lambda: task_row(tid13)["start_at"] == exp_at and task_row(tid13)["auto_start"] == 1, 20):
        ok(f"شروع ست شد: {exp_at}, auto_start=1")
    else:
        t = task_row(tid13); bad("شروع زنده", f"start_at={t['start_at']} auto_start={t['auto_start']}")
    # صبر تا بعد از تیک
    wait_secs = max(0, (next_tick - datetime.now(timezone.utc)).total_seconds()) + 75
    print(f"   ⏳ {int(wait_secs)} ثانیه صبر برای تیک کرون...")
    time.sleep(wait_secs)
    t = task_row(tid13)
    if t["status"] == "in_progress" and t["auto_start"] == 0 and t["started_at"]:
        ok(f"🚀 شروع خودکار زنده: not_started → in_progress در {t['started_at']}")
    else:
        bad("شروع خودکار زنده", json.dumps({k: t[k] for k in ("status","auto_start","started_at","start_at")}, ensure_ascii=False))
else:
    bad("S13", "ساخت تسک اولیه timeout")

# ---------------- جمع‌بندی ----------------
print("\n" + "=" * 50)
print(f"PASS: {len(PASS)} | FAIL: {len(FAIL)}")
for n, i in FAIL: print(f"  ❌ {n}: {i}")
json.dump({"test_ids": test_ids, "pass": PASS, "fail": FAIL}, open("/tmp/live_results.json", "w"))
sys.exit(1 if FAIL else 0)
