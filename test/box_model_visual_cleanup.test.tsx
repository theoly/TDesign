import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { BoxModelInspector } from '../src/components/inspector/BoxModelInspector';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('属性面板去除盒模型同心图可视化展示测试 (Box Model Visual Cleanup - T-BMC-01 ~ T-BMC-04)', () => {
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

  test('CHK-F-01: BoxModelInspector 渲染结果中绝对不包含嵌套同心盒模型图（无 MARGIN/PADDING/CONTENT 外框）', () => {
    act(() => {
      root.render(
        <BoxModelInspector
          computedBox={{
            width: 320,
            height: 180,
            top: 0,
            left: 0,
            padding: { top: 16, right: 24, bottom: 16, left: 24 },
            margin: { top: 8, right: 12, bottom: 8, left: 12 }
          }}
          declarations={{}}
          onStyleChange={() => {}}
        />
      );
    });

    const text = container.textContent || '';
    // 确保绝对不包含旧同心框的大写文字及 CONTENT 标签
    expect(text).not.toContain('MARGIN (外边距)');
    expect(text).not.toContain('PADDING (内边距)');
    expect(text).not.toContain('CONTENT');
    expect(text).not.toContain('320 × 180');

    // 确保 DOM 中无嵌套的同心盒模型容器
    const outerMarginBox = container.querySelector('.bg-amber-950\\/20');
    const innerPaddingBox = container.querySelector('.bg-emerald-950\\/25');
    const centerContentBox = container.querySelector('.bg-blue-950\\/40');
    expect(outerMarginBox).toBeNull();
    expect(innerPaddingBox).toBeNull();
    expect(centerContentBox).toBeNull();
  });

  test('CHK-F-02: BoxModelInspector 仍然正常保留「盒模型与间距 (Box Model)」顶栏与「还原边距」重置按钮', () => {
    let resetCount = 0;
    act(() => {
      root.render(
        <BoxModelInspector
          computedBox={{
            width: 320,
            height: 180,
            top: 0,
            left: 0,
            padding: { top: 16, right: 24, bottom: 16, left: 24 },
            margin: { top: 8, right: 12, bottom: 8, left: 12 }
          }}
          declarations={{
            'padding-top': '20px',
            'margin-bottom': '10px'
          }}
          onStyleChange={(_prop, val) => {
            if (val === '') resetCount++;
          }}
        />
      );
    });

    // 顶栏标题
    expect(container.textContent).toContain('盒模型与间距 (Box Model)');

    // 还原边距按钮存在（因为有覆盖）
    const resetBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('还原边距')
    );
    expect(resetBtn).toBeDefined();

    // 点击还原边距
    act(() => {
      resetBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(resetCount).toBeGreaterThan(0);
  });

  const fireChange = (el: HTMLInputElement | HTMLSelectElement, val: string) => {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    nativeSetter?.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  test('CHK-F-03: Padding (内边距) 控制器完整可用且样式修改即时触发回调', () => {
    const changes: Record<string, string> = {};
    act(() => {
      root.render(
        <BoxModelInspector
          computedBox={{
            width: 320,
            height: 180,
            top: 0,
            left: 0,
            padding: { top: 16, right: 24, bottom: 16, left: 24 },
            margin: { top: 8, right: 12, bottom: 8, left: 12 }
          }}
          declarations={{}}
          onStyleChange={(prop, val) => {
            changes[prop] = val;
          }}
        />
      );
    });

    expect(container.textContent).toContain('Padding (内边距)');

    // 找到 Padding Top 输入框 (第 1 个 input)
    const inputs = container.querySelectorAll('input');
    expect(inputs.length).toBeGreaterThanOrEqual(4);
    const topInput = inputs[0] as HTMLInputElement;

    act(() => {
      fireChange(topInput, '32');
    });

    expect(changes['padding-top']).toBe('32px');
  });

  test('CHK-F-04: Margin (外边距) 控制器完整可用且样式修改即时触发回调', () => {
    const changes: Record<string, string> = {};
    act(() => {
      root.render(
        <BoxModelInspector
          computedBox={{
            width: 320,
            height: 180,
            top: 0,
            left: 0,
            padding: { top: 16, right: 24, bottom: 16, left: 24 },
            margin: { top: 8, right: 12, bottom: 8, left: 12 }
          }}
          declarations={{}}
          onStyleChange={(prop, val) => {
            changes[prop] = val;
          }}
        />
      );
    });

    expect(container.textContent).toContain('Margin (外边距)');

    // 找到 Margin Top 输入框 (第 5 个 input)
    const inputs = container.querySelectorAll('input');
    expect(inputs.length).toBeGreaterThanOrEqual(8);
    const marginTopInput = inputs[4] as HTMLInputElement;

    act(() => {
      fireChange(marginTopInput, '15');
    });

    expect(changes['margin-top']).toBe('15px');
  });
});
