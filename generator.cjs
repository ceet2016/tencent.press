/* ===== Tencent观象台 · 静态站点生成器（重构版） =====
 * 用法：node generator.js
 * 依赖：data/articles.json
 * 输出：dist/（可直接部署到 tencent.press）
 */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DATA = path.join(ROOT, "data", "articles.json");
const ASSETS = path.join(ROOT, "assets");
const OUT = path.join(ROOT, "dist");

const raw = JSON.parse(fs.readFileSync(DATA, "utf8"));
const SITE = raw.site;
const CATEGORIES = raw.categories;
const ARTICLES = raw.articles;

const safeJSON = (obj) => JSON.stringify(obj).replace(/</g, "\\u003c");
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* ---------- 通用片段 ---------- */
function navLinks(activeKey, pagePrefix) {
  let items = `<a href="${pagePrefix}index.html" class="${activeKey === "home" ? "active" : ""}">首页</a>`;
  CATEGORIES.forEach((c) => {
    items += `<a href="${pagePrefix}category/${c.key}.html" class="${activeKey === c.key ? "active" : ""}">${c.label}</a>`;
  });
  return items;
}

function header(activeKey, assetPrefix, pagePrefix) {
  return `<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="${pagePrefix}index.html">
      <img class="brand-mark" src="${assetPrefix}assets/img/logo.svg" alt="Tencent观象台">
      <span class="name">Tencent<b>观象台</b></span>
    </a>
    <button class="search-toggle" type="button" aria-label="搜索">🔍</button>
    <button class="nav-toggle" aria-label="菜单">☰</button>
    <nav class="nav">${navLinks(activeKey, pagePrefix)}</nav>
    <form class="hsearch" onsubmit="return false">
      <input id="search-input" type="search" placeholder="搜索资讯关键词…" aria-label="搜索">
      <button type="button">搜索</button>
    </form>
  </div>
</header>`;
}

function footer(pagePrefix) {
  const catLinks = CATEGORIES.map(
    (c) => `<a href="${pagePrefix}category/${c.key}.html">${c.label}</a>`
  ).join("");
  return `<footer class="site-footer">
  <div class="container">
    <div class="footer-top">
      <div class="footer-brand">
        <div class="logo"><img class="brand-mark" src="${pagePrefix}assets/img/logo.svg" alt="Tencent观象台"> Tencent观象台</div>
        <p>腾讯相关资讯与动态的聚合观察平台，聚焦新闻、产品、财报、技术动态等多维视角。内容聚合自公开来源并链接原文。</p>
      </div>
      <div class="footer-col">
        <h4>分类导航</h4>${catLinks}
      </div>
      <div class="footer-col">
        <h4>站点</h4>
        <a href="${pagePrefix}index.html">首页</a>
        <a href="${pagePrefix}sitemap.xml">站点地图</a>
        <a href="${pagePrefix}index.html#search">搜索</a>
      </div>
      <div class="footer-col">
        <h4>友情链接</h4>
        <a href="https://www.tencent.com" target="_blank" rel="noopener">腾讯官网</a>
        <a href="https://news.qq.com" target="_blank" rel="noopener">腾讯新闻</a>
        <a href="https://cloud.tencent.com" target="_blank" rel="noopener">腾讯云</a>
        <a href="https://weixin.qq.com" target="_blank" rel="noopener">微信</a>
        <a href="https://uniomo.com" target="_blank" rel="noopener">雨落秋垣</a>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© ${new Date().getFullYear()} Tencent观象台 · 域名 tencent.press</span>
      <span>内容聚合自腾讯官方新闻室及公开媒体报道，版权归原作者所有；本站为信息聚合演示项目，与腾讯公司无隶属关系。</span>
    </div>
  </div>
</footer>`;
}

function dataScript() {
  // 关键修正：站点所有可见资讯（信息流 / 头条 / 热榜 / 相关）一律以 Blob 中的
  // 定时抓取结果为准，构建期基线（data/articles.json 的示例稿）不再注入前端。
  // 否则即便删除 Blob，前端仍会回显"其他/旧"数据并产生闪现。这里只注入分类结构，
  // 文章数组留空，待 /api/articles 就绪后由 main.js 填充（单一数据源，杜绝基线泄漏）。
  return `<script>window.__ARTICLES__=[];window.__CATEGORIES__=${safeJSON(
    CATEGORIES
  )};</script>`;
}

