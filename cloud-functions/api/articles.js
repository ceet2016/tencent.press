// cloud-functions/api/articles.js
// 站点前端实时数据源：从 Blob 读取最新 articles.json 并返回。
// 前端 main.js 启动时拉取本接口，使定时抓取结果无需重新构建即可体现在信息流中。

import { getStore } from "@edgeone/pages-blob";

const STORE = process.env.BLOB_STORE || "tencent-press-data";

export async function onRequest() {
  try {
    const store = getStore(STORE);
    const data = await store.get("articles.json", { type: "json", consistency: "strong" });
    if (!data) {
      return new Response(JSON.stringify({ site: {}, categories: [], articles: [] }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
