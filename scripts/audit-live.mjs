/* 线上内链存活审计：从首页与各分类页出发抓取站内链接，逐个请求校验状态码。
   用法：node scripts/audit-live.mjs [baseUrl] */
const BASE = (process.argv[2] || "https://tencent.press").replace(/\/+$/, "");

const seeds = [
  "/",
  "/category/news.html",
  "/category/products.html",
  "/category/finance.html",
  "/category/tech.html",
  "/category/people.html",
  "/category/industry.html",
  "/article.html",
];

const found = new Set();
const results = [];

function absUrl(fromPage, href) {
  try {
    return new URL(href, BASE + fromPage).href;
  } catch {
    return null;
  }
}

async function getText(url) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 link-audit" } });
  return { status: r.status, text: r.ok ? await r.text() : "" };
}

// 1) 收集链接（去掉 script/style 避免把 JS 字符串片段当链接）
for (const page of seeds) {
  const { status, text } = await getText(BASE + page);
  if (status !== 200) {
    results.push({ url: BASE + page, status, from: "(seed)" });
    continue;
  }
  const clean = text
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");
  const re = /(?:href|src)\s*=\s*"([^"]+)"/gi;
  let m;
  while ((m = re.exec(clean))) {
    const v = m[1].trim();
    if (!v || v.startsWith("#") || v.startsWith("data:") || v.startsWith("mailto:")) continue;
    if (/^(https?:)?\/\//i.test(v)) {
      // 只保留同站外链
      if (v.startsWith(BASE) || v.startsWith("/")) found.add(absUrl(page, v));
      continue;
    }
    const u = absUrl(page, v);
    if (u && u.startsWith(BASE)) found.add(u.split("?")[0].split("#")[0]);
  }
}

// 2) 逐个校验
const urls = [...found].sort();
console.log(`待校验站内链接：${urls.length} 个`);
let bad = 0;
for (const u of urls) {
  let status = 0;
  try {
    const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 link-audit" }, method: "GET" });
    status = r.status;
    r.body?.cancel?.();
  } catch (e) {
    status = -1;
  }
  if (status !== 200) {
    bad++;
    results.push({ url: u, status });
  }
}

if (bad === 0) {
  console.log(`✅ 全部 ${urls.length} 个站内链接均返回 200`);
} else {
  console.log(`❌ ${bad} 个异常链接：`);
  results.forEach((r) => console.log(`  ${r.status}  ${r.url}`));
}
