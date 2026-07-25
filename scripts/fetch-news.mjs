// scripts/fetch-news.mjs
// 本地 / CI 抓取 CLI：读取现有数据（优先 Blob，回退本地文件）→ 抓取 → 合并 → 写回 Blob + 本地文件。
// 用法：node scripts/fetch-news.mjs
// 环境变量（外网访问 Blob 时需要）：EO_PROJECT_ID、EO_API_TOKEN、BLOB_STORE（默认 tencent-press-data）

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { scrape, mergeArticles } from "../lib/scraper.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_FILE = path.join(ROOT, "data", "articles.json");
const STORE = process.env.BLOB_STORE || "tencent-press-data";

// 默认抓取源：请按需替换为真实可访问的列表页 / RSS 订阅源。
const SOURCES = [
  { url: "https://www.tencent.com/zh-cn/newsroom.html", limit: 15 },
  { url: "https://news.qq.com/", limit: 15 },
];

async function getBlobStore() {
  if (!process.env.EO_PROJECT_ID || !process.env.EO_API_TOKEN) return null;
  try {
    const { getStore } = await import("@edgeone/pages-blob");
    return getStore({ name: STORE, projectId: process.env.EO_PROJECT_ID, token: process.env.EO_API_TOKEN });
  } catch (e) {
    console.warn("  ! 无法加载 @edgeone/pages-blob：", e.message);
    return null;
  }
}

async function loadExisting(store) {
  if (store) {
    try {
      const data = await store.get("articles.json", { type: "json", consistency: "strong" });
      if (data && Array.isArray(data.articles)) { console.log("  · 已从 Blob 读取现有数据"); return data; }
    } catch (e) { console.warn("  ! Blob 读取失败，回退本地文件：", e.message); }
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

async function save(data, store) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  console.log("  · 已写入本地 data/articles.json");
  if (store) {
    try { await store.setJSON("articles.json", data); console.log("  · 已写入 Blob (" + STORE + ")"); }
    catch (e) { console.warn("  ! Blob 写入失败：", e.message); }
  }
}

(async () => {
  console.log("▶ 开始定时抓取（本地模式）");
  const store = await getBlobStore();
  const existing = await loadExisting(store);
  const fresh = await scrape(SOURCES);
  console.log(`  · 抓取到 ${fresh.length} 条候选`);
  const { merged, added } = mergeArticles(existing.articles, fresh);
  const data = { ...existing, articles: merged, updatedAt: new Date().toISOString() };
  await save(data, store);
  console.log(`✅ 完成，新增 ${added} 条，总计 ${merged.length} 条`);
})();
