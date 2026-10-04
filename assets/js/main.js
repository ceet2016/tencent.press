/* ===== Tencent观象台 · 前端交互逻辑（重构版） ===== */
(function () {
  "use strict";
  var ARTICLES = window.__ARTICLES__ || [];
  var CATEGORIES = window.__CATEGORIES__ || [];
  var ACTIVE_CAT = window.__ACTIVE_CAT__ || null;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function catCoverImg(key) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].key === key && CATEGORIES[i].coverImage) return CATEGORIES[i].coverImage;
    }
    return "";
  }
  // 客户端卡片与静态页处于同一目录层级时无需前缀；分类/详情子页需回退一级
  var PREFIX = (location.pathname.indexOf("/category/") > -1 || location.pathname.indexOf("/article/") > -1) ? "../" : "";

  function catLabel(key) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].key === key) return CATEGORIES[i].label;
    return key;
  }
  function fmtDate(d) { return d ? d.replace(/-/g, "/") : ""; }
  function coverIcon(a) {
    var map = { news: "📰", products: "📦", finance: "📊", tech: "🛠️", people: "👥", industry: "🌐" };
    return map[a.category] || "📌";
  }
  function sourceLabel(s) {
    if (!s) return "腾讯";
    var host = String(s).toLowerCase();
    if (host.indexOf("tencent") > -1) return "腾讯官网";
    if (host.indexOf("qq.com") > -1) return "腾讯新闻";
    if (host.indexOf("weixin") > -1) return "微信";
    if (/[一-龥]/.test(s)) return s; // 已是中文友好名，原样返回
    return s.replace(/^www\./i, "");
  }
  function cardHTML(a, prefix) {
    var img = a.coverImage || catCoverImg(a.category);
    var imgSrc = (img && /^https?:\/\//i.test(img)) ? img : (prefix + img);
    var inner = img
      ? '<img class="cover-img" src="' + imgSrc + '" alt="' + esc(a.title) + '" loading="lazy">'
      : "";
    inner += '<span class="cat-badge">' + catLabel(a.category) + '</span>' +
             '<span class="cover-icon">' + coverIcon(a.category) + '</span>';
    // 有静态详情页 → 站内 article/<id>.html；抓取文章（无静态页）→ 站内通用阅读页 article.html?id=，不再外跳腾讯
    var hasPage = a.hasPage;
    var href = hasPage ? (prefix + "article/" + a.id + ".html") : (prefix + "article.html?id=" + encodeURIComponent(a.id));
    var attrs = "";
    return '<a class="card" href="' + href + '"' + attrs + '>' +
      '<div class="cover" style="background:linear-gradient(135deg,#22d3ee,#4f7cff 55%,#a855f7)">' + inner + '</div>' +
      '<div class="body">' +
        '<h3>' + esc(a.title) + '</h3>' +
        '<p>' + esc(a.summary) + '</p>' +
        '<div class="meta"><span>' + fmtDate(a.date) + '</span>' +
          '<span class="dot"></span><span>' + esc(sourceLabel(a.source)) + '</span>' +
          (a.tags && a.tags[0] ? '<span class="dot"></span><span class="tag">#' + esc(a.tags[0]) + '</span>' : '') +
        '</div>' +
      '</div></a>';
  }

  /* ---- 信息流页（首页 / 分类页） ---- */
  var feedEl = document.getElementById("feed");
  var sentinelEl = document.getElementById("feed-sentinel");
  var chipsEl = document.getElementById("filter-chips");
  var searchEl = document.getElementById("search-input");
  var metaEl = document.getElementById("search-meta");
  var q = "", cat = ACTIVE_CAT;
  var BATCH = 6, shown = 0, current = [];
  var lazy = "IntersectionObserver" in window;

  function compute() {
    var list = ARTICLES.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    if (cat) list = list.filter(function (a) { return a.category === cat; });
    if (q) {
      var s = q.toLowerCase();
      list = list.filter(function (a) {
        return (a.title + " " + a.summary + " " + (a.tags || []).join(" ") + " " + a.source).toLowerCase().indexOf(s) > -1;
      });
    }
    return list;
  }
  function updateMeta(list) {
    if (!metaEl) return;
    var scope = cat ? "「" + catLabel(cat) + "」分类下 " : "";
    metaEl.textContent = scope + "共 " + list.length + " 条资讯" + (q ? '，关键词：「' + q + "」" : "");
  }
  function loadMore() {
    if (shown >= current.length) { if (sentinelEl) sentinelEl.classList.add("done"); return; }
    var end = lazy ? shown + BATCH : current.length;
    var batch = current.slice(shown, end);
    feedEl.insertAdjacentHTML("beforeend", batch.map(function (a) { return cardHTML(a, PREFIX); }).join(""));
    shown = end;
    if (sentinelEl) {
      if (shown >= current.length) sentinelEl.classList.add("done");
      else sentinelEl.classList.remove("done");
    }
  }
  // 持续加载直到哨兵离开视口（或已全部加载）：修复短页面哨兵始终在视口内、
  // IntersectionObserver 不再触发 enter 事件导致一直转圈的问题
  function fillViewport() {
    loadMore();
    if (!sentinelEl || sentinelEl.classList.contains("done")) return;
    var r = sentinelEl.getBoundingClientRect();
    if (r.top <= window.innerHeight + 320) fillViewport();
  }
  function setupFeed() {
    if (!feedEl) return; // 详情页无信息流容器，直接返回，避免空引用报错
    current = compute();
    shown = 0;
    if (sentinelEl) sentinelEl.classList.remove("done");
    if (!current.length) {
      feedEl.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="big">🔍</div>未找到匹配的资讯，试试其他关键词。</div>';
      if (sentinelEl) sentinelEl.classList.add("done");
      updateMeta(current);
      return;
    }
    feedEl.innerHTML = "";
    fillViewport();
    updateMeta(current);
  }

  if (feedEl) {
    if (chipsEl) {
      chipsEl.addEventListener("click", function (e) {
        var t = e.target.closest(".chip");
        if (!t) return;
        chipsEl.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
        t.classList.add("active");
        cat = t.getAttribute("data-cat") || null;
        setupFeed();
      });
    }
    if (searchEl) {
      searchEl.addEventListener("input", function () { q = searchEl.value.trim(); setupFeed(); });
    }
    if (sentinelEl && lazy) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) fillViewport(); });
      }, { rootMargin: "320px 0px" });
      io.observe(sentinelEl);
    }
    // 首次绘制推迟到 /api/articles 就绪后（见 refreshFromApi），避免先出基线、后插抓取的闪现/重排
    feedEl.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="big">⏳</div>正在加载最新资讯…</div>';
  }

  /* ---- 详情页：相关推荐 ---- */
  var relEl = document.getElementById("related-grid");
  function renderRelated() {
    if (!relEl) return;
    var curId = relEl.getAttribute("data-current");
    var current = ARTICLES.filter(function (a) { return a.id === curId; })[0] || null;
    if (!current) return;
    var pool = ARTICLES.filter(function (a) { return a.id !== curId; });
    var byCat = pool.filter(function (a) { return a.category === current.category; });
    var rest = pool.filter(function (a) { return a.category !== current.category; });
    var related = byCat.concat(rest).slice(0, 3);
    relEl.innerHTML = related.map(function (a) {
      // 抓取文章无静态页 → 站内通用阅读页
      var href = a.hasPage ? ("../article/" + a.id + ".html") : ("../article.html?id=" + encodeURIComponent(a.id));
      var attrs = "";
      return '<a class="rc" href="' + href + '"' + attrs + '>' +
        '<h4>' + esc(a.title) + '</h4>' +
        '<span>' + catLabel(a.category) + ' · ' + fmtDate(a.date) + '</span></a>';
    }).join("");
  }
  renderRelated();

  /* ---- 首页头条区（左侧 lead + 右侧「今日要闻」）：随实时数据刷新为最新 ----
     静态 HTML 里的 hero 由 generator 用基线文章构建时写死，抓取到的最新文章进不来。
     这里在 /api/articles 就绪后按日期重排并重绘，使左右两侧始终显示全站最新内容。 */
  var heroLead = document.querySelector(".hero .lead");
  var heroSide = document.querySelector(".hero .side-list");
  function articleHref(a) {
    // 有静态详情页 → article/<id>.html；抓取文章（无静态页）→ 通用阅读页
    return a.hasPage
      ? (PREFIX + "article/" + a.id + ".html")
      : (PREFIX + "article.html?id=" + encodeURIComponent(a.id));
  }
  function renderHero() {
    if (!heroLead && !heroSide) return;      // 非首页（无 hero 区块）直接跳过
    if (!ARTICLES || !ARTICLES.length) return;
    // 头条只从「有封面图」的文章里选最新，避免无封面的 PDF/IR 报表占位稿顶到视觉头条
    // （无封面稿仍保留在信息流与热榜中，仅不进入 hero 视觉区）
    var presentable = ARTICLES.filter(function (a) { return a.coverImage; });
    var pool = presentable.length ? presentable : ARTICLES;
    var sorted = pool.slice().sort(function (a, b) { return (a.date < b.date) ? 1 : -1; });
    var f = sorted[0];
    if (!f) return;

    if (heroLead) {
      heroLead.classList.remove("lead-skeleton"); // 去除骨架占位样式，恢复真实头条卡片布局（封面铺满/文字在下）
      var img = f.coverImage || catCoverImg(f.category);
      var src = img ? ((/^https?:\/\//i.test(img) ? img : (PREFIX + img))) : "";
      var imgTag = src ? '<img class="cover-img" src="' + esc(src) + '" alt="' + esc(f.title) + '" loading="lazy">' : "";
      heroLead.setAttribute("href", articleHref(f));
      heroLead.innerHTML =
        '<div class="lead-cover" style="background:linear-gradient(135deg,#22d3ee,#4f7cff 55%,#a855f7)">' +
          imgTag +
          '<span class="cat-badge">' + catLabel(f.category) + '</span>' +
          '<span class="lead-mark">' + coverIcon(f) + '</span>' +
        '</div>' +
        '<div class="lead-body">' +
          '<span class="cat-tag">' + catLabel(f.category) + ' · ' + fmtDate(f.date) + '</span>' +
          '<h2>' + esc(f.title) + '</h2>' +
          '<p>' + esc(f.summary) + '</p>' +
          '<span class="read">阅读全文 →</span>' +
        '</div>';
    }

    if (heroSide) {
      heroSide.innerHTML = sorted.slice(1, 7).map(function (a, i) {
        return '<li><a href="' + articleHref(a) + '">' +
          '<span class="n">' + (i + 1) + '</span>' +
          '<div><b>' + esc(a.title) + '</b><em>' + fmtDate(a.date) + ' · ' + catLabel(a.category) + '</em></div>' +
        '</a></li>';
      }).join("");
    }
  }
  renderHero();   // 首屏静态已是骨架占位；ARTICLES 为空时本调用直接返回，接口就绪后由 refreshFromApi 重绘

  /* ---- 详情页：阅读进度条 + 回到顶部 ---- */
  var progress = document.getElementById("read-progress");
  var toTop = document.getElementById("to-top");
  function onScroll() {
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    var pct = max > 0 ? (h.scrollTop || document.body.scrollTop) / max : 0;
    if (progress) progress.style.width = (pct * 100).toFixed(2) + "%";
    if (toTop) toTop.style.display = (h.scrollTop || document.body.scrollTop) > 400 ? "block" : "none";
  }
  if (progress || toTop) {
    window.addEventListener("scroll", onScroll, { passive: true });
    if (toTop) toTop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
    onScroll();
  }

  /* ---- 顶部导航：滚动阴影 ---- */
  var header = document.querySelector(".site-header");
  if (header) {
    window.addEventListener("scroll", function () {
      if ((document.documentElement.scrollTop || document.body.scrollTop) > 8) header.classList.add("scrolled");
      else header.classList.remove("scrolled");
    }, { passive: true });
  }

  /* ---- 移动端导航开关由下方独立 IIFE 统一处理（避免重复绑定导致 toggle 互相抵消） ---- */

  /* ---- 热榜：仅由实时抓取数据驱动，避免任何构建期基线混入 ---- */
  var hotListEl = document.querySelector(".hot-list");
  function renderHot() {
    if (!hotListEl) return; // 非首页/分类页无热榜容器
    if (!ARTICLES || !ARTICLES.length) {
      hotListEl.innerHTML = '<li class="hot-item" style="color:#9aa3b2;padding:10px 0">暂无资讯</li>';
      return;
    }
    var sorted = ARTICLES.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    hotListEl.innerHTML = sorted.slice(0, 10).map(function (a, i) {
      var href = a.hasPage
        ? (PREFIX + "article/" + a.id + ".html")
        : (PREFIX + "article.html?id=" + encodeURIComponent(a.id));
      return '<li class="hot-item"><span class="hot-num">' + (i + 1) + '</span><a href="' + href + '">' + esc(a.title) + '</a></li>';
    }).join("");
  }

  /* ---- 实时数据：拉取 /api/articles，使定时抓取结果即时体现（唯一数据来源）---- */
  function refreshFromApi() {
    if (typeof fetch !== "function") { setupFeed(); renderHot(); return; }
    fetch("/api/articles")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        // 仅以 Blob 中的抓取数据为准：构建期基线不注入，删除 Blob 即彻底无"其他/旧"数据
        if (!d || !Array.isArray(d.articles)) { setupFeed(); renderHot(); return; }
        ARTICLES = d.articles;
        setupFeed();          // 一次性按日期排序绘制，杜绝基线先显、抓取后插的闪现/重排
        renderRelated();
        renderHero();         // 头条区同步刷新为全站最新（含定时抓取的文章）
        renderHot();          // 热榜同步刷新为抓取数据榜
        if (!ARTICLES.length) {
          // 真实无数据（Blob 已删且定时任务尚未回填）：骨架改为明确空状态，避免长期"加载中"
          if (heroLead) heroLead.innerHTML = '<div style="padding:48px;text-align:center;color:#9aa3b2;font-weight:600">🗞️ 暂无最新资讯，每日定时抓取后将自动更新</div>';
        }
      })
      .catch(function () { setupFeed(); renderHot(); });
  }
  refreshFromApi();
})();

