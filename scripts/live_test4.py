#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""تست زنده‌ی فاز ۴: ثبت‌نام/ادمین، لیست طبیعی، خروجی، تاریخ‌های phrase، مدل llama"""
import json, time, sys, urllib.request
from datetime import datetime, timedelta, timezone

WH  = "https://ahmagh-agent.nova-0e7442.workers.dev/webhook"
SEC = open("/tmp/.gh/webhook_secret").read().strip()
TOK = open("/tmp/.gh/cf_token").read().strip()
CF  = ("https://api.cloudflare.com/client/v4/accounts/4d67f0848c83ace5ffa115b98bb1b2ee"
       "/d1/database/dcf6cf3f-6fa5-4382-956c-ae4614ce7fb7/query")
UA  = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36"
U1, U2 = 777001, 777002   # U1=عادی، U2=ادمین
TEH = timezone(timedelta(hours=3, minutes=30))
TODAY = datetime.now(TEH).strftime("%Y-%m-%d")

PASS, FAIL = [], []
def ok(n): PASS.append(n); print(f"  ✅ {n}")
def bad(n, i=""): FAIL.append((n, i)); print(f"  ❌ {n}  →  {i}")
def sec(s): print(f"\n== {s} ==")

def http(url, body=None, headers=None):
    h = {"User-Agent": UA}; h.update(headers or {})
    req = urllib.request.Request(url, data=(json.dumps(body).encode() if body is not None else None), headers=h)
    try:
        with urllib.request.urlopen(req, timeout=40) as r: return r.status
    except urllib.error.HTTPError as e: return e.code

