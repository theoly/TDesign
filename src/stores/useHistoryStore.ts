import { create } from 'zustand';
import { Checkpoint, HistoryEntry, Patch } from '../types/history';

interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
  checkpoints: Checkpoint[];

  canUndo: () => boolean;
  canRedo: () => boolean;
  
  commit: (label: string, patches: Patch[], inversePatches: Patch[]) => void;
  undo: () => HistoryEntry | null;
  redo: () => HistoryEntry | null;
  clear: () => void;

  // D17 / §3.8.4 Checkpoint API
  addCheckpoint: (label: string, screenSnapshot: Checkpoint['screenSnapshot']) => string;
  getCheckpoints: () => Checkpoint[];
}

let applyPatchesHandler: ((patches: Patch[]) => void) | null = null;

export const setApplyPatchesHandler = (handler: (patches: Patch[]) => void) => {
  applyPatchesHandler = handler;
};

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  checkpoints: [],

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  commit: (label: string, patches: Patch[], inversePatches: Patch[]) => {
    const entry: HistoryEntry = {
      id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label,
      timestamp: Date.now(),
      patches,
      inversePatches
    };

    set((state) => ({
      past: [...state.past.slice(-199), entry], // keep up to 200
      future: [] // branching drops redo stack
    }));
  },

  undo: () => {
    const { past, future } = get();
    if (past.length === 0) return null;
    const entry = past[past.length - 1];
    set({
      past: past.slice(0, -1),
      future: [entry, ...future]
    });
    if (applyPatchesHandler) {
      applyPatchesHandler(entry.inversePatches);
    }
    return entry;
  },

  redo: () => {
    const { past, future } = get();
    if (future.length === 0) return null;
    const entry = future[0];
    set({
      past: [...past, entry],
      future: future.slice(1)
    });
    if (applyPatchesHandler) {
      applyPatchesHandler(entry.patches);
    }
    return entry;
  },

  clear: () => set({ past: [], future: [] }),

  addCheckpoint: (label: string, screenSnapshot: Checkpoint['screenSnapshot']) => {
    const id = `cp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const checkpoint: Checkpoint = {
      id,
      label,
      timestamp: Date.now(),
      screenSnapshot
    };
    set((state) => ({
      checkpoints: [checkpoint, ...state.checkpoints.slice(0, 49)] // keep up to 50
    }));
    return id;
  },

  getCheckpoints: () => get().checkpoints
}));
