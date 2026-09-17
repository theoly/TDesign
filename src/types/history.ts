export interface Patch {
  op: 'add' | 'remove' | 'replace';
  path: (string | number)[];
  value?: unknown;
}

export interface HistoryEntry {
  id: string;
  label: string;
  timestamp: number;
  patches: Patch[];
  inversePatches: Patch[];
}

export interface Checkpoint {
  id: string;
  label: string;
  timestamp: number;
  screenSnapshot: {
    screenId: string;
    htmlContent: string;
    scopedCss?: string;
  };
}