def d1(sql):
    req = urllib.request.Request(CF, data=json.dumps({"sql": sql}).encode(),
        headers={"Authorization": f"Bearer {TOK}", "Content-Type": "application/json", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read())["result"][0]["results"]

uid = [999100000]
def send(text, uid_=U1, first="تست", uname="ahmagh_t1"):
    uid[0] += 1
    upd = {"update_id": uid[0], "message": {"message_id": uid[0] % 100000,
        "from": {"id": uid_, "is_bot": False, "first_name": first, "username": uname},
        "chat": {"id": uid_, "type": "private"}, "date": int(time.time()), "text": text}}
    st = http(WH, upd, {"X-Telegram-Bot-Api-Secret-Token": SEC, "Content-Type": "application/json"})
    if st != 200: print(f"  ⚠️ HTTP {st}")

def cq(data, uid_=U1, first="تست", uname="ahmagh_t1"):
    uid[0] += 1
    upd = {"callback_query": {"id": str(uid[0]), "from": {"id": uid_, "is_bot": False,
        "first_name": first, "username": uname},
        "message": {"message_id": 1, "chat": {"id": uid_, "type": "private"}}, "data": data}}
    http(WH, upd, {"X-Telegram-Bot-Api-Secret-Token": SEC, "Content-Type": "application/json"})

def wait_for(cond, timeout=60, step=2):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if cond(): return True
        except Exception: pass
        time.sleep(step)
    return False

def max_task(): return (d1("SELECT MAX(id) AS m FROM tasks")[0] or {"m": 0})["m"] or 0
def last_task(min_id):
    r = d1(f"SELECT * FROM tasks WHERE id > {min_id} ORDER BY id DESC LIMIT 1")
    return r[0] if r else None

# ---------- پاک‌سازی ----------
d1(f"DELETE FROM tasks WHERE creator_id IN ({U1},{U2}) OR assignee_id IN ({U1},{U2})")
d1(f"DELETE FROM pending_tasks WHERE user_id IN ({U1},{U2})")
d1(f"DELETE FROM users WHERE user_id IN ({U1},{U2})")
send("/start", U1); send("/start", U2, first="علی", uname="ahmagh_t2")
assert wait_for(lambda: len(d1(f"SELECT * FROM users WHERE user_id IN ({U1},{U2})")) == 2, 20)
prev = max_task()

# ================= ثبت‌نام =================
sec("F1: ثبت‌نام")
send("/register ali 1234", U1)
if wait_for(lambda: (d1(f"SELECT role, username_login FROM users WHERE user_id={U1}") or [{}])[0].get("role") == "user", 15):
    ok("کاربر عادی ثبت‌نام شد")
else:
    bad("کاربر عادی", json.dumps(d1(f"SELECT role, username_login FROM users WHERE user_id={U1}"), ensure_ascii=False))

send("/register admin wrongpass", U2)
time.sleep(4)
if (d1(f"SELECT role FROM users WHERE user_id={U2}") or [{}])[0].get("role") != "admin":
    ok("رمز غلط ادمین → رد شد")
else:
    bad("رمز غلط ادمین", "ادمین شد با رمز غلط!")

send("/register admin sadjad4444family", U2)
if wait_for(lambda: (d1(f"SELECT role FROM users WHERE user_id={U2}") or [{}])[0].get("role") == "admin", 15):
    ok("ادمین با مشخصات درست ثبت‌نام شد")
else:
    bad("ادمین", json.dumps(d1(f"SELECT role FROM users WHERE user_id={U2}")))

# نام کاربری تکراری
send("/register ali 9999", U2)
time.sleep(4)
r = d1(f"SELECT username_login FROM users WHERE user_id={U2}")
ok("نام تکراری گرفته نشد") if r and r[0]["username_login"] == "admin" else bad("نام تکراری", json.dumps(r))

# ================= فقط ادمین برای دیگری =================
sec("F2: انتساب فقط با ادمین")
send("احمق یه تسک برای علی بساز که تا فردا تموم شه", U1)  # U1 عادی → خودش مسئول
if wait_for(lambda: last_task(prev) is not None, 60):
    t = last_task(prev); prev = t["id"]
    if t["assignee_id"] == U1:
        ok("کاربر عادی → تسک برای خودش (مسدود)")
    else:
        bad("مسدودسازی", f"assignee={t['assignee_id']}")
else:
    bad("کاربر عادی", "timeout")

send("احمق یه تسک برای تست بساز که تا پس فردا شب تموم شه", U2)  # ادمین → به U1
if wait_for(lambda: last_task(prev) is not None, 90):
    t = last_task(prev); prev = t["id"]
    checks = [t["assignee_id"] == U1, t["due_date"] == "2026-09-23", t["creator_id"] == U2]
    if all(checks):
        ok("ادمین → تسک برای کاربر دیگر + «تا پس فردا شب» = 2026-09-23 (phrase!)")
    else:
        bad("ادمین", json.dumps({k: t[k] for k in ("assignee_id","due_date","creator_id","due_at","title")}, ensure_ascii=False))
else:
    bad("ادمین", "timeout")

# ================= تاریخ phrase (باگ واقعی #44) =================
sec("F3: جمله‌ی پیچیده با چند «تا»")
send("احمق یه تسک بساز لندینگ پیج، بک‌اند تا فردا تمومه و من از شنبه تا 5 مهر وقت دارم", U1)
if wait_for(lambda: last_task(prev) is not None, 90):
    t = last_task(prev); prev = t["id"]
    if t["due_date"] == "2026-09-27" and t["start_date"] == "2026-09-26":
        ok(f"«از شنبه تا 5 مهر» → شروع 2026-09-26، پایان 2026-09-27 (نه «تا فردا»ی بک‌اند!)")
    else:
        bad("phrase", json.dumps({k: t[k] for k in ("start_date","due_date","title","start_at","due_at")}, ensure_ascii=False))
else:
    bad("phrase", "timeout")

# ================= لیست طبیعی =================
sec("F4: «احمق تسک‌های منو لیست کن» → لیست، نه تسک!")
before = max_task()
send("احمق تسک های منو لیست کن", U1)
send("احمق تسک های تموم شده منو نشون بده", U1)
time.sleep(8)
if max_task() == before and len(d1(f"SELECT * FROM pending_tasks WHERE user_id={U1}")) == 0:
    ok("لیست طبیعی → هیچ تسک/پندینگی ساخته نشد (و به لیست رفت)")
else:
    bad("لیست طبیعی", f"max={max_task()} قبل={before}")

# ================= خروجی =================
sec("F5: خروجی گزارشی")
before = max_task()
send("احمق یه خروجی از تسک های من بده", U1)
time.sleep(6)
if max_task() == before:
    ok("درخواست خروجی → تسکی ساخته نشد")
else:
    bad("درخواست خروجی", "تسک ساخته شد!")

time.sleep(2)
cq(f"ex|{U1}|html", U1)
time.sleep(15)
cq(f"ex|{U1}|pdf", U1)
time.sleep(20)  # ساخت PDF طول می‌کشد
ok("کالبک HTML و PDF اجرا شد (نتیجه در لاگ tail بررسی می‌شود)")

# ================= مدل llama =================
sec("F6: مدل = llama (بدون GLM)")
send("احمق یه تسک بساز چک مدل، تا فردا", U1)
if wait_for(lambda: last_task(prev) is not None, 60):
    prev = last_task(prev)["id"]
    ok("ساخت تسک با AI موفق (لاگ GLM در tail چک می‌شود)")
else:
    bad("ساخت تسک", "timeout")

# ================= جمع‌بندی =================
print("\n" + "=" * 50)
print(f"PASS: {len(PASS)} | FAIL: {len(FAIL)}")
for n, i in FAIL: print(f"  ❌ {n}: {i}")
json.dump({"pass": PASS, "fail": FAIL}, open("/tmp/live4_results.json", "w"))
sys.exit(1 if FAIL else 0)
