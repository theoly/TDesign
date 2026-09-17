import { create } from 'zustand';
import { DesignSystem } from '../types/designSystem';
import {
  Asset,
  AssetId,
  ComponentDefinition,
  ComponentId,
  Decision,
  DecisionId,
  ProjectSettings,
  Screen,
  ScreenId,
  StyleOverride
} from '../types/project';
import { techBlueTheme } from '../utils/themePresets';
import { NidEngine } from '../utils/nidEngine';
import { buildStyleSpecimenHtml } from '../utils/styleSpecimen';
import { createProjectStorage } from '../services/storage/projectStorage';
import { ConversationStore } from '../services/storage/conversationStore';
import { AttachmentStore } from '../services/storage/attachmentStore';
import { ProjectRepository } from '../services/storage/projectRepository';
import {
  planRestyle,
  type RestyleOutcome,
  type RestylePlan,
  type RestyleTarget
} from '../services/ai/restyleService';
import { inspectText, TextUneditableReason } from '../utils/textNode';
import { compileTokensToCss } from '../utils/cssCompiler';
import {
  ProjectMeta,
  deleteProjectData,
  projectKey,
  readProject,
  upsertMeta,
  writeProject
} from '../utils/projectRegistry';
import { useHistoryStore, setApplyPatchesHandler } from './useHistoryStore';
import { Patch } from '../types/history';

/** 新建工程时的空白起始画框 (PRD §3.0.1) */
const blankScreenHtml = (name: string) => `<div class="p-8" style="min-height: 800px; background: var(--color-bg);">
  <div class="card p-6 r-lg shadow-md col gap-4" style="background: var(--color-surface);">
    <h2 class="text-2xl font-bold">${name}</h2>
    <p class="text-sm text-secondary">空白画框。在右侧对话面板描述你的需求，或直接用检查器排版。</p>
    <div class="row gap-3 mt-2">
      <button class="btn btn-primary r-md">主要操作</button>
      <button class="btn btn-ghost r-md">次要操作</button>
    </div>
  </div>
</div>`;

/** 换肤时被 L4 覆盖挡住的节点 (T-AE-22) */
export interface ThemeConflict {
  key: string;
  nid: string;
  screenId: string;
  screenName: string;
  declarations: string[];
  escaped: boolean;
}

export interface SelectedNodeInfo {
  screenId: string;
  nid: string;
  tagName: string;
  /** 直接子文本节点的内容；不可编辑时仅供展示 (doc/issues.md ISSUE-002/003) */
  textContent: string;
  /** 文本是否允许在检查器中修改 */
  textEditable?: boolean;
  textReason?: TextUneditableReason;
  classNames: string[];
  parentChain?: { nid: string; tagName: string; className?: string }[];
  componentId?: string;
  componentInstanceId?: string;
  computedBox: {
    width: number;
    height: number;
    top: number;
    left: number;
    padding: { top: number; right: number; bottom: number; left: number };
    margin: { top: number; right: number; bottom: number; left: number };
  };
}

interface ProjectState {
  id: string;
  name: string;
  /** 工程文件夹绝对路径 (T-AE-40)。未设置时存储层回退 localStorage */
  folderPath?: string;
  createdAt: number;
  settings: ProjectSettings;
  designSystem: DesignSystem;

  // D16 Flat Record Store
  screens: Record<ScreenId, Screen>;
  screenOrder: ScreenId[];
  overrides: Record<string, StyleOverride>; // `${screenId}:${nid}` -> StyleOverride
  decisions: Record<DecisionId, Decision>;
  components: Record<ComponentId, ComponentDefinition>;
  assets: Record<AssetId, Asset>;

  /**
   * 侧边栏折叠面板的展开状态 (PRD §3.0.3)。key 按视图命名空间，如 `assets.images`。
   * 随工程持久化——不同工程的侧栏使用习惯不同，按工程记忆比全局记忆更贴合。
   * 缺失的 key 回落到组件的 defaultOpen，因此新增面板无需数据迁移。
   */
  panelStates: Record<string, boolean>;

  // Runtime Viewport & Selection State
  activeScreenId: ScreenId | null;
  selectedNid: string | null;
  hoveredNid: string | null;
  selectedNode: SelectedNodeInfo | null;
  viewportTransform: { x: number; y: number; scale: number };

  // Temporary Artboard for Side-by-Side adoption (D17 / §3.2.9)
  stagedScreen: {
    targetScreenId: ScreenId;
    newHtml: string;
    screenName: string;
  } | null;

  // Actions
  setName: (name: string) => void;
  setDeviceProfile: (profile: 'pc' | 'mobile') => void;
  setColorMode: (mode: 'light' | 'dark') => void;
  toggleColorMode: () => void;
  setShowViewportGuide: (show: boolean) => void;
  setPanelOpen: (key: string, open: boolean) => void;
  setDesignSystem: (ds: DesignSystem) => void;
  /** 换肤前扫描会被 L4 覆盖挡住的节点 (T-AE-22) */
  scanThemeConflicts: () => ThemeConflict[];
  /** 清除指定 L4 覆盖，使其跟随新主题；escaped 覆盖需显式允许 (T-AE-22) */
  clearOverridesForTheme: (keys: string[], includeEscaped?: boolean) => number;

  // Screen CRUD
  addScreen: (screen: Omit<Screen, 'id'>, customId?: string) => ScreenId;
  /** 画框是否为风格样张页（doc/aesthetic/spec.md §6.6.7） */
  isSpecimen: (id: ScreenId) => boolean;
  /** 某画框中被 L4 手动覆盖的 nid —— Polish/Restyle 不应改动它们 (T-AE-26) */
  getProtectedNids: (screenId: ScreenId) => string[];
  /** 组装 Restyle 的执行队列，组件优先 (T-AE-28) */
  buildRestylePlan: (screenIds?: ScreenId[]) => RestylePlan;
  /** 落地一次通过结构校验的改写 (T-AE-26/27) */
  applyRestyleOutcome: (outcome: RestyleOutcome) => boolean;

