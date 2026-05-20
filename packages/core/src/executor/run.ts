import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import YAML from "yaml";
import type { Database } from "bun:sqlite";
import { JobSchema, type Job } from "../job/schema";
import {
  insertRun, finishRun, appendEvent, abandonStaleRuns,
  deleteOldRuns, type RunStatus, type EventType,
} from "../db/queries";
import { parseDuration } from "../util/duration";
import { acquireLock } from "./lock";
import { runPreflight } from "./preflight";
import { resolvePrompt } from "./prompt";
import { buildClaudeArgv } from "./claude";

export interface ExecuteRunInput {
  db: Database;
  project: string;
  jobFile: string;
  lockPath: string;
  extraPath?: string;   // prepended to PATH (lets tests point to mock claude)
  isTest: boolean;
  /** Per-trigger input values. Each key K is injected as CC_INPUT_<K> into
   *  both the prompt_cmd subprocess and the claude subprocess env.
   *  Callers are responsible for validating the map with `validateInputs`
   *  (`src/job/inputs.ts`) before reaching here — `executeRun` does NOT
   *  re-validate. The CLI and HTTP entry points perform validation at the
   *  boundary. */
  inputs?: Record<string, string>;
  /** Called exactly once, right after the run row is inserted (whatever the
   *  eventual terminal status). Lets callers (e.g. the Run-now API) return
   *  the run_id before the run completes. */
  onStart?: (runId: number) => void;
}

export interface ExecuteRunResult {
  terminalStatus: RunStatus;
  runId: number | null;
  exitCode: number;
}

const ABANDONED_FLOOR_MS = 60 * 60 * 1000; // 1h

