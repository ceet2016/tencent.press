# Tencent观象台（tencent.press）

腾讯相关资讯与动态的聚合观察平台。采用**数据驱动的静态站点生成器**架构：内容集中在 `data/articles.json`，由 `generator.cjs` 生成纯静态 HTML，天然 SEO 友好、可托管于任意静态空间，并适配移动端。

平台运行在 **EdgeOne Makers** 上，使用 **EO Blob** 作为数据存储，并配置**每日定时抓取**（cron）自动聚合最新资讯。

- 运行环境：**Node.js 24.11.0**
- 数据存储：**EdgeOne Makers Blob**（`@edgeone/pages-blob`）
- 定时任务：通过 `edgeone.json` 的 `schedules` 每天触发 `cloud-functions/api/cron/scrape.js`

## 目录结构

```
tencent-press/
├── data/
│   └── articles.json          # 内容数据源（本地基线，首次部署后由 Blob 接管）
├── assets/
│   ├── css/style.css          # 蓝色主色调、响应式资讯门户样式
│   ├── js/main.js             # 客户端搜索 / 分类筛选 / 相关推荐 / 实时数据刷新
│   └── img/                   # 分类封面图（AI 生成，cat-*.png）
├── lib/
│   └── scraper.mjs            # 纯抓取 + 分类 + 去重合并逻辑（零依赖，CLI/函数共用）
├── scripts/
│   ├── fetch-news.mjs         # 本地/CI 抓取 CLI（写 Blob + 本地文件）
│   ├── seed-blob.mjs          # 一次性将本地数据推送到 Blob（初始化）
│   └── sync-blob.mjs          # 构建前从 Blob 拉取最新数据覆盖本地
├── cloud-functions/
│   ├── api/articles.js        # 读取 Blob 返回最新数据（前端实时数据源）
│   └── api/cron/scrape.js     # 定时任务入口（抓取 → 合并 → 写回 Blob）
├── edgeone.json               # Makers 配置：函数打包 + 定时任务
├── package.json               # type:module，Node 24，脚本与依赖
├── generator.cjs              # 站点生成器（CommonJS，无第三方依赖）
├── dist/                      # 生成产物（部署目录）
└── README.md
```

## 本地预览

```bash
cd dist
python -m http.server 8080
# 浏览器打开 http://127.0.0.1:8080
```

## 添加 / 修改文章（手动维护）

编辑 `data/articles.json` 的 `articles` 数组，字段如下：

| 字段 | 说明 |
|------|------|
| `id` | 唯一 slug，用于生成 `article/<id>.html`，建议英文短横线 |
| `title` | 标题 |
| `category` | 分类 key：`news` / `products` / `finance` / `tech` / `people` / `industry` |
| `date` | 发布日期 `YYYY-MM-DD` |
| `source` | 来源（如 官方公告、财报公告） |
| `author` | 作者 |
| `tags` | 标签数组 |
| `summary` | 摘要（同时作为 meta description） |
| `cover` | 封面主色（十六进制，如 `#006EFF`） |
| `coverImage` | 可选，独立封面图路径；留空则自动使用分类封面 `assets/img/cat-<key>.png` |
| `content` | 正文，支持 HTML（`<p>` 等） |
| `sourceUrl` | 原文链接（详情页「阅读原文」按钮跳转） |

> 注意：JSON 字符串内如需使用引号，请用 `\"` 转义；正文中不要出现 `</script>`。

新增分类时，在 `categories` 数组中追加 `{ "key": "...", "label": "...", "desc": "...", "coverImage": "assets/img/cat-xxx.png" }`，生成器会自动生成对应分类页、导航项与封面。

## 构建与生成

```bash
npm run build          # 等效于 node generator.cjs，输出 dist/
```

## 定时抓取（EdgeOne Makers）

### 工作原理

