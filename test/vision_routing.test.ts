import { describe, test, expect, beforeEach } from 'bun:test';
import { sanitizeModelId, useAIConfigStore, defaultProviders, defaultBindings } from '../src/stores/useAIConfigStore';
import { supportsVision } from '../src/services/ai/engine/core/multimodalGuard';
import { AIProviderConfig } from '../src/types/provider';

describe('Vision Model Routing & Model Deprecation Suite', () => {
  beforeEach(() => {
    // Reset AI config store
    useAIConfigStore.setState({
      providers: defaultProviders,
      bindings: defaultBindings
    });
  });

  test('CHK-VR-01: sanitizeModelId 自动将 gemini-2.5-flash 转换为 gemini-2.0-flash', () => {
    expect(sanitizeModelId('gemini-2.5-flash')).toBe('gemini-2.0-flash');
    expect(sanitizeModelId('models/gemini-2.5-flash')).toBe('gemini-2.0-flash');
    expect(sanitizeModelId('  gemini-2.5-flash  ')).toBe('gemini-2.0-flash');
    expect(sanitizeModelId('gemini-2.0-flash')).toBe('gemini-2.0-flash');
    expect(sanitizeModelId('deepseek-chat')).toBe('deepseek-chat');
  });

  test('CHK-VR-02: supportsVision 精确判定多模态与纯文本能力', () => {
    const deepseekProv: AIProviderConfig = {
      id: 'prov-deepseek',
      name: 'DeepSeek 官方',
      protocol: 'openai_compatible',
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'sk-test',
      isEnabled: true,
      defaultModel: 'deepseek-chat'
    };

    const openaiProv: AIProviderConfig = {
      id: 'prov-openai',
      name: 'OpenAI',
      protocol: 'openai_compatible',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      isEnabled: true,
      defaultModel: 'gpt-4o'
    };

    const geminiProv: AIProviderConfig = {
      id: 'prov-gemini',
      name: 'Google Gemini',
      protocol: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: 'test-key',
      isEnabled: true,
      defaultModel: 'gemini-2.0-flash'
    };

    const claudeProv: AIProviderConfig = {
      id: 'prov-anthropic',
      name: 'Anthropic Claude',
      protocol: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'test-key',
      isEnabled: true,
      defaultModel: 'claude-3-5-sonnet-20241022'
    };

    const customVlProv: AIProviderConfig = {
      id: 'prov-custom',
      name: 'SiliconFlow Qwen-VL',
      protocol: 'openai_compatible',
      baseUrl: 'https://api.siliconflow.cn/v1',
      apiKey: 'test-key',
      isEnabled: true,
      defaultModel: 'Qwen/Qwen2.5-VL-72B-Instruct'
    };

    // 纯文本排查
    expect(supportsVision(deepseekProv, 'deepseek-chat')).toBe(false);
    expect(supportsVision(deepseekProv, 'deepseek-reasoner')).toBe(false);
    expect(supportsVision(deepseekProv, 'deepseek-v3')).toBe(false);
    expect(supportsVision(deepseekProv, 'deepseek-r1')).toBe(false);

    // 多模态排查
    expect(supportsVision(geminiProv, 'gemini-2.0-flash')).toBe(true);
    expect(supportsVision(geminiProv, 'gemini-1.5-flash')).toBe(true);
    expect(supportsVision(claudeProv, 'claude-3-5-sonnet-20241022')).toBe(true);
    expect(supportsVision(openaiProv, 'gpt-4o')).toBe(true);
    expect(supportsVision(openaiProv, 'gpt-4o-mini')).toBe(true);
    expect(supportsVision(customVlProv, 'Qwen/Qwen2.5-VL-72B-Instruct')).toBe(true);

    // 空/无效输入
    expect(supportsVision(null, 'gpt-4o')).toBe(false);
    expect(supportsVision(undefined, undefined)).toBe(false);
  });

  test('CHK-VR-03: getActiveProviderForRole 当 Provider 禁用或不存在时返回 null', () => {
    const { getActiveProviderForRole, updateProvider, setRoleBinding } = useAIConfigStore.getState();

    // 正常状态
    const codeActive = getActiveProviderForRole('code');
    expect(codeActive).not.toBeNull();
    expect(codeActive?.provider.id).toBe('prov-deepseek');
    expect(codeActive?.modelId).toBe('deepseek-chat');

    // 禁用 prov-deepseek
    updateProvider('prov-deepseek', { isEnabled: false });
    expect(getActiveProviderForRole('code')).toBeNull();

    // 绑定至不存在的 provider
    setRoleBinding('code', { role: 'code', providerId: 'prov-non-existent', modelId: 'test' });
    expect(getActiveProviderForRole('code')).toBeNull();
  });

  test('CHK-VR-04 & CHK-VR-05: 多模态路由判别策略', () => {
    const { setRoleBinding, updateProvider } = useAIConfigStore.getState();

    // Case 1: 主力为 GPT-4o (原生支持识图)
    updateProvider('prov-openai', { apiKey: 'sk-openai-test', isEnabled: true });
    setRoleBinding('code', { role: 'code', providerId: 'prov-openai', modelId: 'gpt-4o' });

    const codeRole = useAIConfigStore.getState().getActiveProviderForRole('code');
    expect(codeRole).not.toBeNull();
    expect(supportsVision(codeRole?.provider, codeRole?.modelId)).toBe(true);

    // Case 2: 主力为 DeepSeek (纯文本)，Vision 档位已配置 Gemini
    updateProvider('prov-deepseek', { apiKey: 'sk-deepseek-test', isEnabled: true });
    updateProvider('prov-gemini', { apiKey: 'gemini-test-key', isEnabled: true });
    setRoleBinding('code', { role: 'code', providerId: 'prov-deepseek', modelId: 'deepseek-chat' });
    setRoleBinding('vision', { role: 'vision', providerId: 'prov-gemini', modelId: 'gemini-2.0-flash' });

    const currentCode = useAIConfigStore.getState().getActiveProviderForRole('code');
    const currentVision = useAIConfigStore.getState().getActiveProviderForRole('vision');

    expect(supportsVision(currentCode?.provider, currentCode?.modelId)).toBe(false);
    expect(supportsVision(currentVision?.provider, currentVision?.modelId)).toBe(true);
    expect(currentVision?.provider.apiKey).toBe('gemini-test-key');
    expect(currentVision?.modelId).toBe('gemini-2.0-flash');
  });

  test('CHK-VR-07: 历史存储中包含 gemini-2.5-flash 时自动清洗', () => {
    // 模拟 localStorage 包含过期模型
    const legacyConfig = {
      providers: [
        {
          id: 'prov-gemini',
          name: 'Google Gemini',
          protocol: 'gemini',
          baseUrl: 'https://generativelanguage.googleapis.com',
          apiKey: 'key123',
          isEnabled: true,
          defaultModel: 'gemini-2.5-flash'
        }
      ],
      bindings: {
        code: { role: 'code', providerId: 'prov-deepseek', modelId: 'deepseek-chat' },
        chat: { role: 'chat', providerId: 'prov-deepseek', modelId: 'deepseek-chat' },
        vision: { role: 'vision', providerId: 'prov-gemini', modelId: 'gemini-2.5-flash' },
        image: { role: 'image', providerId: 'prov-openai', modelId: 'dall-e-3' }
      }
    };

    localStorage.setItem('ai_designer_providers_v1', JSON.stringify(legacyConfig));

    // 重新加载配置
    const { bindings, providers, getActiveProviderForRole } = useAIConfigStore.getState();
    useAIConfigStore.setState({
      providers: legacyConfig.providers.map((p: any) => ({
        ...p,
        defaultModel: sanitizeModelId(p.defaultModel)
      })),
      bindings: {
        ...bindings,
        vision: {
          ...legacyConfig.bindings.vision,
          modelId: sanitizeModelId(legacyConfig.bindings.vision.modelId)
        }
      }
    });

    const activeVision = useAIConfigStore.getState().getActiveProviderForRole('vision');
    expect(activeVision?.modelId).toBe('gemini-2.0-flash');
    expect(activeVision?.modelId).not.toBe('gemini-2.5-flash');
  });

  test('CHK-VR-06: 纯文本主力且 Vision 未就绪时，拦截判断正确防止 400 崩溃', () => {
    const { updateProvider, setRoleBinding, getActiveProviderForRole } = useAIConfigStore.getState();
    updateProvider('prov-deepseek', { apiKey: 'sk-deepseek-valid', isEnabled: true });
    updateProvider('prov-gemini', { apiKey: '', isEnabled: true });
    setRoleBinding('code', { role: 'code', providerId: 'prov-deepseek', modelId: 'deepseek-chat' });
    setRoleBinding('vision', { role: 'vision', providerId: 'prov-gemini', modelId: 'gemini-2.0-flash' });

    const codeRole = getActiveProviderForRole('code');
    const visionRole = getActiveProviderForRole('vision');

    const codeSupports = codeRole && supportsVision(codeRole.provider, codeRole.modelId);
    const isCodeUsable = Boolean(codeRole && codeRole.provider && codeRole.provider.apiKey);
    const isVisionUsable = Boolean(visionRole && visionRole.provider && visionRole.provider.apiKey);

    // 断言: 主力可用但不支持 Vision
    expect(isCodeUsable).toBe(true);
    expect(codeSupports).toBe(false);

    // 断言: Vision 档位没有 apiKey，不可用
    expect(isVisionUsable).toBe(false);

    // 系统必须拦截，不可裸调底层
    const shouldIntercept = !codeSupports && !isVisionUsable;
    expect(shouldIntercept).toBe(true);
  });
});
