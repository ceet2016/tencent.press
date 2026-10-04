// cloud-functions/api/cron/scrape.js
// Makers 定时任务入口（由 edgeone.json 的 schedules 每天触发）。
// 读取 Blob 中的 articles.json → 抓取新条目 → 合并去重 → 写回 Blob。
// 站点前端通过 /api/articles 实时读取 Blob，因此抓取结果无需重新构建即可体现在信息流中。

import { getStore } from "@edgeone/pages-blob";
import { scrape, mergeArticles, CATEGORIES } from "../../../lib/scraper.mjs";

// 与本地 CLI 一致的抓取源配置；在 Makers 控制台也可通过环境变量 SOURCES 覆盖。
// 注意：newsroom.html 已于 2026 年下线（404），news.qq.com 为 SPA 空壳（无 <a> 链接），
// 故默认改用服务端渲染、含真实新闻链接的腾讯媒体中心与投资者关系页。
const DEFAULT_SOURCES = [
  { url: "https://www.tencent.com/zh-cn/media.html", limit: 20 },
  { url: "https://www.tencent.com/zh-cn/investors.html", limit: 10 },
];

function resolveSources() {
  if (process.env.SOURCES) {
    try {
      const parsed = JSON.parse(process.env.SOURCES);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch (e) {
      console.warn("  ! 环境变量 SOURCES 解析失败，回退默认源：", e.message);
    }
  }
  return DEFAULT_SOURCES;
}

const STORE = process.env.BLOB_STORE || "tencent-press-data";

export async function onRequest() {
  try {
    const store = getStore(STORE);
    let data = await store.get("articles.json", { type: "json", consistency: "strong" });
    if (!data || !Array.isArray(data.articles)) {
      // Blob 首次为空：以内置分类 + 空文章初始化，待抓取填充
      data = { site: { name: "Tencent观象台" }, categories: CATEGORIES, articles: [] };
    }
    const fresh = await scrape(resolveSources());
    let { merged, added } = mergeArticles(data.articles, fresh);
    // 自愈：若合并后仍为空（Blob 被清空且本次抓取失败），回落内置基线，避免写入空数据导致站点空白
    if (!merged.length) {
      try {
        const mod = await import("../../../data/articles.json", { with: { type: "json" } });
        if (mod && mod.default && Array.isArray(mod.default.articles) && mod.default.articles.length) {
          merged = mod.default.articles;
          added = merged.length;
        }
      } catch {}
    }
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
