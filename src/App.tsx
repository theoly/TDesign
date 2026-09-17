import React, { useEffect, useState } from 'react';
import { Header } from './components/layout/Header';
import { SideBar } from './components/layout/SideBar';
import { InfiniteCanvas } from './components/canvas/InfiniteCanvas';
import { PropertyInspector } from './components/inspector/PropertyInspector';
import { ChatDrawer } from './components/chat/ChatDrawer';
import { ThemeEditor } from './components/theme/ThemeEditor';
import { ExportModal } from './components/export/ExportModal';
import { AIProviderModal } from './components/settings/AIProviderModal';
import { AssetModal } from './components/assets/AssetModal';
import { ProjectManager } from './components/workspace/ProjectManager';
import { RestylePanel } from './components/theme/RestylePanel';
import { useWorkspaceStore } from './stores/useWorkspaceStore';

const Workspace: React.FC = () => {
  // T-AE-44 / PRD §3.8.5：上次异常退出时提示恢复
  const { uncleanShutdownAt, dismissRecovery } = useWorkspaceStore();
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);
  // T-AE-26/27: Polish 与 Restyle 共用同一面板——Polish 即队列只含一项的重塑
  const [restyleScope, setRestyleScope] = useState<'all' | string | null>(null);

  return (
    <div className="w-screen h-screen flex flex-col bg-slate-950 overflow-hidden font-sans">
      <Header
        onOpenExport={() => setShowExportModal(true)}
        onOpenSettings={() => setShowSettingsModal(true)}
      />

      {uncleanShutdownAt !== null && (
        <div className="px-4 py-2 bg-amber-950/60 border-b border-amber-800/50 text-[11px] text-amber-200 flex items-center justify-between gap-3">
          <span>
            检测到上次未正常关闭（{new Date(uncleanShutdownAt).toLocaleString('zh-CN')}）。
            已恢复至最后一次自动保存；会话记录为追加写入，最多丢失最后一轮。
          </span>
          <button onClick={dismissRecovery} className="text-amber-400 hover:text-amber-200 shrink-0">
            知道了
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden relative">
        {/* 左侧：VSCode 式活动栏 + 侧边栏（页面 / 资源 / 设计系统 / 历史，D22） */}
        <SideBar
          onOpenRestyle={() => setRestyleScope('all')}
          onOpenAssetCenter={() => setShowAssetModal(true)}
          onOpenThemeEditor={() => setShowThemeModal(true)}
        />

        <div className="flex-1 h-full relative overflow-hidden">
          <InfiniteCanvas onPolish={(sid) => setRestyleScope(sid)} />
        </div>

        <PropertyInspector />

        <ChatDrawer onOpenSettings={() => setShowSettingsModal(true)} />
      </div>

      {showThemeModal && <ThemeEditor onClose={() => setShowThemeModal(false)} />}
      {showExportModal && <ExportModal onClose={() => setShowExportModal(false)} />}
      {showSettingsModal && <AIProviderModal onClose={() => setShowSettingsModal(false)} />}
      {showAssetModal && <AssetModal onClose={() => setShowAssetModal(false)} />}
      {restyleScope !== null && (
        <RestylePanel scope={restyleScope} onClose={() => setRestyleScope(null)} />
      )}
    </div>
  );
};

/**
 * 应用入口 (PRD §3.0 / D21)
 *
 * 启动后先进工程管理页。没有工程上下文时，画板、检查器、资源库、主题面板
 * 全部无意义，直接进工作空间只会得到一屏空壳。
 */
export const App: React.FC = () => {
  const { view, refresh } = useWorkspaceStore();

  useEffect(() => {
    refresh();
  }, []);

  return view === 'workspace' ? <Workspace /> : <ProjectManager />;
};

export default App;
