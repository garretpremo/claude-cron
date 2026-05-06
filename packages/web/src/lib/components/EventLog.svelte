<script lang="ts">
import type { EventDTO } from "@claude-cron/server/contract/schemas";
import type { RunEvent } from "$lib/stores/run-stream";

interface Props {
  events: EventDTO[];
  liveEvents?: RunEvent[];
  startedAt: number;
}
const { events, liveEvents = [], startedAt }: Props = $props();

// Merge historical + live, deduped by seq, preserving order.
const merged = $derived.by(() => {
  const seen = new Set<number>();
  const out: Array<EventDTO & { live?: boolean }> = [];
  for (const e of events) {
    if (seen.has(e.seq)) continue;
    seen.add(e.seq);
    out.push(e);
  }
  for (const e of liveEvents) {
    if (seen.has(e.seq)) continue;
    seen.add(e.seq);
    out.push({ ...e, live: true } as EventDTO & { live?: boolean });
  }
  return out;
});

// The summary card mirrors the legacy renderSummaryCard: render the last
// `result` event as a card at the bottom of the stream.
const finalResult = $derived.by(() => {
  for (let i = merged.length - 1; i >= 0; i--) {
    const e = merged[i];
    if (!e) continue;
    if (e.type !== "claude_stdout") continue;
    const p = e.payload as { type?: string } | null;
    if (p && typeof p === "object" && p.type === "result") {
      return p as ResultPayload;
    }
  }
  return null;
});

interface TextBlock { type: "text"; text?: string }
interface ToolUseBlock { type: "tool_use"; id?: string; name?: string; input?: unknown }
interface ToolResultBlock {
  type: "tool_result";
  tool_use_id?: string;
  is_error?: boolean;
  content?: string | Array<{ type?: string; text?: string }> | unknown;
}
interface ThinkingBlock { type: "thinking"; thinking?: string }
type Block = TextBlock | ToolUseBlock | ToolResultBlock | ThinkingBlock | { type: string };

interface MessagePayload {
  type: "assistant" | "user";
  message?: { content?: Block[] };
}
interface SystemPayload { type: "system"; subtype?: string; model?: string }
interface ResultPayload {
  type: "result";
  subtype?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
  result?: string;
}

function fmtOffset(ts: number, start: number): string {
  const d = ts - start;
  if (d < 1000) return `+${d}ms`;
  return `+${(d / 1000).toFixed(1)}s`;
}

function fmtDuration(ms: number | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function fmtCost(c: number | undefined): string {
  return c == null ? "—" : `$${c.toFixed(4)}`;
}

function jsonPretty(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function toolResultBody(content: ToolResultBlock["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        const item = c as { type?: string; text?: string } | unknown;
        if (item && typeof item === "object" && (item as { type?: string }).type === "text") {
          return (item as { text?: string }).text ?? "";
        }
        return jsonPretty(item);
      })
      .join("\n");
  }
  return jsonPretty(content);
}

// Narrow helpers for template
function asMessage(p: unknown): MessagePayload | null {
  if (!p || typeof p !== "object") return null;
  const t = (p as { type?: unknown }).type;
  if (t === "assistant" || t === "user") return p as MessagePayload;
  return null;
}
function asSystem(p: unknown): SystemPayload | null {
  if (!p || typeof p !== "object") return null;
  if ((p as { type?: unknown }).type === "system") return p as SystemPayload;
  return null;
}
function asResult(p: unknown): ResultPayload | null {
  if (!p || typeof p !== "object") return null;
  if ((p as { type?: unknown }).type === "result") return p as ResultPayload;
  return null;
}
function asLine(p: unknown): string | null {
  if (!p || typeof p !== "object") return null;
  const line = (p as { line?: unknown }).line;
  return typeof line === "string" ? line : null;
}

function blockKey(b: Block, i: number): string {
  if (b.type === "tool_use") return `tu:${(b as ToolUseBlock).id ?? i}`;
  if (b.type === "tool_result") return `tr:${(b as ToolResultBlock).tool_use_id ?? i}`;
  return `${b.type}:${i}`;
}
</script>

