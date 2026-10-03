/* 全站内链审计：遍历 dist 下所有 html，解析 href/src，按文件所在目录解析相对路径，检查目标是否存在。
   同时检查 CSS 中引用的资源。用法：node scripts/audit-links.cjs */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "dist");
const problems = [];
const seen = new Map();

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

const htmlFiles = walk(ROOT).filter((f) => f.endsWith(".html"));

for (const file of htmlFiles) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  let html = fs.readFileSync(file, "utf8");
  const baseDir = path.dirname(file);
  // 剔除 <script>/<style> 块：其中的字符串拼接（如 ' + dest + '）不是真实链接，避免误报
  html = html.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "");

  // 收集 href / src
  const attrs = [];
  const re = /(?:href|src)\s*=\s*"([^"]+)"/gi;
  let m;
  while ((m = re.exec(html))) attrs.push(m[1]);

  for (const raw of attrs) {
    const v = raw.trim();
    if (!v) { problems.push(`${rel}: 空 href/src`); continue; }
    if (/^(https?:)?\/\//i.test(v)) continue;      // 外链/协议相对，跳过
    if (v.startsWith("#")) continue;                // 锚点
    if (v.startsWith("data:")) continue;            // data URI
    if (v.startsWith("mailto:") || v.startsWith("tel:")) continue;
    // 去掉 ?query 与 #hash
    const clean = v.split("?")[0].split("#")[0];
    if (!clean) continue;                           // 纯 query，如 article.html?id=
    const target = path.resolve(baseDir, clean);
    if (!fs.existsSync(target)) {
      problems.push(`${rel}: 死链 "${v}"  ->  解析为 ${path.relative(ROOT, target).replace(/\\/g, "/") || "(根目录外)"}`);
    }
  }
}

// CSS 中引用的资源（url(...)）
const cssFiles = walk(ROOT).filter((f) => f.endsWith(".css"));
for (const cssFile of cssFiles) {
  const rel = path.relative(ROOT, cssFile).replace(/\\/g, "/");
  const css = fs.readFileSync(cssFile, "utf8");
  const re = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
  let m;
  while ((m = re.exec(css))) {
    const v = m[1].trim();
    if (/^(https?:)?\/\//i.test(v) || v.startsWith("data:")) continue;
    const clean = v.split("?")[0].split("#")[0];
    const target = path.resolve(path.dirname(cssFile), clean);
    if (!fs.existsSync(target)) problems.push(`${rel}: CSS 死资源 "${v}"`);
  }
}

console.log(`扫描 HTML: ${htmlFiles.length} 个，CSS: ${cssFiles.length} 个`);
if (problems.length === 0) {
  console.log("✅ 未发现死链");
} else {
  console.log(`❌ 发现 ${problems.length} 个问题：`);
  const uniq = [...new Set(problems)];
  uniq.slice(0, 60).forEach((p) => console.log("  - " + p));
  if (uniq.length > 60) console.log(`  ... 另有 ${uniq.length - 60} 条`);
}
