// ahmagh.pages.dev — پوسته‌ی کوتاه وب‌اپ
// استاتیک از خود Pages سرو می‌شود؛ API به ورکر اصلی (همان مغز بات) پروکسی می‌شود.
const UPSTREAM = "https://ahmagh-agent.nova-0e7442.workers.dev";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API وب‌اپ → ورکر اصلی
    if (url.pathname.startsWith("/api/")) {
      const headers = new Headers(request.headers);
      headers.delete("host");
      const upstream = await fetch(UPSTREAM + url.pathname + url.search, {
        method: request.method,
        headers,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
        redirect: "manual",
      });
      const res = new Response(upstream.body, upstream);
      return res;
    }

    // بقیه → فایل‌های استاتیک
    return env.ASSETS.fetch(request);
  },
};
