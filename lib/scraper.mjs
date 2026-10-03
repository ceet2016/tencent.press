// lib/scraper.mjs
// 纯抓取与合并逻辑（不依赖 blob / 文件系统），供本地 CLI 与 Makers Cloud Function 共用。
// 内置分类关键词表与稳健的 HTML/RSS 抽取，网络异常时静默跳过，保证构建永不中断。

export const CATEGORIES = [
  { key: "news", label: "新闻", desc: "腾讯及生态相关的重要新闻与官方动态" },
  { key: "products", label: "产品", desc: "微信、游戏、支付、云与小程序等核心及新产品进展" },
  { key: "finance", label: "财报", desc: "季度与年度财报、业绩电话会及经营数据解读" },
  { key: "tech", label: "技术动态", desc: "前沿技术、开源、AI 大模型与基础设施进展" },
  { key: "people", label: "人事", desc: "组织架构调整、人才战略与招聘动态" },
  { key: "industry", label: "行业", desc: "互联网行业格局、可持续与社会价值、竞争态势" },
];

const CAT_KEYWORDS = {
  finance: ["财报", "业绩", "营收", "净利润", "一季度", "二季度", "三季度", "四季度", "季度", "年度", "分红", "股价", "市值", "投资", "资本开支", "non-ifrs", "毛利", "现金流"],
  tech: ["混元", "大模型", "ai", "人工智能", "开源", "技术", "算力", "云", "基础设施", "智能体", "模型", "agent", "算法"],
  products: ["微信", "游戏", "小程序", "支付", "产品", "元宝", "应用", "版本", "发布", "qq", "王者", "和平精英", "公众号"],
  people: ["招聘", "人才", "组织", "任命", "高管", "实习", "青云", "校招", "人才计划", "离职", "加盟"],
  industry: ["行业", "可持续", "碳中和", "社会价值", "竞争", "监管", "政策", "生态", "出海", "反垄断"],
};

export function classify(title = "") {
  const t = String(title).toLowerCase();
  let best = "news", bestScore = 0;
  for (const [cat, kws] of Object.entries(CAT_KEYWORDS)) {
    let score = 0;
    for (const kw of kws) if (t.includes(kw.toLowerCase())) score++;
    if (score > bestScore) { bestScore = score; best = cat; }
  }
  return best;
}

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function normalizeId(item) {
  if (item.url) {
    try {
      const u = new URL(item.url);
      const last = (u.pathname.split("/").filter(Boolean).pop() || u.hostname).replace(/\.(html?|php|aspx?)$/i, "");
      const s = slugify(last) || slugify(item.title || "");
      if (s) return "auto-" + s;
    } catch {}
  }
  return "auto-" + (slugify(item.title || "") || Math.random().toString(36).slice(2, 10));
}

