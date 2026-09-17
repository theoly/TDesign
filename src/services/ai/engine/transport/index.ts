import { AITransport } from './types';
import { AIServiceTransport } from './aiServiceTransport';

export * from './types';
export * from './mockTransport';
export * from './tauriTransport';
export * from './fetchTransport';
export * from './aiServiceTransport';

export function createDefaultTransport(): AITransport {
  return new AIServiceTransport();
}
