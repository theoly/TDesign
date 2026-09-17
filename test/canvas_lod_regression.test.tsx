import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { InfiniteCanvas } from '../src/components/canvas/InfiniteCanvas';
import { useProjectStore } from '../src/stores/useProjectStore';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * ISSUE-014 回归：
 *  1. 画框从 L0 降级档位回到 L1/L2 时，iframe 被 React 重新挂载，
 *     旧元素上的点选监听随之消失 —— 画框永久失去可选中能力。
 *  2. 画框壳与 L0 占位层底色写死浅色，深色模式下表现为「不遵循主题」。
 */
describe('ISSUE-014 画布 LOD 重挂载与主题底色回归', () => {
  let container: HTMLDivElement;
  let root: Root;

  const SCREEN_HTML =
    '<div class="p-8" data-nid="aaaaaaaa"><h1 data-nid="bbbbbbbb">标题</h1></div>';

  const mount = async (colorMode: 'light' | 'dark' = 'light') => {
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
      viewportTransform: { x: 0, y: 0, scale: 1 },
      settings: { ...useProjectStore.getState().settings, colorMode }
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
  };

  const setScale = async (scale: number) => {
    await act(async () => {
      useProjectStore.getState().setViewportTransform({ x: 0, y: 0, scale });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120));
    });
  };

  const clickNode = async (nid: string) => {
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe).not.toBeNull();
    const doc = iframe.contentDocument!;
    const el = doc.querySelector(`[data-nid="${nid}"]`) as HTMLElement;
    expect(el).not.toBeNull();
    await act(async () => {
      el.dispatchEvent(new (doc.defaultView as any).MouseEvent('click', { bubbles: true }));
    });
  };

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test('基线：L2 活动画框点选元素可写入 selectedNode', async () => {
    await mount();
    await clickNode('bbbbbbbb');
    const st = useProjectStore.getState();
    expect(st.selectedNid).toBe('bbbbbbbb');
    expect(st.selectedNode?.tagName).toBe('h1');
  });

  test('缺陷 1：缩小至 L0 再放大回 L2 后，画框仍必须可点选（iframe 重挂载需重新绑定监听）', async () => {
    await mount();

    // 缩小到 scale < 0.25 -> LOD 0，iframe 被卸载
    await setScale(0.2);
    expect(container.querySelector('iframe')).toBeNull();

    // 放大回来 -> LOD 2，React 挂载的是一个全新的 iframe 元素
    await setScale(1);
    expect(container.querySelector('iframe')).not.toBeNull();

    await clickNode('bbbbbbbb');
    const st = useProjectStore.getState();
    expect(st.selectedNid).toBe('bbbbbbbb');
    expect(st.selectedNode?.tagName).toBe('h1');
  });

  test('缺陷 2：深色模式下画框壳底色必须取自 Token，不得写死白色', async () => {
    await mount('dark');
    const tokens = useProjectStore.getState().designSystem.tokens;
    const darkBg = tokens.colors.background.dark;

    const shell = Array.from(container.querySelectorAll('div')).find(
      (d) => (d as HTMLElement).style.width && (d as HTMLElement).style.height
    ) as HTMLElement;
    expect(shell).toBeDefined();
    expect(shell.style.background.toLowerCase()).not.toBe('#ffffff');
    expect(shell.style.background.toLowerCase()).toBe(darkBg.toLowerCase());
  });

  test('缺陷 2：L0 占位层底色必须跟随明暗模式', async () => {
    await mount('dark');
    await setScale(0.2);

    const placeholder = Array.from(container.querySelectorAll('div')).find(
      (d) => d.className.includes('font-mono') && d.textContent?.includes('L0 位图降级缩略视图')
    ) as HTMLElement;
    expect(placeholder).toBeDefined();
    expect(placeholder.className).not.toContain('bg-slate-100');

    const darkBg = useProjectStore.getState().designSystem.tokens.colors.background.dark;
    expect(placeholder.style.background.toLowerCase()).toBe(darkBg.toLowerCase());
  });

  test('短内容页不得漏出壳层底色：根元素必须带 Token 底色且不干扰高度测量', async () => {
    await mount('dark');
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    const srcdoc = iframe.getAttribute('srcdoc') || '';
    // 根元素背景会绘制整个 iframe 画布，短内容页也不会露白
    expect(srcdoc).toContain('html { background-color: var(--color-bg, #f8fafc); }');
    // body 上的 min-height:100% 对 height:auto 的 html 是空操作；且一旦改成真的撑满，
    // body.scrollHeight 会被画框高度反向撑住，画框再也无法随内容变矮 (D13)
    expect(srcdoc).not.toContain('<body style="min-height: 100%;">');
    expect(srcdoc).not.toContain('min-height: 100%');
  });
});
