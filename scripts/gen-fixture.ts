import fs from 'node:fs';
import path from 'node:path';

// Parse command line arguments
const args = process.argv.slice(2);
let targetNodes = 800;
let targetImages = 10;
let outPath = 'fixtures/std-800.html';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--nodes' && args[i + 1]) targetNodes = parseInt(args[i + 1], 10);
  if (args[i] === '--images' && args[i + 1]) targetImages = parseInt(args[i + 1], 10);
  if (args[i] === '--out' && args[i + 1]) outPath = args[i + 1];
}

// Generate an inline SVG icon (Lucide-like)
function createSvgIcon(name: string, index: number): string {
  const icons = [
    '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', // clock
    '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', // user
    '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>', // star
    '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>', // grid
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', // message
    '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>', // activity
    '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>', // briefcase
    '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>', // dollar-sign
  ];
  const inner = icons[index % icons.length];
  return `<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="${name}">${inner}</svg>`;
}

// Generate data URLs for images (including large >= 1MB data URLs)
function createDataUrl(isLarge: boolean, idx: number): string {
  if (isLarge) {
    // Generate ~1.1MB base64 data URL
    const size = 1024 * 850; // ~850KB raw -> ~1.13MB base64
    const buffer = Buffer.alloc(size, (idx * 37) % 255);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  }
  // Standard SVG data URL for crisp rendering
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
    <defs>
      <linearGradient id="g${idx}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#3b82f6"/>
        <stop offset="100%" stop-color="#8b5cf6"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g${idx})"/>
    <text x="50%" y="50%" fill="#ffffff" font-family="sans-serif" font-size="16" font-weight="bold" text-anchor="middle" dominant-baseline="middle">Sample Image ${idx + 1}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Pre-create images
const images: string[] = [];
for (let i = 0; i < targetImages; i++) {
  // First 2 images are >= 1MB as required by PRD
  images.push(createDataUrl(i < 2, i));
}

let nodeCount = 0;
let flexGridCount = 0;
let textCount = 0;
let shadowRadiusGradientCount = 0;
let svgIconCount = 0;

