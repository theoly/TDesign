import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ChatDrawer } from '../src/components/chat/ChatDrawer';
import { useAIConfigStore, defaultProviders, defaultBindings } from '../src/stores/useAIConfigStore';
import { AIService } from '../src/services/ai/aiService';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('ChatDrawer: Chat Scroll Control & Floating "Latest Content" Button', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    useAIConfigStore.setState({
      providers: defaultProviders.map((p) =>
        p.id === 'prov-deepseek' ? { ...p, apiKey: 'sk-test-valid-key' } : p
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

  test('CHK-SC-01 & CHK-SC-03: initial state is at bottom; scrolling up displays floating "最新内容" button', () => {
    act(() => {
      root.render(React.createElement(ChatDrawer, { onOpenSettings: () => {} }));
    });

    // Message list exists
    const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLDivElement;
    expect(scrollContainer).not.toBeNull();

    // Initially at bottom, so floating button should not exist
    let floatBtn = container.querySelector('[data-testid="scroll-to-bottom-btn"]');
    expect(floatBtn).toBeNull();

    // Mock dimensions to simulate scrolling up away from bottom:
    // scrollHeight = 1000, clientHeight = 400, scrollTop = 100 (distance = 500 > 35)
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 100, configurable: true, writable: true });

    act(() => {
      scrollContainer.dispatchEvent(new Event('scroll'));
    });

    // Floating button should now appear
    floatBtn = container.querySelector('[data-testid="scroll-to-bottom-btn"]');
    expect(floatBtn).not.toBeNull();
    expect(floatBtn?.textContent).toContain('最新内容');
  });

  test('CHK-SC-04: clicking floating button scrolls to bottom and hides button', () => {
    act(() => {
      root.render(React.createElement(ChatDrawer, { onOpenSettings: () => {} }));
    });

    const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLDivElement;
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 100, configurable: true, writable: true });

    act(() => {
      scrollContainer.dispatchEvent(new Event('scroll'));
    });

    let floatBtn = container.querySelector('[data-testid="scroll-to-bottom-btn"]') as HTMLButtonElement;
    expect(floatBtn).not.toBeNull();

    // Click floating button
    act(() => {
      floatBtn.click();
    });

    // Button should be hidden now because isAtBottom became true
    floatBtn = container.querySelector('[data-testid="scroll-to-bottom-btn"]') as HTMLButtonElement;
    expect(floatBtn).toBeNull();
  });

  test('CHK-SC-05: dragging or scrolling back to bottom hides floating button', () => {
    act(() => {
      root.render(React.createElement(ChatDrawer, { onOpenSettings: () => {} }));
    });

    const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLDivElement;
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(scrollContainer, 'scrollTop', { value: 200, configurable: true, writable: true });

    act(() => {
      scrollContainer.dispatchEvent(new Event('scroll'));
    });

    expect(container.querySelector('[data-testid="scroll-to-bottom-btn"]')).not.toBeNull();

    // Now scroll back down close to bottom: distance = 1000 - 580 - 400 = 20 <= 35
    scrollContainer.scrollTop = 580;
    act(() => {
      scrollContainer.dispatchEvent(new Event('scroll'));
    });

    expect(container.querySelector('[data-testid="scroll-to-bottom-btn"]')).toBeNull();
  });

  test('CHK-SC-02: wheel up event immediately cancels auto-scroll without crashing', () => {
    act(() => {
      root.render(React.createElement(ChatDrawer, { onOpenSettings: () => {} }));
    });

    const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLDivElement;
    expect(() => {
      act(() => {
        const wheelEvent = new WheelEvent('wheel', { deltaY: -100, bubbles: true });
        scrollContainer.dispatchEvent(wheelEvent);
      });
    }).not.toThrow();
  });
});
