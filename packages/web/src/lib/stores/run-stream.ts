// Per-run SSE store. Opens an EventSource against `/api/runs/:id/stream`,
// keeps the most recent N events in a Svelte writable, and closes on error
// or `end`. The server emits named SSE events:
//   event: event   data: { seq, ts, type, payload }   (claude-cron event row)
//   event: status  data: { status }                   (heartbeat / status update)
//   event: end     data: { status }                   (terminal — close)
//   event: error   data: { error }                    (server error)
//
// We surface only the `event` rows in the events store, which is what the
// running-job card and the run popover want to live-tail.
import { writable, type Writable } from "svelte/store";

export interface RunEvent {
  seq: number;
  ts: number;
  type: string;
  payload: unknown;
}

export interface RunStream {
  events: Writable<RunEvent[]>;
  status: Writable<string | null>;
  close: () => void;
}

const KEEP = 3;

export function runStream(runId: number): RunStream {
  const events = writable<RunEvent[]>([]);
  const status = writable<string | null>(null);
  let es: EventSource | null = null;
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    es?.close();
    es = null;
  };

  if (typeof window === "undefined") {
    // SSR / non-browser — return a no-op stream.
    return { events, status, close };
  }

  es = new EventSource(`/api/runs/${runId}/stream`);

  es.addEventListener("event", (msg: MessageEvent) => {
    try {
      const ev = JSON.parse(msg.data) as RunEvent;
      events.update((cur) => [...cur, ev].slice(-KEEP));
    } catch {
      /* ignore malformed payload */
    }
  });

  es.addEventListener("status", (msg: MessageEvent) => {
    try {
      const data = JSON.parse(msg.data) as { status: string | null };
      status.set(data.status);
    } catch {
      /* ignore */
    }
  });

  es.addEventListener("end", (msg: MessageEvent) => {
    try {
      const data = JSON.parse(msg.data) as { status: string | null };
      status.set(data.status);
    } catch {
      /* ignore */
    }
    close();
  });

  es.onerror = () => {
    close();
  };

  return { events, status, close };
}