<div class="event-log">
  {#each merged as e (e.seq)}
    {@const msg = e.type === "claude_stdout" ? asMessage(e.payload) : null}
    {@const sys = e.type === "claude_stdout" ? asSystem(e.payload) : null}
    {@const res = e.type === "claude_stdout" ? asResult(e.payload) : null}
    {@const line = e.type === "claude_stdout" ? asLine(e.payload) : null}

    <div class="event-row">
      <div class="event-meta">
        {#if e.live}<span class="live-badge">LIVE</span>{/if}
        <span class="seq">#{e.seq}</span>
        <span class="ts">{fmtOffset(e.ts, startedAt)}</span>
      </div>

      {#if msg && msg.type === "assistant"}
        <div class="event assistant-event">
          <div class="event-label">assistant</div>
          {#each (msg.message?.content ?? []) as b, i (blockKey(b, i))}
            {#if b.type === "text"}
              <div class="block block-text">{(b as TextBlock).text ?? ""}</div>
            {:else if b.type === "tool_use"}
              {@const tu = b as ToolUseBlock}
              <details class="block block-tool-use" open>
                <summary>
                  <span class="tool-name">⚙ {tu.name ?? "(tool)"}</span>
                  {#if tu.id}<span class="tool-id"> · {tu.id.slice(-8)}</span>{/if}
                </summary>
                <pre class="tool-input">{jsonPretty(tu.input ?? {})}</pre>
              </details>
            {:else if b.type === "thinking"}
              {@const tb = b as ThinkingBlock}
              <details class="block block-thinking">
                <summary>💭 thinking</summary>
                <div class="thinking-body">{tb.thinking ?? ""}</div>
              </details>
            {:else}
              <details class="block block-unknown">
                <summary>{b.type}</summary>
                <pre>{jsonPretty(b)}</pre>
              </details>
            {/if}
          {/each}
        </div>
      {:else if msg && msg.type === "user"}
        <div class="event user-event">
          <div class="event-label">user</div>
          {#each (msg.message?.content ?? []) as b, i (blockKey(b, i))}
            {#if b.type === "tool_result"}
              {@const tr = b as ToolResultBlock}
              <details class="block block-tool-result" class:error={tr.is_error}>
                <summary>
                  {tr.is_error ? "↩ tool error" : "↩ tool result"}
                  {#if tr.tool_use_id}<span class="tool-id"> · {String(tr.tool_use_id).slice(-8)}</span>{/if}
                </summary>
                <pre>{toolResultBody(tr.content)}</pre>
              </details>
            {:else if b.type === "text"}
              <div class="block block-text">{(b as TextBlock).text ?? ""}</div>
            {:else}
              <details class="block block-unknown">
                <summary>{b.type}</summary>
                <pre>{jsonPretty(b)}</pre>
              </details>
            {/if}
          {/each}
        </div>
      {:else if sys}
        <div class="event system-event">
          ▸ system · {[sys.subtype, sys.model ? `model: ${sys.model}` : ""].filter(Boolean).join(" · ")}
        </div>
      {:else if res}
        <div
          class="event result-event"
          class:ok={res.subtype === "success"}
          class:err={res.subtype && res.subtype !== "success"}
        >
          ▸ result · {res.subtype ?? ""}{typeof res.total_cost_usd === "number" ? ` · $${res.total_cost_usd.toFixed(4)}` : ""}{typeof res.num_turns === "number" ? ` · ${res.num_turns} turns` : ""}
        </div>
      {:else if line != null}
        <div class="event legacy-stdout">
          <code>{line}</code>
        </div>
      {:else if e.type === "claude_stdout"}
        <details class="event unknown-event">
          <summary>stdout</summary>
          <pre>{jsonPretty(e.payload)}</pre>
        </details>
      {:else if e.type === "start"}
        <div class="event control-event start"><span class="etype">start</span></div>
      {:else if e.type === "preflight"}
        {@const p = (e.payload ?? {}) as { proceed?: boolean; exitCode?: number | null; durationMs?: number; timedOut?: boolean; stdout?: string; stderr?: string }}
        <div class="event control-event preflight">
          <span class="etype">{p.proceed ? "✓" : "✗"} preflight</span>
          <span class="etail"> exit={p.exitCode ?? "—"} · {p.durationMs ?? 0}ms{p.timedOut ? " · TIMED OUT" : ""}</span>
          {#if p.stdout || p.stderr}
            <details>
              <summary>output</summary>
              <pre>{(p.stdout ?? "") + (p.stderr ? "\n[stderr] " + p.stderr : "")}</pre>
            </details>
          {/if}
        </div>
      {:else if e.type === "prompt_cmd"}
        {@const p = (e.payload ?? {}) as { prompt?: string }}
        <div class="event control-event prompt-cmd">
          <span class="etype">prompt_cmd</span> → <code>{p.prompt ?? ""}</code>
        </div>
      {:else if e.type === "claude_stderr"}
        {@const p = (e.payload ?? {}) as { line?: string }}
        <div class="event stderr-event">
          <span class="etype">stderr</span> <code>{p.line ?? ""}</code>
        </div>
      {:else if e.type === "end"}
        {@const p = (e.payload ?? {}) as { status?: string }}
        <div class="event control-event end">
          <span class="etype">end</span><span class="etail"> · {p.status ?? ""}</span>
        </div>
      {:else}
        <details class="event unknown-event">
          <summary>{e.type}</summary>
          <pre>{jsonPretty(e.payload)}</pre>
        </details>
      {/if}
    </div>
  {/each}

  {#if finalResult}
    {@const ok = finalResult.subtype === "success"}
    <div class="summary-card" class:ok class:err={!ok}>
      <div class="summary-head">
        <strong>{ok ? "✔ success" : "✘ " + (finalResult.subtype ?? "error")}</strong>
        <span class="summary-meta">
          · {fmtDuration(finalResult.duration_ms)}
          · {typeof finalResult.num_turns === "number" ? finalResult.num_turns : "—"} turns
          · {fmtCost(finalResult.total_cost_usd)}
        </span>
      </div>
      {#if finalResult.result}
        <div class="summary-result">{finalResult.result}</div>
      {/if}
    </div>
  {/if}
</div>

<style>
.event-log {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm, 8px);
  font-size: var(--font-size-sm, 13px);
}
.event-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.event-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--md-sys-color-on-surface-variant);
  opacity: 0.85;
}
.event-meta .seq,
.event-meta .ts { color: inherit; }
.live-badge {
  background: var(--md-sys-color-primary);
  color: var(--md-sys-color-on-primary);
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.05em;
}

.event-label {
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.05em;
  color: var(--md-sys-color-on-surface-variant);
  margin-bottom: 4px;
}

.assistant-event {
  border-left: 3px solid var(--md-sys-color-primary);
  padding-left: 10px;
}
.user-event {
  border-left: 3px solid var(--md-sys-color-secondary);
  padding-left: 10px;
}

.system-event,
.result-event,
.control-event {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: var(--md-sys-color-on-surface-variant);
  background: transparent;
  padding: 4px 6px;
}
.control-event {
  background: var(--md-sys-color-surface-container-low);
  border-radius: 4px;
}
.control-event details { margin-top: 4px; }
.control-event details summary { cursor: pointer; }

.result-event.ok { color: var(--md-sys-color-tertiary); }
.result-event.err { color: var(--md-sys-color-error); }

.stderr-event {
  border-left: 3px solid var(--md-sys-color-error);
  padding: 4px 0 4px 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: var(--md-sys-color-error);
}
.legacy-stdout {
  background: var(--md-sys-color-surface-container-low);
  border-radius: 4px;
  padding: 4px 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}

.block {
  margin: 4px 0;
  padding: 6px 8px;
  background: var(--md-sys-color-surface-container-low);
  border-radius: 6px;
}
.block-text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
  color: var(--md-sys-color-on-surface);
  background: var(--md-sys-color-surface-container-high);
}

.block-thinking {
  color: var(--md-sys-color-on-surface-variant);
}
.block-thinking summary { cursor: pointer; }
.block-thinking .thinking-body {
  margin-top: 6px;
  white-space: pre-wrap;
  font-style: italic;
  color: var(--md-sys-color-on-surface-variant);
}

.block-tool-use summary { cursor: pointer; }
.block-tool-use .tool-name {
  color: var(--md-sys-color-tertiary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.block-tool-use .tool-id {
  color: var(--md-sys-color-on-surface-variant);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  opacity: 0.7;
}
.block-tool-use .tool-input { margin-top: 6px; }

.block-tool-result summary {
  cursor: pointer;
  color: var(--md-sys-color-tertiary);
}
.block-tool-result.error summary {
  color: var(--md-sys-color-error);
}
.block-tool-result .tool-id {
  color: var(--md-sys-color-on-surface-variant);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  opacity: 0.7;
}

.block-unknown summary { cursor: pointer; }

pre {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  margin: 0;
  background: var(--md-sys-color-surface);
  color: var(--md-sys-color-on-surface);
  padding: 6px 8px;
  border-radius: 4px;
  overflow: auto;
}

details > summary { list-style: none; }
details > summary::-webkit-details-marker { display: none; }

.summary-card {
  margin: 8px 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--md-sys-color-tertiary) 10%, var(--md-sys-color-surface-container-low));
  border: 1px solid color-mix(in srgb, var(--md-sys-color-tertiary) 30%, transparent);
}
.summary-card.err {
  background: color-mix(in srgb, var(--md-sys-color-error) 10%, var(--md-sys-color-surface-container-low));
  border-color: color-mix(in srgb, var(--md-sys-color-error) 30%, transparent);
}
.summary-card .summary-head strong { color: var(--md-sys-color-tertiary); }
.summary-card.err .summary-head strong { color: var(--md-sys-color-error); }
.summary-card .summary-meta {
  color: var(--md-sys-color-on-surface-variant);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}
.summary-card .summary-result {
  margin-top: 8px;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
  color: var(--md-sys-color-on-surface);
}
</style>