  /** 当前工程的会话存档 (T-AE-31)。会话不进 project.json，独立分片存储 */
  getConversationStore: () => ConversationStore;
  getAttachmentStore: () => AttachmentStore;
  /** 删除样张后重新生成一份（§6.6.7 生命周期） */
  regenerateSpecimen: () => ScreenId;
  updateScreen: (id: ScreenId, updates: Partial<Screen>, historyLabel?: string) => void;
  updateScreenHtml: (id: ScreenId, htmlContent: string, historyLabel?: string) => void;
  removeScreen: (id: ScreenId) => void;
  renameScreen: (id: ScreenId, name: string) => void;
  duplicateScreen: (id: ScreenId) => ScreenId | null;
  arrangeScreens: () => void;
  reorderScreens: (newOrder: ScreenId[]) => void;
  setActiveScreen: (id: ScreenId | null) => void;
  selectNodeByNid: (screenId: ScreenId, nid: string) => void;

  // Overrides (L4)
  setOverride: (screenId: ScreenId, nid: string, declarations: Record<string, string>, escaped?: boolean, historyLabel?: string) => void;
  clearScreenOverrides: (screenId: ScreenId) => void;

  // Decisions (D20)
  /**
   * @param source 省略时记为用户手动创建。AI 从对话中提取、经用户确认的约定
   *   必须传 `{ kind: 'auto_extracted', conversationId }`，否则无法区分来源、
   *   也无法跳回产生它的那轮对话 (ISSUE-010)。
   */
  addDecision: (
    text: string,
    scope?: 'global' | 'screen',
    screenId?: string,
    source?: { kind: 'auto_extracted' | 'manual'; conversationId?: string }
  ) => void;
  removeDecision: (id: DecisionId) => void;
  toggleDecision: (id: DecisionId) => void;

  // Components (D6 / PRD §3.7)
  createComponent: (name: string, templateHtml: string, description?: string) => ComponentId;
  extractComponentFromNode: (screenId: ScreenId, nid: string, name: string) => ComponentId | null;
  updateComponent: (id: ComponentId, updates: Partial<ComponentDefinition>) => void;
  deleteComponent: (id: ComponentId) => void;
  insertComponent: (screenId: ScreenId, componentId: ComponentId) => void;
  detachComponentInstance: (screenId: ScreenId, nid: string) => void;
  syncComponentInstances: (componentId: ComponentId, force?: boolean) => { syncedCount: number; skippedConflictCount: number; details: string[] };

  // Assets (PRD §3.4.1)
  addAsset: (asset: Asset) => void;
  removeAsset: (id: AssetId) => void;
  replaceAssetGlobally: (oldAssetId: string, newAssetUrl: string) => number;
  cleanupUnusedAssets: () => number;

  // Selection & Viewport
  selectNode: (info: SelectedNodeInfo | null) => void;
  setHoveredNid: (nid: string | null) => void;
  setViewportTransform: (transform: { x: number; y: number; scale: number }) => void;

  // Side-by-Side Staging (D17)
  stageScreenChange: (targetScreenId: ScreenId, newHtml: string, screenName: string) => void;
  adoptStagedChange: () => void;
  discardStagedChange: () => void;
  keepBothScreens: () => void;

  // Persistence & Recovery (T-02, T-03, T-04)
  saveProject: () => void;
  loadProject: (jsonString: string) => void;
  initNewProject: (opts: { name: string; deviceProfile: 'pc' | 'mobile'; designSystem: DesignSystem; initialDecisions?: string[] }) => string;
  loadProjectById: (id: string) => boolean;
  /** 从文件夹读回的工程文档载入 (T-AE-43) */
  loadProjectDocument: (doc: unknown, folderPath: string) => boolean;
  deleteProject: (id: string) => void;
  hasRecoverySession: () => boolean;
  recoverSession: () => void;
  applyPatches: (patches: Patch[]) => void;
}


// Initial Demo Screens
const initialScreen1: Screen = {
  id: 'screen-1',
  name: '登录注册页 (Login)',
  position: { x: 100, y: 120 },
  htmlContent: NidEngine.injectNids(`<div class="row items-center justify-center p-8" style="min-height: 800px; background: var(--color-bg);">
  <div class="card p-8 r-xl shadow-lg col gap-4" style="width: 440px; background: var(--color-surface);">
    <div class="col gap-1 text-center">
      <div class="logo r-md bg-primary row items-center justify-center mx-auto" style="width: 48px; height: 48px; margin: 0 auto 12px auto;">
        <svg class="icon" width="24" height="24" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </div>
      <h2 class="text-2xl font-bold">欢迎使用 StudioMetrics</h2>
      <p class="text-sm text-secondary">请输入您的企业账号以开启 AI 原生设计工作台</p>
    </div>
    <div class="col gap-3 mt-4">
      <div class="col gap-1">
        <label class="text-sm font-medium">工作邮箱</label>
        <input class="input" type="email" placeholder="name@company.com" value="alex.designer@company.com" />
      </div>
      <div class="col gap-1">
        <div class="row justify-between items-center">
          <label class="text-sm font-medium">访问密钥</label>
          <a href="#" class="text-xs text-primary" style="text-decoration: none;">忘记密钥？</a>
        </div>
        <input class="input" type="password" value="••••••••••••" />
      </div>
      <button class="btn btn-primary r-md mt-2 w-full text-center">
        <span>登入系统</span>
      </button>
    </div>
  </div>
</div>`)
};

