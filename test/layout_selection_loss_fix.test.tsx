import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { useProjectStore } from '../src/stores/useProjectStore';
import { ScreenFrame } from '../src/components/canvas/ScreenFrame';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const render = (component: React.ReactElement) => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(component);
  });
};

const cleanup = () => {
  if (root) {
    act(() => root.unmount());
  }
  if (container && container.parentNode) {
    container.remove();
  }
};

describe('ISSUE-019: 布局与样式修改时画框元素高亮选中态（.aidesign-selected）保持测试', () => {
  beforeEach(() => {
    useProjectStore.setState({
      screens: {},
      screenOrder: [],
      overrides: {},
      selectedNid: null,
      selectedNode: null,
      activeScreenId: null
    });
  });

  afterEach(() => {
    cleanup();
  });

  test('CHK-F-01 & CHK-F-02 & CHK-F-03: 修改布局属性（display, flex-direction, align, justify, gap）后，选中元素蓝框高亮绝不丢失', async () => {
    const store = useProjectStore.getState();
    const screenId = store.addScreen({
      name: '卡片布局测试',
      htmlContent: `
        <div data-nid="root1" class="container p-4">
          <div data-nid="card-activity" class="card col items-center gap-2 p-4">
            <span data-nid="icon1" class="icon">📅</span>
            <h3 data-nid="title1">参加活动</h3>
            <p data-nid="desc1">认识同类</p>
          </div>
        </div>
      `
    });
    store.setActiveScreen(screenId);

    // 选中「参加活动」卡片
    act(() => {
      store.selectNodeByNid(screenId, 'card-activity');
    });

    const screen = useProjectStore.getState().screens[screenId];
    render(<ScreenFrame screen={screen} lodLevel={2} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe).not.toBeNull();
    const doc = iframe.contentDocument!;
    const cardEl = doc.querySelector('[data-nid="card-activity"]') as HTMLElement;
    expect(cardEl).not.toBeNull();

    // 1. 验证初始状态带有选区高亮类名
    expect(cardEl.classList.contains('aidesign-selected')).toBe(true);

    const initialSrcDoc = iframe.getAttribute('srcdoc');

    // 2. 模拟用户在布局面板点击切换主轴方向：Row -> Column
    await act(async () => {
      store.setOverride(screenId, 'card-activity', { 'flex-direction': 'row' }, false, '设置 flex-direction: row');
    });

    // 断言：高亮类名在属性修改后必须持续存在！
    expect(cardEl.classList.contains('aidesign-selected')).toBe(true);

    // 断言：iframe srcdoc 属性不得改变（严禁整页重载）
    expect(iframe.getAttribute('srcdoc')).toBe(initialSrcDoc);

    // 断言：style id="overrides" 已经热注入了新样式
    const overridesStyle = doc.getElementById('overrides');
    expect(overridesStyle?.textContent).toContain('flex-direction: row !important;');

    // 3. 模拟用户连续点击多个布局按钮：切换对齐、间距、换行
    await act(async () => {
      store.setOverride(screenId, 'card-activity', {
        'justify-content': 'center',
        'align-items': 'center',
        'gap': 'var(--space-4)',
        'flex-wrap': 'wrap'
      }, false, '批量微调布局');
    });

    // 验证无论修改何种布局属性，选中元素的 .aidesign-selected 始终坚挺
    expect(cardEl.classList.contains('aidesign-selected')).toBe(true);
    expect(overridesStyle?.textContent).toContain('justify-content: center !important;');
    expect(overridesStyle?.textContent).toContain('gap: var(--space-4) !important;');

    // 4. 模拟切换模式为 Block
    await act(async () => {
      store.setOverride(screenId, 'card-activity', { display: 'block' }, false, '切换为 block');
    });

    expect(cardEl.classList.contains('aidesign-selected')).toBe(true);
    expect(overridesStyle?.textContent).toContain('display: block !important;');

    // 5. 模拟点击「还原布局」清除覆盖
    await act(async () => {
      store.clearNodeOverrides(screenId, 'card-activity');
    });

    // 还原后，选中状态依然稳固
    expect(cardEl.classList.contains('aidesign-selected')).toBe(true);
  });

  test('CHK-F-04: 当 iframe 发生重新加载时，handleLoad 能够自动恢复当前选中的高亮类名', async () => {
    const store = useProjectStore.getState();
    const screenId = store.addScreen({
      name: '重载恢复测试',
      htmlContent: '<div data-nid="root2"><div data-nid="target-node">目标元素</div></div>'
    });
    store.setActiveScreen(screenId);

    act(() => {
      store.selectNodeByNid(screenId, 'target-node');
    });

    const screen = useProjectStore.getState().screens[screenId];
    render(<ScreenFrame screen={screen} lodLevel={2} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    const doc = iframe.contentDocument!;
    const targetEl = doc.querySelector('[data-nid="target-node"]') as HTMLElement;
    expect(targetEl.classList.contains('aidesign-selected')).toBe(true);

    // 人工清除类名，模拟跨文档刷新
    targetEl.classList.remove('aidesign-selected');
    expect(targetEl.classList.contains('aidesign-selected')).toBe(false);

    // 触发 iframe load 事件
    await act(async () => {
      iframe.dispatchEvent(new Event('load'));
    });

    // 验证 handleLoad 自动为当前选中的 target-node 恢复 .aidesign-selected
    expect(targetEl.classList.contains('aidesign-selected')).toBe(true);
  });
});
