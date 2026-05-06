<script lang="ts">
import { browser } from "$app/environment";
import { goto } from "$app/navigation";
import type { RunDTO } from "$lib/api";
if (browser) void import("@m3e/chips");

interface Props {
  rows: RunDTO[];
  showProject?: boolean;
  showJob?: boolean;
  onRowClick?: (id: number) => void;
  emptyText?: string;
}
const {
  rows,
  showProject = true,
  showJob = true,
  onRowClick,
  emptyText = "No runs yet.",
}: Props = $props();

const click = (id: number) => () => {
  if (onRowClick) {
    onRowClick(id);
    return;
  }
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("run", String(id));
  void goto(url.pathname + url.search, { replaceState: false, keepFocus: true });
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const sameDay = new Date().toDateString() === d.toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function formatCost(c: number | null): string {
  if (c == null) return "—";
  return `$${c.toFixed(4)}`;
}
</script>

{#if rows.length === 0}
  <div class="empty">{emptyText}</div>
{:else}
  <div class="table-wrap">
    <table class="runs">
      <thead>
        <tr>
          <th class="time">time</th>
          {#if showProject}<th>project</th>{/if}
          {#if showJob}<th>job</th>{/if}
          <th>status</th>
          <th class="num">duration</th>
          <th class="num">cost</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as r (r.id)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <tr
            class={r.status}
            class:running={r.status === "running"}
            onclick={click(r.id)}
            tabindex="0"
            role="button"
          >
            <td class="time">{formatTime(r.started_at)}</td>
            {#if showProject}<td class="project">{r.project}</td>{/if}
            {#if showJob}<td class="job">{r.job}</td>{/if}
            <td class="status-cell">
              <m3e-chip class="status-chip status-{r.status}">{r.status}</m3e-chip>
              {#if r.coalesced_count && r.coalesced_count > 1}
                <span class="x">×{r.coalesced_count}</span>
              {/if}
            </td>
            <td class="num">{formatDuration(r.duration_ms)}</td>
            <td class="num">{formatCost(r.cost_usd)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
.empty {
  padding: var(--space-xl);
  text-align: center;
  opacity: 0.6;
}
.table-wrap {
  border: 1px solid color-mix(in srgb, var(--md-sys-color-on-surface) 12%, transparent);
  border-radius: 12px;
  overflow: hidden;
  background: var(--md-sys-color-surface-container-low);
}
table.runs {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
}
th, td {
  text-align: left;
  padding: var(--space-xs) var(--space-md);
  border-bottom: 1px solid color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
}
th {
  font-weight: 500;
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.6;
  background: var(--md-sys-color-surface-container);
}
tbody tr {
  cursor: pointer;
  transition: background 120ms ease;
}
tbody tr:hover {
  background: var(--md-sys-color-surface-container);
}
tbody tr:focus {
  outline: 2px solid var(--md-sys-color-primary);
  outline-offset: -2px;
}
tbody tr:last-child td {
  border-bottom: none;
}
td.num, th.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
td.time {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: nowrap;
}
td.project, td.job {
  white-space: nowrap;
}
.status-cell {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}
.x {
  font-size: var(--font-size-xs);
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}
tr.running td.time::before {
  content: "";
  display: inline-block;
  width: 8px;
  height: 8px;
  background: var(--md-sys-color-primary);
  border-radius: 50%;
  margin-right: var(--space-xs);
  vertical-align: middle;
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
</style>
