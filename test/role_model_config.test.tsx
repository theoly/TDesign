import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { AIProviderModal } from '../src/components/settings/AIProviderModal';
import { useAIConfigStore, defaultProviders, defaultBindings } from '../src/stores/useAIConfigStore';
import { classifyIntent } from '../src/services/ai/intentClassifier';
import { supportsVision } from '../src/services/ai/engine/core/multimodalGuard';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('核心能力档位独立配置与分流 (Role-based Model Configuration)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    useAIConfigStore.setState({
      providers: [...defaultProviders],
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

  describe('CHK-F-02 ~ CHK-F-04: 角色绑定解耦与多模型独立分配', () => {
    test('单独设置代码生成模型不影响对话推理模型', () => {
      const store = useAIConfigStore.getState();

      store.setRoleBinding('code', {
        role: 'code',
        providerId: 'prov-deepseek',
        modelId: 'deepseek-coder'
      });

      const updated = useAIConfigStore.getState();
      expect(updated.bindings.code.providerId).toBe('prov-deepseek');
      expect(updated.bindings.code.modelId).toBe('deepseek-coder');
      // chat 仍然保持原本的模型配置
      expect(updated.bindings.chat.modelId).toBe('deepseek-chat');
    });

    test('单独设置对话推理模型不影响代码生成模型', () => {
      const store = useAIConfigStore.getState();

      store.setRoleBinding('chat', {
        role: 'chat',
        providerId: 'prov-deepseek',
        modelId: 'deepseek-v3'
      });

      const updated = useAIConfigStore.getState();
      expect(updated.bindings.chat.providerId).toBe('prov-deepseek');
      expect(updated.bindings.chat.modelId).toBe('deepseek-v3');
      // code 仍然不受任何影响
      expect(updated.bindings.code.providerId).toBe('prov-deepseek');
      expect(updated.bindings.code.modelId).toBe('deepseek-chat');
    });

    test('支持跨 Provider 分别指派代码、对话与视觉模型', () => {
      const store = useAIConfigStore.getState();

      // 1. 代码模型选用 本地 Ollama (qwen2.5-coder)
      store.setRoleBinding('code', {
        role: 'code',
        providerId: 'prov-ollama',
        modelId: 'qwen2.5-coder'
      });

      // 2. 对话推理选用 DeepSeek (deepseek-chat)
      store.setRoleBinding('chat', {
        role: 'chat',
        providerId: 'prov-deepseek',
        modelId: 'deepseek-chat'
      });

      // 3. 视觉识图选用 Google Gemini (gemini-2.0-flash)
      store.setRoleBinding('vision', {
        role: 'vision',
        providerId: 'prov-gemini',
        modelId: 'gemini-2.0-flash'
      });

      const activeCode = store.getActiveProviderForRole('code');
      const activeChat = store.getActiveProviderForRole('chat');
      const activeVision = store.getActiveProviderForRole('vision');

      expect(activeCode?.provider.id).toBe('prov-ollama');
      expect(activeCode?.modelId).toBe('qwen2.5-coder');

      expect(activeChat?.provider.id).toBe('prov-deepseek');
      expect(activeChat?.modelId).toBe('deepseek-chat');

      expect(activeVision?.provider.id).toBe('prov-gemini');
      expect(activeVision?.modelId).toBe('gemini-2.0-flash');
    });

    test('同一 Provider 下可配置不同的代码专精模型与对话模型', () => {
      const store = useAIConfigStore.getState();

      // 自定义或内置 Provider 下分别绑定该 Provider 提供的不同模型
      store.setRoleBinding('code', {
        role: 'code',
        providerId: 'prov-deepseek',
        modelId: 'deepseek-coder'
      });
      store.setRoleBinding('chat', {
        role: 'chat',
        providerId: 'prov-deepseek',
        modelId: 'deepseek-chat'
      });

      const activeCode = store.getActiveProviderForRole('code');
      const activeChat = store.getActiveProviderForRole('chat');

      expect(activeCode?.provider.id).toBe('prov-deepseek');
      expect(activeCode?.modelId).toBe('deepseek-coder');

      expect(activeChat?.provider.id).toBe('prov-deepseek');
      expect(activeChat?.modelId).toBe('deepseek-chat');
      expect(activeCode?.modelId).not.toBe(activeChat?.modelId);
    });

    test('CHK-F-05: 修改 Provider defaultModel 不篡改已有解耦的角色绑定', () => {
      const store = useAIConfigStore.getState();

      store.setRoleBinding('code', {
        role: 'code',
        providerId: 'prov-openai',
        modelId: 'o3-mini'
      });
      store.setRoleBinding('chat', {
        role: 'chat',
        providerId: 'prov-openai',
        modelId: 'gpt-4o'
      });

      // 更新 provider 自身默认值
      store.updateProvider('prov-openai', { defaultModel: 'gpt-4o-mini' });

      const updated = useAIConfigStore.getState();
      // 检查各角色绑定的 modelId 未被静默覆盖
      expect(updated.bindings.code.modelId).toBe('o3-mini');
      expect(updated.bindings.chat.modelId).toBe('gpt-4o');
    });
  });

  describe('CHK-F-01, CHK-F-06, CHK-F-07: UI 独立指派控件与角色徽标交互', () => {
    test('AIProviderModal 渲染独立的代码、对话、Vision 角色操作按钮', () => {
      act(() => {
        root.render(<AIProviderModal onClose={() => {}} />);
      });

      const text = container.textContent || '';
      // 检查右侧头部与各处独立按钮文案存在
      expect(text).toContain('设为代码模型');
      expect(text).toContain('设为对话模型');
      expect(text).toContain('设为 Vision 档');
      expect(text).toContain('指派给代码');
      expect(text).toContain('指派给对话');
      expect(text).toContain('指派给 Vision');
      expect(text).toContain('核心能力档位指派');
      expect(text).toContain('页面代码生成档');
      expect(text).toContain('对话与意图推理档');
    });

    test('通过 UI 按钮可独立切换代码模型与对话模型', () => {
      act(() => {
        root.render(<AIProviderModal onClose={() => {}} />);
      });

      // 切换到 OpenAI
      const buttons = Array.from(container.querySelectorAll('button'));
      const openaiBtn = buttons.find((b) => b.textContent?.includes('OpenAI 官方'));
      expect(openaiBtn).toBeDefined();

      act(() => {
        openaiBtn?.click();
      });

      // 点击 "设为代码模型"
      const setCodeBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('设为代码模型')
      );
      expect(setCodeBtn).toBeDefined();

      act(() => {
        setCodeBtn?.click();
      });

      const stateAfterCode = useAIConfigStore.getState();
      expect(stateAfterCode.bindings.code.providerId).toBe('prov-openai');
      // chat 仍然是 deepseek
      expect(stateAfterCode.bindings.chat.providerId).toBe('prov-deepseek');

      // 点击 "设为对话模型"
      const setChatBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('设为对话模型')
      );
      expect(setChatBtn).toBeDefined();

      act(() => {
        setChatBtn?.click();
      });

      const stateAfterChat = useAIConfigStore.getState();
      expect(stateAfterChat.bindings.chat.providerId).toBe('prov-openai');
    });
  });

  describe('CHK-F-08: 问答意图与代码生成意图分流判定', () => {
    test('设计咨询与提问意图准确识别为 question', () => {
      const r1 = classifyIntent('什么是 60-30-10 配色法则？');
      expect(r1.intent).toBe('question');

      const r2 = classifyIntent('这个页面的字体规范是什么，怎么提升信息层级？');
      expect(r2.intent).toBe('question');

      const r3 = classifyIntent('为什么按钮要在深色模式下使用明亮的主色？');
      expect(r3.intent).toBe('question');
    });

    test('页面创建与修改意图准确识别为 create_screen / modify_screen', () => {
      const r1 = classifyIntent('生成一个深色极简风格的数据看板页面');
      expect(r1.intent).toBe('create_screen');

      const r2 = classifyIntent('把当前页面的按钮文案修改为立即购买', true);
      expect(r2.intent).toBe('modify_screen');
    });
  });

  describe('视觉与识图能力支持判定', () => {
    test('正确识别 Vision 支持与不支持的模型', () => {
      const geminiProv = defaultProviders.find((p) => p.id === 'prov-gemini')!;
      const deepseekProv = defaultProviders.find((p) => p.id === 'prov-deepseek')!;
      const openaiProv = defaultProviders.find((p) => p.id === 'prov-openai')!;

      expect(supportsVision(geminiProv, 'gemini-2.0-flash')).toBe(true);
      expect(supportsVision(deepseekProv, 'deepseek-chat')).toBe(false);
      expect(supportsVision(deepseekProv, 'deepseek-coder')).toBe(false);
      expect(supportsVision(openaiProv, 'gpt-4o')).toBe(true);
      expect(supportsVision(openaiProv, 'gpt-4o-mini')).toBe(true);
    });
  });
});
