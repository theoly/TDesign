import { invoke, Channel, isTauri } from '@tauri-apps/api/core';
import { AIProviderConfig } from '../../types/provider';
import { detectModelCapabilities, DiscoveredModel } from './engine/core/multimodalGuard';

export interface ModelDiscoveryResult {
  success: boolean;
  message: string;
  models: DiscoveredModel[];
  fromFallback?: boolean;
}

/**
 * 远程调用通用 GET 请求（优先走 Tauri Rust 代理以绕过 CORS）
 */
async function getRemoteJson(
  url: string,
  headers: Record<string, string>,
  allowPrivateNetwork = false
): Promise<any> {
  // 1. Tauri 桌面端优先走原生代理命令 proxy_stream_request
  if (isTauri()) {
    try {
      const channel = new Channel<{ type: 'Chunk' | 'Error' | 'Done'; data?: string }>();
      let fullText = '';
      let errorMsg = '';

      const streamPromise = new Promise<string>((resolve, reject) => {
        channel.onmessage = (payload) => {
          if (payload.type === 'Chunk' && payload.data) {
            fullText += payload.data;
          } else if (payload.type === 'Error') {
            errorMsg = payload.data || '网络请求异常';
            reject(new Error(errorMsg));
          } else if (payload.type === 'Done') {
            resolve(fullText);
          }
        };
      });

      await invoke('proxy_stream_request', {
        url,
        method: 'GET',
        headers,
        body: '',
        allow_private_network: allowPrivateNetwork,
        channel
      });

      const resText = await streamPromise;
      if (!resText.trim()) {
        throw new Error('远端返回空数据');
      }
      return JSON.parse(resText);
    } catch (tauriErr: any) {
      console.warn('Tauri proxy_stream_request GET failed, trying fetch fallback:', tauriErr);
    }
  }

  // 2. Web 开发或降级直连环境
  let fetchUrl = url;
  const forwardHeaders = { ...headers };
  if (
    typeof window !== 'undefined' &&
    (window.location?.hostname === 'localhost' || window.location?.hostname === '127.0.0.1')
  ) {
    fetchUrl = '/api/ai-proxy';
    forwardHeaders['x-target-url'] = url;
  }

  const res = await fetch(fetchUrl, {
    method: 'GET',
    headers: forwardHeaders
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${errBody || res.statusText}`);
  }

  return await res.json();
}

/**
 * 过滤并排除非对话生成类模型（如纯向量嵌入、语音转录等）
 */
function isGenerativeModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  const nonGenerativePatterns = [
    'embedding',
    'embed',
    'text-embedding',
    'tts',
    'whisper',
    'moderation',
    'bge-',
    'rerank',
    'davinci-002',
    'babbage-002'
  ];
  return !nonGenerativePatterns.some((pattern) => lower.includes(pattern));
}

export class ModelDiscoveryService {
  /**
   * 探测指定 Provider 的可用模型列表并自动计算能力标签 (BR-MD-01 & BR-MD-02)
   */
  public static async discoverModels(provider: AIProviderConfig): Promise<ModelDiscoveryResult> {
    const rawKey = (provider.apiKey || '').trim();
    const cleanBase = (provider.baseUrl || '').trim().replace(/\/+$/, '');

    try {
      if (provider.protocol === 'openai_compatible') {
        if (!cleanBase) throw new Error('API Base URL 不能为空');

        // 计算 models 端点 URL
        let modelsUrl = `${cleanBase}/models`;
        if (cleanBase.endsWith('/chat/completions')) {
          modelsUrl = cleanBase.replace(/\/chat\/completions$/, '/models');
        } else if (!cleanBase.endsWith('/v1') && !cleanBase.includes('/v1/')) {
          modelsUrl = `${cleanBase}/v1/models`;
        }

        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        if (rawKey) {
          headers['Authorization'] = rawKey.startsWith('Bearer ') ? rawKey : `Bearer ${rawKey}`;
          headers['api-key'] = rawKey.replace(/^Bearer\s+/i, '');
        }

        const data = await getRemoteJson(modelsUrl, headers, provider.allowPrivateNetwork);
        const rawList: any[] = Array.isArray(data) ? data : data?.data || data?.models || [];

        const discovered: DiscoveredModel[] = [];
        for (const item of rawList) {
          const modelId: string = typeof item === 'string' ? item : item?.id || item?.name || '';
          if (modelId && isGenerativeModel(modelId)) {
            discovered.push({
              id: modelId,
              name: typeof item === 'object' && item.name ? item.name : modelId,
              capabilities: detectModelCapabilities(provider, modelId)
            });
          }
        }

        if (discovered.length === 0) {
          throw new Error('未能从 Provider 获取到有效生成类模型');
        }

        return {
          success: true,
          message: `成功探测到 ${discovered.length} 个可用模型`,
          models: discovered
        };
      } else if (provider.protocol === 'gemini') {
        if (!rawKey) throw new Error('Google Gemini 需要填写 API Key 才能探测模型');

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${rawKey}`;
        const data = await getRemoteJson(geminiUrl, {}, false);
        const rawList: any[] = data?.models || [];

        const discovered: DiscoveredModel[] = [];
        for (const item of rawList) {
          // 仅包含支持 generateContent 的模型 (排除 embedding, aqa 等)
          const methods: string[] = item?.supportedGenerationMethods || [];
          if (methods.length > 0 && !methods.includes('generateContent')) {
            continue;
          }

          let modelId: string = item?.name || '';
          // 剥离 models/ 前缀 (如 models/gemini-2.0-flash -> gemini-2.0-flash)
          modelId = modelId.replace(/^models\//i, '').trim();

          if (modelId && isGenerativeModel(modelId)) {
            discovered.push({
              id: modelId,
              name: item?.displayName || modelId,
              capabilities: detectModelCapabilities(provider, modelId)
            });
          }
        }

        return {
          success: true,
          message: `成功探测到 ${discovered.length} 个 Gemini 可用模型`,
          models: discovered
        };
      } else if (provider.protocol === 'ollama_native') {
        const ollamaBase = cleanBase || 'http://localhost:11434';
        const tagsUrl = `${ollamaBase}/api/tags`;

        const data = await getRemoteJson(tagsUrl, {}, provider.allowPrivateNetwork);
        const rawList: any[] = data?.models || [];

        const discovered: DiscoveredModel[] = [];
        for (const item of rawList) {
          const modelId = (item?.name || item?.model || '').trim();
          if (modelId) {
            discovered.push({
              id: modelId,
              name: modelId,
              capabilities: detectModelCapabilities(provider, modelId)
            });
          }
        }

        return {
          success: true,
          message: `成功探测到 ${discovered.length} 个本地 Ollama 模型`,
          models: discovered
        };
      } else if (provider.protocol === 'anthropic') {
        // Anthropic 尝试调用 /v1/models，若失败则安全回退至已知官方模型列表
        const anthropicUrl = cleanBase.includes('/v1')
          ? `${cleanBase}/models`
          : `${cleanBase || 'https://api.anthropic.com'}/v1/models`;

        const headers: Record<string, string> = {
          'x-api-key': rawKey.replace(/^Bearer\s+/i, ''),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        };

        try {
          const data = await getRemoteJson(anthropicUrl, headers, provider.allowPrivateNetwork);
          const rawList: any[] = Array.isArray(data) ? data : data?.data || [];
          if (rawList.length > 0) {
            const discovered = rawList.map((m: any) => {
              const id = m.id || m.name;
              return {
                id,
                name: m.display_name || id,
                capabilities: detectModelCapabilities(provider, id)
              };
            });
            return {
              success: true,
              message: `成功探测到 ${discovered.length} 个 Claude 模型`,
              models: discovered
            };
          }
        } catch {
          // 降级使用内置官方清单
        }

        const builtinClaude = [
          'claude-3-7-sonnet-20250219',
          'claude-3-5-sonnet-20241022',
          'claude-3-5-haiku-20241022',
          'claude-3-opus-20240229'
        ];
        return {
          success: true,
          message: `已加载 ${builtinClaude.length} 个标准 Claude 官方模型`,
          models: builtinClaude.map((id) => ({
            id,
            name: id,
            capabilities: detectModelCapabilities(provider, id)
          })),
          fromFallback: true
        };
      }
    } catch (err: any) {
      // 优雅回退：使用 Provider 自带的 suggestedModels 或 defaultModel
      const fallbackList: string[] = [
        ...(provider.suggestedModels || []),
        provider.defaultModel || ''
      ].filter(Boolean);

      const uniqueFallbacks = Array.from(new Set(fallbackList));
      if (uniqueFallbacks.length > 0) {
        return {
          success: false,
          message: `模型拉取失败 (${err.message})，已加载预设模型`,
          models: uniqueFallbacks.map((id) => ({
            id,
            name: id,
            capabilities: detectModelCapabilities(provider, id)
          })),
          fromFallback: true
        };
      }

      return {
        success: false,
        message: `模型探测失败: ${err.message}`,
        models: []
      };
    }

    return {
      success: false,
      message: '未知的协议类型',
      models: []
    };
  }
}
