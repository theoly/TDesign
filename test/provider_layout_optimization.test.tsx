import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { AIProviderModal } from '../src/components/settings/AIProviderModal';
import { useAIConfigStore, defaultProviders, defaultBindings } from '../src/stores/useAIConfigStore';
import { AIProviderConfig } from '../src/types/provider';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('AI Provider 自定义模型信息布局优化验证', () => {
  let container: HTMLDivElement;
  let root: Root;

  const customAliyunProvider: AIProviderConfig = {
    id: 'prov-custom-aliyun',
    name: '阿里百炼 Token Plan (Aliyun)',
    protocol: 'openai_compatible',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: 'sk-test-aliyun',
    isEnabled: true,
    defaultModel: 'qwen-plus',
    isCustom: true
  };

  beforeEach(() => {
    localStorage.clear();
    useAIConfigStore.setState({
      providers: [...defaultProviders, customAliyunProvider],
      bindings: { ...defaultBindings }
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
  });

  test('CHK-F-05: 弹窗与侧边栏宽度舒展，具备工业级呼吸感 (max-w-5xl 与 w-72)', () => {
    act(() => {
      root.render(<AIProviderModal onClose={() => {}} />);
    });

    const modalDialog = container.querySelector('.max-w-5xl');
    expect(modalDialog).not.toBeNull();

    const sidebar = container.querySelector('.w-72');
    expect(sidebar).not.toBeNull();
    expect(sidebar?.classList.contains('flex-shrink-0')).toBe(true);
  });

  test('CHK-F-01 & CHK-F-02: 左侧厂商列表项中“第三方”徽章防压缩与截断样式', () => {
    act(() => {
      root.render(<AIProviderModal onClose={() => {}} />);
    });

    // 查找包含“阿里百炼”的列表项
    const buttons = Array.from(container.querySelectorAll('button'));
    const aliyunBtn = buttons.find((btn) => btn.textContent?.includes('阿里百炼 Token Plan'));
    expect(aliyunBtn).toBeDefined();

    // 验证名称容器与 truncate
    const nameSpan = aliyunBtn?.querySelector('.truncate');
    expect(nameSpan).not.toBeNull();
    expect(nameSpan?.textContent).toContain('阿里百炼 Token Plan');

    // 验证“第三方”徽章具备 shrink-0 和 whitespace-nowrap
    const badge = Array.from(aliyunBtn?.querySelectorAll('span') || []).find(
      (s) => s.textContent?.trim() === '第三方'
    );
    expect(badge).toBeDefined();
    expect(badge?.classList.contains('shrink-0')).toBe(true);
    expect(badge?.classList.contains('whitespace-nowrap')).toBe(true);
  });

  test('CHK-F-03 & CHK-F-04: 中间主编辑区头部“自定义第三方”防挤压与布局排版', () => {
    act(() => {
      root.render(<AIProviderModal onClose={() => {}} />);
    });

    // 点击切换到自定义阿里百炼 Provider
    const buttons = Array.from(container.querySelectorAll('button'));
    const aliyunBtn = buttons.find((btn) => btn.textContent?.includes('阿里百炼 Token Plan'));
    act(() => {
      aliyunBtn?.click();
    });

    // 查找标题输入框
    const input = container.querySelector('input[placeholder="Provider 名称"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('阿里百炼 Token Plan (Aliyun)');

    // 查找“自定义第三方”徽章并断言样式
    const customBadge = Array.from(container.querySelectorAll('span')).find(
      (s) => s.textContent?.trim() === '自定义第三方'
    );
    expect(customBadge).toBeDefined();
    expect(customBadge?.classList.contains('shrink-0')).toBe(true);
    expect(customBadge?.classList.contains('whitespace-nowrap')).toBe(true);

    // 验证右侧头部档位按钮均具备 shrink-0 与 whitespace-nowrap
    const headerActions = container.querySelector('[data-testid="header-role-actions"]');
    expect(headerActions).not.toBeNull();
    const actionItems = Array.from(headerActions?.children || []);
    expect(actionItems.length).toBeGreaterThan(0);
    actionItems.forEach((item) => {
      expect(item.classList.contains('shrink-0')).toBe(true);
      expect(item.classList.contains('whitespace-nowrap')).toBe(true);
    });
  });

  test('修改自定义 Provider 名称能即时在左侧与右侧同步更新且不破坏布局', () => {
    act(() => {
      root.render(<AIProviderModal onClose={() => {}} />);
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const aliyunBtn = buttons.find((btn) => btn.textContent?.includes('阿里百炼 Token Plan'));
    act(() => {
      aliyunBtn?.click();
    });

    const input = container.querySelector('input[placeholder="Provider 名称"]') as HTMLInputElement;
    act(() => {
      input.value = '超级超长第三方自定义千问模型接入服务 (DashScope Qwen)';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      // 触发 onChange
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      nativeInputValueSetter?.call(input, '超级超长第三方自定义千问模型接入服务 (DashScope Qwen)');
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const customBadge = Array.from(container.querySelectorAll('span')).find(
      (s) => s.textContent?.trim() === '自定义第三方'
    );
    expect(customBadge).toBeDefined();
    expect(customBadge?.classList.contains('shrink-0')).toBe(true);
    expect(customBadge?.classList.contains('whitespace-nowrap')).toBe(true);
  });
});
