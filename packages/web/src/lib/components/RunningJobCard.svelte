<script lang="ts">
import { onDestroy } from "svelte";
import { browser } from "$app/environment";
import { goto } from "$app/navigation";
import { runStream, type RunEvent } from "$lib/stores/run-stream";

if (browser) void import("@m3e/card");

interface Props {
  runId: number;
  project: string;
  job: string;
  startedAt: number;
}
const props: Props = $props();
// svelte-ignore state_referenced_locally
const { project, job, startedAt } = props;
// svelte-ignore state_referenced_locally
const initialRunId = props.runId;

const stream = browser ? runStream(initialRunId) : null;
let evs = $state<RunEvent[]>([]);
let now = $state(Date.now());

let tick: ReturnType<typeof setInterval> | null = null;
let unsubscribe: (() => void) | null = null;
if (browser) {
  tick = setInterval(() => (now = Date.now()), 5_000);
  if (stream) {
    unsubscribe = stream.events.subscribe((v) => {
      evs = v;
    });
  }
}

onDestroy(() => {
  stream?.close();
  if (unsubscribe) unsubscribe();
  if (tick) clearInterval(tick);
});

function timeAgo(tsMs: number, ref: number): string {
  const sec = Math.max(0, Math.floor((ref - tsMs) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

function summarize(ev: RunEvent): string {
  const p = (ev.payload ?? {}) as Record<string, unknown>;
  if (ev.type === "claude_stdout") {
    const t = (p.type as string | undefined) ?? "";
    if (t === "tool_use") {
      const name = (p.name as string | undefined) ?? "tool";
      return `tool: ${name}`;
    }
    if (t === "assistant") return "assistant text";
    if (t === "result") return "result";
    if (t === "system") return "system";
    return t || "stdout";
  }
  if (ev.type === "claude_stderr") return "stderr";
  if (ev.type === "preflight") return "preflight";
  if (ev.type === "prompt_cmd") return "prompt_cmd";
  if (ev.type === "start") return "started";
  if (ev.type === "end") return "ended";
  return ev.type;
}

function open() {
  void goto(
    `/projects/${encodeURIComponent(project)}/jobs/${encodeURIComponent(job)}?run=${props.runId}`,
  );
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    open();
  }
}

</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<m3e-card
  variant="outlined"
  class="run-card"
  role="button"
  tabindex="0"
  onclick={open}
  onkeydown={onKey}
>
  <div slot="content" class="body">
    <header class="head">
      <div class="title">
        <span class="project">{project}</span>
        <span class="sep">/</span>
        <span class="job">{job}</span>
      </div>
      <span class="status-pulse" aria-label="running"></span>
    </header>
    <div class="started">started {timeAgo(startedAt, now)}</div>
    <ul class="events">
      {#each evs as ev (ev.seq)}
        <li>{summarize(ev)}</li>
      {/each}
      {#if evs.length === 0}
        <li class="placeholder">waiting for events…</li>
      {/if}
    </ul>
  </div>
</m3e-card>

<style>
:global(.run-card) {
  display: block;
  min-width: 280px;
  flex: 0 0 280px;
  cursor: pointer;
}
.body {
  padding: var(--space-md);
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}
.title {
  font-weight: 600;
  font-size: var(--font-size-sm);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sep {
  opacity: 0.45;
  margin-inline: 0.25rem;
}
.project {
  opacity: 0.8;
}
.status-pulse {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--md-sys-color-primary);
  animation: pulse 1.5s ease-in-out infinite;
  flex: none;
}
.started {
  font-size: var(--font-size-xs);
  opacity: 0.7;
  margin-top: 2px;
}
.events {
  list-style: none;
  padding: 0;
  margin: var(--space-sm) 0 0;
  font-size: var(--font-size-xs);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  opacity: 0.85;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 3.6em;
}
.placeholder {
  opacity: 0.5;
}
@keyframes pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
</style>
