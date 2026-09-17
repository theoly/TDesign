import { invoke, Channel, isTauri } from '@tauri-apps/api/core';
import { AITransport, TransportRequest, StreamEvent } from './types';
import { SSEChunkParser } from './chunkParser';

export class TauriRustTransport implements AITransport {
  public readonly id = 'tauri-rust';

  public stream(
    request: TransportRequest,
    onEvent: (event: StreamEvent) => void
  ): { abort: () => void; promise: Promise<void> } {
    let isAborted = false;
    const parser = new SSEChunkParser(onEvent);

    const promise = new Promise<void>(async (resolve, reject) => {
      try {
        const channel = new Channel<{ type: string; data?: string }>();
        channel.onmessage = (payload) => {
          if (isAborted) return;
          if (payload.type === 'Chunk' && payload.data) {
            parser.feed(payload.data);
          } else if (payload.type === 'Error') {
            onEvent({
              type: 'Error',
              kind: 'network_error',
              message: payload.data || '网络请求异常'
            });
            resolve();
          } else if (payload.type === 'Done') {
            parser.finish();
            onEvent({ type: 'Done', finish_reason: 'stop' });
            resolve();
          }
        };

        await invoke('proxy_stream_request', {
          url: request.url,
          method: request.method || 'POST',
          headers: request.headers || {},
          body: typeof request.body === 'string' ? request.body : JSON.stringify(request.body || {}),
          allow_private_network: request.allowPrivateNetwork ?? request.provider?.allowPrivateNetwork ?? false,
          allowed_internal_hosts: request.allowedInternalHosts ?? request.provider?.allowedInternalHosts ?? [],
          channel
        });
      } catch (err: any) {
        if (!isAborted) {
          onEvent({
            type: 'Error',
            kind: 'network_error',
            message: err?.message || 'Tauri proxy request failed'
          });
        }
        resolve();
      }
    });

    const abort = () => {
      isAborted = true;
    };

    return { abort, promise };
  }
}
