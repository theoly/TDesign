import React, { useEffect, useRef, useState } from 'react';
import { Screen } from '../../types/project';
import { compileTokensToCss } from '../../utils/cssCompiler';
import { getBaseCss } from '../../styles/baseCss';
import { NidEngine } from '../../utils/nidEngine';
import { inspectText, setTextByNid } from '../../utils/textNode';
import { useProjectStore } from '../../stores/useProjectStore';
import { Copy, Edit2, Sparkles } from 'lucide-react';

interface ScreenFrameProps {
  screen: Screen;
  lodLevel: 0 | 1 | 2; // 0=bitmap proxy, 1=frozen iframe, 2=active iframe
  isStaged?: boolean;
  /** T-AE-26: 触发单画框 AI 质感润色 */
  onPolish?: (screenId: string) => void;
}

export const ScreenFrame: React.FC<ScreenFrameProps> = ({ screen, lodLevel, isStaged, onPolish }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number>(screen.measuredHeight || 800);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [nameInput, setNameInput] = useState(screen.name);

  const {
    settings,
    designSystem,
    activeScreenId,
    selectedNid,
    hoveredNid,
    overrides,
    setActiveScreen,
    selectNode,
    setHoveredNid,
    updateScreen,
    updateScreenHtml,
    removeScreen,
    renameScreen,
    duplicateScreen
  } = useProjectStore();

  const isActive = activeScreenId === screen.id;
  const frameWidth = settings.frameWidth;
  const showGuide = settings.showViewportGuide;
  const guideHeight = settings.viewportGuideHeight;

  // Compile Tokens for this frame
  const tokensCss = compileTokensToCss(designSystem.tokens, settings.colorMode);

  /**
   * 画框壳与 L0 占位层的底色必须跟随当前明暗模式 (ISSUE-014)。
   * 此前二者写死 #ffffff / bg-slate-100，深色模式下画框在 iframe 绘制完成前
   * 以及整个 L0 降级档位都是一块白板，用户直观看到的就是「新建页面不遵循主题」。
   */
  const frameBg =
    settings.colorMode === 'light'
      ? designSystem.tokens.colors.background.light
      : designSystem.tokens.colors.background.dark;
  const frameFg =
    settings.colorMode === 'light'
      ? designSystem.tokens.colors.textSecondary.light
      : designSystem.tokens.colors.textSecondary.dark;

  // Compile L4 Overrides for this screen
  const screenOverrides = Object.entries(overrides)
    .filter(([key]) => key.startsWith(`${screen.id}:`))
    .map(([key, ov]) => {
      const declarationsStr = Object.entries(ov.declarations)
        .map(([prop, val]) => `${prop}: ${val} !important;`)
        .join(' ');
      return `[data-nid="${ov.nid}"] { ${declarationsStr} }`;
    })
    .join('\n');

  /**
   * 编辑器 chrome 样式：选中/悬浮描边。
   * 刻意**不放入 base.css**——它不是设计系统的一部分，
   * 进入权威源会污染类名白名单并泄漏到导出产物 (T-AE-02)。
   */
  const editorChromeCss = `
    .aidesign-hovered {
      outline: 2px dashed #3b82f6 !important;
      outline-offset: 1px;
    }
    .aidesign-selected {
      outline: 2px solid #2563eb !important;
      outline-offset: 2px;
      box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.2) !important;
    }
  `;

  // Construct full frame document (preserve existing nids if already injected)
  const htmlWithNids = screen.htmlContent.includes('data-nid=')
    ? screen.htmlContent
    : NidEngine.injectNids(screen.htmlContent);

  useEffect(() => {
    if (!screen.htmlContent.includes('data-nid=')) {
      updateScreen(screen.id, { htmlContent: htmlWithNids });
    }
  }, [screen.htmlContent, screen.id, htmlWithNids, updateScreen]);

  const fullSrcDoc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style id="base-css">${getBaseCss(settings.deviceProfile)}</style>
  <style id="editor-chrome">${editorChromeCss}</style>
  <style id="tokens">${tokensCss}</style>
  <style id="overrides">${screenOverrides}</style>
  <style id="frame-fill">html { background-color: var(--color-bg, #f8fafc); }</style>
</head>
<body>
  ${htmlWithNids}
</body>
</html>`;

  // Hot update Tokens when theme changes (under 100ms, no DOM rebuild)
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument) return;
    const tokensEl = iframe.contentDocument.getElementById('tokens');
    if (tokensEl) {
      tokensEl.textContent = tokensCss;
    }
  }, [tokensCss]);

  // Hot update Overrides
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument) return;
    const overridesEl = iframe.contentDocument.getElementById('overrides');
    if (overridesEl) {
      overridesEl.textContent = screenOverrides;
    }
  }, [screenOverrides]);

  // Host Direct DOM Event Binding (Same-origin sandbox)
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let cleanupListeners: (() => void) | null = null;

    const handleLoad = () => {
      const doc = iframe.contentDocument;
      if (!doc || !doc.body) return;

      if (cleanupListeners) {
        cleanupListeners();
      }

      // Measure content height (D13)
      const h = Math.max(doc.body.scrollHeight, 700);
      setMeasuredHeight(h);
      if (h !== screen.measuredHeight) {
        updateScreen(screen.id, { measuredHeight: h });
      }

      // Mouse Hover listener
      const onMouseOver = (e: MouseEvent) => {
        e.stopPropagation();
        const target = (e.target as HTMLElement).closest('[data-nid]');
        if (target) {
          const nid = target.getAttribute('data-nid');
          setHoveredNid(nid);
        }
      };

      const onMouseOut = () => {
        setHoveredNid(null);
      };

      // Mouse Click listener
      const onClick = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setActiveScreen(screen.id);

        const target = (e.target as HTMLElement).closest('[data-nid]') as HTMLElement;
        if (target) {
          const nid = target.getAttribute('data-nid') || '';
          const compEl = target.closest('[data-component-id]') as HTMLElement | null;
          const componentId = compEl ? compEl.getAttribute('data-component-id') || undefined : undefined;
          const componentInstanceId = compEl ? compEl.getAttribute('data-component-instance') || undefined : undefined;

          // Collect parent chain for breadcrumb navigation (PRD §3.6.1)
          const parentChain: { nid: string; tagName: string; className?: string }[] = [];
          let cur = target.parentElement;
          while (cur && cur !== doc.body) {
            const pNid = cur.getAttribute('data-nid');
            if (pNid) {
              parentChain.unshift({
                nid: pNid,
                tagName: cur.tagName.toLowerCase(),
                className: cur.className
              });
            }
            cur = cur.parentElement;
          }

          const rect = target.getBoundingClientRect();
          const style = window.getComputedStyle(target);

          selectNode({
            screenId: screen.id,
            nid,
            tagName: target.tagName.toLowerCase(),
            ...(() => {
              const t = inspectText(target);
              return { textContent: t.text, textEditable: t.editable, textReason: t.reason };
            })(),
            classNames: Array.from(target.classList),
            parentChain,
            componentId,
            componentInstanceId,
            computedBox: {
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              top: Math.round(rect.top),
              left: Math.round(rect.left),
              padding: {
                top: parseInt(style.paddingTop, 10) || 0,
                right: parseInt(style.paddingRight, 10) || 0,
                bottom: parseInt(style.paddingBottom, 10) || 0,
                left: parseInt(style.paddingLeft, 10) || 0
              },
              margin: {
                top: parseInt(style.marginTop, 10) || 0,
                right: parseInt(style.marginRight, 10) || 0,
                bottom: parseInt(style.marginBottom, 10) || 0,
                left: parseInt(style.marginLeft, 10) || 0
              }
            }
          });
        }
      };

      // Double-click listener for inline text editing (PRD §3.6.1)
      const onDblClick = (e: MouseEvent) => {
        const target = (e.target as HTMLElement).closest('[data-nid]') as HTMLElement;
        if (!target) return;
        if (inspectText(target).editable) {
          e.preventDefault();
          e.stopPropagation();
          target.contentEditable = 'true';
          target.focus();

          const finishEditing = () => {
            target.contentEditable = 'false';
            const newText = (target.textContent ?? '').trim();
            const nid = target.getAttribute('data-nid');
            if (nid && newText) {
              const nextHtml = setTextByNid(screen.htmlContent, nid, newText);
              if (nextHtml) {
                updateScreenHtml(screen.id, nextHtml, `行内编辑: ${newText.slice(0, 10)}`);
              }
            }
          };

          target.addEventListener('blur', finishEditing, { once: true });
          target.addEventListener('keydown', (ke: KeyboardEvent) => {
            if (ke.key === 'Enter') {
              ke.preventDefault();
              target.blur();
            } else if (ke.key === 'Escape') {
              ke.preventDefault();
              target.contentEditable = 'false';
            }
          });
        }
      };

      doc.body.addEventListener('mouseover', onMouseOver);
      doc.body.addEventListener('mouseout', onMouseOut);
      doc.body.addEventListener('click', onClick);
      doc.body.addEventListener('dblclick', onDblClick);

      cleanupListeners = () => {
        if (doc && doc.body) {
          doc.body.removeEventListener('mouseover', onMouseOver);
          doc.body.removeEventListener('mouseout', onMouseOut);
          doc.body.removeEventListener('click', onClick);
          doc.body.removeEventListener('dblclick', onDblClick);
        }
      };
    };

    if (iframe.contentDocument && iframe.contentDocument.body) {
      handleLoad();
    }

    iframe.addEventListener('load', handleLoad);
    return () => {
      iframe.removeEventListener('load', handleLoad);
      if (cleanupListeners) {
        cleanupListeners();
      }
    };
    // lodLevel 必须在依赖内 (ISSUE-014)：L0 档位根本不渲染 iframe，
    // 从 L0 回到 L1/L2 时 React 挂载的是一个**全新的 iframe 元素**，
    // 而旧元素上的监听器随之消失。若不在此重新绑定，画框将永久失去
    // 点选/悬浮/行内编辑能力，表现为「点了没反应、检查器显示未选中任何元素」。
  }, [screen.htmlContent, screen.id, lodLevel]);

  // Synchronize selection & hover highlights inside iframe
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument) return;
    const doc = iframe.contentDocument;

    // Clear old classes
    doc.querySelectorAll('.aidesign-selected').forEach(el => el.classList.remove('aidesign-selected'));
    doc.querySelectorAll('.aidesign-hovered').forEach(el => el.classList.remove('aidesign-hovered'));

    if (isActive && selectedNid) {
      const selectedEl = doc.querySelector(`[data-nid="${selectedNid}"]`);
      if (selectedEl) selectedEl.classList.add('aidesign-selected');
    }

    if (isActive && hoveredNid && hoveredNid !== selectedNid) {
      const hoveredEl = doc.querySelector(`[data-nid="${hoveredNid}"]`);
      if (hoveredEl) hoveredEl.classList.add('aidesign-hovered');
    }
  }, [selectedNid, hoveredNid, isActive, lodLevel]);

  // 按住画框顶栏拖动位置 (PRD §3.3.2)。世界坐标位移 = 屏幕位移 / 画板缩放比
  const handleTitleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || isEditingName) return;
    e.stopPropagation(); // 避免触发画板自身的平移
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: screen.position.x,
      originY: screen.position.y
    };
    setIsDragging(true);

    // 用 getState 读取而非订阅 viewportTransform——订阅会让每次平移缩放
    // 都重渲染全部画框，直接抵消 LOD 调度的收益
    const scale = useProjectStore.getState().viewportTransform.scale || 1;
    let moved = false;

    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = (ev.clientX - d.startX) / scale;
      const dy = (ev.clientY - d.startY) / scale;
      if (!moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return; // 容忍点击时的微小抖动
      moved = true;
      updateScreen(screen.id, {
        position: { x: Math.round(d.originX + dx), y: Math.round(d.originY + dy) }
      });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      dragRef.current = null;
      setIsDragging(false);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      ref={containerRef}
      className={`absolute transition-shadow duration-200 select-none ${
        isStaged
          ? 'ring-4 ring-purple-500 shadow-2xl rounded-xl'
          : isActive
          ? 'ring-2 ring-blue-500 shadow-xl rounded-lg'
          : 'ring-1 ring-slate-700 hover:ring-slate-500 shadow-md rounded-lg'
      }`}
      style={{
        left: `${screen.position.x}px`,
        top: `${screen.position.y}px`,
        width: `${frameWidth}px`,
        height: `${measuredHeight + 36}px`,
        background: frameBg
      }}
      onClick={() => setActiveScreen(screen.id)}
    >
      {/* 画框顶栏：唯一的拖动热区 (PRD §3.3.2) */}
      <div
        onMouseDown={handleTitleMouseDown}
        className={`h-9 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs text-slate-300 rounded-t-lg ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        title="按住拖动可调整画框位置"
      >
        <div className="flex items-center gap-2 font-medium">
          <span className={`w-2 h-2 rounded-full ${isStaged ? 'bg-purple-400 animate-pulse' : isActive ? 'bg-blue-500' : 'bg-slate-600'}`} />
          {isEditingName ? (
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={() => {
                setIsEditingName(false);
                if (nameInput.trim() && nameInput !== screen.name) {
                  renameScreen(screen.id, nameInput.trim());
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setIsEditingName(false);
                  if (nameInput.trim() && nameInput !== screen.name) {
                    renameScreen(screen.id, nameInput.trim());
                  }
                } else if (e.key === 'Escape') {
                  setIsEditingName(false);
                  setNameInput(screen.name);
                }
              }}
              className="bg-slate-950 border border-blue-500 rounded px-1.5 py-0.5 text-xs text-white outline-none w-36"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditingName(true);
              }}
              className="cursor-pointer hover:text-white"
              title="双击重命名画框"
            >
              {screen.name}
            </span>
          )}
          <span className="text-slate-500 font-mono">({frameWidth}px)</span>
          {isStaged && <span className="bg-purple-900/60 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded text-[10px]">AI 新方案比选</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-400 font-mono mr-1">LOD {lodLevel}</span>
          {!isStaged && (
            <>
              {/* T-AE-26: 样张页是设计系统的投影，改它应该去改 Token，不接受 AI 改写 */}
              {screen.metadata?.kind !== 'specimen' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPolish?.(screen.id);
                  }}
                  className="text-slate-400 hover:text-amber-400 p-1 rounded hover:bg-slate-800 transition"
                  title="AI 质感润色：保持结构与文案不变，只提升视觉表现"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  duplicateScreen(screen.id);
                }}
                className="text-slate-400 hover:text-blue-400 p-1 rounded hover:bg-slate-800 transition"
                title="复制画框 (PRD §3.3.2)"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditingName(true);
                }}
                className="text-slate-400 hover:text-blue-400 p-1 rounded hover:bg-slate-800 transition"
                title="重命名画框"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`确定删除画框 "${screen.name}" 吗？`)) {
                    removeScreen(screen.id);
                  }
                }}
                className="text-slate-400 hover:text-red-400 p-1 rounded hover:bg-slate-800 transition text-sm leading-none"
                title="删除画框"
              >
                ×
              </button>
            </>
          )}
        </div>
      </div>

      {/* Artboard Content */}
      <div className="relative w-full overflow-hidden" style={{ height: `${measuredHeight}px` }}>
        {lodLevel === 0 ? (
          // L0 Bitmap Proxy
          <div
            className="w-full h-full flex flex-col items-center justify-center text-sm font-mono"
            style={{ background: frameBg, color: frameFg }}
          >
            <span>[L0 位图降级缩略视图]</span>
            <span className="text-xs opacity-70">{screen.name}</span>
          </div>
        ) : (
          // L1 (Frozen) or L2 (Active) Iframe
          <iframe
            ref={iframeRef}
            srcDoc={fullSrcDoc}
            sandbox="allow-same-origin"
            className="w-full h-full border-none block"
            style={{
              pointerEvents: lodLevel === 2 ? 'auto' : 'none'
            }}
            title={screen.name}
          />
        )}

        {/* Device Viewport Guide (D13: 首屏虚线参考) */}
        {showGuide && guideHeight < measuredHeight && (
          <div
            className="absolute left-0 right-0 border-b-2 border-dashed border-rose-500/70 pointer-events-none z-30 flex items-center justify-end px-3"
            style={{ top: `${guideHeight}px` }}
          >
            <span className="bg-rose-600/90 text-white text-[10px] font-semibold px-2 py-0.5 rounded shadow">
              {settings.deviceProfile.toUpperCase()} 首屏折线 ({guideHeight}px)
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
