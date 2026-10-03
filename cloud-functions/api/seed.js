// cloud-functions/api/seed.js
// 浏览器可访问的 Blob 自初始化接口——你只需访问 https://www.tencent.press/api/seed
// 即可将 data/articles.json 推送到 Blob，无需本地 CLI / API Token。
// 用法：GET /api/seed       首次写入
//       GET /api/seed?dry=1   仅预览（不写入）
//       GET /api/seed?force=1 强制覆盖已有 Blob 数据

import { getStore } from "@edgeone/pages-blob";

async function loadSeed() {
  // 1) ESM 动态 import（Node 22+ 支持 JSON import attributes）
  try {
    const mod = await import("../../data/articles.json", { with: { type: "json" } });
    if (mod && mod.default) return mod.default;
  } catch {}

  // 2) fs.readFileSync 回退（兼容不同 cwd 的运行环境）
  try {
    const fs = await import("fs");
    const candidates = [
      "../../data/articles.json", // cwd 在函数目录
      "../data/articles.json",    // cwd 在 cloud-functions/
      "data/articles.json",       // cwd 在项目根
    ];
    for (const p of candidates) {
      try {
        return JSON.parse(fs.readFileSync(p, "utf8"));
      } catch {}
    }
  } catch {}

  return null;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const dry = url.searchParams.get("dry") === "1";

  try {
    const data = await loadSeed();
    if (!data) {
      return json(
        {
          ok: false,
          error:
            "无法加载 data/articles.json（既未命中 ESM import 也未命中 fs 路径）。请确认 edgeone.json 中 includeFiles 包含 data/，并重新部署。",
        },
        500
      );
    }

    const store = getStore(process.env.BLOB_STORE || "tencent-press-data");
    const existing = await store.get("articles.json", { type: "json", consistency: "strong" });

    if (
      existing &&
      Array.isArray(existing.articles) &&
      existing.articles.length > 0 &&
      !force
    ) {
      return json({
        ok: true,
        seeded: false,
        existing: existing.articles.length,
        message: "Blob 已有数据；如需重新写入请加 ?force=1",
      });
    }

    if (dry) {
      return json({
        ok: true,
        dry: true,
        total: data.articles.length,
        categories: (data.categories || []).length,
        message: "DRY 模式：未写入 Blob",
      });
    }

    const out = { ...data, updatedAt: new Date().toISOString() };
    await store.setJSON("articles.json", out);

    return json({
      ok: true,
      seeded: true,
      total: data.articles.length,
      categories: (data.categories || []).length,
      updatedAt: out.updatedAt,
      message: "已写入 Blob。访问 /api/articles 验证数据；明早 08:00 后定时任务会自动更新。",
    });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
