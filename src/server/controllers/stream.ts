import type { Database } from "bun:sqlite";
import { pollNewEvents, getRunStatus } from "../services/run-service";
import { HttpError, toErrorResponse } from "../http/errors";
import { sseHeaders } from "../http/response";

const POLL_MS = 500;

export function streamController(db: Database) {
  return {
    stream: (idRaw: string): Response => {
      try {
        const id = Number(idRaw);
        if (!Number.isInteger(id) || id <= 0) {
          throw new HttpError(400, "Invalid run id", "BAD_ID");
        }
        const status = getRunStatus(db, id);
        if (status === null) {
          throw new HttpError(404, `Run ${id} not found`, "NOT_FOUND");
        }

        const stream = new ReadableStream({
          start(controller) {
            let seq = -1;
            let closed = false;

            const send = (evt: string, data: unknown) => {
              if (closed) return;
              controller.enqueue(
                new TextEncoder().encode(`event: ${evt}\ndata: ${JSON.stringify(data)}\n\n`)
              );
            };

            const tick = async () => {
              while (!closed) {
                const newEvents = pollNewEvents(db, id, seq);
                for (const e of newEvents) {
                  send("event", e);
                  seq = e.seq;
                }
                const st = getRunStatus(db, id);
                send("status", { status: st });
                if (st !== "running") {
                  send("end", { status: st });
                  controller.close();
                  closed = true;
                  return;
                }
                await new Promise((r) => setTimeout(r, POLL_MS));
              }
            };

            tick().catch((e) => {
              try {
                send("error", { error: String(e) });
                controller.close();
              } catch {}
              closed = true;
            });
          },
        });

        return new Response(stream, { headers: sseHeaders() });
      } catch (e) { return toErrorResponse(e); }
    },
  };
}