export async function executeRun(i: ExecuteRunInput): Promise<ExecuteRunResult> {
  const now = Date.now();

  // 1. Parse job (before stale sweep so we know the timeout)
  let job: Job;
  try {
    const raw = readFileSync(i.jobFile, "utf8");
    job = JobSchema.parse(YAML.parse(raw));
  } catch (e) {
    const id = insertRun(i.db, {
      project: i.project, job: "<unknown>", fire_time: now,
      started_at: now, schedule: "?", is_test: i.isTest,
    });
    i.onStart?.(id);
    finishRun(i.db, id, {
      status: "config_error", exit_code: null, cost_usd: null,
      summary: e instanceof Error ? e.message : String(e),
      ended_at: Date.now(),
    });
    return { terminalStatus: "config_error", runId: id, exitCode: 2 };
  }

  const jobTimeoutMs = parseDuration(job.timeout);
  const staleMs = Math.max(2 * jobTimeoutMs, ABANDONED_FLOOR_MS);

  // 2. Abandoned sweep
  abandonStaleRuns(i.db, now, staleMs);

  // 3. Acquire lock
  const lock = await acquireLock(i.lockPath);
  if (!lock) {
    const id = insertRun(i.db, {
      project: i.project, job: job.name, fire_time: now,
      started_at: now, schedule: job.schedule, is_test: i.isTest,
    });
    i.onStart?.(id);
    finishRun(i.db, id, {
      status: "skipped_overlap", exit_code: null, cost_usd: null,
      summary: null, ended_at: Date.now(),
    });
    return { terminalStatus: "skipped_overlap", runId: id, exitCode: 0 };
  }

  // 4. Insert running row
  const runId = insertRun(i.db, {
    project: i.project, job: job.name, fire_time: now,
    started_at: Date.now(), schedule: job.schedule, is_test: i.isTest,
  });
  i.onStart?.(runId);

  let seq = 0;
  const emit = (type: EventType, payload: unknown) => {
    appendEvent(i.db, runId, seq++, Date.now(), type, payload);
  };
  emit("start", { project: i.project, job: job.name });

  // cwd: job.cwd is relative to the project root, which is the parent
  // of the .claude-jobs dir. Since jobFile = <proj>/.claude-jobs/<name>.yaml,
  // projectRoot = dirname(dirname(jobFile)).
  const projectRoot = dirname(dirname(i.jobFile));
  const cwdAbs = resolve(projectRoot, job.cwd);
  const env: Record<string, string> = { ...process.env } as any;
  if (i.extraPath) env.PATH = `${i.extraPath}:${env.PATH ?? ""}`;
  if (i.inputs) {
    for (const [k, v] of Object.entries(i.inputs)) {
      env[`CC_INPUT_${k}`] = v;
    }
  }

  try {
    // 5. Preflight
    if (job.preflight) {
      const pf = await runPreflight({
        run: job.preflight.run,
        timeoutMs: parseDuration(job.preflight.timeout),
        cwd: cwdAbs,
        env,
      });
      emit("preflight", pf);
      if (!pf.proceed) {
        finishRun(i.db, runId, {
          status: "skipped_preflight", exit_code: pf.exitCode,
          cost_usd: null, summary: pf.timedOut ? "preflight timed out" : "preflight gated",
          ended_at: Date.now(),
        });
        emit("end", { status: "skipped_preflight" });
        await lock.release();
        return { terminalStatus: "skipped_preflight", runId, exitCode: 0 };
      }
    }

    // 6. Resolve prompt
    let prompt: string;
    try {
      const r = await resolvePrompt({
        claude: job.claude, cwd: cwdAbs,
        timeoutMs: 30_000, env,
      });
      if (r.fromCmd) emit("prompt_cmd", r);
      prompt = r.prompt;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      finishRun(i.db, runId, {
        status: "config_error", exit_code: null,
        cost_usd: null, summary: msg, ended_at: Date.now(),
      });
      emit("end", { status: "config_error", error: msg });
      await lock.release();
      return { terminalStatus: "config_error", runId, exitCode: 2 };
    }

    // 7. Build argv and spawn
    const argv = buildClaudeArgv({ job, prompt, cwdAbsolute: cwdAbs });

    const proc = Bun.spawn(argv, {
      cwd: cwdAbs, env,
      stdout: "pipe", stderr: "pipe",
    });

    if (proc.pid) {
      i.db.query("UPDATE runs SET pid=? WHERE id=?").run(proc.pid, runId);
    }

    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      try { proc.kill("SIGTERM"); } catch {}
      setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} }, 5_000);
    }, jobTimeoutMs);

    // Stream stdout/stderr line-by-line as the process runs. Each JSON line
    // becomes its own event with the parsed object as payload; non-JSON lines
    // fall back to `{ line: string }`.
    const stdoutLines: string[] = [];
    const streamLines = async (
      stream: ReadableStream<Uint8Array>, onLine: (line: string) => void
    ) => {
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl = buf.indexOf("\n");
          while (nl !== -1) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            if (line) onLine(line);
            nl = buf.indexOf("\n");
          }
        }
        if (buf) onLine(buf);
      } catch { /* stream closed (e.g. killed) */ }
    };
    const stdoutPromise = streamLines(proc.stdout, (line) => {
      stdoutLines.push(line);
      let payload: unknown;
      try { payload = JSON.parse(line); } catch { payload = { line }; }
      emit("claude_stdout", payload);
    });
    const stderrPromise = streamLines(proc.stderr, (line) => {
      emit("claude_stderr", { line });
    });

    const exitCode = await proc.exited;
    clearTimeout(timeout);

    // Give drains a beat to flush buffered output; race in case streams
    // don't close cleanly after an external kill.
    await Promise.race([
      Promise.all([stdoutPromise, stderrPromise]),
      new Promise((r) => setTimeout(r, 500)),
    ]);

    // 8. Extract cost / summary / token usage from the last stream-json
    //    `result` event. On subscription auth, total_cost_usd is the
    //    notional API-equivalent dollar amount (not a charge). Token counts
    //    are the source of truth for "what this run consumed".
    let cost: number | null = null;
    let summary: string | null = null;
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let cacheCreationTokens: number | null = null;
    let cacheReadTokens: number | null = null;
    for (let k = stdoutLines.length - 1; k >= 0; k--) {
      try {
        const obj = JSON.parse(stdoutLines[k]!);
        if (obj && typeof obj === "object" && obj.type === "result") {
          cost = typeof obj.total_cost_usd === "number" ? obj.total_cost_usd
               : typeof obj.cost_usd === "number" ? obj.cost_usd
               : null;
          summary = typeof obj.result === "string" ? obj.result : null;
          const u = obj.usage;
          if (u && typeof u === "object") {
            const num = (v: unknown) => (typeof v === "number" ? v : null);
            inputTokens = num(u.input_tokens);
            outputTokens = num(u.output_tokens);
            cacheCreationTokens = num(u.cache_creation_input_tokens);
            cacheReadTokens = num(u.cache_read_input_tokens);
          }
          break;
        }
      } catch { /* skip */ }
    }

    // 9. Terminal status
    const wasSignaled = proc.signalCode !== null;
    const status: RunStatus = timedOut
      ? "timeout"
      : wasSignaled
        ? "interrupted"
        : exitCode === 0 ? "success" : "failure";

    finishRun(i.db, runId, {
      status, exit_code: timedOut ? null : exitCode,
      cost_usd: cost, summary, ended_at: Date.now(),
      input_tokens: inputTokens, output_tokens: outputTokens,
      cache_creation_tokens: cacheCreationTokens, cache_read_tokens: cacheReadTokens,
    });
    emit("end", {
      status, exit_code: exitCode, cost,
      input_tokens: inputTokens, output_tokens: outputTokens,
      cache_creation_tokens: cacheCreationTokens, cache_read_tokens: cacheReadTokens,
    });

    // 10. Retention sweep
    const cutoff = Date.now() - job.logging.retention_days * 86_400_000;
    deleteOldRuns(i.db, i.project, job.name, cutoff);

    await lock.release();
    return { terminalStatus: status, runId, exitCode: status === "success" ? 0 : 1 };
  } catch (e) {
    finishRun(i.db, runId, {
      status: "failure", exit_code: null, cost_usd: null,
      summary: e instanceof Error ? e.message : String(e),
      ended_at: Date.now(),
    });
    emit("end", { status: "failure", error: String(e) });
    await lock.release();
    return { terminalStatus: "failure", runId, exitCode: 1 };
  }
}
