import { AIProviderConfig, ErrorKind, StreamEvent } from '../../types/provider';
import { useUsageStore } from '../../stores/useUsageStore';
import { isTauri, invoke, Channel } from '@tauri-apps/api/core';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  imageUrl?: string;
}

class StreamChunkProcessor {
  private buffer = '';
  private currentEvent = 'message';
  private accumulatedOutputChars = 0;
  private hasRecordedUsage = false;
  private isInsideThinkTag = false;

  constructor(
    private provider: AIProviderConfig,
    private modelId: string,
    private inputCharsEstimated: number,
    private onEvent: (ev: StreamEvent) => void
  ) {}

  public processChunk(chunk: string) {
    this.buffer += chunk;

    if (this.provider.protocol === 'ollama_native') {
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.message?.content) {
            this.accumulatedOutputChars += parsed.message.content.length;
            this.onEvent({ type: 'Delta', text: parsed.message.content });
          }
          if (parsed.done) {
            this.onEvent({ type: 'Done', finish_reason: 'stop' });
          }
        } catch (e) {
          /* partial */
        }
      }
    } else {
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('event:')) {
          this.currentEvent = trimmed.slice(6).trim();
          continue;
        }

        let dataStr = '';
        if (trimmed.startsWith('data:')) {
          dataStr = trimmed.slice(5).trim();
        } else if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          // Non-SSE standard JSON chunk fallback
          dataStr = trimmed;
        } else {
          continue;
        }

        if (dataStr === '[DONE]') {
          if (this.isInsideThinkTag) {
            this.isInsideThinkTag = false;
            this.onEvent({ type: 'Delta', text: '\n</think>\n\n' });
          }
          this.onEvent({ type: 'Done', finish_reason: 'stop' });
          continue;
        }

        try {
          const data = JSON.parse(dataStr);

          // Handle error object in stream event
          if (data.error || this.currentEvent === 'error' || data.type === 'error') {
            const errorText = data.error?.message || data.message || JSON.stringify(data);
            this.onEvent({
              type: 'Error',
              kind: 'invalid_response',
              message: `API 错误: ${errorText}`
            });
            return;
          }

          if (this.provider.protocol === 'openai_compatible') {
            const reasoningDelta =
              data.choices?.[0]?.delta?.reasoning_content ??
              data.choices?.[0]?.delta?.reasoning;

            if (reasoningDelta) {
              this.accumulatedOutputChars += reasoningDelta.length;
              if (!this.isInsideThinkTag) {
                this.isInsideThinkTag = true;
                this.onEvent({ type: 'Delta', text: '<think>\n' + reasoningDelta });
              } else {
                this.onEvent({ type: 'Delta', text: reasoningDelta });
              }
            }

            const delta =
              data.choices?.[0]?.delta?.content ??
              data.choices?.[0]?.text ??
              data.choices?.[0]?.message?.content;
            if (delta) {
              this.accumulatedOutputChars += delta.length;
              if (this.isInsideThinkTag) {
                this.isInsideThinkTag = false;
                this.onEvent({ type: 'Delta', text: '\n</think>\n\n' + delta });
              } else {
                this.onEvent({ type: 'Delta', text: delta });
              }
            }
            if (data.usage) {
              this.hasRecordedUsage = true;
              const inTok = data.usage.prompt_tokens || 0;
              const outTok = data.usage.completion_tokens || 0;
              this.onEvent({ type: 'Usage', input_tokens: inTok, output_tokens: outTok });
              useUsageStore.getState().recordUsage({
                providerName: this.provider.name,
                modelId: this.modelId,
                inputTokens: inTok,
                outputTokens: outTok,
                estimatedCostUsd: Number(((inTok * 0.000001) + (outTok * 0.000003)).toFixed(6))
              });
            }
            if (data.choices?.[0]?.finish_reason) {
              if (this.isInsideThinkTag) {
                this.isInsideThinkTag = false;
                this.onEvent({ type: 'Delta', text: '\n</think>\n\n' });
              }
              this.onEvent({ type: 'Done', finish_reason: data.choices[0].finish_reason });
            }
          } else if (this.provider.protocol === 'anthropic') {
            if (data.type === 'content_block_delta' && data.delta?.type === 'thinking_delta') {
              const thinking = data.delta.thinking;
              if (thinking) {
                this.accumulatedOutputChars += thinking.length;
                if (!this.isInsideThinkTag) {
                  this.isInsideThinkTag = true;
                  this.onEvent({ type: 'Delta', text: '<think>\n' + thinking });
                } else {
                  this.onEvent({ type: 'Delta', text: thinking });
                }
              }
            }
            const textDelta =
              data.delta?.text ??
              (data.type === 'content_block_delta' ? data.delta?.text : null) ??
              data.content?.[0]?.text;
            if (textDelta) {
              this.accumulatedOutputChars += textDelta.length;
              if (this.isInsideThinkTag) {
                this.isInsideThinkTag = false;
                this.onEvent({ type: 'Delta', text: '\n</think>\n\n' + textDelta });
              } else {
                this.onEvent({ type: 'Delta', text: textDelta });
              }
            }
            if (data.usage) {
              this.hasRecordedUsage = true;
              const inTok = data.usage.input_tokens || 0;
              const outTok = data.usage.output_tokens || 0;
              this.onEvent({ type: 'Usage', input_tokens: inTok, output_tokens: outTok });
              useUsageStore.getState().recordUsage({
                providerName: this.provider.name,
                modelId: this.modelId,
                inputTokens: inTok,
                outputTokens: outTok,
                estimatedCostUsd: Number(((inTok * 0.000003) + (outTok * 0.000015)).toFixed(6))
              });
            }
            if (this.currentEvent === 'message_stop' || data.type === 'message_stop') {
              if (this.isInsideThinkTag) {
                this.isInsideThinkTag = false;
                this.onEvent({ type: 'Delta', text: '\n</think>\n\n' });
              }
              this.onEvent({ type: 'Done', finish_reason: 'stop' });
            }
          } else if (this.provider.protocol === 'gemini') {
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              this.accumulatedOutputChars += text.length;
              this.onEvent({ type: 'Delta', text });
            }
            if (data.candidates?.[0]?.finishReason) {
              this.onEvent({ type: 'Done', finish_reason: data.candidates[0].finishReason });
              const inTok = Math.max(1, Math.round(this.inputCharsEstimated / 3.5));
              const outTok = Math.max(1, Math.round(this.accumulatedOutputChars / 3.5));
              useUsageStore.getState().recordUsage({
                providerName: this.provider.name,
                modelId: this.modelId,
                inputTokens: inTok,
                outputTokens: outTok,
                estimatedCostUsd: Number(((inTok * 0.0000005) + (outTok * 0.0000015)).toFixed(6))
              });
              this.hasRecordedUsage = true;
            }
          }
        } catch (e) {
          /* partial chunk parse error */
        }
      }
    }
  }

  public finish() {
    if (this.isInsideThinkTag) {
      this.isInsideThinkTag = false;
      this.onEvent({ type: 'Delta', text: '\n</think>\n\n' });
    }
    if (!this.hasRecordedUsage && this.accumulatedOutputChars > 0) {
      const inTok = Math.max(1, Math.round(this.inputCharsEstimated / 3.5));
      const outTok = Math.max(1, Math.round(this.accumulatedOutputChars / 3.5));
      useUsageStore.getState().recordUsage({
        providerName: this.provider.name,
        modelId: this.modelId,
        inputTokens: inTok,
        outputTokens: outTok,
        estimatedCostUsd: Number(((inTok * 0.000001) + (outTok * 0.000003)).toFixed(6))
      });
      this.hasRecordedUsage = true;
    }
  }
}

