// scripts/sync-blob.mjs
// 构建前从 Blob 拉取最新数据覆盖本地 data/articles.json（供 Makers 构建使用）。
// 仅在配置了 EO_PROJECT_ID / EO_API_TOKEN 且 Blob 中存在数据时生效；否则保持本地文件不变。

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_FILE = path.join(ROOT, "data", "articles.json");
const STORE = process.env.BLOB_STORE || "tencent-press-data";

(async () => {
  if (!process.env.EO_PROJECT_ID || !process.env.EO_API_TOKEN) {
    console.log("· 未配置 Blob 环境变量，跳过同步，使用本地 data/articles.json");
    return;
  }
  try {
    const { getStore } = await import("@edgeone/pages-blob");
    const store = getStore({ name: STORE, projectId: process.env.EO_PROJECT_ID, token: process.env.EO_API_TOKEN });
    const data = await store.get("articles.json", { type: "json", consistency: "strong" });
    if (data && Array.isArray(data.articles)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
      console.log("· 已从 Blob 同步", data.articles.length, "条到本地");
    } else {
      console.log("· Blob 暂无数据，保留本地文件");
    }
  } catch (e) {
    console.warn("! Blob 同步失败，保留本地文件：", e.message);
  }
})();