function metaTags(opts) {
  const title = esc(opts.title);
  const desc = esc(opts.desc);
  const url = opts.url;
  const ogType = opts.ogType || "website";
  const ogImg = opts.image ? `${SITE.baseUrl}/${opts.image}` : "";
  return `<title>${title}</title>
<meta name="description" content="${desc}">
<meta name="keywords" content="${esc(SITE.keywords)}">
<meta name="author" content="Tencent观象台">
<link rel="canonical" href="${url}">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${url}">
${ogImg ? `<meta property="og:image" content="${ogImg}">\n<meta property="og:image:width" content="1536">\n<meta property="og:image:height" content="1024">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
${ogImg ? `<meta name="twitter:image" content="${ogImg}">` : ""}
<meta name="theme-color" content="#4f7cff">`;
}

function shell(opts) {
  return `<!DOCTYPE html>
<html lang="${SITE.lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>
/* 域名守卫（反镜像/反代/反内嵌）：仅对实时反代与保留脚本的克隆有效；
   对"整站离线克隆并自存、且剥除脚本"的镜像，前端无法根治，需走源站防抓+下架。 */
(function () {
  try {
    var d = ["tencent", "press"].join(".");            // 轻度拆分，防一行正则剥除
    var h = (location.hostname || "").toLowerCase();
    var ok = h === d || h === "www." + d ||
      h === "localhost" || h === "127.0.0.1" || h === "[::1]" ||
      /\.edgeone\.app$/.test(h) || /\.magents\.site$/.test(h);
    if (ok) return;
    var dest = "https://" + d + (location.pathname || "/") + (location.search || "") + (location.hash || "");
    // 1) 首选：直接把地址栏带回官方域名（对实时反代/访客输错域名有效）
    try { window.top.location.replace(dest); } catch (e) { location.replace(dest); }
    // 2) 降级：若跳转被 CSP/sandbox 拦截，则把镜像页篡改为"官方跳转提示"（反制保留脚本的懒惰克隆）
    setTimeout(function () {
      try {
        document.documentElement.innerHTML =
          '<head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=' + dest + '">' +
          '<title>正在跳转到官方网站…</title></head>' +
          '<body style="font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:64px 20px;color:#333">' +
          '<h2 style="color:#E55200">本页面为未经授权的镜像</h2>' +
          '<p>官方网站唯一地址：</p>' +
          '<p style="font-size:18px"><a style="color:#4f7cff" href="' + dest + '">' + dest + '</a></p>' +
          '</body>';
      } catch (e) {}
    }, 1000);
  } catch (e) {}
})();
</script>
${metaTags(opts)}
<link rel="icon" type="image/svg+xml" href="${opts.assetPrefix}assets/img/logo.svg">
<link rel="apple-touch-icon" href="${opts.assetPrefix}assets/img/logo.svg">
<link rel="stylesheet" href="${opts.assetPrefix}assets/css/style.css">
</head>
<body>
${header(opts.activeKey, opts.assetPrefix, opts.pagePrefix)}
${opts.body}
${footer(opts.pagePrefix)}
${dataScript()}
${opts.extraScript || ""}
<script src="${opts.assetPrefix}assets/js/main.js"></script>
</body>
</html>`;
}

/* ---------- 工具 ---------- */
function coverIcon(cat) {
  const map = { news: "📰", products: "📦", finance: "📊", tech: "🛠️", people: "👥", industry: "🌐" };
  return map[cat] || "📌";
}
function catLabel(key) {
  const c = CATEGORIES.find((x) => x.key === key);
  return c ? c.label : key;
}
function catCover(key) {
  const c = CATEGORIES.find((x) => x.key === key);
  return c && c.coverImage ? c.coverImage : null;
}
function fmtDate(d) { return d ? d.replace(/-/g, "/") : ""; }
function sourceLabel(s) {
  if (!s) return "腾讯";
  var host = String(s).toLowerCase();
  if (host.indexOf("tencent") > -1) return "腾讯官网";
  if (host.indexOf("qq.com") > -1) return "腾讯新闻";
  if (host.indexOf("weixin") > -1) return "微信";
  if (/[一-龥]/.test(s)) return s;
  return s.replace(/^www\./i, "");
}

/* 封面：优先文章独立图，其次分类图；图片加载失败时回退到蓝紫渐变 */
function coverImg(a, pagePrefix) {
  const img = a.coverImage || catCover(a.category);
  const imgSrc = img && /^https?:\/\//i.test(img) ? img : (pagePrefix + img);
  const grad = `background:linear-gradient(135deg,#22d3ee,#4f7cff 55%,#a855f7)`;
  const inner = img
    ? `<img class="cover-img" src="${imgSrc}" alt="${esc(a.title)}" loading="lazy">` +
      `<span class="cat-badge">${catLabel(a.category)}</span><span class="cover-icon">${coverIcon(a.category)}</span>`
    : `<span class="cat-badge">${catLabel(a.category)}</span><span class="cover-icon">${coverIcon(a.category)}</span>`;
  return `<div class="cover" style="${grad}">${inner}</div>`;
}

function cardHTML(a, pagePrefix) {
  return `<a class="card" href="${pagePrefix}article/${a.id}.html">
    ${coverImg(a, pagePrefix)}
    <div class="body">
      <h3>${a.title}</h3>
      <p>${a.summary}</p>
      <div class="meta"><span>${fmtDate(a.date)}</span>
        <span class="dot"></span><span>${sourceLabel(a.source)}</span>
        ${a.tags && a.tags[0] ? `<span class="dot"></span><span class="tag">#${a.tags[0]}</span>` : ""}
      </div>
    </div></a>`;
}

// 静态页首屏占位：与 assets/js/main.js 的骨架完全一致，使首屏即显示「加载中」，
// 避免构建期基线卡片先被浏览器绘制、再被 /api/articles 实时数据替换而产生的闪现/刷新。
function feedSkeleton() {
  return `<div class="empty" style="grid-column:1/-1"><div class="big">⏳</div>正在加载最新资讯…</div>`;
}

// 首屏头条占位：与 assets/js/main.js 的骨架一致，避免构建期基线头条先绘制再被
// /api/articles 实时数据替换而产生闪现；真实头条在接口就绪后由 renderHero() 重绘。
function heroSkeleton() {
  // 用 <a class="lead lead-skeleton"> 占位（而非 <div> + 内联样式）：
  // renderHero() 复用同一元素并移除 lead-skeleton 类，既保证头条可点击，
  // 又避免骨架内联样式残留（display:flex 等会破坏 .lead 的 block 布局，导致封面塌缩成窄条）。
  return `<section class="hero">
  <div class="container hero-grid">
    <a class="lead lead-skeleton" href="index.html">⏳ 正在加载最新头条…</a>
    <aside class="side">
      <div class="side-head">今日要闻</div>
      <ul class="side-list"><li style="color:#9aa3b2;padding:14px 0">⏳ 正在加载…</li></ul>
    </aside>
  </div></section>`;
}

// 热榜占位：真实榜单在 /api/articles 就绪后由 main.js renderHot() 填充（仅含抓取数据）。
function hotPanelSkeleton(pagePrefix) {
  return `<div class="panel">
    <div class="section-head"><span>热榜 TOP</span><a href="${pagePrefix}index.html">更多</a></div>
    <ol class="hot-list"><li class="hot-item" style="color:#9aa3b2;padding:10px 0">⏳ 加载中…</li></ol>
  </div>`;
}

/* ---------- 侧栏模块（热榜 / 分类导航） ---------- */
function hotPanel(list, pagePrefix) {
  const items = list
    .map((a, i) => `<li class="hot-item"><span class="hot-num">${i + 1}</span><a href="${pagePrefix}article/${a.id}.html">${esc(a.title)}</a></li>`)
    .join("");
  return `<div class="panel">
    <div class="section-head"><span>热榜 TOP</span><a href="${pagePrefix}index.html">更多</a></div>
    <ol class="hot-list">${items}</ol>
  </div>`;
}
function catNavPanel(activeKey, pagePrefix) {
  const links = CATEGORIES.map(
    (c) => `<a href="${pagePrefix}category/${c.key}.html" class="${c.key === activeKey ? "active" : ""}">${c.label}</a>`
  ).join("");
  return `<div class="panel">
    <div class="section-head"><span>分类导航</span></div>
    <div class="cat-nav">${links}</div>
  </div>`;
}

/* ---------- 首页 ---------- */
function buildIndex() {
  const sorted = ARTICLES.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const featured = sorted[0];
  const sideList = sorted.slice(1, 7);

  // 头条区改为骨架占位：真实内容由 main.js 在 /api/articles 就绪后重绘，
  // 从源头消除构建期基线头条先显、抓取数据后插的闪现。
  const hero = heroSkeleton();

  const chips = `<button class="chip active" data-cat="">全部</button>` +
    CATEGORIES.map((c) => `<button class="chip" data-cat="${c.key}">${c.label}</button>`).join("");
  const main = `<section class="container main-grid">
    <div class="col-main">
      <div class="filter-row" id="filter-chips">${chips}</div>
      <div class="search-meta" id="search-meta">正在加载最新资讯…</div>
      <div class="feed" id="feed">${feedSkeleton()}</div>
      <div class="feed-sentinel" id="feed-sentinel"></div>
    </div>
    <aside class="col-side">
      ${hotPanelSkeleton("")}
      ${catNavPanel("", "")}
    </aside>
  </section>`;
  const html = shell({
    title: `${SITE.name} · 腾讯资讯与动态聚合观察平台`,
    desc: SITE.description,
    url: `${SITE.baseUrl}/`,
    activeKey: "home",
    assetPrefix: "",
    pagePrefix: "",
    image: catCover("news"),
    body: hero + main,
  });
  writeFile(path.join(OUT, "index.html"), html);
}

/* ---------- 分类页 ---------- */
function buildCategories() {
  CATEGORIES.forEach((c) => {
    const list = ARTICLES.filter((a) => a.category === c.key).sort((a, b) => (a.date < b.date ? 1 : -1));
    const chips = `<button class="chip" data-cat="">全部</button>` +
      CATEGORIES.map((x) =>
        `<button class="chip${x.key === c.key ? " active" : ""}" data-cat="${x.key}">${x.label}</button>`
      ).join("");
    const main = `
<section class="container main-grid">
  <div class="col-main">
    <div class="cat-hero"><h1>${c.label}</h1><p>${c.desc}</p></div>
    <div class="filter-row" id="filter-chips">${chips}</div>
    <div class="search-meta" id="search-meta">正在加载最新资讯…</div>
    <div class="feed" id="feed">${feedSkeleton("../")}</div>
    <div class="feed-sentinel" id="feed-sentinel"></div>
  </div>
  <aside class="col-side">
    ${hotPanelSkeleton("../")}
    ${catNavPanel(c.key, "../")}
  </aside>
</section>`;
    const html = shell({
      title: `${c.label} - ${SITE.name}`,
      desc: `${c.desc} | ${SITE.name}`,
      url: `${SITE.baseUrl}/category/${c.key}.html`,
      activeKey: c.key,
      assetPrefix: "../",
      pagePrefix: "../",
      image: catCover(c.key),
      body: main,
      extraScript: `<script>window.__ACTIVE_CAT__="${c.key}";</script>`,
    });
    writeFile(path.join(OUT, "category", `${c.key}.html`), html);
  });
}

/* ---------- 文章详情页 ---------- */
function buildArticles() {
  ARTICLES.forEach((a) => {
    const sourceBtn = a.sourceUrl
      ? `<div class="source-btn"><a href="${a.sourceUrl}" target="_blank" rel="noopener">阅读原文 · ${esc(a.source)} ↗</a></div>`
      : "";
    const body = `
<article class="article-wrap">
  <div class="read-progress" id="read-progress"></div>
  <div class="container">
    <div class="breadcrumb"><a href="../index.html">首页</a> / <a href="../category/${a.category}.html">${catLabel(a.category)}</a> / 正文</div>
    <div class="article-head">
      <span class="cat-tag">${catLabel(a.category)}</span>
      <h1>${a.title}</h1>
      <p class="sub">${a.summary}</p>
      <div class="article-meta">
        <span>来源：${esc(a.source)}</span><span>作者：${esc(a.author)}</span><span>发布：${fmtDate(a.date)}</span>
      </div>
    </div>
    <div class="article-hero" style="background:linear-gradient(135deg,#22d3ee,#4f7cff 55%,#a855f7)"><img class="cover-img" src="${(/^https?:\/\//i.test(a.coverImage || "") ? a.coverImage : "../" + (a.coverImage || catCover(a.category) || ""))}" alt="${esc(a.title)}"></div>
    <div class="article-content">${a.content}</div>
    <div class="article-tags">${(a.tags || []).map((t) => `<span class="t">#${t}</span>`).join("")}</div>
    ${sourceBtn}
    <div class="related">
      <h3>相关推荐</h3>
      <div class="related-grid" id="related-grid" data-current="${a.id}"></div>
    </div>
    <div class="back-top-wrap"><a class="chip" href="../index.html">← 返回首页</a></div>
  </div>
</article>
<button class="to-top" id="to-top" aria-label="回到顶部">↑</button>`;
    const html = shell({
      title: `${a.title} - ${SITE.name}`,
      desc: a.summary,
      url: `${SITE.baseUrl}/article/${a.id}.html`,
      activeKey: a.category,
      assetPrefix: "../",
      pagePrefix: "../",
      image: a.coverImage || catCover(a.category),
      body,
      ogType: "article",
    });
    writeFile(path.join(OUT, "article", `${a.id}.html`), html);
  });
}

/* ---------- 通用文章阅读页（供无静态页的抓取文章使用：站内渲染，不外跳腾讯） ---------- */
const articleViewScript = `(function(){
  function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
  function fmtDate(d){return d?d.replace(/-/g,"/"):"";}
  function sourceLabel(s){if(!s)return "腾讯";var h=String(s).toLowerCase();if(h.indexOf("tencent")>-1)return "腾讯官网";if(h.indexOf("qq.com")>-1)return "腾讯新闻";if(h.indexOf("weixin")>-1)return "微信";if(/[一-龥]/.test(s))return s;return s.replace(/^www\\./i,"");}
  var CATS=window.__CATEGORIES__||[];
  function catLabel(k){for(var i=0;i<CATS.length;i++){if(CATS[i].key===k)return CATS[i].label;}return k;}
  function catCover(k){for(var i=0;i<CATS.length;i++){if(CATS[i].key===k)return CATS[i].coverImage;}return "";}
  var box=document.getElementById("article-view");
  if(!box)return;
  function params(){var q=location.search.slice(1).split("&");var o={};for(var i=0;i<q.length;i++){var e=q[i].indexOf("=");if(e>-1)o[decodeURIComponent(q[i].slice(0,e))]=decodeURIComponent(q[i].slice(e+1));}return o;}
  var id=params().id;
  if(!id){box.innerHTML='<div class="empty"><div class="big">🧭</div><h2>缺少文章参数</h2><p><a class="chip" href="index.html">返回首页</a></p></div>';return;}
  fetch("/api/articles").then(function(r){return r.ok?r.json():null;}).then(function(d){
    if(!d||!d.articles){throw new Error("nodata");}
    var a=null;for(var i=0;i<d.articles.length;i++){if(d.articles[i].id===id){a=d.articles[i];break;}}
    if(!a){box.innerHTML='<div class="empty"><div class="big">🧭</div><h2>未找到该文章</h2><p><a class="chip" href="index.html">返回首页</a></p></div>';return;}
    document.title=a.title+" - Tencent观象台";
    var img=a.coverImage||catCover(a.category)||"";
    var imgTag=img?'<img class="cover-img" src="'+img+'" alt="'+esc(a.title)+'">':"";
    var rel=[];for(var i=0;i<d.articles.length&&rel.length<3;i++){if(d.articles[i].id!==id)rel.push(d.articles[i]);}
    var relHtml="";for(var i=0;i<rel.length;i++){var x=rel[i];relHtml+='<a class="rc" href="article.html?id='+encodeURIComponent(x.id)+'"><h4>'+esc(x.title)+'</h4><span>'+catLabel(x.category)+' · '+fmtDate(x.date)+'</span></a>';}
    var srcBtn=a.sourceUrl?'<div class="source-btn"><a href="'+a.sourceUrl+'" target="_blank" rel="noopener">阅读原文 · '+esc(sourceLabel(a.source))+' ↗</a></div>':"";
    var tagsHtml="";var tg=(a.tags||[]);for(var i=0;i<tg.length;i++){tagsHtml+='<span class="t">#'+esc(tg[i])+'</span>';}
    var content=a.content?a.content:("<p>"+esc(a.summary)+"</p>");
    box.innerHTML='<article class="article-wrap"><div class="container">'+
      '<div class="breadcrumb"><a href="index.html">首页</a> / <a href="category/'+a.category+'.html">'+catLabel(a.category)+'</a> / 正文</div>'+
      '<div class="article-head"><span class="cat-tag">'+catLabel(a.category)+'</span><h1>'+esc(a.title)+'</h1><p class="sub">'+esc(a.summary)+'</p>'+
      '<div class="article-meta"><span>来源：'+esc(sourceLabel(a.source))+'</span><span>发布：'+fmtDate(a.date)+'</span></div></div>'+
      '<div class="article-hero" style="background:linear-gradient(135deg,#22d3ee,#4f7cff 55%,#a855f7)">'+imgTag+'</div>'+
      '<div class="article-content">'+content+'</div>'+
      '<div class="article-tags">'+tagsHtml+'</div>'+
      srcBtn+
      '<div class="related"><h3>相关推荐</h3><div class="related-grid">'+relHtml+'</div></div>'+
      '<div class="back-top-wrap"><a class="chip" href="index.html">← 返回首页</a></div>'+
      '</div></article>';
  }).catch(function(){box.innerHTML='<div class="empty"><div class="big">⚠️</div><h2>加载失败</h2><p>请刷新重试或<a class="chip" href="index.html">返回首页</a></p></div>';});
})();`;
function buildArticleView() {
  const body = `<section class="container"><div class="article-view" id="article-view"><div class="empty"><div class="big">⏳</div><p>加载中…</p></div></div></section>`;
  const html = shell({
    title: `${SITE.name} · 文章阅读`,
    desc: SITE.description,
    url: `${SITE.baseUrl}/article.html`,
    activeKey: "home",
    assetPrefix: "",
    pagePrefix: "",
    image: catCover("news"),
    body,
    extraScript: `<script>${articleViewScript}</script>`,
  });
  writeFile(path.join(OUT, "article.html"), html);
}

/* ---------- SEO 文件 ---------- */
function buildSitemap() {
  const urls = [];
  urls.push({ loc: `${SITE.baseUrl}/`, lastmod: today(), changefreq: "daily", priority: "1.0" });
  CATEGORIES.forEach((c) =>
    urls.push({ loc: `${SITE.baseUrl}/category/${c.key}.html`, lastmod: today(), changefreq: "daily", priority: "0.8" })
  );
  // 文章为定时抓取动态内容（经 /api/articles + article.html?id= 读取），不写入静态站点地图，
  // 避免暴露构建期基线示例稿的陈旧 URL。
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`
  )
  .join("\n")}
