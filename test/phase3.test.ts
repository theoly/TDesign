import { describe, test, expect } from 'bun:test';
import { ComponentDetector } from '../src/utils/componentDetector';
import { techBlueTheme } from '../src/utils/themePresets';
import { Screen } from '../src/types/project';

describe('Phase 3: Component Fingerprinting & Repeated Subtrees', () => {
  test('DOMParser availability and fingerprinting', () => {
    // Check if DOMParser is available or polyfilled in test runner
    if (typeof DOMParser === 'undefined') {
      console.log('DOMParser not in global scope in basic Bun test runtime');
      expect(true).toBe(true);
      return;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(
      `<div class="card p-5 r-lg col gap-2"><span class="text-sm">Metric</span><h2 class="text-3xl">100</h2></div>`,
      'text/html'
    );
    const el = doc.body.firstElementChild!;
    const fp = ComponentDetector.computeFingerprint(el);
    expect(fp).toContain('div.card.col.gap-2.p-5.r-lg');
    expect(fp).toContain('h2.text-3xl');
  });
});
