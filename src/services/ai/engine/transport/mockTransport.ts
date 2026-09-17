import { AITransport, TransportRequest, StreamEvent } from './types';

export interface MockStreamScenario {
  events: StreamEvent[];
  delayMs?: number;
}

export class MockTransport implements AITransport {
  public readonly id = 'mock';
  private scenarioQueue: MockStreamScenario[] = [];
  public lastRequest?: TransportRequest;

  constructor(scenarios?: MockStreamScenario[]) {
    if (scenarios) {
      this.scenarioQueue = [...scenarios];
    }
  }

  public enqueueScenario(scenario: MockStreamScenario): void {
    this.scenarioQueue.push(scenario);
  }

  public queueResponse(text: string, delayMs = 5): void {
    this.enqueueScenario({
      events: [
        { type: 'Delta', text },
        { type: 'Usage', input_tokens: 100, output_tokens: 50 },
        { type: 'Done', finish_reason: 'stop' }
      ],
      delayMs
    });
  }

  public clearScenarios(): void {
    this.scenarioQueue = [];
  }

  public stream(
    request: TransportRequest,
    onEvent: (event: StreamEvent) => void
  ): { abort: () => void; promise: Promise<void> } {
    this.lastRequest = request;
    let isAborted = false;
    let timeoutId: any = null;

    const scenario = this.scenarioQueue.shift() || {
      events: [
        { type: 'Delta', text: '```html\n<div data-nid="mock0001" class="p-4">Mock Generated UI</div>\n```' },
        { type: 'Usage', input_tokens: 120, output_tokens: 45 },
        { type: 'Done', finish_reason: 'stop' }
      ],
      delayMs: 5
    };

    const promise = new Promise<void>((resolve) => {
      let idx = 0;
      const step = () => {
        if (isAborted) {
          resolve();
          return;
        }

        if (idx < scenario.events.length) {
          const ev = scenario.events[idx++];
          onEvent(ev);
          if (ev.type === 'Done' || ev.type === 'Error') {
            resolve();
            return;
          }
          timeoutId = setTimeout(step, scenario.delayMs || 5);
        } else {
          resolve();
        }
      };

      timeoutId = setTimeout(step, scenario.delayMs || 5);
    });

    const abort = () => {
      isAborted = true;
      if (timeoutId) clearTimeout(timeoutId);
    };

    return { abort, promise };
  }
}
