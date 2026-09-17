import { create } from 'zustand';

export interface UsageRecord {
  id: string;
  timestamp: number;
  providerName: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

interface UsageState {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedCostUsd: number;
  history: UsageRecord[];

  recordUsage: (record: Omit<UsageRecord, 'id' | 'timestamp'>) => void;
  clearUsage: () => void;
}

const USAGE_STORAGE_KEY = 'ai_designer_usage_stats_v1';

function loadStoredUsage(): {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedCostUsd: number;
  history: UsageRecord[];
} {
  try {
    const raw = localStorage.getItem(USAGE_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // ignore
  }
  return {
    totalCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalEstimatedCostUsd: 0,
    history: []
  };
}

const initial = loadStoredUsage();

export const useUsageStore = create<UsageState>((set, get) => ({
  ...initial,

  recordUsage: (data) => {
    set((state) => {
      const record: UsageRecord = {
        ...data,
        id: `usage-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now()
      };

      const next = {
        totalCalls: state.totalCalls + 1,
        totalInputTokens: state.totalInputTokens + data.inputTokens,
        totalOutputTokens: state.totalOutputTokens + data.outputTokens,
        totalEstimatedCostUsd: Number((state.totalEstimatedCostUsd + data.estimatedCostUsd).toFixed(6)),
        history: [record, ...state.history].slice(0, 50)
      };

      try {
        localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        // ignore
      }

      return next;
    });
  },

  clearUsage: () => {
    const empty = {
      totalCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalEstimatedCostUsd: 0,
      history: []
    };
    try {
      localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(empty));
    } catch (e) {
      // ignore
    }
    set(empty);
  }
}));
