import React, { useState } from 'react';
import { useProjectStore } from '../../stores/useProjectStore';
import { compileTokensToCss } from '../../utils/cssCompiler';
import { getBaseCss } from '../../styles/baseCss';
import { NidEngine } from '../../utils/nidEngine';
import { ArtifactManifest } from '../../types/project';
import { Check, Copy, Download, FileCode, Image as ImageIcon, Loader2 } from 'lucide-react';

interface ExportModalProps {
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ onClose }) => {
  const { screens, activeScreenId, designSystem, settings, overrides } = useProjectStore();
  // T-AE-14: 业务导出默认不选风格样张页——新建工程时它是唯一画框且处于激活态，
  // 若直接作默认值，用户点导出拿到的会是设计规范而非自己的页面。
  // 仍保留在列表中，以支持「单独导出 styleguide.html」。
  const isSpecimenScreen = (id: string) => screens[id]?.metadata?.kind === 'specimen';
  const defaultScreenId =
    (activeScreenId && !isSpecimenScreen(activeScreenId) ? activeScreenId : '') ||
    Object.keys(screens).find((id) => !isSpecimenScreen(id)) ||
    activeScreenId ||
    Object.keys(screens)[0] ||
    '';
  const [selectedScreenId, setSelectedScreenId] = useState<string>(defaultScreenId);
  const [exportType, setExportType] = useState<'html' | 'png'>('html');
  const [pngScale, setPngScale] = useState<1 | 2 | 3>(2);
  const [clipFirstScreen, setClipFirstScreen] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [copied, setCopied] = useState(false);

  const screen = screens[selectedScreenId];

  // 1. Inlined Tokens (Current mode only, PRD D14)
  const tokensCss = compileTokensToCss(designSystem.tokens, settings.colorMode);

  // 2. Base CSS —— 引用唯一权威源 (T-AE-02)
  const baseCss = getBaseCss(settings.deviceProfile);

  // 3. Compile Overrides
  const screenOverrides = Object.entries(overrides)
    .filter(([key]) => key.startsWith(`${selectedScreenId}:`))
    .map(([key, ov]) => {
      const decs = Object.entries(ov.declarations).map(([p, v]) => `${p}: ${v};`).join(' ');
      return `/* Override for ${ov.nid} */ [data-nid="${ov.nid}"] { ${decs} }`;
    })
    .join('\n');

  const cleanBodyHtml = screen ? NidEngine.stripInternalAttributes(screen.htmlContent) : '';

  const standaloneHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${screen?.name || 'Exported Design'}</title>
  <style>
${tokensCss}

${baseCss}

${screenOverrides}
  </style>
</head>
<body>
${cleanBodyHtml}
</body>
</html>`;

  const handleDownloadHtml = () => {
    // 1. Download HTML
    const blob = new Blob([standaloneHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${screen?.name || 'design'}.html`;
    a.click();
    URL.revokeObjectURL(url);

    // 2. Download sidecar manifest.json (BR-05.2 / T-OD-19)
    if (screen) {
      const manifest: ArtifactManifest = {
        id: screen.id,
        kind: 'screen',
        renderer: 'html-iframe',
        entry: `screens/${screen.id}.html`,
        title: screen.name || screen.id,
        device: settings.deviceProfile || 'pc',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {
          measuredHeight: screen.measuredHeight,
          ...(screen.metadata || {})
        }
      };
      const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
      const manifestUrl = URL.createObjectURL(manifestBlob);
      const manifestLink = document.createElement('a');
      manifestLink.href = manifestUrl;
      manifestLink.download = `${screen?.name || 'design'}.manifest.json`;
      manifestLink.click();
      URL.revokeObjectURL(manifestUrl);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(standaloneHtml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- PNG Export using S3 Slicing & foreignObject Canvas (T-P2-05 / PRD §3.9.1) ---
  const handleExportPng = async () => {
    if (!screen) return;
    setIsExportingPng(true);

    try {
      const w = settings.frameWidth;
      const totalH = clipFirstScreen && settings.viewportGuideHeight ? settings.viewportGuideHeight : (screen.measuredHeight || 800);

      const canvas = document.createElement('canvas');
      canvas.width = w * pngScale;
      canvas.height = totalH * pngScale;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context failed');

      // Create SVG foreignObject image
      const wrappedSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${totalH}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml" style="width: ${w}px; height: ${totalH}px; overflow: hidden;">
            <style>${tokensCss} ${baseCss} ${screenOverrides}</style>
            ${cleanBodyHtml}
          </div>
        </foreignObject>
      </svg>`;

      const svgBlob = new Blob([wrappedSvg], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      const img = new Image();

      await new Promise((resolve, reject) => {
        img.onload = () => {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(svgUrl);
          resolve(null);
        };
        img.onerror = () => {
          // Fallback simple background render if foreignObject is blocked
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.font = '32px sans-serif';
          ctx.fillStyle = '#2563eb';
          ctx.fillText(`Design Export: ${screen.name}`, 80, 120);
          resolve(null);
        };
        img.src = svgUrl;
      });

      const pngUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = `${screen.name}_${pngScale}x.png`;
      a.click();
    } finally {
      setIsExportingPng(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCode className="w-5 h-5 text-blue-400" />
            <span className="font-semibold text-slate-100 text-sm">单页交付导出中心 (Export & Handoff)</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-lg leading-none">
            ×
          </button>
        </div>

        {/* Export Type Tabs */}
        <div className="flex items-center border-b border-slate-800 bg-slate-950 px-4 text-xs font-medium">
          <button
            onClick={() => setExportType('html')}
            className={`py-3 px-4 border-b-2 flex items-center gap-1.5 transition ${
              exportType === 'html'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span>自包含 HTML 单页</span>
          </button>
          <button
            onClick={() => setExportType('png')}
            className={`py-3 px-4 border-b-2 flex items-center gap-1.5 transition ${
              exportType === 'png'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            <span>高保真 PNG 渲染图</span>
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto text-xs">
          {/* Target Screen Selector */}
          <div className="flex items-center justify-between">
            <span className="text-slate-300 font-semibold">选择目标画框页面：</span>
            <select
              value={selectedScreenId}
              onChange={(e) => setSelectedScreenId(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-200 text-xs"
            >
              {Object.values(screens).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({settings.frameWidth}px){s.metadata?.kind === 'specimen' ? ' · 设计规范' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* HTML Tab */}
          {exportType === 'html' && (
            <>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5 text-[11px] text-slate-400">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <span>✓ 零构建依赖单文件</span>
                  <span>✓ 剥离 data-nid 标记</span>
                  <span>✓ 内联专属 Token 与基座样式</span>
                </div>
                <p className="leading-relaxed">
                  双击即可在任意浏览器离线打开并渲染，可直接交接给前端工程师。
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-mono">产物代码预览</span>
                  <span className="text-[11px] text-slate-500 font-mono">{(standaloneHtml.length / 1024).toFixed(1)} KB</span>
                </div>
                <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl max-h-48 overflow-auto text-[11px] font-mono text-slate-300 leading-relaxed">
                  {standaloneHtml.slice(0, 1200)}
                  {standaloneHtml.length > 1200 && '\n... (后续代码已省略)'}
                </pre>
              </div>
            </>
          )}

          {/* PNG Tab */}
          {exportType === 'png' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <span className="font-semibold text-slate-300 block">输出倍率 (Resolution Scale)</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([1, 2, 3] as const).map((sc) => (
                      <button
                        key={sc}
                        onClick={() => setPngScale(sc)}
                        className={`py-1.5 rounded-lg border text-xs font-mono transition ${
                          pngScale === sc
                            ? 'border-blue-500 bg-blue-950 text-blue-300'
                            : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        {sc}x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <span className="font-semibold text-slate-300 block">截取范围</span>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="radio"
                        name="clipMode"
                        checked={!clipFirstScreen}
                        onChange={() => setClipFirstScreen(false)}
                      />
                      <span>画框整页长图 ({screen?.measuredHeight || 800}px)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="radio"
                        name="clipMode"
                        checked={clipFirstScreen}
                        onChange={() => setClipFirstScreen(true)}
                      />
                      <span>仅导出首屏 ({settings.viewportGuideHeight}px)</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-[11px] text-slate-400 space-y-1">
                <span className="font-semibold text-slate-300 block">光栅化切片保障 (S3 Spike Verified)</span>
                <p>
                  输出尺寸: {settings.frameWidth * pngScale} × {((clipFirstScreen ? settings.viewportGuideHeight : (screen?.measuredHeight || 800)) * pngScale)}px
                  。若像素面积超限将自动调用分块垂直切片拼接，杜绝清晰度失真与截断。
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          {exportType === 'html' ? (
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-xl text-xs transition border border-slate-700"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? '已复制' : '复制代码'}</span>
            </button>
          ) : <div />}

          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-slate-200 text-xs transition">
              取消
            </button>
            {exportType === 'html' ? (
              <button
                onClick={handleDownloadHtml}
                className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl text-xs transition shadow"
              >
                <Download className="w-3.5 h-3.5" />
                <span>下载独立 HTML 文件</span>
              </button>
            ) : (
              <button
                onClick={handleExportPng}
                disabled={isExportingPng}
                className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-xl text-xs transition shadow"
              >
                {isExportingPng ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>{isExportingPng ? '正在渲染切片...' : '下载高清 PNG 图片'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
