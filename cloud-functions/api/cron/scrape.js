// cloud-functions/api/cron/scrape.js
// Makers 定时任务入口（由 edgeone.json 的 schedules 每天触发）。
// 读取 Blob 中的 articles.json → 抓取新条目 → 合并去重 → 写回 Blob。
// 站点前端通过 /api/articles 实时读取 Blob，因此抓取结果无需重新构建即可体现在信息流中。

import { getStore } from "@edgeone/pages-blob";
import { scrape, mergeArticles, CATEGORIES } from "../../../lib/scraper.mjs";

// 与本地 CLI 一致的抓取源配置；在 Makers 控制台也可通过环境变量 SOURCES 覆盖。
const SOURCES = [
  { url: "https://www.tencent.com/zh-cn/newsroom.html", limit: 15 },
  { url: "https://news.qq.com/", limit: 15 },
];

const STORE = process.env.BLOB_STORE || "tencent-press-data";

export async function onRequest() {
  try {
    const store = getStore(STORE);
    let data = await store.get("articles.json", { type: "json", consistency: "strong" });
    if (!data || !Array.isArray(data.articles)) {
      // Blob 首次为空：以内置分类 + 空文章初始化，待抓取填充
      data = { site: { name: "Tencent观象台" }, categories: CATEGORIES, articles: [] };
    }
    const fresh = await scrape(SOURCES);
    const { merged, added } = mergeArticles(data.articles, fresh);
    const out = { ...data, articles: merged, updatedAt: new Date().toISOString() };
    await store.setJSON("articles.json", out);

    return new Response(
      JSON.stringify({ ok: true, added, total: merged.length, updatedAt: out.updatedAt }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
