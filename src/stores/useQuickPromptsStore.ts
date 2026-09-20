import { create } from 'zustand';
import { QuickPromptItem } from '../types/quickPrompt';

const STORAGE_KEY = 'ai_designer_global_quick_prompts_v1';

export const DEFAULT_BUILTIN_PROMPTS: QuickPromptItem[] = [
  {
    id: 'builtin-mobile-adaptive',
    title: '📱 移动端适配',
    content: '请优化移动端小屏幕适配，调整留白间距、字体层级并吸底主操作按钮。',
    scope: 'global',
    isBuiltin: true
  },
  {
    id: 'builtin-micro-texture',
    title: '🎨 优化微质感',
    content: '请为卡片与组件增加细腻微边框、柔和投影与轻微背景渐变，提升质感。',
    scope: 'global',
    isBuiltin: true
  },
  {
    id: 'builtin-form-validation',
    title: '💡 完善表单',
    content: '补充表单输入验证状态、清晰的错误提示文案与辅助说明。',
    scope: 'global',
    isBuiltin: true
  },
  {
    id: 'builtin-empty-state',
    title: '🧩 补充空状态',
    content: '设计该页面的空状态 (Empty State) 插图与引导操作按钮。',
    scope: 'global',
    isBuiltin: true
  },
  {
    id: 'builtin-interaction-feedback',
    title: '⚡ 增加状态反馈',
    content: '补充操作的 Loading 加载态、禁用态 (Disabled) 与成功完成提示。',
    scope: 'global',
    isBuiltin: true
  }
];

function loadGlobalPrompts(): QuickPromptItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    // ignore
  }
  return [...DEFAULT_BUILTIN_PROMPTS];
}

function saveGlobalPrompts(prompts: QuickPromptItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
  } catch (e) {
    // ignore
  }
}

interface QuickPromptsState {
  globalPrompts: QuickPromptItem[];
  addGlobalPrompt: (prompt: { title: string; content: string }) => QuickPromptItem;
  updateGlobalPrompt: (id: string, updates: { title?: string; content?: string }) => void;
  deleteGlobalPrompt: (id: string) => void;
  resetGlobalPrompts: () => void;
}

export const useQuickPromptsStore = create<QuickPromptsState>((set, get) => ({
  globalPrompts: loadGlobalPrompts(),

  addGlobalPrompt: ({ title, content }) => {
    const newPrompt: QuickPromptItem = {
      id: `global-qp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: title.trim(),
      content: content.trim(),
      scope: 'global',
      createdAt: Date.now()
    };
    const updated = [...get().globalPrompts, newPrompt];
    set({ globalPrompts: updated });
    saveGlobalPrompts(updated);
    return newPrompt;
  },

  updateGlobalPrompt: (id, updates) => {
    const updated = get().globalPrompts.map((p) => {
      if (p.id !== id) return p;
      return {
        ...p,
        ...(updates.title !== undefined ? { title: updates.title.trim() } : {}),
        ...(updates.content !== undefined ? { content: updates.content.trim() } : {})
      };
    });
    set({ globalPrompts: updated });
    saveGlobalPrompts(updated);
  },

  deleteGlobalPrompt: (id) => {
    const updated = get().globalPrompts.filter((p) => p.id !== id);
    set({ globalPrompts: updated });
    saveGlobalPrompts(updated);
  },

  resetGlobalPrompts: () => {
    const defaults = [...DEFAULT_BUILTIN_PROMPTS];
    set({ globalPrompts: defaults });
    saveGlobalPrompts(defaults);
  }
}));
