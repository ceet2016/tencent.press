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
  function cardHTML(a, prefix) {
    var img = a.coverImage || catCoverImg(a.category);
    var inner = img
      ? '<img class="cover-img" src="' + prefix + img + '" alt="' + esc(a.title) + '" loading="lazy">'
      : "";
    inner += '<span class="cat-badge">' + catLabel(a.category) + '</span>' +
             '<span class="cover-icon">' + coverIcon(a.category) + '</span>';
    return '<a class="card" href="' + prefix + 'article/' + a.id + '.html">' +
      '<div class="cover" style="background:linear-gradient(135deg,' + (a.cover || "#FF6A00") + ',#FF3D2E)">' + inner + '</div>' +
      '<div class="body">' +
        '<h3>' + esc(a.title) + '</h3>' +
        '<p>' + esc(a.summary) + '</p>' +
        '<div class="meta"><span>' + fmtDate(a.date) + '</span>' +
          '<span class="dot"></span><span>' + esc(a.source) + '</span>' +
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
  function setupFeed() {
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
    loadMore();
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
        entries.forEach(function (en) { if (en.isIntersecting) loadMore(); });
      }, { rootMargin: "320px 0px" });
      io.observe(sentinelEl);
    }
    setupFeed();
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
      return '<a class="rc" href="../article/' + a.id + '.html">' +
        '<h4>' + esc(a.title) + '</h4>' +
        '<span>' + catLabel(a.category) + ' · ' + fmtDate(a.date) + '</span></a>';
    }).join("");
  }
  renderRelated();

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

  /* ---- 实时数据：拉取 /api/articles，使定时抓取结果即时体现 ---- */
  function refreshFromApi() {
    if (typeof fetch !== "function") return;
    fetch("/api/articles")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !Array.isArray(d.articles)) return;
        var map = {};
        ARTICLES.forEach(function (a) { map[a.id] = a; });
        var changed = false;
        d.articles.forEach(function (a) { if (!map[a.id]) { map[a.id] = a; changed = true; } });
        var merged = Object.keys(map).map(function (k) { return map[k]; });
        if (changed || merged.length !== ARTICLES.length) {
          ARTICLES = merged;
          if (feedEl) setupFeed();
          renderRelated();
        }
      })
      .catch(function () { /* 无 /api/articles 时静默回退到静态数据 */ });
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