/* ===== 移动端：汉堡菜单 + 搜索切换 ===== */
(function () {
  var headerInner = document.querySelector(".header-inner");
  var nav = document.querySelector(".nav");
  var navToggle = document.querySelector(".nav-toggle");
  var searchToggle = document.querySelector(".search-toggle");
  var searchInput = document.getElementById("search-input");
  if (!headerInner) return;

  function closeAll(except) {
    if (nav && except !== "nav") nav.classList.remove("open");
    if (except !== "search") headerInner.classList.remove("search-open");
    if (navToggle) navToggle.setAttribute("aria-expanded", "false");
    if (searchToggle) searchToggle.setAttribute("aria-expanded", "false");
  }

  if (navToggle && nav) {
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.addEventListener("click", function () {
      var willOpen = !nav.classList.contains("open");
      closeAll(willOpen ? "nav" : null);
      nav.classList.toggle("open", willOpen);
      navToggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });
    nav.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () { closeAll(); });
    });
  }

  if (searchToggle) {
    searchToggle.setAttribute("aria-expanded", "false");
    searchToggle.addEventListener("click", function () {
      var willOpen = !headerInner.classList.contains("search-open");
      closeAll(willOpen ? "search" : null);
      headerInner.classList.toggle("search-open", willOpen);
      searchToggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
      if (willOpen && searchInput) setTimeout(function () { searchInput.focus(); }, 50);
    });
  }

  // 点击页面其它区域关闭
  document.addEventListener("click", function (e) {
    if (!headerInner.contains(e.target)) closeAll();
  });
})();
