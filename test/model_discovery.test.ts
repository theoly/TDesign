import { describe, test, expect, beforeEach } from 'bun:test';
import { detectModelCapabilities } from '../src/services/ai/engine/core/multimodalGuard';
import { ModelDiscoveryService } from '../src/services/ai/modelDiscoveryService';
import { AIProviderConfig } from '../src/types/provider';

describe('Model Discovery & Capability Detection Suite (BR-MD-01 ~ BR-MD-03)', () => {
  const mockOpenAIProv: AIProviderConfig = {
    id: 'prov-openai',
    name: 'OpenAI 官方',
    protocol: 'openai_compatible',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-mock',
    isEnabled: true,
    defaultModel: 'gpt-4o'
  };

  const mockDeepSeekProv: AIProviderConfig = {
    id: 'prov-deepseek',
    name: 'DeepSeek 官方',
    protocol: 'openai_compatible',
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'sk-mock',
    isEnabled: true,
    defaultModel: 'deepseek-chat'
  };

  const mockGeminiProv: AIProviderConfig = {
    id: 'prov-gemini',
    name: 'Google Gemini',
    protocol: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    apiKey: 'key-mock',
    isEnabled: true,
    defaultModel: 'gemini-2.0-flash'
  };

  const mockOllamaProv: AIProviderConfig = {
    id: 'prov-ollama',
    name: '本地 Ollama',
    protocol: 'ollama_native',
    baseUrl: 'http://localhost:11434',
    apiKey: '',
    isEnabled: true,
    defaultModel: 'qwen2.5-coder'
  };

  test('CHK-MD-01: detectModelCapabilities 精确推断视觉、深度推理、代码与对话四维能力', () => {
    // 1. gpt-4o: 对话 + 视觉
    const gpt4oCaps = detectModelCapabilities(mockOpenAIProv, 'gpt-4o');
    expect(gpt4oCaps).toContain('chat');
    expect(gpt4oCaps).toContain('vision');
    expect(gpt4oCaps).not.toContain('reasoning');

    // 2. o3-mini: 对话 + 推理
    const o3Caps = detectModelCapabilities(mockOpenAIProv, 'o3-mini');
    expect(o3Caps).toContain('chat');
    expect(o3Caps).toContain('reasoning');
    expect(o3Caps).not.toContain('vision');

    // 3. deepseek-chat: 纯对话 (非视觉)
    const dsChatCaps = detectModelCapabilities(mockDeepSeekProv, 'deepseek-chat');
    expect(dsChatCaps).toEqual(['chat']);

    // 4. deepseek-reasoner (R1): 对话 + 推理 (非视觉)
    const dsReasonerCaps = detectModelCapabilities(mockDeepSeekProv, 'deepseek-reasoner');
    expect(dsReasonerCaps).toContain('chat');
    expect(dsReasonerCaps).toContain('reasoning');
    expect(dsReasonerCaps).not.toContain('vision');

    // 5. qwen2.5-coder:32b: 对话 + 代码
    const qwenCoderCaps = detectModelCapabilities(mockOllamaProv, 'qwen2.5-coder:32b');
    expect(qwenCoderCaps).toContain('chat');
    expect(qwenCoderCaps).toContain('code');
    expect(qwenCoderCaps).not.toContain('vision');

    // 6. qwen2.5-vl-72b: 对话 + 视觉
    const qwenVlCaps = detectModelCapabilities(mockOpenAIProv, 'qwen2.5-vl-72b');
    expect(qwenVlCaps).toContain('chat');
    expect(qwenVlCaps).toContain('vision');

    // 7. gemini-2.0-flash: 对话 + 视觉
    const geminiCaps = detectModelCapabilities(mockGeminiProv, 'gemini-2.0-flash');
    expect(geminiCaps).toContain('chat');
    expect(geminiCaps).toContain('vision');
  });

  test('CHK-MD-02: OpenAI 兼容协议优雅降级与预设回退', async () => {
    // 模拟无效 URL 或网络不可达
    const provWithBadUrl: AIProviderConfig = {
      ...mockOpenAIProv,
      baseUrl: 'http://127.0.0.1:59999/v1',
      suggestedModels: ['gpt-4o', 'gpt-4o-mini', 'o3-mini']
    };

    const res = await ModelDiscoveryService.discoverModels(provWithBadUrl);
    // 降级回退机制生效
    expect(res.models.length).toBeGreaterThanOrEqual(3);
    expect(res.fromFallback).toBe(true);
    expect(res.models.some((m) => m.id === 'gpt-4o' && m.capabilities.includes('vision'))).toBe(true);
    expect(res.models.some((m) => m.id === 'o3-mini' && m.capabilities.includes('reasoning'))).toBe(true);
  });

  test('CHK-MD-03 & CHK-MD-05: Anthropic 协议自动补全标准模型列表', async () => {
    const claudeProv: AIProviderConfig = {
      id: 'prov-anthropic',
      name: 'Anthropic Claude',
      protocol: 'anthropic',
      baseUrl: 'http://127.0.0.1:59999',
      apiKey: 'sk-ant-mock',
      isEnabled: true
    };

    const res = await ModelDiscoveryService.discoverModels(claudeProv);
    expect(res.success).toBe(true);
    expect(res.models.length).toBeGreaterThanOrEqual(4);
    // Claude 全系支持 Vision
    res.models.forEach((m) => {
      expect(m.capabilities).toContain('vision');
    });
  });
});