export class AIService {
  public static stream(
    provider: AIProviderConfig,
    modelId: string,
    messages: ChatMessage[],
    onEvent: (ev: StreamEvent) => void,
    timeoutMs = 45000
  ): { abort: () => void; promise: Promise<void> } {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      onEvent({
        type: 'Error',
        kind: 'timeout',
        message: `请求在 ${timeoutMs}ms 后超时`
      });
    }, timeoutMs);

    let isAborted = false;
    const inputCharsEstimated = messages.reduce((acc, m) => acc + m.content.length + (m.imageUrl ? 1000 : 0), 0);
    const processor = new StreamChunkProcessor(provider, modelId, inputCharsEstimated, onEvent);

    let url = '';

    const promise = (async () => {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        let bodyJson: unknown;

        if (provider.protocol === 'openai_compatible') {
          const cleanBase = (provider.baseUrl || '').trim().replace(/\/+$/, '');
          url = cleanBase.endsWith('/chat/completions') ? cleanBase : `${cleanBase}/chat/completions`;

          const rawKey = (provider.apiKey || '').trim();
          if (rawKey) {
            headers['Authorization'] = rawKey.startsWith('Bearer ') ? rawKey : `Bearer ${rawKey}`;
            headers['api-key'] = rawKey.replace(/^Bearer\s+/i, '');
          }

          const formattedMessages = messages.map((m) => {
            if (m.imageUrl) {
              return {
                role: m.role,
                content: [
                  { type: 'text', text: m.content },
                  { type: 'image_url', image_url: { url: m.imageUrl } }
                ]
              };
            }
            return { role: m.role, content: m.content };
          });

          const body: Record<string, unknown> = {
            model: modelId,
            messages: formattedMessages,
            stream: true,
            temperature: 0.7,
            max_tokens: 8192
          };

          // Official OpenAI supports stream_options; omit for custom third-party proxies to prevent 400 Bad Request
          if (provider.id === 'prov-openai') {
            body.stream_options = { include_usage: true };
          }

          bodyJson = body;
        } else if (provider.protocol === 'anthropic') {
          const cleanBase = (provider.baseUrl || '').trim().replace(/\/+$/, '');
          if (cleanBase.endsWith('/messages')) {
            url = cleanBase;
          } else if (cleanBase.endsWith('/v1')) {
            url = `${cleanBase}/messages`;
          } else {
            url = `${cleanBase}/v1/messages`;
          }

          const rawKey = (provider.apiKey || '').trim().replace(/^Bearer\s+/i, '');
          if (rawKey) {
            headers['x-api-key'] = rawKey;
            headers['Authorization'] = `Bearer ${rawKey}`;
          }
          headers['anthropic-version'] = '2023-06-01';
          headers['anthropic-dangerous-direct-browser-access'] = 'true';

          const systemMsg = messages.find((m) => m.role === 'system')?.content || '';
          const nonSystem = messages
            .filter((m) => m.role !== 'system')
            .map((m) => {
              if (m.imageUrl && m.imageUrl.startsWith('data:')) {
                const match = m.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
                if (match) {
                  return {
                    role: m.role,
                    content: [
                      { type: 'text', text: m.content },
                      {
                        type: 'image',
                        source: { type: 'base64', media_type: match[1], data: match[2] }
                      }
                    ]
                  };
                }
              }
              return { role: m.role, content: m.content };
            });

          const anthropicMessages = nonSystem.length > 0 ? nonSystem : [{ role: 'user', content: 'hello' }];

          const body: Record<string, unknown> = {
            model: modelId,
            messages: anthropicMessages,
            stream: true,
            max_tokens: 8192,
            temperature: 0.7
          };

          if (systemMsg.trim()) {
            body.system = systemMsg.trim();
          }

          bodyJson = body;
        } else if (provider.protocol === 'gemini') {
          const keyParam = provider.apiKey ? `?key=${provider.apiKey.trim()}&alt=sse` : '?alt=sse';
          const cleanBase = (provider.baseUrl || '').trim().replace(/\/+$/, '');
          url = `${cleanBase}/models/${modelId}:streamGenerateContent${keyParam}`;

          const contents = messages.map((m) => {
            const parts: any[] = [{ text: m.content }];
            if (m.imageUrl && m.imageUrl.startsWith('data:')) {
              const match = m.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
              if (match) {
                parts.push({
                  inlineData: { mimeType: match[1], data: match[2] }
                });
              }
            }
            return {
              role: m.role === 'assistant' ? 'model' : 'user',
              parts
            };
          });

          bodyJson = {
            contents,
            generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
          };
        } else if (provider.protocol === 'ollama_native') {
          const cleanBase = (provider.baseUrl || '').trim().replace(/\/+$/, '');
          url = `${cleanBase}/api/chat`;
          bodyJson = {
            model: modelId,
            messages,
            stream: true
          };
        }

        // Strategy 1: If running inside Tauri desktop app, use native Rust proxy to completely bypass CORS
        if (isTauri()) {
          try {
            const channel = new Channel<{ type: 'Chunk' | 'Error' | 'Done'; data?: string }>();
            channel.onmessage = (payload) => {
              if (isAborted) return;
              if (payload.type === 'Chunk' && payload.data) {
                processor.processChunk(payload.data);
              } else if (payload.type === 'Error') {
                clearTimeout(timeoutId);
                onEvent({
                  type: 'Error',
                  kind: 'network_error',
                  message: payload.data || '网络请求异常'
                });
              } else if (payload.type === 'Done') {
                clearTimeout(timeoutId);
                processor.finish();
                onEvent({ type: 'Done', finish_reason: 'stop' });
              }
            };

            await invoke('proxy_stream_request', {
              url,
              method: 'POST',
              headers,
              body: JSON.stringify(bodyJson),
              allow_private_network: false,
              channel
            });
            return;
          } catch (tauriErr) {
            console.warn('Tauri proxy_stream_request unavailable or failed, falling back to fetch:', tauriErr);
          }
        }

        // Strategy 2: Web / Browser environment with Vite dev proxy support
        let fetchUrl = url;
        const forwardHeaders: Record<string, string> = { ...headers };

        // In web dev mode on localhost, route through Vite proxy to eliminate CORS
        if (
          typeof window !== 'undefined' &&
          (window.location?.hostname === 'localhost' || window.location?.hostname === '127.0.0.1')
        ) {
          fetchUrl = '/api/ai-proxy';
          forwardHeaders['x-target-url'] = url;
        }

        const resp = await fetch(fetchUrl, {
          method: 'POST',
          headers: forwardHeaders,
          body: JSON.stringify(bodyJson),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!resp.ok) {
          const status = resp.status;
          const text = await resp.text().catch(() => '');
          let kind: ErrorKind = 'network_error';
          if (status === 401 || status === 403) kind = 'auth_failed';
          else if (status === 404) kind = 'not_found';
          else if (status === 429) kind = 'rate_limited';

          let parsedMessage = text || resp.statusText;
          try {
            const errJson = JSON.parse(text);
            if (errJson.error?.message) {
              parsedMessage = errJson.error.message;
            } else if (errJson.message) {
              parsedMessage = errJson.message;
            }
          } catch {
            // Keep original text
          }

          onEvent({
            type: 'Error',
            kind,
            message: `HTTP 错误 ${status}: ${parsedMessage}`,
            http_status: status
          });
          return;
        }

        if (!resp.body) {
          onEvent({ type: 'Error', kind: 'invalid_response', message: '响应体为空' });
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            processor.finish();
            break;
          }
          const chunkText = decoder.decode(value, { stream: true });
          processor.processChunk(chunkText);
        }
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        if (isAborted) return;
        const e = err as Error;
        if (e.name === 'AbortError') return;

        let msg = e.message || '网络连接异常';
        if (e.name === 'TypeError' && (e.message.includes('Load failed') || e.message.includes('Failed to fetch'))) {
          msg = `跨域网络限制 (CORS): ${e.message}。由于该服务提供商 (${url}) 未在服务端开放浏览器跨域头，请在客户端桌面端运行或通过代理访问。`;
        }

        onEvent({
          type: 'Error',
          kind: 'network_error',
          message: msg
        });
      }
    })();

    return {
      abort: () => {
        isAborted = true;
        clearTimeout(timeoutId);
        controller.abort();
      },
      promise
    };
  }

  /**
   * Performs quick connectivity test with the given modelId
   */
  public static async testConnection(
    provider: AIProviderConfig,
    modelId: string
  ): Promise<{ success: boolean; message: string }> {
    const trimmedModel = (modelId || '').trim();
    if (!trimmedModel) {
      return { success: false, message: '请先填写模型 ID (Model ID)' };
    }
    if (!(provider.baseUrl || '').trim()) {
      return { success: false, message: '请先填写 API Base URL' };
    }
    if (!(provider.apiKey || '').trim() && provider.protocol !== 'ollama_native') {
      return { success: false, message: '请先填写 API Key 凭证' };
    }

    try {
      let receivedAny = false;
      let errorMsg = '';
      const { promise } = this.stream(
        provider,
        trimmedModel,
        [{ role: 'user', content: 'hello' }],
        (ev) => {
          if (ev.type === 'Delta' || ev.type === 'Done') receivedAny = true;
          if (ev.type === 'Error') errorMsg = ev.message;
        },
        12000
      );
      await promise;
      if (errorMsg) return { success: false, message: errorMsg };
      if (receivedAny) return { success: true, message: '连通性测试成功' };
      return { success: false, message: '未收到有效响应' };
    } catch (e: any) {
      return { success: false, message: e.message || '连接失败' };
    }
  }
}
