#!/bin/bash
# 构建 CloudBase 静态托管部署产物（dist/）
#
# 只打包运行时会用到的文件。app/js 下的 main.js / tools.js / world.js /
# player.js / mobs.js / ui.js 是 merge 前的旧版死代码（index.html 只引用 *2.js），
# 不参与构建，可省约 400KB 上传量。
#
# 用法：bash scripts/build-dist.sh
# 产物：dist/index.html + dist/js/* + dist/css/style2.css
# 上传：用 CloudBase MCP 的 manageHosting(action="upload", localPath="<repo>/dist", cloudPath="mymc/")
#       ⚠️ 必须传子目录 mymc/ —— 该 bucket 是多项目共用，根 index.html 被「墨魂拳皇」占用

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/app"
OUT="$ROOT/dist"

# index.html 实际引用的文件（改动 index.html 的 script 标签时同步这里）
JS_FILES=(error.js three.min.js tools2.js world2.js player2.js mobs2.js ui2.js main2.js)
CSS_FILES=(style2.css)

rm -rf "$OUT"
mkdir -p "$OUT/js" "$OUT/css"

for f in "${JS_FILES[@]}"; do
  [ -f "$SRC/js/$f" ] || { echo "❌ 缺失 $SRC/js/$f"; exit 1; }
  cp "$SRC/js/$f" "$OUT/js/$f"
done

for f in "${CSS_FILES[@]}"; do
  [ -f "$SRC/css/$f" ] || { echo "❌ 缺失 $SRC/css/$f"; exit 1; }
  cp "$SRC/css/$f" "$OUT/css/$f"
done

cp "$SRC/index.html" "$OUT/index.html"

echo "✅ dist 构建完成：$(find "$OUT" -type f | wc -l | tr -d ' ') 个文件，$(du -sh "$OUT" | cut -f1)"
echo
find "$OUT" -type f -exec ls -lh {} \; | awk '{printf "  %-8s %s\n", $5, $9}'
