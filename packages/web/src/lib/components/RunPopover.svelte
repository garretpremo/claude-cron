<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { browser } from "$app/environment";
import { api, type RunWithEventsDTO } from "$lib/api";
import { runStream, type RunEvent, type RunStream } from "$lib/stores/run-stream";
import { maskSensitiveInputs } from "@claude-cron/core";
import EventLog from "./EventLog.svelte";
if (browser) void import("@m3e/chips");

interface Props {
  runId: number;
  onClose: () => void;
}
const { runId, onClose }: Props = $props();

let detail = $state<RunWithEventsDTO | null>(null);
let loadError = $state<string | null>(null);
let live = $state<RunStream | null>(null);

onMount(async () => {
  try {
    const d = await api.runs.get(runId);
    detail = d;
    if (d.status === "running") {
      live = runStream(runId);
    }
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  if (browser) {
    document.addEventListener("keydown", onKeyDown);
  }
});

onDestroy(() => {
  live?.close();
  if (browser) document.removeEventListener("keydown", onKeyDown);
});

function onKeyDown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.preventDefault();
    onClose();
  }
}

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) onClose();
}

function formatCost(c: number | null | undefined): string {
  return c == null ? "—" : `$${c.toFixed(4)}`;
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

let liveEvents = $state<RunEvent[]>([]);

$effect(() => {
  if (!live) {
    liveEvents = [];
    return;
  }
  const unsubscribe = live.events.subscribe((v) => {
    liveEvents = v;
  });
  return () => unsubscribe();
});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="backdrop"
  role="dialog"
  aria-modal="true"
  aria-labelledby="run-popover-title"
  tabindex="-1"
  onclick={onBackdrop}
>
  <div class="popover" role="document">
    <header class="head">
      <div class="head-titles">
        <h2 id="run-popover-title">Run #{runId}</h2>
        {#if detail}
          <div class="subtitle">
            <span class="proj">{detail.project}</span>
            <span class="sep">/</span>
            <span class="job">{detail.job}</span>
          </div>
        {/if}
      </div>
      <button class="close" type="button" onclick={onClose} aria-label="Close">
        <m3e-icon name="close"></m3e-icon>
      </button>
    </header>

    <div class="content">
      {#if loadError}
        <div class="error">Failed to load run: {loadError}</div>
      {:else if !detail}
        <div class="loading">Loading…</div>
      {:else}
        <div class="meta">
          <div class="meta-row">
            <span class="key">status</span>
            <m3e-chip class="status-chip status-{detail.status}">{detail.status}</m3e-chip>
          </div>
          <div class="meta-row">
            <span class="key">started</span>
            <span class="val">{new Date(detail.started_at).toLocaleString()}</span>
          </div>
          <div class="meta-row">
            <span class="key">duration</span>
            <span class="val">{formatDuration(detail.duration_ms)}</span>
          </div>
          <div class="meta-row">
            <span class="key">cost</span>
            <span class="val">{formatCost(detail.cost_usd)}</span>
          </div>
          <div class="meta-row">
            <span class="key">tokens</span>
            <span class="val">
              in {detail.input_tokens ?? "—"}
              · out {detail.output_tokens ?? "—"}
              · cache {detail.cache_creation_tokens ?? 0}/{detail.cache_read_tokens ?? 0}
            </span>
          </div>
          {#if detail.summary}
            <div class="meta-row summary">
              <span class="key">summary</span>
              <span class="val summary-text">{detail.summary}</span>
            </div>
          {/if}
          {#if detail.inputs_json}
            {@const inputs = maskSensitiveInputs(JSON.parse(detail.inputs_json) as Record<string, string>)}
            <div class="meta-row inputs-row">
              <span class="key">inputs</span>
              <dl class="inputs-table">
                {#each Object.entries(inputs) as [k, v]}
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                {/each}
              </dl>
            </div>
          {/if}
        </div>

        <h3>Event trace</h3>
        <EventLog
          events={detail.events}
          liveEvents={live ? liveEvents : []}
          startedAt={detail.started_at}
        />
      {/if}
    </div>

    <footer class="foot">
      <button type="button" class="text-button" onclick={onClose}>Close</button>
    </footer>
  </div>
</div>

<style>
.backdrop {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, black 50%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: var(--space-md);
  animation: fade-in 120ms ease-out;
}
.popover {
  background: var(--md-sys-color-surface-container-high);
  color: var(--md-sys-color-on-surface);
  border-radius: 24px;
  width: min(720px, 100%);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 64px color-mix(in srgb, black 40%, transparent);
  overflow: hidden;
  animation: pop-in 160ms ease-out;
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-lg) var(--space-xl) var(--space-md);
}
.head-titles h2 {
  margin: 0;
  font-size: var(--font-size-2xl);
  font-weight: 500;
}
.subtitle {
  font-size: var(--font-size-sm);
  opacity: 0.75;
  margin-top: 2px;
}
.subtitle .sep { opacity: 0.5; margin-inline: 0.25rem; }
.close {
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 6px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.close:hover { background: var(--md-sys-color-surface-container-highest); }
.content {
  padding: 0 var(--space-xl);
  overflow: auto;
  flex: 1;
}
.loading, .error {
  padding: var(--space-xl) 0;
  opacity: 0.75;
}
.error { color: var(--md-sys-color-error); }
.meta {
  display: grid;
  gap: var(--space-xs);
  margin-bottom: var(--space-lg);
}
.meta-row {
  display: grid;
  grid-template-columns: 80px 1fr;
  align-items: center;
  gap: var(--space-md);
  font-size: var(--font-size-sm);
}
.meta-row.summary { align-items: start; }
.meta-row.inputs-row { align-items: start; }
.inputs-table {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.25rem 0.75rem;
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: var(--font-size-xs);
}
.inputs-table dt {
  color: var(--md-sys-color-on-surface-variant);
}
.inputs-table dd {
  margin: 0;
  word-break: break-all;
}
.summary-text {
  white-space: pre-wrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: var(--font-size-xs);
  opacity: 0.85;
}
.key {
  text-transform: uppercase;
  font-size: var(--font-size-xs);
  letter-spacing: 0.04em;
  opacity: 0.6;
}
.val {
  font-variant-numeric: tabular-nums;
}
h3 {
  margin: 0 0 var(--space-sm);
  font-size: var(--font-size-md);
  font-weight: 500;
}
.foot {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-xl) var(--space-lg);
  border-top: 1px solid color-mix(in srgb, currentColor 10%, transparent);
}
.text-button {
  background: transparent;
  border: none;
  color: var(--md-sys-color-primary);
  cursor: pointer;
  padding: 8px 16px;
  border-radius: 20px;
  font: inherit;
  font-weight: 500;
}
.text-button:hover {
  background: color-mix(in srgb, var(--md-sys-color-primary) 8%, transparent);
}
@keyframes fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes pop-in {
  from { opacity: 0; transform: scale(0.97); }
  to   { opacity: 1; transform: scale(1); }
}
</style>
