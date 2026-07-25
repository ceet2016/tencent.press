// scripts/seed-blob.mjs
// 一次性将本地 data/articles.json 推送到 Blob，作为首个数据源（部署后执行一次即可）。
// 用法：EO_PROJECT_ID=xxx EO_API_TOKEN=yyy node scripts/seed-blob.mjs

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_FILE = path.join(ROOT, "data", "articles.json");
const STORE = process.env.BLOB_STORE || "tencent-press-data";

(async () => {
  if (!process.env.EO_PROJECT_ID || !process.env.EO_API_TOKEN) {
    console.error("✗ 缺少环境变量 EO_PROJECT_ID / EO_API_TOKEN");
    process.exit(1);
  }
  const { getStore } = await import("@edgeone/pages-blob");
  const store = getStore({ name: STORE, projectId: process.env.EO_PROJECT_ID, token: process.env.EO_API_TOKEN });
  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  await store.setJSON("articles.json", { ...data, updatedAt: new Date().toISOString() });
  console.log("✅ 已写入 Blob (" + STORE + ")，当前共", data.articles.length, "条");
})();
