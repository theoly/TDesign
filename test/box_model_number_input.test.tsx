import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import {
  BoxModelInspector,
  sanitizeSpacingInput,
  formatCssSpacing,
  toDisplaySpacing,
  SpacingNumberInput
} from '../src/components/inspector/BoxModelInspector';
import { useProjectStore } from '../src/stores/useProjectStore';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('ISSUE-020: BoxModel 边距数字输入限制与即时生效测试', () => {
  let container: HTMLDivElement;
  let root: any;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => root.unmount());
    }
    if (container && container.parentNode) {
      container.remove();
    }
  });

  const render = (ui: React.ReactElement) => {
    act(() => {
      root.render(ui);
    });
  };

  const fireChange = (el: HTMLInputElement | HTMLSelectElement, val: string) => {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    nativeSetter?.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const fireKeyDown = (input: HTMLInputElement, key: string, shiftKey = false) => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
  };

  const fireBlur = (input: HTMLInputElement) => {
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  };

  test('单元逻辑: sanitizeSpacingInput 严格净化数字与非法字符', () => {
    // 净化非数字字符与特殊符号
    expect(sanitizeSpacingInput('20\\ab', false)).toBe('20');
    expect(sanitizeSpacingInput('20px', false)).toBe('20');
    expect(sanitizeSpacingInput('abc!@#', false)).toBe('');
    expect(sanitizeSpacingInput('12.5', false)).toBe('12.5');

    // Padding: 不允许负数
    expect(sanitizeSpacingInput('-15', false)).toBe('15');
    expect(sanitizeSpacingInput('-15px', false)).toBe('15');

    // Margin: 允许负数
    expect(sanitizeSpacingInput('-15', true)).toBe('-15');
    expect(sanitizeSpacingInput('-15px', true)).toBe('-15');
    expect(sanitizeSpacingInput('-', true)).toBe('-');

    // auto 关键字支持
    expect(sanitizeSpacingInput('auto', true, true)).toBe('auto');
    expect(sanitizeSpacingInput('AUTO', true, true)).toBe('auto');
    expect(sanitizeSpacingInput('auto', false, false)).toBe('');

    // CSS Token 保留
    expect(sanitizeSpacingInput('var(--space-4)', false)).toBe('var(--space-4)');
  });

  test('单元逻辑: formatCssSpacing 自动补齐 px 规范化为合法 CSS 属性值', () => {
    // 纯数字转为合法带 px 单位的 CSS 声明（避免无单位数字被浏览器丢弃）
    expect(formatCssSpacing('20', false)).toBe('20px');
    expect(formatCssSpacing('0', false)).toBe('0px');
    expect(formatCssSpacing('16.5', false)).toBe('16.5px');
    expect(formatCssSpacing('20px', false)).toBe('20px');

    // Margin 负数
    expect(formatCssSpacing('-12', true)).toBe('-12px');
    // Padding 负数保底归零
    expect(formatCssSpacing('-12', false)).toBe('0px');

    // 半输入或无效值不产出非法声明
    expect(formatCssSpacing('-', true)).toBe('');
    expect(formatCssSpacing('.', true)).toBe('');
    expect(formatCssSpacing('', true)).toBe('');

    // 关键字与 Token 保留
    expect(formatCssSpacing('auto', true)).toBe('auto');
    expect(formatCssSpacing('var(--space-3)', false)).toBe('var(--space-3)');
  });

  test('单元逻辑: toDisplaySpacing 纯净展示数值（剥离 px）', () => {
    expect(toDisplaySpacing('20px')).toBe('20');
    expect(toDisplaySpacing('-15px')).toBe('-15');
    expect(toDisplaySpacing('0px')).toBe('0');
    expect(toDisplaySpacing('auto')).toBe('auto');
    expect(toDisplaySpacing('var(--space-2)')).toBe('var(--space-2)');
    expect(toDisplaySpacing('')).toBe('');
  });

  test('CHK-F-01: Padding 4 边输入框仅允许非负数字，过滤非法字符 (如 20\\ab) 并补齐 px', () => {
    let changedProps: Record<string, string> = {};
    const handleStyleChange = (prop: string, val: string) => {
      changedProps[prop] = val;
    };

    render(
      <BoxModelInspector
        computedBox={{
          width: 300,
          height: 200,
          top: 0,
          left: 0,
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
          margin: { top: 0, right: 0, bottom: 0, left: 0 }
        }}
        declarations={{}}
        onStyleChange={handleStyleChange}
      />
    );

    const topInput = container.querySelector('input[data-testid="padding-top-input"]') as HTMLInputElement;
    expect(topInput).not.toBeNull();

    // 1. 用户输入 20\ab -> 被净化并自动加上 px 单位
    act(() => {
      fireChange(topInput, '20\\ab');
    });
    expect(changedProps['padding-top']).toBe('20px');
    expect(topInput.value).toBe('20');

    // 2. Padding 尝试输入负数 -10 -> 负号被剥离并加上 px
    act(() => {
      fireChange(topInput, '-10');
    });
    expect(changedProps['padding-top']).toBe('10px');
    expect(topInput.value).toBe('10');
  });

  test('CHK-F-02 & CHK-F-03: Margin 4 边输入框接受正负数字，过滤字母且产出有效 px 使得调整即时生效', () => {
    let changedProps: Record<string, string> = {};
    const handleStyleChange = (prop: string, val: string) => {
      changedProps[prop] = val;
    };

    render(
      <BoxModelInspector
        computedBox={{
          width: 300,
          height: 200,
          top: 0,
          left: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          margin: { top: 0, right: 0, bottom: 0, left: 0 }
        }}
        declarations={{}}
        onStyleChange={handleStyleChange}
      />
    );

    const topMarginInput = container.querySelector('input[data-testid="margin-top-input"]') as HTMLInputElement;
    expect(topMarginInput).not.toBeNull();

    // 1. 用户输入 20 -> 必须携带 px 单位 (20px)，保证注入 style#overrides 成为有效 CSS 使得浏览器能正确应用
    act(() => {
      fireChange(topMarginInput, '20');
    });
    expect(changedProps['margin-top']).toBe('20px');
    expect(topMarginInput.value).toBe('20');

    // 2. 用户输入 20\ab -> 过滤为 20 并应用 20px
    act(() => {
      fireChange(topMarginInput, '20\\ab');
    });
    expect(changedProps['margin-top']).toBe('20px');
    expect(topMarginInput.value).toBe('20');

    // 3. 用户输入负外边距 -15 -> 正确支持负数并带 px
    act(() => {
      fireChange(topMarginInput, '-15');
    });
    expect(changedProps['margin-top']).toBe('-15px');
    expect(topMarginInput.value).toBe('-15');

    // 4. 用户输入 auto -> 支持 auto
    act(() => {
      fireChange(topMarginInput, 'auto');
    });
    expect(changedProps['margin-top']).toBe('auto');
  });

  test('CHK-F-04: 输入框清空时正确调用空值覆盖，恢复默认状态', () => {
    let changedProps: Record<string, string> = {};
    const handleStyleChange = (prop: string, val: string) => {
      changedProps[prop] = val;
    };

    render(
      <BoxModelInspector
        computedBox={{
          width: 100,
          height: 100,
          top: 0,
          left: 0,
          padding: { top: 8, right: 8, bottom: 8, left: 8 },
          margin: { top: 0, right: 0, bottom: 0, left: 0 }
        }}
        declarations={{ 'padding-top': '24px' }}
        onStyleChange={handleStyleChange}
      />
    );

    const topInput = container.querySelector('input[data-testid="padding-top-input"]') as HTMLInputElement;
    // 初始显示 24
    expect(topInput.value).toBe('24');

    // 清空输入框
    act(() => {
      fireChange(topInput, '');
    });
    expect(changedProps['padding-top']).toBe('');
  });

  test('CHK-F-05: 联动模式下的自定义输入框同样受限数字与自动 px 格式化保护', () => {
    let changedProps: Record<string, string> = {};
    const handleStyleChange = (prop: string, val: string) => {
      changedProps[prop] = val;
    };

    render(
      <BoxModelInspector
        computedBox={{
          width: 200,
          height: 200,
          top: 0,
          left: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          margin: { top: 0, right: 0, bottom: 0, left: 0 }
        }}
        declarations={{}}
        onStyleChange={handleStyleChange}
      />
    );

    // 开启 Margin 锁定联动
    const linkButtons = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.title.includes('锁定') || b.title.includes('四边')
    );
    // 第 2 个是 Margin 联动按钮
    act(() => {
      linkButtons[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const customMarginInput = container.querySelector('input[data-testid="margin-linked-custom-input"]') as HTMLInputElement;
    expect(customMarginInput).not.toBeNull();

    // 联动自定义输入 30\xyz
    act(() => {
      fireChange(customMarginInput, '30\\xyz');
    });
    expect(changedProps['margin']).toBe('30px');
    expect(customMarginInput.value).toBe('30');
  });

  test('进阶体验: 键盘上下键微调 (ArrowUp/ArrowDown) 步进 1px 与 Shift 步进 10px', () => {
    let latestCss = '';
    render(
      <SpacingNumberInput
        value="10px"
        allowNegative={false}
        onChange={(val) => {
          latestCss = val;
        }}
        data-testid="test-number-input"
      />
    );

    const input = container.querySelector('input[data-testid="test-number-input"]') as HTMLInputElement;
    expect(input.value).toBe('10');

    // 按下 ArrowUp -> +1
    act(() => {
      fireKeyDown(input, 'ArrowUp');
    });
    expect(input.value).toBe('11');
    expect(latestCss).toBe('11px');

    // 按下 Shift+ArrowUp -> +10
    act(() => {
      fireKeyDown(input, 'ArrowUp', true);
    });
    expect(input.value).toBe('21');
    expect(latestCss).toBe('21px');

    // 按下 Shift+ArrowDown -> -10
    act(() => {
      fireKeyDown(input, 'ArrowDown', true);
    });
    expect(input.value).toBe('11');
    expect(latestCss).toBe('11px');
  });

  test('端到端集成: 输入数字生成的样式声明写入 overrides 并产出合法有效 CSS', () => {
    const store = useProjectStore.getState();
    const screenId = store.addScreen({
      name: '边距测试画框',
      htmlContent: '<div data-nid="box-elem" class="card">测试卡片</div>'
    });

    let generatedCssProp = '';
    let generatedCssVal = '';
    const handleStyleChange = (prop: string, val: string) => {
      generatedCssProp = prop;
      generatedCssVal = val;
      store.setOverride(screenId, 'box-elem', { [prop]: val });
    };

    render(
      <BoxModelInspector
        computedBox={{
          width: 300,
          height: 150,
          top: 0,
          left: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          margin: { top: 0, right: 0, bottom: 0, left: 0 }
        }}
        declarations={{}}
        onStyleChange={handleStyleChange}
      />
    );

    const topMarginInput = container.querySelector('input[data-testid="margin-top-input"]') as HTMLInputElement;

    // 用户在输入框中输入纯数字 20
    act(() => {
      fireChange(topMarginInput, '20');
    });

    expect(generatedCssProp).toBe('margin-top');
    expect(generatedCssVal).toBe('20px');

    // 检查 store 中的覆盖声明为带 px 的合法 CSS
    const ov = useProjectStore.getState().overrides[`${screenId}:box-elem`];
    expect(ov).toBeDefined();
    expect(ov.declarations['margin-top']).toBe('20px');

    // 验证拼装出有效可执行的 CSS 规则
    const decs = Object.entries(ov.declarations)
      .map(([p, v]) => `${p}: ${v} !important;`)
      .join(' ');
    expect(decs).toContain('margin-top: 20px !important;');
  });
});