const initialScreen2: Screen = {
  id: 'screen-2',
  name: '核心仪表盘 (Dashboard)',
  position: { x: 1660, y: 120 },
  htmlContent: NidEngine.injectNids(`<div class="col gap-4 p-6" style="min-height: 800px; background: var(--color-bg);">
  <div class="row items-center justify-between pb-4 border-b">
    <div class="col">
      <h1 class="text-2xl font-bold">商业效能监控大屏</h1>
      <p class="text-sm text-muted">实时汇聚多端 API 吞吐指标与集群运行水线</p>
    </div>
    <div class="row items-center gap-3">
      <button class="btn btn-ghost r-md">导出图表</button>
      <button class="btn btn-primary r-md">新建分析卡片</button>
    </div>
  </div>
  <div class="grid-3 gap-4 mt-2">
    <div class="card p-5 r-lg shadow-sm col gap-2">
      <span class="text-sm text-muted">今日总调用</span>
      <h2 class="text-3xl font-bold">2,481,200</h2>
      <span class="text-xs text-success">↑ 18.5% 较昨日提升</span>
    </div>
    <div class="card p-5 r-lg shadow-sm col gap-2">
      <span class="text-sm text-muted">平均响应延时</span>
      <h2 class="text-3xl font-bold">42 ms</h2>
      <span class="text-xs text-success">正常水位区间</span>
    </div>
    <div class="card p-5 r-lg shadow-sm col gap-2">
      <span class="text-sm text-muted">系统健康度</span>
      <h2 class="text-3xl font-bold text-success">99.99%</h2>
      <span class="text-xs text-muted">无未决关键告警</span>
    </div>
  </div>
</div>`)
};

