import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, History, Image as ImageIcon, Palette } from 'lucide-react';
import { ScreensPanel } from './panels/ScreensPanel';
import { AssetsPanel } from './panels/AssetsPanel';
import { DesignSystemPanel } from './panels/DesignSystemPanel';
import { HistoryPanel } from './panels/HistoryPanel';

export type SidebarView = 'screens' | 'assets' | 'design' | 'history';

const VIEWS: { key: SidebarView; icon: React.FC<{ className?: string }>; label: string }[] = [
  { key: 'screens', icon: FileText, label: '页面' },
  { key: 'assets', icon: ImageIcon, label: '资源' },
  { key: 'design', icon: Palette, label: '设计系统' },
  { key: 'history', icon: History, label: '历史' }
];

const MIN_WIDTH = 200;
const MAX_WIDTH = 420;

interface SideBarProps {
  onOpenAssetCenter: () => void;
  onOpenThemeEditor: () => void;
  /** T-AE-27: 批量风格重塑 */
  onOpenRestyle: () => void;
}

/**
 * VSCode 式左侧栏 (PRD §3.0.2 / §3.0.3 / D22)
 *
 * 活动栏图标互斥切换视图，再次点击当前项折叠整个侧边栏；
 * 侧边栏内容用折叠面板分组，宽度可拖拽。
 */
export const SideBar: React.FC<SideBarProps> = ({ onOpenAssetCenter, onOpenThemeEditor , onOpenRestyle }) => {
  const [view, setView] = useState<SidebarView>('screens');
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(260);
  const resizing = useRef(false);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!resizing.current) return;
    setWidth(Math.min(Math.max(e.clientX - 48, MIN_WIDTH), MAX_WIDTH));
  }, []);

  const stopResize = useCallback(() => {
    resizing.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', stopResize);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', stopResize);
    };
  }, [onMouseMove, stopResize]);

  const handleActivityClick = (key: SidebarView) => {
    if (key === view) {
      setCollapsed((c) => !c);
    } else {
      setView(key);
      setCollapsed(false);
    }
  };

  return (
    <div className="flex h-full shrink-0">
      {/* 活动栏 */}
      <div className="w-12 h-full bg-slate-950 border-r border-slate-850 flex flex-col items-center py-2 gap-1 z-20">
        {VIEWS.map((v) => {
          const active = v.key === view && !collapsed;
          return (
            <button
              key={v.key}
              onClick={() => handleActivityClick(v.key)}
              title={v.label}
              className={`relative w-10 h-10 flex items-center justify-center rounded-lg transition ${
                active ? 'text-blue-400 bg-slate-900' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {active && <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-blue-500 rounded-r" />}
              <v.icon className="w-5 h-5" />
            </button>
          );
        })}
      </div>

      {/* 侧边栏内容 */}
      {!collapsed && (
        <div className="relative h-full bg-slate-900 border-r border-slate-800 flex flex-col z-20" style={{ width }}>
          <div className="h-8 px-3 flex items-center border-b border-slate-800 shrink-0">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {VIEWS.find((v) => v.key === view)?.label}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {view === 'screens' && <ScreensPanel />}
            {view === 'assets' && <AssetsPanel onOpenAssetCenter={onOpenAssetCenter} />}
            {view === 'design' && <DesignSystemPanel onOpenThemeEditor={onOpenThemeEditor} onOpenRestyle={onOpenRestyle} />}
            {view === 'history' && <HistoryPanel />}
          </div>

          {/* 宽度拖拽条 */}
          <div
            onMouseDown={() => {
              resizing.current = true;
              document.body.style.cursor = 'col-resize';
              document.body.style.userSelect = 'none';
            }}
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500/60 transition"
          />
        </div>
      )}
    </div>
  );
};
