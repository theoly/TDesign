import { AITransport, TransportRequest, StreamEvent, ErrorKind } from './types';
import { SSEChunkParser } from './chunkParser';

export class FetchTransport implements AITransport {
  public readonly id = 'fetch-dev';

  public stream(
    request: TransportRequest,
    onEvent: (event: StreamEvent) => void
  ): { abort: () => void; promise: Promise<void> } {
    const controller = new AbortController();
    const parser = new SSEChunkParser(onEvent);

    let fetchUrl = request.url;
    const forwardHeaders: Record<string, string> = { ...(request.headers || {}) };

    if (
      typeof window !== 'undefined' &&
      (window.location?.hostname === 'localhost' || window.location?.hostname === '127.0.0.1')
    ) {
      fetchUrl = '/api/ai-proxy';
      forwardHeaders['x-target-url'] = request.url;
    }

    const promise = (async () => {
      try {
        const resp = await fetch(fetchUrl, {
          method: request.method || 'POST',
          headers: forwardHeaders,
          body: typeof request.body === 'string' ? request.body : JSON.stringify(request.body || {}),
          signal: controller.signal
        });

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
            if (errJson.error?.message) parsedMessage = errJson.error.message;
            else if (errJson.message) parsedMessage = errJson.message;
          } catch {}

          onEvent({
            type: 'Error',
            kind,
            message: `HTTP ${status}: ${parsedMessage}`,
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
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          parser.feed(chunk);
        }

        parser.finish();
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          onEvent({
            type: 'Error',
            kind: 'network_error',
            message: err?.message || '网络连接异常'
          });
        }
      }
    })();

    const abort = () => {
      controller.abort();
    };

    return { abort, promise };
  }
}