function buildPage(target: number): string {
  let bodyContent = '';

  // Navbar (Flex container + shadow + rounded)
  bodyContent += `
    <header class="navbar row items-center justify-between shadow-md">
      <div class="row items-center gap-3">
        <div class="logo r-md bg-gradient-brand row items-center justify-center">
          ${createSvgIcon('brand', svgIconCount++)}
        </div>
        <span class="text-lg font-bold brand-title">StudioMetrics Pro</span>
      </div>
      <nav class="row items-center gap-4 nav-links">
        <a href="#dash" class="nav-item row items-center gap-1 active">
          ${createSvgIcon('nav-dash', svgIconCount++)}
          <span>仪表盘</span>
        </a>
        <a href="#analytics" class="nav-item row items-center gap-1">
          ${createSvgIcon('nav-chart', svgIconCount++)}
          <span>数据分析</span>
        </a>
        <a href="#team" class="nav-item row items-center gap-1">
          ${createSvgIcon('nav-team', svgIconCount++)}
          <span>团队成员</span>
        </a>
        <a href="#settings" class="nav-item row items-center gap-1">
          ${createSvgIcon('nav-settings', svgIconCount++)}
          <span>系统设置</span>
        </a>
      </nav>
      <div class="row items-center gap-3">
        <button class="btn btn-ghost row items-center gap-1">
          ${createSvgIcon('bell', svgIconCount++)}
          <span>消息</span>
          <span class="badge bg-danger r-full text-xs">3</span>
        </button>
        <div class="avatar r-full shadow-sm">
          <img src="${images[2 % images.length]}" alt="User Avatar" class="r-full" />
        </div>
      </div>
    </header>
  `;
  nodeCount += 35;
  flexGridCount += 12;
  textCount += 12;
  shadowRadiusGradientCount += 8;

  // Hero / Metrics Bar
  bodyContent += `
    <section class="metrics-grid grid-4 gap-4 mt-4">
      <div class="card p-4 r-lg shadow-sm bg-surface row items-center justify-between">
        <div class="col gap-1">
          <span class="text-sm text-muted">本月总活跃用户</span>
          <h2 class="text-3xl font-bold">128,450</h2>
          <span class="text-xs text-success row items-center gap-1">↑ 14.8% 环比增长</span>
        </div>
        <div class="metric-icon p-3 r-md bg-primary-light">
          ${createSvgIcon('user-stat', svgIconCount++)}
        </div>
      </div>
      <div class="card p-4 r-lg shadow-sm bg-surface row items-center justify-between">
        <div class="col gap-1">
          <span class="text-sm text-muted">线上实时订单</span>
          <h2 class="text-3xl font-bold">3,892</h2>
          <span class="text-xs text-success row items-center gap-1">↑ 8.2% 保持增长</span>
        </div>
        <div class="metric-icon p-3 r-md bg-accent-light">
          ${createSvgIcon('order-stat', svgIconCount++)}
        </div>
      </div>
      <div class="card p-4 r-lg shadow-sm bg-surface row items-center justify-between">
        <div class="col gap-1">
          <span class="text-sm text-muted">平均转化率</span>
          <h2 class="text-3xl font-bold">4.62%</h2>
          <span class="text-xs text-warning row items-center gap-1">↓ 0.4% 波动区间</span>
        </div>
        <div class="metric-icon p-3 r-md bg-warning-light">
          ${createSvgIcon('rate-stat', svgIconCount++)}
        </div>
      </div>
      <div class="card p-4 r-lg shadow-sm bg-surface row items-center justify-between">
        <div class="col gap-1">
          <span class="text-sm text-muted">累计总营收</span>
          <h2 class="text-3xl font-bold">¥ 842,900</h2>
          <span class="text-xs text-success row items-center gap-1">↑ 22.4% 达成目标</span>
        </div>
        <div class="metric-icon p-3 r-md bg-success-light">
          ${createSvgIcon('rev-stat', svgIconCount++)}
        </div>
      </div>
    </section>
  `;
  nodeCount += 48;
  flexGridCount += 16;
  textCount += 20;
  shadowRadiusGradientCount += 12;

  // Main Dashboard Sections with Cards, Tables, Grids, and Lists
  let sectionIndex = 0;
  while (nodeCount < target - 60) {
    sectionIndex++;
    const img1 = images[sectionIndex % images.length];
    const img2 = images[(sectionIndex + 1) % images.length];

    bodyContent += `
      <section class="dashboard-module grid-2 gap-4 mt-4">
        <!-- Module Card Left -->
        <div class="card p-5 r-xl shadow-md bg-surface col gap-4">
          <div class="row items-center justify-between border-b pb-3">
            <div class="row items-center gap-2">
              <span class="section-indicator r-sm bg-primary"></span>
              <h3 class="text-lg font-semibold">业务指标监控板块 #${sectionIndex}</h3>
            </div>
            <div class="row items-center gap-2">
              <button class="btn btn-sm btn-ghost r-md">导出报告</button>
              <button class="btn btn-sm btn-primary r-md row items-center gap-1">
                ${createSvgIcon('action', svgIconCount++)}
                <span>配置策略</span>
              </button>
            </div>
          </div>
          
          <div class="banner-preview r-lg shadow-inner overflow-hidden">
            <img src="${img1}" alt="Banner ${sectionIndex}" class="full-img" />
          </div>

          <div class="grid-3 gap-3">
            <div class="sub-stat p-3 r-md bg-muted-light col gap-1">
              <span class="text-xs text-muted">Q1 预算进度</span>
              <span class="text-md font-bold">78.5%</span>
              <div class="progress-bar r-full bg-muted overflow-hidden">
                <div class="progress-fill r-full bg-primary" style="width: 78.5%; height: 6px;"></div>
              </div>
            </div>
            <div class="sub-stat p-3 r-md bg-muted-light col gap-1">
              <span class="text-xs text-muted">服务健康度</span>
              <span class="text-md font-bold text-success">99.98%</span>
              <div class="progress-bar r-full bg-muted overflow-hidden">
                <div class="progress-fill r-full bg-success" style="width: 99.9%; height: 6px;"></div>
              </div>
            </div>
            <div class="sub-stat p-3 r-md bg-muted-light col gap-1">
              <span class="text-xs text-muted">告警响应时延</span>
              <span class="text-md font-bold">1.2 秒</span>
              <div class="progress-bar r-full bg-muted overflow-hidden">
                <div class="progress-fill r-full bg-accent" style="width: 45%; height: 6px;"></div>
              </div>
            </div>
          </div>

          <p class="text-sm text-secondary leading-relaxed">
            实时流量分布模型持续稳定运转中，当前集群节点利用率处于健康负载水位区间，自动化弹性扩缩容策略已处于预热待命状态。
          </p>
        </div>

        <!-- Module Card Right: List & Activity -->
        <div class="card p-5 r-xl shadow-md bg-surface col gap-4">
          <div class="row items-center justify-between border-b pb-3">
            <div class="row items-center gap-2">
              <span class="section-indicator r-sm bg-accent"></span>
              <h3 class="text-lg font-semibold">关键变更流水明细 #${sectionIndex}</h3>
            </div>
            <span class="badge bg-muted r-full text-xs">实时推送中</span>
          </div>

          <div class="activity-list col gap-2">
            <div class="list-item p-3 r-lg bg-surface-alt row items-center justify-between shadow-xs">
              <div class="row items-center gap-3">
                <div class="icon-bubble r-full p-2 bg-primary-light">
                  ${createSvgIcon('item-1', svgIconCount++)}
                </div>
                <div class="col">
                  <span class="text-sm font-medium">配置项变更核准 (PR #10${sectionIndex})</span>
                  <span class="text-xs text-muted">操作人：首席架构师 · 2 分钟前</span>
                </div>
              </div>
              <span class="tag r-md bg-success-light text-success text-xs">已生效</span>
            </div>

            <div class="list-item p-3 r-lg bg-surface-alt row items-center justify-between shadow-xs">
              <div class="row items-center gap-3">
                <div class="icon-bubble r-full p-2 bg-accent-light">
                  ${createSvgIcon('item-2', svgIconCount++)}
                </div>
                <div class="col">
                  <span class="text-sm font-medium">数据管道例行批处理完成</span>
                  <span class="text-xs text-muted">吞吐量：42,100 条/秒 · 8 分钟前</span>
                </div>
              </div>
              <span class="tag r-md bg-primary-light text-primary text-xs">成功</span>
            </div>

            <div class="list-item p-3 r-lg bg-surface-alt row items-center justify-between shadow-xs">
              <div class="row items-center gap-3">
                <div class="icon-bubble r-full p-2 bg-warning-light">
                  ${createSvgIcon('item-3', svgIconCount++)}
                </div>
                <div class="col">
                  <span class="text-sm font-medium">第三方 API 延时超阈值告警</span>
                  <span class="text-xs text-muted">自动切换主备线路 · 15 分钟前</span>
                </div>
              </div>
              <span class="tag r-md bg-warning-light text-warning text-xs">自动恢复</span>
            </div>
          </div>

          <div class="footer-thumbnail row items-center gap-3 mt-2">
            <div class="thumb-box r-md overflow-hidden shadow-sm" style="width: 80px; height: 50px;">
              <img src="${img2}" alt="Thumb" class="full-img" />
            </div>
            <div class="col gap-1">
              <span class="text-xs font-semibold">附带监控快照索引 #${sectionIndex}</span>
              <span class="text-xs text-muted">哈希特征值: 0x9f8b21${sectionIndex}c7a</span>
            </div>
          </div>
        </div>
      </section>
    `;
    nodeCount += 75;
    flexGridCount += 24;
    textCount += 28;
    shadowRadiusGradientCount += 18;
  }

  // Footer Section
  bodyContent += `
    <footer class="footer p-6 mt-6 border-t row items-center justify-between text-muted text-sm">
      <div class="row items-center gap-2">
        ${createSvgIcon('footer-logo', svgIconCount++)}
        <span>© 2026 StudioMetrics System. All rights reserved.</span>
      </div>
      <div class="row items-center gap-4">
        <a href="#privacy" class="hover-underline">隐私条款</a>
        <a href="#security" class="hover-underline">安全合规</a>
        <a href="#docs" class="hover-underline">API 开发者文档</a>
      </div>
    </footer>
  `;
  nodeCount += 18;
  flexGridCount += 4;
  textCount += 6;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Benchmark Fixture (${targetNodes} Nodes)</title>
  <style id="tokens">
    :root {
      --color-primary: #2563eb;
      --color-primary-light: #dbeafe;
      --color-accent: #7c3aed;
      --color-accent-light: #ede9fe;
      --color-success: #16a34a;
      --color-success-light: #dcfce7;
      --color-warning: #d97706;
      --color-warning-light: #fef3c7;
      --color-danger: #dc2626;
      --color-bg: #f8fafc;
      --color-surface: #ffffff;
      --color-surface-alt: #f1f5f9;
      --color-text-primary: #0f172a;
      --color-text-secondary: #475569;
      --color-text-muted: #94a3b8;
      --color-border: #e2e8f0;
      --radius-sm: 4px;
      --radius-md: 8px;
      --radius-lg: 12px;
      --radius-xl: 16px;
      --radius-full: 9999px;
      --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
      --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
      --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
    }
  </style>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--color-bg);
      color: var(--color-text-primary);
      padding: 20px;
      line-height: 1.5;
    }
    .row { display: flex; flex-direction: row; position: relative; }
    .col { display: flex; flex-direction: column; position: relative; }
    .sticky-top { position: sticky; top: 0; z-index: 10; }
    .items-center { align-items: center; }
    .justify-between { justify-content: space-between; }
    .justify-center { justify-content: center; }
    .grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .grid-4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .gap-1 { gap: 4px; }
    .gap-2 { gap: 8px; }
    .gap-3 { gap: 12px; }
    .gap-4 { gap: 16px; }
    .p-2 { padding: 8px; }
    .p-3 { padding: 12px; }
    .p-4 { padding: 16px; }
    .p-5 { padding: 20px; }
    .p-6 { padding: 24px; }
    .pb-3 { padding-bottom: 12px; }
    .mt-2 { margin-top: 8px; }
    .mt-4 { margin-top: 16px; }
    .mt-6 { margin-top: 24px; }
    .r-sm { border-radius: var(--radius-sm); }
    .r-md { border-radius: var(--radius-md); }
    .r-lg { border-radius: var(--radius-lg); }
    .r-xl { border-radius: var(--radius-xl); }
    .r-full { border-radius: var(--radius-full); }
    .shadow-xs { box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
    .shadow-sm { box-shadow: var(--shadow-sm); }
    .shadow-md { box-shadow: var(--shadow-md); }
    .shadow-inner { box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.06); }
    .bg-surface { background-color: var(--color-surface); }
    .bg-surface-alt { background-color: var(--color-surface-alt); }
    .bg-primary { background-color: var(--color-primary); color: #fff; }
    .bg-primary-light { background-color: var(--color-primary-light); color: var(--color-primary); }
    .bg-accent { background-color: var(--color-accent); color: #fff; }
    .bg-accent-light { background-color: var(--color-accent-light); color: var(--color-accent); }
    .bg-success { background-color: var(--color-success); color: #fff; }
    .bg-success-light { background-color: var(--color-success-light); color: var(--color-success); }
    .bg-warning-light { background-color: var(--color-warning-light); color: var(--color-warning); }
    .bg-danger { background-color: var(--color-danger); color: #fff; }
    .bg-muted { background-color: var(--color-border); }
    .bg-muted-light { background-color: #f8fafc; border: 1px solid var(--color-border); }
    .bg-gradient-brand { background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%); color: #fff; width: 36px; height: 36px; }
    .border-b { border-bottom: 1px solid var(--color-border); }
    .border-t { border-top: 1px solid var(--color-border); }
    .text-xs { font-size: 12px; }
    .text-sm { font-size: 14px; }
    .text-md { font-size: 15px; }
    .text-lg { font-size: 18px; }
    .text-3xl { font-size: 28px; }
    .font-medium { font-weight: 500; }
    .font-semibold { font-weight: 600; }
    .font-bold { font-weight: 700; }
    .text-muted { color: var(--color-text-muted); }
    .text-secondary { color: var(--color-text-secondary); }
    .text-success { color: var(--color-success); }
    .text-warning { color: var(--color-warning); }
    .text-primary { color: var(--color-primary); }
    .btn { padding: 8px 16px; border: 1px solid transparent; cursor: pointer; font-size: 14px; font-weight: 500; }
    .btn-sm { padding: 4px 10px; font-size: 12px; }
    .btn-ghost { background: transparent; color: var(--color-text-secondary); border-color: var(--color-border); }
    .btn-primary { background: var(--color-primary); color: #fff; }
    .badge { padding: 2px 8px; font-size: 11px; font-weight: 600; }
    .tag { padding: 2px 8px; font-size: 12px; font-weight: 500; }
    .avatar { width: 36px; height: 36px; overflow: hidden; }
    .avatar img, .full-img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .overflow-hidden { overflow: hidden; }
    .section-indicator { width: 4px; height: 18px; display: inline-block; }
    .hover-underline { text-decoration: none; color: inherit; }
    .hover-underline:hover { text-decoration: underline; }
    .icon { display: inline-block; vertical-align: middle; }
    .navbar { padding: 12px 24px; background: var(--color-surface); border-radius: var(--radius-lg); }
    .nav-links a { text-decoration: none; color: var(--color-text-secondary); font-size: 14px; font-weight: 500; padding: 6px 12px; border-radius: var(--radius-md); }
    .nav-links a.active { background: var(--color-primary-light); color: var(--color-primary); }
  </style>
</head>
<body>
  ${bodyContent}
  <!-- Metrics validation meta -->
  <!-- Total generated nodes approx: ${nodeCount} -->
  <!-- Flex/Grid containers: ${flexGridCount} (${Math.round((flexGridCount / nodeCount) * 100)}%) -->
  <!-- Text elements: ${textCount} (${Math.round((textCount / nodeCount) * 100)}%) -->
  <!-- Shadow/Radius/Gradient: ${shadowRadiusGradientCount} -->
  <!-- SVG Icons: ${svgIconCount} -->
</body>
</html>`;
}

const html = buildPage(targetNodes);
const fullOutPath = path.resolve(outPath);
fs.mkdirSync(path.dirname(fullOutPath), { recursive: true });
fs.writeFileSync(fullOutPath, html, 'utf-8');

console.log(`Generated fixture: ${outPath}`);
console.log(`- Approx Nodes: ${nodeCount} (target: ${targetNodes})`);
console.log(`- Flex/Grid containers: ${flexGridCount} (${Math.round((flexGridCount / nodeCount) * 100)}% >= 30%)`);
console.log(`- Text elements: ${textCount} (${Math.round((textCount / nodeCount) * 100)}% >= 30%)`);
console.log(`- Shadow/Radius/Gradient occurrences: ${shadowRadiusGradientCount} (>= 50)`);
console.log(`- SVG Icons: ${svgIconCount} (>= 30)`);
console.log(`- Embedded Images: ${images.length} (including 2 >= 1MB)`);
console.log(`- File Size: ${(fs.statSync(fullOutPath).size / (1024 * 1024)).toFixed(2)} MB`);