</urlset>`;
  writeFile(path.join(OUT, "sitemap.xml"), xml);
}
function buildRobots() {
  writeFile(
    path.join(OUT, "robots.txt"),
    `User-agent: *\nAllow: /\n\nSitemap: ${SITE.baseUrl}/sitemap.xml\n`
  );
}
function build404() {
  const body = `<section class="container"><div class="empty"><div class="big">🧭</div><h2>页面走丢了</h2><p>您访问的页面不存在或已移动。</p><p><a class="chip" href="index.html">返回首页</a></p></div></section>`;
  const html = shell({
    title: `404 - ${SITE.name}`,
    desc: "页面未找到",
    url: `${SITE.baseUrl}/404.html`,
    activeKey: "home",
    assetPrefix: "",
    pagePrefix: "",
    body,
  });
  writeFile(path.join(OUT, "404.html"), html);
}

/* ---------- 工具 ---------- */
function today() { return new Date().toISOString().slice(0, 10); }
function writeFile(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
  console.log("  ✓", path.relative(OUT, p));
}
function copyAssets() { copyDir(ASSETS, path.join(OUT, "assets")); }
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

/* ---------- 执行 ---------- */
console.log("▶ 生成 Tencent观象台 静态站点 → dist/");
buildIndex();
buildCategories();
// 注意：不再生成构建期基线静态详情页（buildArticles）。所有文章经 /api/articles + article.html?id= 动态读取，
// 站点内容 100% 由定时抓取驱动，杜绝"旧/其他"数据回显。
buildArticleView();
buildSitemap();
buildRobots();
build404();
copyAssets();
console.log("✅ 完成。共生成", ARTICLES.length, "篇文章、", CATEGORIES.length, "个分类页。");