function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&[a-z]+;/gi, " ");
}
function stripHtml(s) {
  return decodeEntities(String(s).replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function resolveUrl(href, base) {
  try { return new URL(href, base).href; } catch { return href; }
}

function resolveDate(raw) {
  if (!raw) return "";
  const m = String(raw).match(/(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/);
  if (m) {
    const y = m[1], mo = String(m[2]).padStart(2, "0"), d = String(m[3]).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  const t = Date.parse(raw);
  if (!isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return "";
}

// 从 HTML 抽取候选条目：优先 RSS/Atom，回退到通用 <a> 抽取
function extractFromHtml(html, baseUrl) {
  const items = [];
  if (/<rss|<feed|<item|<entry/i.test(html)) {
    const blocks = html.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) || [];
    for (const b of blocks) {
      const title = stripHtml((b.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || "");
      let url = (b.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || "";
      if (!url) url = (b.match(/<link[^>]*href="([^"]*)"/i) || [])[1] || "";
      const dateRaw = (b.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || b.match(/<updated>([\s\S]*?)<\/updated>/i) || [])[1] || "";
      const desc = stripHtml((b.match(/<description>([\s\S]*?)<\/description>/i) || b.match(/<summary>([\s\S]*?)<\/summary>/i) || [])[1] || "");
      if (title && url) items.push({ title, url: resolveUrl(url, baseUrl), date: resolveDate(dateRaw), snippet: desc.slice(0, 160) });
    }
    if (items.length) return items;
  }
  const re = /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    const text = stripHtml(m[2]);
    if (text.length < 8) continue;
    const after = html.slice(m.index, m.index + 400);
    items.push({ title: text, url: resolveUrl(href, baseUrl), date: resolveDate(after), snippet: "" });
  }
  return items;
}

// 过滤导航栏 / 页脚等噪声链接，避免被当成新闻条目
const NAV_NOISE = /^(我们的产品和服务|主要链接|投资者工具包|联系我们|关于腾讯|隐私|条款|网站地图|Cookie|English|粤网文|粤B2|粤公网安备|备案|Skip)/;

function isTencentRelated(item) {
  try {
    const host = new URL(item.url).hostname;
    if (/tencent|qq\.com|weixin/i.test(host)) return true;
  } catch {}
  return /腾讯|微信|qq|元宝|混元|腾讯云|腾讯游戏/i.test(item.title || "");
}

// 抓取文章页的真实封面图（og:image / twitter:image）；失败回退空（由上层回退分类封面）。
// 实际抓取逻辑统一在 fetchArticleEnrich 中完成（一次请求同时取封面/正文/标签），
// 此处仅作为兼容入口委派给它，避免重复网络请求。
async function fetchOgImage(url) {
  return (await fetchArticleEnrich(url)).coverImage;
}

export async function fetchSource(source, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout || 8000);
  try {
    const res = await fetch(source.url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TencentGuanxiangtai/1.0; +https://tencent.press)",
        "Accept": "text/html,application/xml,application/rss+xml",
      },
    });
    if (!res.ok) return [];
    const html = await res.text();
    let items = extractFromHtml(html, source.url).filter(isTencentRelated).filter((it) => !NAV_NOISE.test(it.title));
    if (source.category) items = items.map((it) => ({ ...it, forcedCat: source.category }));
    return items.slice(0, source.limit || 20);
  } catch (e) {
    console.warn(`  ! 抓取失败 ${source.url}: ${e.message}`);
    return [];
  } finally { clearTimeout(timer); }
}

function sourceFromUrl(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (h.indexOf("tencent") > -1) return "腾讯官网";
    if (h.indexOf("qq.com") > -1) return "腾讯新闻";
    if (h.indexOf("weixin") > -1) return "微信";
  } catch {}
  return "自动聚合";
}

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 从 HTML 抽取正文块：<p>/<h2>/<h3> 纯文本封装为安全 HTML；正文过短则回退空
function extractContent(html) {
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  function extractBlocks(src) {
    const blocks = [];
    const re = /<(p|h2|h3)[^>]*>([\s\S]*?)<\/\1>/gi;
    let m;
    while ((m = re.exec(src))) {
      const txt = stripHtml(m[2]).trim();
      if (!txt) continue;
      const tag = m[1].toLowerCase();
      if (tag === "p" && txt.length < 25) continue; // 跳过过短的导航/说明
      if (tag !== "p" && txt.length < 4) continue;
      blocks.push(tag === "p" ? "<p>" + escHtml(txt) + "</p>" : "<" + tag + ">" + escHtml(txt) + "</" + tag + ">");
      if (blocks.length >= 40) break;
    }
    return blocks;
  }
  let main = "";
  const art = clean.match(/<(article|main)[^>]*>([\s\S]*?)<\/\1>/i);
  if (art) main = art[2];
  else {
    const c = clean.match(/<[^>]*(?:class|id)=["'][^"']*(?:article-content|article-body|article__content|rich_media_content|content-area|post-content|article_detail)["'][^>]*>([\s\S]*?)<\/div>/i);
    if (c) main = c[1];
  }
  let blocks = extractBlocks(main || clean);
  if (blocks.length < 3) blocks = extractBlocks(clean);
  const out = blocks.join("");
  return out.length >= 80 ? out : "";
}

// 从 HTML 抽取文章标签：优先 rel="topic" 主题链接，其次 meta keywords，
// 再回退标题中命中的中文分类关键词；结果为去重后的标签数组（最多 5 个）
function extractTags(html, title = "") {
  const set = new Set();
  // 1) Tencent 文章页的 rel="topic" 主题链接（如 <a rel="topic">科技向善</a>）
  const topicRe = /<a\b[^>]*\brel=["']topic["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = topicRe.exec(html))) {
    const s = stripHtml(m[1]).trim();
    if (s && s.length <= 20) set.add(s);
  }
  // 2) meta keywords（部分来源页存在）
  const kw = (html.match(/<meta\s+name=["']keywords["'][^>]*content=["']([^"']+)["']/i) || [])[1];
  if (kw) kw.split(/[,，;；]/).forEach((t) => { const s = t.trim(); if (s) set.add(s); });
  // 3) 回退：标题中命中的中文分类关键词
  if (set.size === 0 && title) {
    const tl = String(title).toLowerCase();
    for (const kws of Object.values(CAT_KEYWORDS)) {
      for (const k of kws) {
        if (/[一-龥]/.test(k) && tl.includes(k.toLowerCase())) set.add(k);
        if (set.size >= 3) break;
      }
      if (set.size >= 3) break;
    }
  }
  const out = [];
  for (const t of set) {
    const s = String(t).replace(/^#+/, "").trim();
    if (s && s.length <= 20 && !/[\n<>]/.test(s)) out.push(s);
    if (out.length >= 5) break;
  }
  return out;
}

// 一次请求同时抓取封面图（og:image）、正文（content）与标签（tags）；
// PDF/图片或非 HTML 直接返回空，避免无谓解析。
async function fetchArticleEnrich(url, title = "") {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TencentGuanxiangtai/1.0; +https://tencent.press)" },
    });
    clearTimeout(t);
    if (!res.ok) return { coverImage: "", content: "", tags: [] };
    const ct = res.headers.get("content-type") || "";
    if (!/text\/html/i.test(ct)) return { coverImage: "", content: "", tags: [] }; // PDF / 图片等
    const html = await res.text();
    const coverImage =
      (html.match(/<meta\s+property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || [])[1] ||
      (html.match(/<meta\s+name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) || [])[1] || "";
    return { coverImage, content: extractContent(html), tags: extractTags(html, title) };
  } catch {
    return { coverImage: "", content: "", tags: [] };
  }
}

// 抓取文章正文（导出，供本地校验脚本复用）；内部委派给 fetchArticleEnrich
export async function fetchArticleContent(url) {
  return (await fetchArticleEnrich(url)).content;
}

export async function scrape(SOURCES) {
  const fresh = [];
  for (const s of SOURCES) {
    const items = await fetchSource(s);
    for (const it of items) {
      fresh.push({
        title: it.title,
        url: it.url,
        date: it.date || new Date().toISOString().slice(0, 10),
        category: it.forcedCat || classify(it.title),
        snippet: it.snippet || "",
        source: it.source || sourceFromUrl(it.url),
        coverImage: "",
      });
    }
  }
  // 并行抓取每篇文章的封面图、正文与标签（一次请求完成），失败回退空/占位
  await Promise.all(fresh.map(async (f) => {
    const e = await fetchArticleEnrich(f.url, f.title);
    f.coverImage = e.coverImage;
    f.content = e.content;
    f.tags = e.tags;
  }));
  return fresh;
}

function pickCover(cat) {
  return { news: "#4f7cff", products: "#a855f7", finance: "#11A97E", tech: "#22d3ee", people: "#f472b6", industry: "#0EA5B7" }[cat] || "#4f7cff";
}

export function mergeArticles(existing, fresh) {
  const seen = new Set();
  (existing || []).forEach((a) => {
    if (a.id) seen.add(a.id);
    if (a.sourceUrl) seen.add("u:" + a.sourceUrl);
    if (a.title) seen.add("t:" + a.title.trim());
  });
  const added = [];
  for (const f of fresh) {
    const id = normalizeId(f);
    if (seen.has(id) || seen.has("u:" + f.url) || seen.has("t:" + f.title.trim())) continue;
    seen.add(id); seen.add("u:" + f.url); seen.add("t:" + f.title.trim());
    added.push({
      id,
      title: f.title,
      category: f.category || classify(f.title),
      date: f.date,
      source: f.source || "自动聚合",
      author: "观象台聚合",
      tags: f.tags && f.tags.length ? f.tags.slice(0, 5) : [],
      summary: f.snippet || f.title,
      cover: pickCover(f.category),
      coverImage: f.coverImage || "",
      sourceUrl: f.url,
      content: f.content || "<p>本条目由定时抓取自动聚合自公开来源，原文链接见「阅读原文」，摘要以官方及媒体原文为准。</p>",
    });
  }
  return { merged: (existing || []).concat(added), added: added.length };
}
