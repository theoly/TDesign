import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ScreenFrame } from '../src/components/canvas/ScreenFrame';
import { useProjectStore } from '../src/stores/useProjectStore';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('画框标题栏颜色与深色画布可视性测试 (Screen Title Color & Contrast - T-STC-01 ~ T-STC-04 / ISSUE-022)', () => {
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

  test('CHK-F-01: 浅色工程模式下，未激活标题使用高对比度亮色 text-slate-300，绝不包含导致看不清的暗色 text-slate-700', async () => {
    const mockScreen = {
      id: 'screen-title-light-inactive',
      name: '送花表达心意 - 牵手币充值',
      htmlContent: '<div data-nid="root001" class="p-4"><p>内容</p></div>',
      scopedCss: '',
      position: { x: 0, y: 0 },
      width: 390,
      measuredHeight: 600,
      updatedAt: Date.now(),
      metadata: {}
    };

    useProjectStore.setState({
      screens: { [mockScreen.id]: mockScreen },
      screenOrder: [mockScreen.id],
      activeScreenId: 'other-screen-id', // 未激活
      settings: {
        ...useProjectStore.getState().settings,
        deviceProfile: 'mobile',
        frameWidth: 390,
        colorMode: 'light' // 浅色模式
      }
    });

    await act(async () => {
      root.render(<ScreenFrame screen={mockScreen} lodLevel={1} />);
    });

    const header = container.querySelector('div.min-h-\\[26px\\]');
    expect(header).not.toBeNull();
    // 必须包含亮色文字类名
    expect(header?.className).toContain('text-slate-300');
    expect(header?.className).toContain('hover:text-white');
    // 绝对不包含暗色类名
    expect(header?.className).not.toContain('text-slate-700');
    expect(header?.className).not.toContain('text-slate-600');
  });

  test('CHK-F-02: 浅色工程模式下，激活标题具备 text-blue-400 醒目亮蓝，绝不包含过暗的 text-blue-600', async () => {
    const mockScreen = {
      id: 'screen-title-light-active',
      name: '编辑资料',
      htmlContent: '<div data-nid="root002" class="p-4"><p>内容</p></div>',
      scopedCss: '',
      position: { x: 0, y: 0 },
      width: 390,
      measuredHeight: 600,
      updatedAt: Date.now(),
      metadata: {}
    };

    useProjectStore.setState({
      screens: { [mockScreen.id]: mockScreen },
      screenOrder: [mockScreen.id],
      activeScreenId: mockScreen.id, // 激活态
      settings: {
        ...useProjectStore.getState().settings,
        deviceProfile: 'mobile',
        frameWidth: 390,
        colorMode: 'light' // 浅色模式
      }
    });

    await act(async () => {
      root.render(<ScreenFrame screen={mockScreen} lodLevel={2} />);
    });

    const header = container.querySelector('div.min-h-\\[26px\\]');
    expect(header).not.toBeNull();
    // 包含高对比度亮蓝
    expect(header?.className).toContain('text-blue-400');
    expect(header?.className).toContain('font-semibold');
    // 不包含深蓝
    expect(header?.className).not.toContain('text-blue-600');
  });

  test('CHK-F-03: 深色工程模式下，未激活与激活标题均保持高对比度亮色', async () => {
    const mockScreen = {
      id: 'screen-title-dark',
      name: '深色页面',
      htmlContent: '<div data-nid="root003" class="p-4"><p>内容</p></div>',
      scopedCss: '',
      position: { x: 0, y: 0 },
      width: 390,
      measuredHeight: 600,
      updatedAt: Date.now(),
      metadata: {}
    };

    // 1. 深色未激活
    useProjectStore.setState({
      screens: { [mockScreen.id]: mockScreen },
      screenOrder: [mockScreen.id],
      activeScreenId: 'other-screen',
      settings: {
        ...useProjectStore.getState().settings,
        colorMode: 'dark'
      }
    });

    await act(async () => {
      root.render(<ScreenFrame screen={mockScreen} lodLevel={1} />);
    });

    let header = container.querySelector('div.min-h-\\[26px\\]');
    expect(header?.className).toContain('text-slate-300');
    expect(header?.className).not.toContain('text-slate-700');

    // 2. 深色激活
    useProjectStore.setState({ activeScreenId: mockScreen.id });
    await act(async () => {
      root.render(<ScreenFrame screen={mockScreen} lodLevel={2} />);
    });

    header = container.querySelector('div.min-h-\\[26px\\]');
    expect(header?.className).toContain('text-blue-400');
    expect(header?.className).not.toContain('text-blue-600');
  });

  test('CHK-F-04: 激活状态下操作按钮统一采用深色工作台高对比度类名，不包含 text-slate-600', async () => {
    const mockScreen = {
      id: 'screen-buttons-test',
      name: '操作按钮测试',
      htmlContent: '<div data-nid="root004" class="p-4"></div>',
      scopedCss: '',
      position: { x: 0, y: 0 },
      width: 390,
      measuredHeight: 600,
      updatedAt: Date.now(),
      metadata: {}
    };

    useProjectStore.setState({
      screens: { [mockScreen.id]: mockScreen },
      screenOrder: [mockScreen.id],
      activeScreenId: mockScreen.id,
      settings: {
        ...useProjectStore.getState().settings,
        colorMode: 'light' // 即使在浅色模式下，画布也是深色，按钮必须为深色工作台风格
      }
    });

    await act(async () => {
      root.render(<ScreenFrame screen={mockScreen} lodLevel={2} />);
    });

    const copyBtn = container.querySelector('button[title="复制画框"]');
    const editBtn = container.querySelector('button[title="重命名画框"]');
    const deleteBtn = container.querySelector('button[title="删除画框"]');
    const coverBtn = container.querySelector('button[title="设为工程封面"]');

    expect(copyBtn).not.toBeNull();
    expect(copyBtn?.className).toContain('text-slate-400');
    expect(copyBtn?.className).not.toContain('text-slate-600');

    expect(editBtn).not.toBeNull();
    expect(editBtn?.className).toContain('text-slate-400');
    expect(editBtn?.className).not.toContain('text-slate-600');

    expect(deleteBtn).not.toBeNull();
    expect(deleteBtn?.className).toContain('text-slate-400');
    expect(deleteBtn?.className).not.toContain('text-slate-600');

    expect(coverBtn).not.toBeNull();
    expect(coverBtn?.className).toContain('text-slate-400');
    expect(coverBtn?.className).not.toContain('text-slate-600');
  });

  test('CHK-F-05: 双击重命名行内输入框使用深色背景与亮色字体 (bg-slate-900 text-white)', async () => {
    const mockScreen = {
      id: 'screen-rename-input',
      name: '双击输入框测试',
      htmlContent: '<div data-nid="root005" class="p-4"></div>',
      scopedCss: '',
      position: { x: 0, y: 0 },
      width: 390,
      measuredHeight: 600,
      updatedAt: Date.now(),
      metadata: {}
    };

    useProjectStore.setState({
      screens: { [mockScreen.id]: mockScreen },
      screenOrder: [mockScreen.id],
      activeScreenId: mockScreen.id,
      settings: {
        ...useProjectStore.getState().settings,
        colorMode: 'light'
      }
    });

    await act(async () => {
      root.render(<ScreenFrame screen={mockScreen} lodLevel={2} />);
    });

    // 找到标题 span 并双击
    const titleSpan = container.querySelector('span[title*="双击重命名"]');
    expect(titleSpan).not.toBeNull();

    act(() => {
      titleSpan?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });

    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.className).toContain('bg-slate-900');
    expect(input.className).toContain('text-white');
    expect(input.className).not.toContain('bg-white');
  });
});
