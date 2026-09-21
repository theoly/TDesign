# TauDesign 品牌资产

## 标记 (Mark)

画框里挖出希腊字母 **τ (tau)**。产品的核心隐喻是无限画布上的画框，名字的词根又恰好是 tau——
字形与名字、名字与产品三者咬合，不是给字母套个方框。

字形在 16px 下会退化成一个 **T**：竖笔的弯钩收成一点加重。这是刻意的——
它不会糊成一团，只会变简单，而 T 对 **T**auDesign 依然成立。

| 文件 | 用途 |
|---|---|
| `taudesign-mark.svg` | 主版本。浅色背景、应用图标、favicon |
| `taudesign-mark-dark.svg` | 深色界面用。底板提亮至 `#3B82F6`，字形用界面底色 `#0F172A` |
| `taudesign-mark-mono.svg` | 单色版。底板取 `currentColor`，字形挖空透底；用于印刷、水印、单色场景 |
| `taudesign-icon-macos.svg` | macOS 应用图标。按苹果比例（内容占 82%、圆角 22.5%）留边，勿用于其他场合 |

界面内使用 `src/components/common/BrandMark.tsx`，它内联同一份几何，跟随尺寸与配色。

## 几何

64 网格。底板 `x=3 y=3 w=58 h=58 rx=17`；字形为两条描边路径，
`stroke-width=9`、`linecap=round`，横笔 `M17 21H47`，竖笔带钩 `M32 21v13.5c0 5.1 2.8 7.7 6.4 7.7`。
改尺寸只缩放，**不要单独调笔画粗细**——9/64 这个比例是让 16px 下笔画不断的下限。

## 颜色

| 角色 | 值 | 来源 |
|---|---|---|
| 主色（底板） | `#2563EB` | 默认主题 `primary.500`，与产品界面同源 |
| 深色底板 | `#3B82F6` | `primary` 提亮一档，保证在 `#0F172A` 上的对比 |
| 字形 | `#F8FAFC` / `#0F172A` | 界面前景色与底色 |

**不要**给标记加渐变、外发光或投影渐变。工作台界面本身信息密度已经很高，
标记靠形体而非效果取得辨识度。

## 字标 (Wordmark)

字标不提供 SVG——把字轮廓化会让它无法随品牌字体更新，且在不装字体的机器上静默走样。
它应当在 HTML/CSS 里排出来：

- 字体：**Space Grotesk**，字重 600
- 字距：`letter-spacing: -0.02em`
- 大小写：`TauDesign`（T 与 D 大写，中间连写，不加空格与连字符）
- 与标记的间距：标记高度的 **0.4 倍**

```html
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600&display=swap" rel="stylesheet">

<span style="display:inline-flex;align-items:center;gap:14px">
  <img src="taudesign-mark.svg" width="36" height="36" alt="">
  <span style="font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:27px;letter-spacing:-0.02em;color:#0F172A">TauDesign</span>
</span>
```

## 生成的图标

`src-tauri/icons/` 下的全部图标与 `public/favicon.svg` 均由本目录的 SVG 生成，
**不要手工编辑那些 PNG**。改了 SVG 之后重新生成：

```bash
bash scripts/gen-icons.sh
```

脚本按用途分流：`.icns` 用苹果比例版（Dock 里才和邻居等大），
Windows、Linux 与 favicon 用满版。

> ⚠️ 不要用 `magick a.png b.png ... out.ico` 组装 `.ico`——ImageMagick 会把各帧
> 存成未压缩位图，同样内容能从 12KB 膨胀到 300KB。脚本里按 ICO 规范手工组装，
> payload 直接放 PNG 字节。

依赖：`rsvg-convert`（`brew install librsvg`）、`iconutil`（macOS 自带，仅 `.icns` 需要）、`python3`（组装 `.ico`）。
