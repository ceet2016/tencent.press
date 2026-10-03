/* ===== scripts/publish.cjs =====
 * EdgeOne Makers（框架预设 = Other）实测会直接托管「仓库根目录」，
 * 而忽略「输出目录 / OutputDir」设置。因此仅把站点生成到 dist/ 会导致
 * 线上 404（dist/ 下的 index.html 等文件根本不会被服务）。
 *
 * 本脚本在 generator.cjs 生成 dist/ 之后，把 dist/ 的内容同步到项目根目录，
 * 使 Makers 服务的根目录拥有完整静态站点。即使未来 OutputDir 被正确识别，
 * dist/ 中同样保留了站点，两种情形都能正常访问。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "dist");

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

if (!fs.existsSync(SRC)) {
  console.error("✗ dist/ 不存在，请先运行 node generator.cjs");
  process.exit(1);
}

copyDir(SRC, ROOT);
console.log("✓ 已同步 dist/ → 项目根目录（供 Makers 根目录托管）");
