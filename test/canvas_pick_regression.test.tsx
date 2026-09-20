import { describe, test, expect, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { InfiniteCanvas } from '../src/components/canvas/InfiniteCanvas';
import { useProjectStore } from '../src/stores/useProjectStore';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * ISSUE-017 回归：桌面端 (Tauri macOS WKWebView) 画框完全无法点选元素。
 *
 * 根因是画框 iframe 上的 `sandbox="allow-same-origin"`：WebKit 对「脚本被禁用」
 * 的文档不执行任何事件监听器，连宿主 realm 注册的都不执行。Chromium 无此行为，
 * 因此 happy-dom 单测与浏览器 dev 环境都验不出来——**本组用例只能守住契约本身**：
 * 画框不得带 sandbox 属性，且脚本隔离必须由 CSP 顶上，二者缺一都是回归。
 */
describe('ISSUE-017 画框点选能力与沙箱策略回归', () => {
  let container: HTMLDivElement;
  let root: Root;

  const SCREEN_HTML =
    '<div class="p-8" data-nid="aaaaaaaa"><h1 data-nid="bbbbbbbb">标题</h1></div>';

  const mount = async () => {
    useProjectStore.setState({
      screens: {
        s1: {
          id: 's1',
          name: '页面 1',
          htmlContent: SCREEN_HTML,
          position: { x: 0, y: 0 },
          measuredHeight: 800
        } as any
      },
      screenOrder: ['s1'],
      activeScreenId: 's1',
      selectedNid: null,
      selectedNode: null,
      viewportTransform: { x: 0, y: 0, scale: 1 }
    } as any);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(InfiniteCanvas, {}));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120));
    });
    return container.querySelector('iframe') as HTMLIFrameElement;
  };

  afterEach(() => {
    if (root) act(() => root.unmount());
    if (container) container.remove();
  });

  test('画框 iframe 不得带 sandbox 属性（WebKit 下会让宿主监听器全部失效）', async () => {
    const iframe = await mount();
    expect(iframe).not.toBeNull();
    expect(iframe.hasAttribute('sandbox')).toBe(false);
  });

  test('去掉 sandbox 后脚本隔离必须由 CSP 顶上，不得裸奔', async () => {
    const iframe = await mount();
    const srcdoc = iframe.getAttribute('srcdoc') || '';
    expect(srcdoc).toContain('http-equiv="Content-Security-Policy"');
    expect(srcdoc).toContain("script-src 'none'");
    // CSP 必须落在 <head> 内且位于任何内容之前，否则对文档无效
    expect(srcdoc.indexOf('Content-Security-Policy')).toBeLessThan(srcdoc.indexOf('<body>'));
  });

  test('画框内点击元素仍写入 selectedNode（基线能力不得回归）', async () => {
    const iframe = await mount();
    const doc = iframe.contentDocument!;
    const el = doc.querySelector('[data-nid="bbbbbbbb"]') as HTMLElement;
    expect(el).not.toBeNull();
    await act(async () => {
      el.dispatchEvent(new (doc.defaultView as any).MouseEvent('click', { bubbles: true }));
    });
    const st = useProjectStore.getState();
    expect(st.selectedNid).toBe('bbbbbbbb');
    expect(st.selectedNode?.tagName).toBe('h1');
  });
});

/**
 * ISSUE-017 次要缺陷：新建与复制出来的画框几乎完整压在旧画框之上
 * （固定偏移 40 / 80px，而画框宽 390~1440px），被压住的画框既看不见也点不到。
 */
describe('ISSUE-017 新画框落位不得相互压盖', () => {
  const prime = () => {
    useProjectStore.setState({
      screens: {},
      screenOrder: [],
      activeScreenId: null,
      selectedNid: null,
      selectedNode: null
    } as any);
  };

  test('连续新建空白画框：相邻画框水平间距不小于一个画框宽度', () => {
    prime();
    const st = useProjectStore.getState();
    const frameWidth = st.settings.frameWidth;
    const a = st.addBlankScreen();
    const b = useProjectStore.getState().addBlankScreen();
    const c = useProjectStore.getState().addBlankScreen();

    const xs = [a, b, c].map((id) => useProjectStore.getState().screens[id].position.x);
    expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(frameWidth);
    expect(xs[2] - xs[1]).toBeGreaterThanOrEqual(frameWidth);
  });

  test('复制画框：副本不得压在原画框之上', () => {
    prime();
    const frameWidth = useProjectStore.getState().settings.frameWidth;
    const a = useProjectStore.getState().addBlankScreen();
    const copy = useProjectStore.getState().duplicateScreen(a)!;

    const xa = useProjectStore.getState().screens[a].position.x;
    const xc = useProjectStore.getState().screens[copy].position.x;
    expect(Math.abs(xc - xa)).toBeGreaterThanOrEqual(frameWidth);
  });
});
