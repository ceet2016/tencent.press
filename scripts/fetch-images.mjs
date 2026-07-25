/* ===== scripts/fetch-images.mjs =====
 * 为每篇文章抓取「真实对应的图片」：从文章 sourceUrl 抽取头图/配图，
 * 下载到 assets/img/articles/<id>.<ext>，并写回 data/articles.json 的 coverImage。
 * 零依赖（使用 Node 内置 fetch），仅做静态 HTML 解析 + 启发式筛选。
 *
 * 用法：
 *   node scripts/fetch-images.mjs            # 仅填补缺失 coverImage 的文章
 *   node scripts/fetch-images.mjs --force     # 全部重新抓取
 *   node scripts/fetch-images.mjs --dry       # 仅打印将使用的图片 URL，不下载
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data", "articles.json");
const OUTDIR = path.join(ROOT, "assets", "img", "articles");

const FORCE = process.argv.includes("--force");
const DRY = process.argv.includes("--dry");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extFromType(ct, url) {
  if (ct) {
    if (/jpeg|jpg/i.test(ct)) return "jpg";
    if (/png/i.test(ct)) return "png";
    if (/webp/i.test(ct)) return "webp";
    if (/gif/i.test(ct)) return "gif";
    if (/avif/i.test(ct)) return "avif";
  }
  const m = (url.split("?")[0]).match(/\.(jpe?g|png|webp|gif|avif)(?:$|[#?])/i);
  return m ? m[1].toLowerCase() : "jpg";
}

function isIcon(u) {
  return /favicon|apple-touch|mstile|logo|icon|avatar|sprite|placeholder|blank|pixel|1x1|loading|spinner|arrow|default|feedback|zqsb|wechat-code|qrcode|static\/images|stcn\.png|sinafinance_app|\.svg/i.test(u);
}

/* 从 HTML 抽取候选图片 URL（已绝对化），并按相关度排序 */
function extractImages(html, base) {
  const cands = [];
  const push = (u) => {
    if (!u) return;
    try {
      const abs = new URL(u, base).toString();
      cands.push(abs);
    } catch {}
  };
  // 1) og:image / twitter:image（任意属性顺序）
  for (const m of html.matchAll(/<meta[^>]+(?:property|name)="(og:image|twitter:image)"[^>]+content="([^"]+)"/gi)) push(m[2]);
  for (const m of html.matchAll(/<meta[^>]+content="([^"]+)"[^>]+(?:property|name)="(og:image|twitter:image)"/gi)) push(m[1]);
  // 2) JSON-LD / 内联 image 字段
  for (const m of html.matchAll(/"image"\s*:\s*"([^"]+)"/g)) push(m[1]);
  // 3) <img src> 与 srcset
  for (const m of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)) push(m[1]);
  for (const m of html.matchAll(/<img\b[^>]*\bsrcset="([^"]+)"/gi)) {
    for (const part of m[1].split(",")) {
      const u = part.trim().split(/\s+/)[0];
      push(u);
    }
  }
  // 3b) 懒加载 data-src / data-original / data-lazy-src / data-srcset
  for (const m of html.matchAll(/\b(?:data-src|data-original|data-lazy-src|data-srcset)="([^"]+)"/gi)) {
    if (/srcset/i.test(m[0])) {
      for (const part of m[1].split(",")) push(part.trim().split(/\s+/)[0]);
    } else push(m[1]);
  }
  // 规范化 + 去重 + 去图标 + 偏好排序
  const seen = new Set();
  const out = [];
  for (const u of cands) {
    if (seen.has(u)) continue;
    seen.add(u);
    if (isIcon(u)) continue;
    out.push(u);
  }
  const score = (u) => {
    if (/og:image|twitter:image/.test(u)) return 100; // 不会命中，占位
    if (/wp-content\/uploads\/2026\//i.test(u)) return 60; // 当年文章配图
    if (/wp-content\/uploads\//i.test(u)) return 50; // 其它 WP 上传
    if (/gtimg\.com|inews\.gtimg\.com/i.test(u)) return 45; // 腾讯图片 CDN
    if (/\.(jpe?g|png|webp|gif)/i.test(u.split("?")[0])) return 30;
    return 10;
  };
  return out.sort((a, b) => score(b) - score(a));
}

/* 去掉 WordPress 缩略图尺寸后缀，取原图 */
function fullSize(u) {
  return u.replace(/-\d+x\d+(?=\.[a-z]+(\?|$))/i, "");
}

async function fetchText(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.text();
}

async function download(url, dest) {
  const r = await fetch(fullSize(url), { headers: { "User-Agent": UA, Referer: url }, redirect: "follow" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 4000) throw new Error("too small " + buf.length); // 跳过极小图标
  const ext = extFromType(r.headers.get("content-type"), url);
  const d2 = dest + "." + ext;
  fs.writeFileSync(d2, buf);
  return { file: d2, ext, size: buf.length };
}

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA, "utf-8"));
  const arts = data.articles;
  fs.mkdirSync(OUTDIR, { recursive: true });

  let done = 0, skipped = 0, failed = 0;
  for (const a of arts) {
    const hasLocal = a.coverImage && a.coverImage.startsWith("assets/img/articles/");
    if (hasLocal && !FORCE) { skipped++; continue; }
    if (!a.sourceUrl) { console.log(`• 跳过（无 sourceUrl）: ${a.id}`); skipped++; continue; }

    let picked = null;
    try {
      const html = await fetchText(a.sourceUrl);
      const imgs = extractImages(html, a.sourceUrl);
      if (imgs.length) picked = imgs[0];
    } catch (e) {
      console.log(`✗ 抓取页面失败 ${a.id}: ${e.message}`);
    }

    if (!picked) { console.log(`• 无可用图片: ${a.id}`); failed++; continue; }

    const relBase = `assets/img/articles/${a.id}`;
    const dest = path.join(OUTDIR, a.id);
    if (DRY) {
      console.log(`[dry] ${a.id} -> ${fullSize(picked)}`);
      a.coverImage = relBase + ".jpg";
      continue;
    }
    try {
      const { file, ext, size } = await download(picked, dest);
      a.coverImage = `assets/img/articles/${a.id}.${ext}`;
      console.log(`✓ ${a.id} <- ${size}B  (${a.coverImage})`);
      done++;
    } catch (e) {
      console.log(`✗ 下载失败 ${a.id}: ${e.message}  (url=${picked})`);
      failed++;
    }
    await sleep(300); // 礼貌节流
  }

  if (!DRY) {
    data.updatedAt = new Date().toISOString();
    fs.writeFileSync(DATA, JSON.stringify(data, null, 2) + "\n", "utf-8");
    console.log(`\n完成：新增/更新 ${done}，跳过 ${skipped}，失败 ${failed}。已写回 data/articles.json。`);
  } else {
    console.log(`\n[dry] 将更新 ${arts.filter(a=>!a.coverImage||FORCE).length} 篇（未写文件）。`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