export const useProjectStore = create<ProjectState>((set, get) => ({
  id: 'proj_default',
  name: 'MyDesignStudio',
  createdAt: Date.now(),
  settings: {
    deviceProfile: 'pc',
    frameWidth: 1440,
    viewportGuideHeight: 900,
    showViewportGuide: true,
    colorMode: 'light',
    lodBudget: 12
  },
  designSystem: techBlueTheme,

  screens: {
    'screen-1': initialScreen1,
    'screen-2': initialScreen2
  },
  screenOrder: ['screen-1', 'screen-2'],
  overrides: {},
  decisions: {
    'dec-1': {
      id: 'dec-1',
      text: '界面按钮统一使用规范圆角与纯正主色',
      scope: 'global',
      source: { kind: 'manual', createdAt: Date.now() },
      active: true
    }
  },
  components: {},
  assets: {},
  panelStates: {},

  activeScreenId: 'screen-1',
  selectedNid: null,
  hoveredNid: null,
  selectedNode: null,
  viewportTransform: { x: 80, y: 80, scale: 0.7 },
  stagedScreen: null,

  setName: (name) => {
    set({ name });
    get().saveProject();
  },

  setDeviceProfile: (profile) => {
    const frameWidth = profile === 'pc' ? 1440 : 390;
    const viewportGuideHeight = profile === 'pc' ? 900 : 844;
    set((state) => ({
      settings: { ...state.settings, deviceProfile: profile, frameWidth, viewportGuideHeight }
    }));
    get().saveProject();
  },

  setPanelOpen: (key, open) => {
    set((state) => ({ panelStates: { ...state.panelStates, [key]: open } }));
    get().saveProject();
  },

  setColorMode: (mode) => {
    set((state) => ({
      settings: { ...state.settings, colorMode: mode }
    }));
    get().saveProject();
  },

  toggleColorMode: () => {
    const cur = get().settings.colorMode;
    get().setColorMode(cur === 'light' ? 'dark' : 'light');
  },


  setShowViewportGuide: (show) => {
    set((state) => ({
      settings: { ...state.settings, showViewportGuide: show }
    }));
  },

  /**
   * 扫描会挡住主题变更的 L4 手动覆盖 (T-AE-22)。
   *
   * ScreenFrame 把 overrides 编译为 `[data-nid]{ prop: val !important }`，
   * 优先级高于一切 Token 驱动的类——用户手调过的节点换主题后原地不动，
   * 成为风格孤岛。换肤前必须把这些节点摆到用户面前。
   */
  scanThemeConflicts: () => {
    const { overrides, screens } = get();
    return Object.entries(overrides).map(([key, ov]) => {
      const screenId = key.slice(0, key.indexOf(':'));
      return {
        key,
        nid: ov.nid,
        screenId,
        screenName: screens[screenId]?.name ?? '已删除画框',
        declarations: Object.keys(ov.declarations),
        // escaped 是用户显式声明的逃逸，默认保留、不纳入清除范围
        escaped: Boolean(ov.escaped)
      };
    });
  },

  clearOverridesForTheme: (keys, includeEscaped = false) => {
    const { overrides } = get();
    const target = keys.filter((k) => overrides[k] && (includeEscaped || !overrides[k].escaped));
    if (target.length === 0) return 0;

    const prev = target.map((k) => ({ key: k, value: overrides[k] }));
    const next = { ...overrides };
    for (const k of target) delete next[k];

    // 整批作为单条历史记录入栈，可一键撤销
    useHistoryStore.getState().commit(
      `清除 ${target.length} 条手动样式覆盖以跟随新主题`,
      target.map((k) => ({ op: 'remove' as const, path: ['overrides', k] })),
      prev.map((p) => ({ op: 'add' as const, path: ['overrides', p.key], value: p.value }))
    );
    set({ overrides: next });
    get().saveProject();
    return target.length;
  },

  setDesignSystem: (ds) => {
    const prevDs = get().designSystem;
    useHistoryStore.getState().commit(
      `切换主题为 ${ds.name}`,
      [{ op: 'replace', path: ['designSystem'], value: ds }],
      [{ op: 'replace', path: ['designSystem'], value: prevDs }]
    );
    set({ designSystem: ds });
    get().saveProject();
  },

  isSpecimen: (id) => get().screens[id]?.metadata?.kind === 'specimen',

  getProtectedNids: (screenId) => {
    const { overrides } = get();
    const prefix = `${screenId}:`;
    return Object.entries(overrides)
      .filter(([key]) => key.startsWith(prefix))
      .map(([, ov]) => ov.nid);
  },

  /**
   * 组装 Restyle 队列 (T-AE-28)。
   *
   * 组件排在页面之前：一个被 N 个页面复用的组件，重塑成本是 1 次调用而非 N 次，
   * 且只改组件定义再走既有的实例同步链路，避免同一组件在不同页面被改成不同样子。
   */
  buildRestylePlan: (screenIds) => {
    const { screens, screenOrder, components } = get();
    const ids = screenIds ?? screenOrder;

    const countReuse = (componentId: string) =>
      ids.reduce(
        (n, sid) => n + (screens[sid]?.htmlContent.split(`data-component-id="${componentId}"`).length - 1 || 0),
        0
      );

    const componentTargets: RestyleTarget[] = Object.values(components).map((c) => ({
      kind: 'component' as const,
      id: c.id,
      name: c.name,
      html: c.templateHtml,
      reuseCount: countReuse(c.id)
    }));

    const screenTargets: RestyleTarget[] = ids
      .map((sid) => screens[sid])
      .filter((sc): sc is NonNullable<typeof sc> => Boolean(sc))
      // 样张页是设计系统的投影，改它应该去改 Token (§6.6.7)
      .filter((sc) => sc.metadata?.kind !== 'specimen')
      .map((sc) => ({
        kind: 'screen' as const,
        id: sc.id,
        name: sc.name,
        html: sc.htmlContent,
        protectedNids: get().getProtectedNids(sc.id)
      }));

    return planRestyle(componentTargets, screenTargets);
  },

  applyRestyleOutcome: (outcome) => {
    if (outcome.status !== 'applied' || !outcome.html) return false;
    const { target, html } = outcome;

    if (target.kind === 'component') {
      get().updateComponent(target.id, { templateHtml: html });
      // 走既有实例同步链路下发；含 L4 覆盖的实例由该链路自动跳过保护
      get().syncComponentInstances(target.id);
      return true;
    }

    get().updateScreen(target.id, { htmlContent: html }, `风格重塑：${target.name}`);
    return true;
  },

  getConversationStore: () => {
    const { id, folderPath } = get();
    return new ConversationStore(createProjectStorage(id, folderPath));
  },

  getAttachmentStore: () => {
    const { id, folderPath } = get();
    return new AttachmentStore(createProjectStorage(id, folderPath));
  },

  /**
   * 重新生成风格样张页 (T-AE-14)。
   * 样张是设计系统的投影而非业务页，用户删除后应能一键恢复。
   */
  regenerateSpecimen: () => {
    const state = get();
    const existing = state.screenOrder.find((sid) => state.screens[sid]?.metadata?.kind === 'specimen');
    const html = NidEngine.injectNids(buildStyleSpecimenHtml(state.settings.deviceProfile));
    if (existing) {
      get().updateScreen(existing, { htmlContent: html }, '重新生成风格样张');
      return existing;
    }
    return get().addScreen({
      name: '🎨 风格样张',
      position: { x: 100, y: 120 },
      htmlContent: html,
      metadata: { kind: 'specimen' }
    });
  },

  addScreen: (screenData, customId) => {
    const id = customId || `screen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const rawHtml = screenData.htmlContent || '<div class="p-8"><h1>新画板</h1></div>';
    const htmlContent = rawHtml.includes('data-nid=') ? rawHtml : NidEngine.injectNids(rawHtml);
    const screen: Screen = { ...screenData, id, htmlContent };
    const prevScreens = get().screens;
    const prevOrder = get().screenOrder;

    useHistoryStore.getState().commit(
      `新建画框: ${screen.name}`,
      [{ op: 'add', path: ['screens', id], value: screen }],
      [{ op: 'remove', path: ['screens', id] }]
    );

    set((state) => ({
      screens: { ...state.screens, [id]: screen },
      screenOrder: [...state.screenOrder, id],
      activeScreenId: id
    }));
    get().saveProject();
    return id;
  },

  updateScreen: (id, updates, historyLabel) => {
    const prevScreen = get().screens[id];
    if (!prevScreen) return;
    const updated = { ...prevScreen, ...updates };

    if (historyLabel) {
      useHistoryStore.getState().commit(
        historyLabel,
        [{ op: 'replace', path: ['screens', id], value: updated }],
        [{ op: 'replace', path: ['screens', id], value: prevScreen }]
      );
    }

    set((state) => ({
      screens: { ...state.screens, [id]: updated }
    }));
    get().saveProject();
  },

  updateScreenHtml: (id, htmlContent, historyLabel) => {
    const injected = htmlContent.includes('data-nid=') ? htmlContent : NidEngine.injectNids(htmlContent);
    get().updateScreen(id, { htmlContent: injected }, historyLabel || '修改页面内容');
  },

  removeScreen: (id) => {
    const prevScreen = get().screens[id];
    if (!prevScreen) return;

    useHistoryStore.getState().commit(
      `删除画框: ${prevScreen.name}`,
      [{ op: 'remove', path: ['screens', id] }],
      [{ op: 'add', path: ['screens', id], value: prevScreen }]
    );

    set((state) => {
      const nextScreens = { ...state.screens };
      delete nextScreens[id];
      const nextOrder = state.screenOrder.filter((sId) => sId !== id);
      return {
        screens: nextScreens,
        screenOrder: nextOrder,
        activeScreenId: state.activeScreenId === id ? (nextOrder[0] || null) : state.activeScreenId
      };
    });
    get().saveProject();
  },

  renameScreen: (id, name) => {
    get().updateScreen(id, { name }, `重命名画框: ${name}`);
  },

  duplicateScreen: (id) => {
    const s = get().screens[id];
    if (!s) return null;
    const newId = `screen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newScreen: Screen = {
      ...s,
      id: newId,
      name: `${s.name} (副本)`,
      position: { x: s.position.x + 80, y: s.position.y + 80 },
      htmlContent: NidEngine.injectNids(NidEngine.stripInternalAttributes(s.htmlContent))
    };
    get().addScreen(newScreen, newId);
    return newId;
  },

  arrangeScreens: () => {
    set((state) => {
      const nextScreens = { ...state.screens };
      let curX = 100;
      const curY = 120;
      const spacingX = 120;
      const frameWidth = state.settings.frameWidth;

      state.screenOrder.forEach((id) => {
        const s = nextScreens[id];
        if (!s) return;
        nextScreens[id] = {
          ...s,
          position: { x: curX, y: curY }
        };
        curX += frameWidth + spacingX;
      });

      return { screens: nextScreens };
    });
    get().saveProject();
  },

  reorderScreens: (newOrder) => {
    set({ screenOrder: newOrder });
  },

  setActiveScreen: (id) => {
    set({ activeScreenId: id, selectedNid: null, selectedNode: null });
  },

  selectNodeByNid: (screenId, nid) => {
    const screen = get().screens[screenId];
    if (!screen) return;
    get().setActiveScreen(screenId);

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<body>${screen.htmlContent}</body>`, 'text/html');
    const el = doc.querySelector(`[data-nid="${nid}"]`) as HTMLElement;
    if (!el) return;

    const compEl = el.closest('[data-component-id]') as HTMLElement | null;
    const componentId = compEl ? compEl.getAttribute('data-component-id') || undefined : undefined;
    const componentInstanceId = compEl ? compEl.getAttribute('data-component-instance') || undefined : undefined;

    const parentChain: { nid: string; tagName: string; className?: string }[] = [];
    let cur = el.parentElement;
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

    get().selectNode({
      screenId,
      nid,
      tagName: el.tagName.toLowerCase(),
      ...(() => {
        const t = inspectText(el);
        return { textContent: t.text, textEditable: t.editable, textReason: t.reason };
      })(),
      classNames: Array.from(el.classList),
      parentChain,
      componentId,
      componentInstanceId,
      computedBox: {
        width: 120,
        height: 40,
        top: 0,
        left: 0,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        margin: { top: 0, right: 0, bottom: 0, left: 0 }
      }
    });
  },

  setOverride: (screenId, nid, declarations, escaped = false, historyLabel) => {
    const key = `${screenId}:${nid}`;
    const prevOverride = get().overrides[key];
    const newOverride: StyleOverride = {
      nid,
      declarations: { ...(prevOverride?.declarations || {}), ...declarations },
      escaped
    };

    useHistoryStore.getState().commit(
      historyLabel || `修改样式属性: ${nid}`,
      [{ op: 'replace', path: ['overrides', key], value: newOverride }],
      prevOverride
        ? [{ op: 'replace', path: ['overrides', key], value: prevOverride }]
        : [{ op: 'remove', path: ['overrides', key] }]
    );

    set((state) => ({
      overrides: { ...state.overrides, [key]: newOverride }
    }));
    get().saveProject();
  },

  clearScreenOverrides: (screenId) => {
    set((state) => {
      const next = { ...state.overrides };
      for (const k in next) {
        if (k.startsWith(`${screenId}:`)) delete next[k];
      }
      return { overrides: next };
    });
    get().saveProject();
  },

  addDecision: (text, scope = 'global', screenId, source) => {
    const id: DecisionId = `dec-${Date.now()}`;
    const dec: Decision = {
      id,
      text,
      scope,
      screenId,
      source: { kind: source?.kind ?? 'manual', conversationId: source?.conversationId, createdAt: Date.now() },
      active: true
    };
    set((state) => ({
      decisions: { ...state.decisions, [id]: dec }
    }));
    get().saveProject();
  },

  removeDecision: (id) => {
    set((state) => {
      const next = { ...state.decisions };
      delete next[id];
      return { decisions: next };
    });
    get().saveProject();
  },

  toggleDecision: (id) => {
    set((state) => {
      const cur = state.decisions[id];
      if (!cur) return state;
      return {
        decisions: { ...state.decisions, [id]: { ...cur, active: !cur.active } }
      };
    });
    get().saveProject();
  },

  // Components (PRD §3.7)
  createComponent: (name, templateHtml, description) => {
    const id = `comp-${Math.random().toString(36).substring(2, 9)}`;
    const comp: ComponentDefinition = {
      id,
      name,
      description,
      templateHtml,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    set((state) => ({
      components: { ...state.components, [id]: comp }
    }));
    get().saveProject();
    return id;
  },

  extractComponentFromNode: (screenId, nid, name) => {
    const screen = get().screens[screenId];
    if (!screen) return null;

    try {
      let content = screen.htmlContent;
      if (!content.includes(`data-nid="${nid}"`)) {
        content = NidEngine.injectNids(content);
      }
      const parser = new DOMParser();
      let doc = parser.parseFromString(`<body>${content}</body>`, 'text/html');
      let el = doc.querySelector(`[data-nid="${nid}"]`) as HTMLElement;

      if (!el) {
        const curSel = get().selectedNode;
        if (curSel && curSel.tagName) {
          const candidates = Array.from(doc.querySelectorAll(curSel.tagName));
          const found = candidates.find(c => {
            const textMatch = curSel.textContent ? c.textContent?.includes(curSel.textContent.trim()) : true;
            const classMatch = curSel.classNames.length ? curSel.classNames.some(cls => c.classList.contains(cls)) : true;
            return textMatch && classMatch;
          });
          if (found) {
            el = found as HTMLElement;
            el.setAttribute('data-nid', nid);
          }
        }
      }

      if (!el) return null;

      const compId = `comp-${Math.random().toString(36).substring(2, 9)}`;
      const instId = `inst-${Math.random().toString(36).substring(2, 9)}`;

      // Create template copy
      const templateClone = el.cloneNode(true) as HTMLElement;
      templateClone.removeAttribute('data-component-instance');
      templateClone.setAttribute('data-component-id', compId);
      const templateHtml = templateClone.outerHTML;

      // Tag element in screen
      el.setAttribute('data-component-id', compId);
      el.setAttribute('data-component-instance', instId);

      const updatedHtml = doc.body.innerHTML;

      const comp: ComponentDefinition = {
        id: compId,
        name,
        templateHtml,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      set((state) => ({
        components: { ...state.components, [compId]: comp }
      }));

      get().updateScreenHtml(screenId, updatedHtml, `提取为组件: ${name}`);

      // Update selected node info with component attributes
      const curSel = get().selectedNode;
      if (curSel && curSel.nid === nid) {
        get().selectNode({ ...curSel, componentId: compId, componentInstanceId: instId });
      }

      return compId;
    } catch (e) {
      console.error('extractComponentFromNode error:', e);
      return null;
    }
  },

  updateComponent: (id, updates) => {
    set((state) => {
      const cur = state.components[id];
      if (!cur) return state;
      return {
        components: {
          ...state.components,
          [id]: { ...cur, ...updates, updatedAt: Date.now() }
        }
      };
    });
    get().saveProject();
  },

  deleteComponent: (id) => {
    set((state) => {
      const next = { ...state.components };
      delete next[id];
      return { components: next };
    });
    get().saveProject();
  },

  insertComponent: (screenId, componentId) => {
    const comp = get().components[componentId];
    const screen = get().screens[screenId];
    if (!comp || !screen) return;

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<body>${comp.templateHtml}</body>`, 'text/html');
      const el = doc.body.firstElementChild as HTMLElement;
      if (!el) return;

      const instId = `inst-${Math.random().toString(36).substring(2, 9)}`;
      el.setAttribute('data-component-id', componentId);
      el.setAttribute('data-component-instance', instId);

      const htmlWithNids = NidEngine.injectNids(el.outerHTML);

      const screenDoc = parser.parseFromString(`<body>${screen.htmlContent}</body>`, 'text/html');
      const rootContainer = screenDoc.body.firstElementChild || screenDoc.body;
      const tmpDiv = screenDoc.createElement('div');
      tmpDiv.innerHTML = htmlWithNids;
      if (tmpDiv.firstElementChild) {
        rootContainer.appendChild(tmpDiv.firstElementChild);
      }

      get().updateScreenHtml(screenId, screenDoc.body.innerHTML, `插入组件实例: ${comp.name}`);
    } catch (e) {
      console.error('insertComponent error:', e);
    }
  },

  detachComponentInstance: (screenId, nid) => {
    const screen = get().screens[screenId];
    if (!screen) return;

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<body>${screen.htmlContent}</body>`, 'text/html');
      const el = doc.querySelector(`[data-nid="${nid}"]`);
      if (!el) return;

      const compRoot = el.closest('[data-component-id]') as HTMLElement;
      if (!compRoot) return;

      compRoot.removeAttribute('data-component-id');
      compRoot.removeAttribute('data-component-instance');

      get().updateScreenHtml(screenId, doc.body.innerHTML, '从组件分离实例');

      const curSel = get().selectedNode;
      if (curSel && curSel.nid === nid) {
        get().selectNode({ ...curSel, componentId: undefined, componentInstanceId: undefined });
      }
    } catch (e) {
      console.error('detachComponentInstance error:', e);
    }
  },

  syncComponentInstances: (componentId, force = false) => {
    const comp = get().components[componentId];
    if (!comp) return { syncedCount: 0, skippedConflictCount: 0, details: [] };

    const { screens, overrides } = get();
    let syncedCount = 0;
    let skippedConflictCount = 0;
    const details: string[] = [];

    const parser = new DOMParser();

    Object.values(screens).forEach((screen) => {
      const doc = parser.parseFromString(`<body>${screen.htmlContent}</body>`, 'text/html');
      const instances = doc.querySelectorAll(`[data-component-id="${componentId}"]`);
      if (instances.length === 0) return;

      let screenModified = false;

      instances.forEach((inst) => {
        const instEl = inst as HTMLElement;
        const instId = instEl.getAttribute('data-component-instance') || `inst-${Math.random().toString(36).substring(2, 9)}`;

        // Check L4 style overrides conflict
        const nidsInInstance: string[] = [];
        const rootNid = instEl.getAttribute('data-nid');
        if (rootNid) nidsInInstance.push(rootNid);
        instEl.querySelectorAll('[data-nid]').forEach((c) => {
          const cnid = c.getAttribute('data-nid');
          if (cnid) nidsInInstance.push(cnid);
        });

        const conflictingNids = nidsInInstance.filter((nid) => overrides[`${screen.id}:${nid}`]);
        const hasConflict = conflictingNids.length > 0;

        if (hasConflict && !force) {
          skippedConflictCount++;
          details.push(`画板「${screen.name}」中的实例存在 ${conflictingNids.length} 条手动样式覆盖 (L4)，已自动跳过保护`);
          return;
        }

        // Slot preservation: extract inner leaf texts and img src
        const leafTexts: string[] = [];
        const leafImages: string[] = [];
        instEl.querySelectorAll('*').forEach((child) => {
          if (child.tagName.toLowerCase() === 'img') {
            const src = (child as HTMLImageElement).getAttribute('src');
            if (src) leafImages.push(src);
          } else if (child.children.length === 0 && child.textContent?.trim()) {
            leafTexts.push(child.textContent.trim());
          }
        });

        // Parse clean template
        const tDoc = parser.parseFromString(`<body>${comp.templateHtml}</body>`, 'text/html');
        const newEl = tDoc.body.firstElementChild as HTMLElement;
        if (!newEl) return;

        newEl.setAttribute('data-component-id', componentId);
        newEl.setAttribute('data-component-instance', instId);
        if (rootNid) newEl.setAttribute('data-nid', rootNid);

        // Re-inject leaf texts
        let tIdx = 0;
        let imgIdx = 0;
        newEl.querySelectorAll('*').forEach((child) => {
          if (child.tagName.toLowerCase() === 'img' && imgIdx < leafImages.length) {
            child.setAttribute('src', leafImages[imgIdx++]);
          } else if (child.children.length === 0 && child.textContent?.trim() && tIdx < leafTexts.length) {
            child.textContent = leafTexts[tIdx++];
          }
        });

        // Ensure nids
        const withNids = NidEngine.injectNids(newEl.outerHTML);
        const tempHolder = doc.createElement('div');
        tempHolder.innerHTML = withNids;
        if (tempHolder.firstElementChild) {
          instEl.replaceWith(tempHolder.firstElementChild);
          screenModified = true;
          syncedCount++;
        }
      });

      if (screenModified) {
        get().updateScreenHtml(screen.id, doc.body.innerHTML, `同步组件实例: ${comp.name}`);
      }
    });

    return { syncedCount, skippedConflictCount, details };
  },

  // Assets (PRD §3.4.1)
  addAsset: (asset) => {
    set((state) => ({
      assets: { ...state.assets, [asset.id]: asset }
    }));
    get().saveProject();
  },

  removeAsset: (id) => {
    set((state) => {
      const next = { ...state.assets };
      delete next[id];
      return { assets: next };
    });
    get().saveProject();
  },

  replaceAssetGlobally: (oldAssetId, newAssetUrl) => {
    const { screens } = get();
    let count = 0;
    const parser = new DOMParser();

    Object.values(screens).forEach((screen) => {
      const doc = parser.parseFromString(`<body>${screen.htmlContent}</body>`, 'text/html');
      let changed = false;

      // 1. Elements with data-asset-id
      doc.querySelectorAll(`[data-asset-id="${oldAssetId}"]`).forEach((el) => {
        if (el.tagName.toLowerCase() === 'img') {
          (el as HTMLImageElement).src = newAssetUrl;
        } else {
          (el as HTMLElement).style.backgroundImage = `url(${newAssetUrl})`;
        }
        changed = true;
        count++;
      });

      // 2. Images with matching src
      doc.querySelectorAll('img').forEach((img) => {
        const src = img.getAttribute('src');
        if (src === oldAssetId || (src && src.includes(oldAssetId))) {
          img.src = newAssetUrl;
          changed = true;
          count++;
        }
      });

      if (changed) {
        get().updateScreenHtml(screen.id, doc.body.innerHTML, `全局替换素材: ${oldAssetId}`);
      }
    });

    return count;
  },

  cleanupUnusedAssets: () => {
    const { screens, assets } = get();
    const allHtml = Object.values(screens).map((s) => s.htmlContent).join(' ');
    let cleaned = 0;
    const nextAssets = { ...assets };

    Object.keys(nextAssets).forEach((id) => {
      const asset = nextAssets[id];
      const isUsed = allHtml.includes(id) || (asset.relPath && allHtml.includes(asset.relPath));
      if (!isUsed) {
        delete nextAssets[id];
        cleaned++;
      }
    });

    if (cleaned > 0) {
      set({ assets: nextAssets });
      get().saveProject();
    }
    return cleaned;
  },

  selectNode: (info) => {
    set({
      selectedNode: info,
      selectedNid: info ? info.nid : null,
      activeScreenId: info ? info.screenId : get().activeScreenId
    });
  },

  setHoveredNid: (nid) => set({ hoveredNid: nid }),

  setViewportTransform: (transform) => set({ viewportTransform: transform }),

  // Side-by-side adoption (D17)
  stageScreenChange: (targetScreenId, newHtml, screenName) => {
    set({
      stagedScreen: { targetScreenId, newHtml, screenName }
    });
  },

  adoptStagedChange: () => {
    const staged = get().stagedScreen;
    if (!staged) return;
    const target = get().screens[staged.targetScreenId];
    if (target) {
      useHistoryStore.getState().addCheckpoint(`采纳新版前备份: ${target.name}`, {
        screenId: target.id,
        htmlContent: target.htmlContent,
        scopedCss: target.scopedCss
      });
      get().updateScreenHtml(staged.targetScreenId, staged.newHtml, `采纳 AI 生成新版: ${staged.screenName}`);
    }
    set({ stagedScreen: null });
  },

  discardStagedChange: () => {
    set({ stagedScreen: null });
  },

  keepBothScreens: () => {
    const staged = get().stagedScreen;
    if (!staged) return;
    const count = Object.keys(get().screens).length;
    const newId = `screen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    get().addScreen({
      name: `${staged.screenName} (AI 方案)`,
      position: { x: 100 + count * 1560, y: 120 },
      htmlContent: staged.newHtml
    }, newId);
    set({ stagedScreen: null });
  },

  saveProject: () => {
    const { id, name, settings, designSystem, screens, overrides, decisions, components, assets, panelStates } =
      get();
    const data = {
      id,
      name,
      schemaVersion: 1,
      savedAt: Date.now(),
      settings,
      designSystem,
      screens,
      overrides,
      decisions,
      components,
      assets,
      panelStates
    };
    const { folderPath } = get();
    if (folderPath) {
      // 文件夹工程：画框正文外置为独立文件，project.json 原子写入 (T-AE-40)
      // 失败不抛出——保存失败不应让编辑操作整个崩掉，由标题栏状态提示
      void new ProjectRepository(createProjectStorage(id, folderPath))
        .save(data as never)
        .catch((e) => console.warn('[project] 文件夹保存失败', e));
    } else {
      writeProject(id, JSON.stringify(data));
    }

    // 同步注册表元信息，供工程管理页渲染卡片 (PRD §3.0.1)
    const firstScreenId = get().screenOrder[0];
    const firstScreen = firstScreenId ? screens[firstScreenId] : undefined;
    const meta: ProjectMeta = {
      id,
      name,
      deviceProfile: settings.deviceProfile,
      frameWidth: settings.frameWidth,
      createdAt: get().createdAt,
      updatedAt: data.savedAt,
      screenCount: Object.keys(screens).length,
      previewHtml: firstScreen?.htmlContent,
      previewCss: compileTokensToCss(designSystem.tokens, settings.colorMode),
      folderPath: get().folderPath
    };
    upsertMeta(meta);
  },

  /** 新建空白工程并切换为当前工程 (PRD §3.0.1)。设备档位在此确定，之后不可更改 (D8) */
  initNewProject: ({ name, deviceProfile, designSystem: ds, initialDecisions }) => {
    const id = `proj_${Date.now().toString(36)}`;
    const screenId = `screen-${Date.now().toString(36)}`;
    const now = Date.now();
    set({
      id,
      name,
      createdAt: now,
      settings: {
        deviceProfile,
        frameWidth: deviceProfile === 'pc' ? 1440 : 390,
        viewportGuideHeight: deviceProfile === 'pc' ? 900 : 844,
        showViewportGuide: true,
        colorMode: 'light',
        lodBudget: 12
      },
      designSystem: ds,
      screens: {
        [screenId]: {
          id: screenId,
          name: '🎨 风格样张',
          position: { x: 100, y: 120 },
          htmlContent: NidEngine.injectNids(buildStyleSpecimenHtml(deviceProfile)),
          metadata: { kind: 'specimen' }
        }
      },
      screenOrder: [screenId],
      overrides: {},
      // T-AE-20: 三问中「行业语境」等不可量化的偏好落为工程约定，
      // 复用既有 Decision 结构与 Prompt 注入链路，不新增持久化结构
      decisions: Object.fromEntries(
        (initialDecisions ?? []).map((text, i) => {
          const id = `dec-init-${i}`;
          return [id, { id, text, scope: 'global' as const, source: { kind: 'auto_extracted' as const, createdAt: now }, active: true }];
        })
      ),
      components: {},
      assets: {},
      panelStates: {},
      activeScreenId: screenId,
      selectedNid: null,
      hoveredNid: null,
      selectedNode: null,
      stagedScreen: null,
      viewportTransform: { x: 80, y: 80, scale: 0.7 }
    });
    get().saveProject();
    return id;
  },

  /** 从注册表载入指定工程 */
  loadProjectById: (id) => {
    const raw = readProject(id);
    if (!raw) return false;
    get().loadProject(raw);
    return true;
  },

  loadProjectDocument: (doc, folderPath) => {
    try {
      get().loadProject(JSON.stringify(doc));
      // folderPath 决定此后会话与附件写文件夹而非 localStorage
      set({ folderPath });
      return true;
    } catch (e) {
      console.warn('[project] 文档载入失败', e);
      return false;
    }
  },

  deleteProject: (id) => {
    deleteProjectData(id);
  },

  loadProject: (jsonString) => {
    try {
      const data = JSON.parse(jsonString);
      const order = data.screenOrder && data.screenOrder.length
        ? data.screenOrder.filter((sid: string) => data.screens?.[sid])
        : Object.keys(data.screens || {});
      set({
        id: data.id || get().id,
        createdAt: data.createdAt || data.savedAt || Date.now(),
        name: data.name || 'Untitled',
        settings: data.settings || get().settings,
        designSystem: data.designSystem || get().designSystem,
        screens: data.screens || {},
        screenOrder: order,
        activeScreenId: order[0] || null,
        selectedNid: null,
        hoveredNid: null,
        selectedNode: null,
        stagedScreen: null,
        overrides: data.overrides || {},
        decisions: data.decisions || {},
        components: data.components || {},
        assets: data.assets || {},
        panelStates: data.panelStates || {}
      });
    } catch (e) {
      console.error('Invalid project JSON', e);
    }
  },

  hasRecoverySession: () => !!readProject(get().id),

  recoverSession: () => {
    const raw = readProject(get().id);
    if (raw) get().loadProject(raw);
  },

  applyPatches: (patches) => {
    set((state) => {
      const nextScreens = { ...state.screens };
      let nextScreenOrder = [...state.screenOrder];
      const nextOverrides = { ...state.overrides };
      let nextDesignSystem = state.designSystem;
      const nextDecisions = { ...state.decisions };
      const nextComponents = { ...state.components };

      for (const patch of patches) {
        const root = patch.path[0];
        const key = patch.path[1] as string;

        if (root === 'screens') {
          if (patch.op === 'remove') {
            delete nextScreens[key];
            nextScreenOrder = nextScreenOrder.filter((id) => id !== key);
          } else if (patch.value) {
            nextScreens[key] = patch.value as Screen;
            if (!nextScreenOrder.includes(key)) {
              nextScreenOrder.push(key);
            }
          }
        } else if (root === 'overrides') {
          if (patch.op === 'remove') {
            delete nextOverrides[key];
          } else if (patch.value) {
            nextOverrides[key] = patch.value as StyleOverride;
          }
        } else if (root === 'designSystem') {
          if (patch.value) {
            nextDesignSystem = patch.value as DesignSystem;
          }
        } else if (root === 'decisions') {
          if (patch.op === 'remove') {
            delete nextDecisions[key];
          } else if (patch.value) {
            nextDecisions[key] = patch.value as Decision;
          }
        } else if (root === 'components') {
          if (patch.op === 'remove') {
            delete nextComponents[key];
          } else if (patch.value) {
            nextComponents[key] = patch.value as ComponentDefinition;
          }
        }
      }

      return {
        screens: nextScreens,
        screenOrder: nextScreenOrder,
        overrides: nextOverrides,
        designSystem: nextDesignSystem,
        decisions: nextDecisions,
        components: nextComponents
      };
    });
    get().saveProject();
  }
}));

// Connect JSON Patch history undo/redo directly to project state (PRD §3.8.1 / D16)
setApplyPatchesHandler((patches) => {
  useProjectStore.getState().applyPatches(patches);
});

if (typeof window !== 'undefined') {
  (window as any).__projectStore = useProjectStore;
}


