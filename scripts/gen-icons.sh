#!/usr/bin/env bash
#
# 由 assets/brand/ 的 SVG 生成 src-tauri/icons/ 下的全部图标。
# src-tauri/icons/*.png|icns|ico 都是本脚本的产物，不要手工编辑。
#
# 依赖：rsvg-convert（brew install librsvg）
#       iconutil（macOS 自带，仅生成 .icns 时需要）
#       python3（组装 .ico）
set -euo pipefail

cd "$(dirname "$0")/.."

BRAND="assets/brand"
ICONS="src-tauri/icons"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "❌ 需要 rsvg-convert（brew install librsvg）"
  exit 1
fi

MARK="$BRAND/taudesign-mark.svg"          # 满版：Windows / Linux / favicon
MACOS="$BRAND/taudesign-icon-macos.svg"   # 苹果比例：留边 82%、圆角 22.5%

for f in "$MARK" "$MACOS"; do
  [ -f "$f" ] || { echo "❌ 缺少源文件: $f"; exit 1; }
done

mkdir -p "$ICONS"

echo "🎨 通用 PNG（满版）..."
rsvg-convert -w 32  -h 32  "$MARK" -o "$ICONS/32x32.png"
rsvg-convert -w 128 -h 128 "$MARK" -o "$ICONS/128x128.png"
rsvg-convert -w 256 -h 256 "$MARK" -o "$ICONS/128x128@2x.png"
rsvg-convert -w 512 -h 512 "$MARK" -o "$ICONS/icon.png"

echo "🪟 Windows Store 系列..."
for s in 30 44 71 89 107 142 150 284 310; do
  rsvg-convert -w "$s" -h "$s" "$MARK" -o "$ICONS/Square${s}x${s}Logo.png"
done
rsvg-convert -w 50 -h 50 "$MARK" -o "$ICONS/StoreLogo.png"

echo "🍎 macOS .icns（苹果比例版）..."
if command -v iconutil >/dev/null 2>&1; then
  ICONSET="$TMP/icon.iconset"
  mkdir -p "$ICONSET"
  gen_icns() { rsvg-convert -w "$1" -h "$1" "$MACOS" -o "$ICONSET/$2.png"; }
  gen_icns 16   icon_16x16
  gen_icns 32   icon_16x16@2x
  gen_icns 32   icon_32x32
  gen_icns 64   icon_32x32@2x
  gen_icns 128  icon_128x128
  gen_icns 256  icon_128x128@2x
  gen_icns 256  icon_256x256
  gen_icns 512  icon_256x256@2x
  gen_icns 512  icon_512x512
  gen_icns 1024 icon_512x512@2x
  iconutil -c icns "$ICONSET" -o "$ICONS/icon.icns"
else
  echo "   ⚠️  非 macOS，跳过 .icns（iconutil 不可用），保留现有文件"
fi

echo "🗔  Windows .ico..."
# 注意：不要用 `magick a.png b.png ... out.ico` —— ImageMagick 会把各帧存成
# 未压缩位图，同样内容能从 12KB 膨胀到 300KB。这里按 ICO 规范手工组装，
# payload 直接放 PNG 字节（Vista+ 支持，与 Tauri 自带图标的结构一致）。
for s in 16 24 32 48 64 256; do
  rsvg-convert -w "$s" -h "$s" "$MARK" -o "$TMP/ico-$s.png"
done
python3 - "$TMP" "$ICONS/icon.ico" <<'PY'
import struct, sys

tmp, out_path = sys.argv[1], sys.argv[2]
sizes = [16, 24, 32, 48, 64, 256]
frames = [(s, open(f"{tmp}/ico-{s}.png", "rb").read()) for s in sizes]

header = struct.pack("<HHH", 0, 1, len(frames))   # reserved, type=icon, count
offset = 6 + 16 * len(frames)
entries, payloads = b"", b""
for s, data in frames:
    dim = 0 if s >= 256 else s                     # 0 代表 256
    entries += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(data), offset)
    payloads += data
    offset += len(data)

open(out_path, "wb").write(header + entries + payloads)
print(f"   .ico: {len(frames)} 帧, {len(header) + len(entries) + len(payloads)} 字节")
PY

echo "🌐 favicon..."
cp "$MARK" public/favicon.svg

echo "✅ 图标生成完成"
ls -la "$ICONS" | awk 'NR>3 {printf "   %-26s %s\n", $9, $5}'
