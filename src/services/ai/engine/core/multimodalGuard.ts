import { AIProviderConfig } from '../../../../types/provider';

/**
 * 校验指定 Provider 与模型是否具备多模态识图能力 (Vision / Multimodal)
 *
 * 业务判定规则 (BR-VR-01):
 * 1. Google Gemini 协议全系模型均原生支持多模态视觉 (Gemini 1.5 Flash/Pro, Gemini 2.0 Flash)；
 * 2. Anthropic Claude 3 / 3.5 / 3.7 协议全系模型原生支持视觉输入；
 * 3. DeepSeek 官方 API (deepseek-chat, deepseek-reasoner, deepseek-v3, deepseek-r1) 均为纯文本模型，不支持多模态；
 * 4. 显式带有 vision, -vl, llava, omni, 4o, gemini, claude-3 关键字的模型均视为多模态模型；
 * 5. OpenAI 官方 Provider 下的 gpt-4o, gpt-4-turbo, o1 视为多模态模型。
 */
export function supportsVision(provider?: AIProviderConfig | null, modelId?: string): boolean {
  if (!provider) return false;

  // 1. Gemini 原生协议全系支持 Vision
  if (provider.protocol === 'gemini') return true;

  // 2. Anthropic Claude 3 全系支持 Vision
  if (provider.protocol === 'anthropic') return true;

  const model = (modelId || provider.defaultModel || '').toLowerCase().trim();
  const provId = (provider.id || '').toLowerCase().trim();

  // 3. DeepSeek 严格排查 (官方 API 为纯文本)
  if (provId === 'prov-deepseek' || model.includes('deepseek')) {
    return false;
  }

  // 4. 关键字包含视觉/多模态特征
  if (
    model.includes('vision') ||
    model.includes('-vl') ||
    model.includes('llava') ||
    model.includes('omni') ||
    model.includes('4o') ||
    model.includes('gemini') ||
    model.includes('claude-3')
  ) {
    return true;
  }

  // 5. OpenAI 官方常见视觉模型
  if (
    provId === 'prov-openai' &&
    (model.startsWith('gpt-4') || model.startsWith('o1') || model.startsWith('chatgpt-4o'))
  ) {
    return true;
  }

  return false;
}

export type ModelCapability = 'vision' | 'reasoning' | 'code' | 'chat';

export interface DiscoveredModel {
  id: string;
  name?: string;
  capabilities: ModelCapability[];
}

/**
 * 推断指定模型的综合能力标签 (Vision / Reasoning / Code / Chat)
 */
export function detectModelCapabilities(
  provider?: AIProviderConfig | null,
  modelId?: string
): ModelCapability[] {
  const caps: ModelCapability[] = ['chat'];
  const model = (modelId || provider?.defaultModel || '').toLowerCase().trim();

  // 1. 视觉能力
  if (supportsVision(provider, modelId)) {
    caps.push('vision');
  }

  // 2. 深度思考推理能力
  if (
    model.includes('reasoner') ||
    model.includes('r1') ||
    model.includes('o1') ||
    model.includes('o3') ||
    model.includes('thinking') ||
    model.includes('thought')
  ) {
    caps.push('reasoning');
  }

  // 3. 代码特化能力
  if (
    model.includes('coder') ||
    model.includes('code') ||
    model.includes('starcoder') ||
    model.includes('dev')
  ) {
    caps.push('code');
  }

  return caps;
}