1. `edgeone.json` 的 `schedules` 每天（Asia/Shanghai 08:00）以 POST 触发 `/api/cron/scrape`。
2. `cloud-functions/api/cron/scrape.js` 从 Blob 读取 `articles.json` → 调用 `lib/scraper.mjs` 抓取配置源 → 按关键词分类、去重合并 → 写回 Blob。
3. 前端 `assets/js/main.js` 在页面加载时请求 `/api/articles`（读取同一 Blob），将新增条目即时合并进信息流——**无需重新构建即可体现抓取结果**。
4. 若需让静态预渲染 HTML 也包含最新内容，重新构建/部署一次即可（构建前 `sync-blob.mjs` 会从 Blob 拉取最新数据）。

### 抓取源配置

编辑以下文件中的 `SOURCES` 数组，替换为真实可访问的列表页 / RSS 订阅源即可：

- 本地 / CI：`scripts/fetch-news.mjs`
- Makers 定时函数：`cloud-functions/api/cron/scrape.js`

`lib/scraper.mjs` 自动识别 RSS/Atom 与通用 `<a>` 列表，并按关键词将条目归入对应分类；网络异常时静默跳过，保证构建永不中断。

### Blob 初始化（首次部署后执行一次）

```bash
# 需要 EO_PROJECT_ID 与 EO_API_TOKEN（Makers 控制台「API Token」）
export EO_PROJECT_ID=pages-xxxxxxxx
export EO_API_TOKEN=your-token
npm run seed
```

> 控制台需绑定一个名为 `tencent-press-data` 的 Blob 命名空间（或设置环境变量 `BLOB_STORE` 指定其它名称）。

## 本地手动抓取

```bash
npm run scrape
# 可选：外网写回 Blob（设置 EO_PROJECT_ID / EO_API_TOKEN 后自动启用）
```

## 部署到 EdgeOne Makers

1. 在 Makers 控制台创建项目，绑定 `tencent-press-data` Blob 命名空间。
2. 设置环境变量：`EO_PROJECT_ID`、`EO_API_TOKEN`、`BLOB_STORE`（可选）。
3. 将代码推送到 Git 仓库（或 `edgeone makers deploy`），构建命令为 `npm run build`，**构建输出目录设为 `dist`**。
4. `cloud-functions/` 下的函数与 `edgeone.json` 中的 `schedules` 由 Makers 自动识别；部署后在控制台「定时任务」可见 `daily-news-scrape`。
5. 部署完成后执行一次 `npm run seed` 初始化 Blob 数据。
6. 在域名解析处将 `tencent.press` 指向 Makers 提供的地址并配置 HTTPS。

## SEO 要点

- 每个页面均含 `title` / `description` / `keywords` / Open Graph（`og:image` 使用对应分类封面）/ Twitter Card / `canonical`。
- `dist/sitemap.xml` 已列出首页、各分类页与全部文章页（绝对地址 `https://tencent.press/...`）。
- 部署后建议：向搜索引擎提交 `https://tencent.press/sitemap.xml`，并确保 `robots.txt` 可公开访问。
- 文章 `content` 为服务端预渲染的真实 HTML，利于收录。

## 内容说明与合规

- 站点内容由 `data/articles.json` 驱动，并经定时抓取持续聚合。**已接入真实公开信息**：基线数据通过腾讯官方新闻室（tencent.com/newsroom）及公开媒体报道检索整理，覆盖 2026 年腾讯在新闻、产品、财报、技术、人事、行业等方面的真实动态；定时抓取进一步从配置源聚合最新条目。
- 每条资讯均保留 `source`（来源）与 `sourceUrl`（原文链接），详情页提供「阅读原文」按钮跳转至原始出处，便于读者核验。
- 正文为基于公开信息的**客观摘要**，非原文转载；版权归原作者 / 原始发布方所有。
- 本站为信息聚合演示项目，与腾讯公司无隶属关系。正式运营请持续以合规方式获取与标注来源，并遵守相关版权与数据合规要求。
