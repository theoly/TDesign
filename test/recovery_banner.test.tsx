import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { RecoveryBanner } from '../src/App';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('RecoveryBanner: 10s Auto-dismiss Countdown', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test('CHK-RB-01: renders banner with recovery message and initial 10s countdown button', () => {
    let dismissed = false;
    const fakeTime = Date.now() - 3600000;

    act(() => {
      root.render(
        <RecoveryBanner
          uncleanShutdownAt={fakeTime}
          onDismiss={() => {
            dismissed = true;
          }}
        />
      );
    });

    const banner = container.querySelector('[data-testid="recovery-banner"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('已恢复至最后一次自动保存');
    expect(banner?.textContent).toContain('知道了 (10s)');
    expect(dismissed).toBe(false);
  });

  test('CHK-RB-03: clicking "知道了" triggers onDismiss immediately', () => {
    let dismissed = false;
    const fakeTime = Date.now() - 3600000;

    act(() => {
      root.render(
        <RecoveryBanner
          uncleanShutdownAt={fakeTime}
          onDismiss={() => {
            dismissed = true;
          }}
        />
      );
    });

    const button = container.querySelector('button') as HTMLButtonElement;
    expect(button).not.toBeNull();

    act(() => {
      button.click();
    });

    expect(dismissed).toBe(true);
  });

  test('CHK-RB-02: countdown decrements and auto-dismisses when time expires', async () => {
    let dismissed = false;
    const fakeTime = Date.now() - 3600000;

    act(() => {
      root.render(
        <RecoveryBanner
          uncleanShutdownAt={fakeTime}
          onDismiss={() => {
            dismissed = true;
          }}
        />
      );
    });

    const button = container.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toBe('知道了 (10s)');

    // Wait 1.1s for at least one tick
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1100));
    });

    expect(button.textContent).toContain('9s');
    expect(dismissed).toBe(false);
  });
});
