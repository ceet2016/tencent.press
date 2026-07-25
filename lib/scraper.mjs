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

function stripHtml(s) {
  return String(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
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

function isTencentRelated(item) {
  try {
    const host = new URL(item.url).hostname;
    if (/tencent|qq\.com|weixin/i.test(host)) return true;
  } catch {}
  return /腾讯|微信|qq|元宝|混元|腾讯云|腾讯游戏/i.test(item.title || "");
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
    let items = extractFromHtml(html, source.url).filter(isTencentRelated);
    if (source.category) items = items.map((it) => ({ ...it, forcedCat: source.category }));
    return items.slice(0, source.limit || 20);
  } catch (e) {
    console.warn(`  ! 抓取失败 ${source.url}: ${e.message}`);
    return [];
  } finally { clearTimeout(timer); }
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
        source: it.source || (() => { try { return new URL(it.url).hostname; } catch { return "自动聚合"; } })(),
      });
    }
  }
  return fresh;
}

function pickCover(cat) {
  return { news: "#006EFF", products: "#7B61FF", finance: "#11A97E", tech: "#FF7A1A", people: "#E5484D", industry: "#0EA5B7" }[cat] || "#006EFF";
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
      tags: [],
      summary: f.snippet || f.title,
      cover: pickCover(f.category),
      coverImage: "",
      sourceUrl: f.url,
      content: "<p>本条目由定时抓取自动聚合自公开来源，原文链接见「阅读原文」，摘要以官方及媒体原文为准。</p>",
    });
  }
  return { merged: (existing || []).concat(added), added: added.length };
}
