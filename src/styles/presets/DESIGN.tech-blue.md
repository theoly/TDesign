# DESIGN SPECIFICATION · 现代科技质感 (tech-blue)

## 1. 设计哲学与基调 (Vision & Tone)
- **基调**: Linear / Stripe 工业科技风格，理性、精确、高保真。
- **视觉气质**: 靛蓝紫品牌主色配合弥散光晕微质感，沉着且具备现代 SaaS 产品的高端质感。
- **结构原则**: 清晰的信息分组，严谨的栅格对齐，克制的留白，高信息密度而不杂乱。

## 2. 60-30-10 配色法则 (Color Strategy)
- **60% 基础底色**:
  - 浅色模式使用 `--color-bg` (#f8fafc) 与 `--color-surface` (#ffffff) 构筑背景与卡片；
  - 深色模式使用 `--color-bg` (#090d16) 与 `--color-surface` (#0f172a)。
- **30% 结构层级**:
  - 正文采用 `--color-text-primary`，副文案采用 `--color-text-secondary`；
  - 容器描边采用 `--color-border-subtle`，保持边框极细微与高雅。
- **10% 品牌强化与行动点**:
  - 核心主操作按钮与聚焦状态必须且仅使用 `--color-primary` (#5e6ad2)；
  - 辅助高亮采用 `--color-primary-light` 与 `--shadow-glow`。

## 3. 排版节奏与信息密度 (Typography & Density)
- **字体与比例**: 无衬线系统字族，标题阶梯：页面大标 24px~30px，卡片标题 16px~18px，正文 14px，元数据 12px。
- **密度刻度**: 采用 `standard` 密度阶梯，容器标准内边距 `p-4` (16px) 或 `p-6` (24px)，元素间距推荐 `gap-3` (12px) 或 `gap-4` (16px)。
- **圆角**: 推荐使用 `--radius-md` (8px) 或 `--radius-lg` (12px)，赋予交互元素精细倒角。

## 4. 严禁事项与负面约束 (Negative Constraints)
- **严禁生硬重黑描边**: 杜绝使用 `#000000` 或非半透明的厚重边框，必须使用系统 `--color-border-subtle`。
- **严禁彩虹调色盘**: 除明确的状态通知（success/warning/danger）外，禁止在同一界面混用 3 种以上非衍生色。
- **严禁行内样式硬编码**: 绝对禁止使用 `style="background: ..."` 硬编码色值，必须完全使用类名与 CSS 变量。
- **严禁破坏设备边界**: PC 端必须包裹内容最大宽度居中容器，移动端禁止使用多列绝对横向排版。
