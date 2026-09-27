/**
 * حالت آفلاین — به‌جای اپ اصلی دیپلوی می‌شود تا کل سرویس (وب + بات + API) از دسترس خارج شود.
 * بازگرداندن: از ریشه‌ی پروژه `npx wrangler deploy` بزن — همین!
 */
export default {
  async fetch(): Promise<Response> {
    const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>احمق‌ایجنت — آفلاین</title>
<style>
  *{margin:0;box-sizing:border-box}
  body{min-height:100dvh;display:grid;place-items:center;background:#0e0e0d;color:#ece4d3;
       font-family:Tahoma,"Segoe UI",sans-serif;text-align:center;padding:24px;line-height:2.2}
  .box{max-width:420px}
  .b{width:72px;height:72px;margin:0 auto 20px;border-radius:20px;display:grid;place-items:center;
     font-size:30px;font-weight:700;background:linear-gradient(135deg,#818cf8,#a78bfa);color:#14101f}
  h1{font-size:20px;margin-bottom:8px}
  p{font-size:13.5px;color:#a59d8a}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#fbbf24;
       margin-inline-end:6px;animation:p 1.6s infinite}
  @keyframes p{50%{opacity:.3}}
</style></head><body><div class="box">
<div class="b">ا</div>
<h1>احمق‌ایجنت موقتاً آفلاین است</h1>
<p><span class="dot"></span>سرور به‌صورت دستی خاموش شده است و بعداً برمی‌گردد.<br>
داده‌ها و تسک‌ها سالم اند و جایی نرفته‌اند.<br>
در تلگرام هم تا برگشتن جواب نمی‌گیرید — صبور باشید.</p>
</div></body></html>`;
    return new Response(html, {
      status: 503,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  },
  async scheduled(): Promise<void> {
    // کرون زنده است ولی عمداً هیچ کاری نمی‌کند — یادآوری/گزارش ارسال نمی‌شود
  },
};
