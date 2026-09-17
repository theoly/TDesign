import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ChatDrawer } from '../src/components/chat/ChatDrawer';
import { useAIConfigStore, defaultProviders, defaultBindings } from '../src/stores/useAIConfigStore';
import { AIService } from '../src/services/ai/aiService';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('ChatDrawer: AI Thinking & Collapsible Feedback & Click-to-Stop', () => {
  let container: HTMLDivElement;
  let root: Root;

  const fireChange = (el: HTMLInputElement | HTMLTextAreaElement, val: string) => {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value'
    )?.set;
    nativeSetter?.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  beforeEach(() => {
    localStorage.clear();
    // Ensure active provider has an API key so sending messages doesn't block on warning
    useAIConfigStore.setState({
      providers: defaultProviders.map((p) =>
        p.id === 'prov-deepseek' ? { ...p, apiKey: 'sk-test-key-valid' } : p
      ),
      bindings: defaultBindings
    });

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

  test('collapsible thinking & feedback process can be expanded and collapsed', async () => {
    let mockOnEvent: any;
    let mockAbortCalled = false;

    // Mock AIService.stream
    AIService.stream = (_prov, _mod, _msgs, onEvent) => {
      mockOnEvent = onEvent;
      return {
        abort: () => {
          mockAbortCalled = true;
        },
        promise: new Promise((resolve) => {
          // Delay resolve to test in-flight thinking state
          setTimeout(() => {
            onEvent({ type: 'Delta', text: '```html\n<div class="card">Hello</div>\n```' });
            onEvent({ type: 'Done', finish_reason: 'stop' });
            resolve();
          }, 100);
        })
      };
    };

    act(() => {
      root.render(React.createElement(ChatDrawer, { onOpenSettings: () => {} }));
    });

    const textarea = container.querySelector('textarea');
    expect(textarea).not.toBeNull();

    // Type prompt
    act(() => {
      fireChange(textarea!, '生成科技感仪表盘');
    });

    // Find submit button
    const sendBtn = container.querySelector('button[title*="发送设计诉求"]');
    expect(sendBtn).not.toBeNull();

    // Click submit
    await act(async () => {
      sendBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // 1. Verify thinking card appears during generation
    expect(container.textContent).toContain('AI 正在深度推理与规划');
    expect(container.textContent).toContain('意图推理与多模态反推');

    // Wait for the stream promise to finish
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });

    // 2. Once finished, thinking card is in collapsed state (简略展示)
    expect(container.textContent).toContain('AI 思考与反馈过程');
    expect(container.textContent).toContain('展开');

    // Click to expand thinking details
    const toggleBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('AI 思考与反馈过程')
    );
    expect(toggleBtn).toBeDefined();

    act(() => {
      toggleBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Detailed steps are now visible
    expect(container.textContent).toContain('收起');
    expect(container.textContent).toContain('检索设计规范与工程约定');
    expect(container.textContent).toContain('高保真代码生成与画布同步');

    // Click again to collapse
    act(() => {
      toggleBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('展开');
  });

  test('submit button displays loading state during generation and can be clicked to stop', async () => {
    let mockAbortCalled = false;
    let resolveStreamPromise: () => void;

    AIService.stream = (_prov, _mod, _msgs, _onEvent) => {
      return {
        abort: () => {
          mockAbortCalled = true;
        },
        promise: new Promise<void>((resolve) => {
          resolveStreamPromise = resolve;
        })
      };
    };

    act(() => {
      root.render(React.createElement(ChatDrawer, { onOpenSettings: () => {} }));
    });

    const textarea = container.querySelector('textarea');
    act(() => {
      fireChange(textarea!, '做一个登录页面');
    });

    const sendBtn = container.querySelector('button[title*="发送设计诉求"]');
    await act(async () => {
      sendBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Submit button should now be in loading state
    const stopBtn = container.querySelector('button[title*="点击可立即停止"]');
    expect(stopBtn).not.toBeNull();
    expect(stopBtn?.textContent).toContain('思考中');
    expect(stopBtn?.textContent).toContain('停止');
    expect(stopBtn?.querySelector('.animate-spin')).not.toBeNull();

    // Click the loading/stop button to stop generation
    await act(async () => {
      stopBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      resolveStreamPromise!();
    });

    expect(mockAbortCalled).toBe(true);
    // Assistant message reflects that it was stopped
    expect(container.textContent).toContain('生成已由用户手动停止');

    // The button transitions back to regular send button
    const restoredSendBtn = container.querySelector('button[title*="发送设计诉求"]');
    expect(restoredSendBtn).not.toBeNull();
  });

  describe('extractHtml & Semantic Tag Screen Creation', () => {
    const { extractHtml } = require('../src/components/chat/ChatDrawer');

    test('extracts HTML from standard markdown code block', () => {
      const raw = '好的，这是为您设计的登录页：\n```html\n<form class="card p-6">\n  <input type="tel" />\n</form>\n```\n希望对您有帮助！';
      const extracted = extractHtml(raw);
      expect(extracted).not.toBeNull();
      expect(extracted).toContain('<form class="card p-6">');
      expect(extracted).not.toContain('好的，这是为您设计的');
      expect(extracted).not.toContain('```');
    });

    test('extracts HTML with <main> or <section> or unclosed code block', () => {
      // Unclosed code block cut off by token limit
      const unclosed = '```html\n<main class="min-h-screen p-4">\n  <div class="row">Hello</div>';
      const extracted = extractHtml(unclosed);
      expect(extracted).not.toBeNull();
      expect(extracted).toContain('<main class="min-h-screen p-4">');
    });

    test('extracts direct HTML when model omits markdown backticks', () => {
      const raw = '<div class="card p-4"><h3>登录</h3><input class="input" /></div>';
      const extracted = extractHtml(raw);
      expect(extracted).toBe(raw);
    });

    test('strips <think> tags before extracting HTML', () => {
      const raw = '<think>用户想要一个登录页面，需要包含手机号和验证码。</think>\n```html\n<form class="card">\n  <input />\n</form>\n```';
      const extracted = extractHtml(raw);
      expect(extracted).not.toBeNull();
      expect(extracted).toContain('<form class="card">');
      expect(extracted).not.toContain('用户想要一个登录页面');
    });

    test('returns null when model gives conversational response without HTML', () => {
      const conversational = '请问您需要使用浅色主题还是深色主题？需要支持微信第三方登录吗？';
      const extracted = extractHtml(conversational);
      expect(extracted).toBeNull();
    });
  });
});
