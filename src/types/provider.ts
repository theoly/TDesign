export type ErrorKind =
  | 'auth_failed'
  | 'not_found'
  | 'rate_limited'
  | 'timeout'
  | 'network_error'
  | 'invalid_response';

export type StreamEvent =
  | { type: 'Delta'; text: string }
  | { type: 'Usage'; input_tokens: number; output_tokens: number }
  | { type: 'Done'; finish_reason: string }
  | { type: 'Error'; kind: ErrorKind; message: string; http_status?: number };

export type ModelRole = 'code' | 'chat' | 'vision' | 'image';

export type ProviderProtocol = 'openai_compatible' | 'anthropic' | 'gemini' | 'ollama_native';

export interface AIProviderConfig {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  apiKey: string;
  isEnabled: boolean;
  defaultModel?: string;
  customModels?: string[];
  isCustom?: boolean;
  allowPrivateNetwork?: boolean;
  allowedInternalHosts?: string[];
}

export interface ModelRoleBinding {
  role: ModelRole;
  providerId: string;
  modelId: string;
  maxOutputTokens?: number;
}

export interface ThirdPartyPreset {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  defaultModel: string;
  suggestedModels: string[];
  description: string;
}
