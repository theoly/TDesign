import { createDefaultTransport } from '../transport';
import { DefaultAIEngineCore } from './aiEngineCore';
import { AIEngineCore } from './types';

export * from './types';
export * from './protocolAdapter';
export * from './aiEngineCore';

export function createAIEngineCore(customTransport?: any): AIEngineCore {
  return new DefaultAIEngineCore(customTransport || createDefaultTransport());
}
