<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { browser } from "$app/environment";
import { page } from "$app/stores";
import { goto } from "$app/navigation";
import { api, type JobStatsDTO, type RunDTO } from "$lib/api";
import StatCardsRow from "$lib/components/StatCardsRow.svelte";
import RunsTable from "$lib/components/RunsTable.svelte";
import RunPopover from "$lib/components/RunPopover.svelte";
import Button from "$lib/m3e/Button.svelte";

const project = $derived($page.params.project ?? "");
const job = $derived($page.params.job ?? "");
const filterKey = $derived(`claude-cron:filters:job:${project}:${job}`);

interface Filters {
  status?: string;
}
const STATUSES = [
  "running",
  "success",
  "failure",
  "timeout",
  "interrupted",
  "abandoned",
  "skipped_preflight",
  "skipped_overlap",
  "config_error",
] as const;

function loadFilters(key: string): Filters {
  if (!browser) return {};
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Filters) : {};
  } catch {
    return {};
  }
}

let stats = $state<JobStatsDTO | null>(null);
let rows = $state<RunDTO[]>([]);
let filters = $state<Filters>({});
let loadError = $state<string | null>(null);
let pollHandle: ReturnType<typeof setInterval> | null = null;
let runNowBusy = $state(false);
let runNowError = $state<string | null>(null);
let activeKey = "";

async function refresh() {
  if (!project || !job) return;
  try {
    const params: Record<string, string | number | undefined> = {
      project,
      job,
      limit: 200,
    };
    if (filters.status) params.status = filters.status;
    const [s, r] = await Promise.all([
      api.dashboard.jobStats(project, job, "24h"),
      api.runs.list(params),
    ]);
    stats = s;
    // Pin running runs to top, keep started_at desc within groups otherwise.
    rows = r.runs.slice().sort((a, b) => {
      const ar = a.status === "running" ? 0 : 1;
      const br = b.status === "running" ? 0 : 1;
      if (ar !== br) return ar - br;
      return b.started_at - a.started_at;
    });
    loadError = null;
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }
}

function persistFilters() {
  if (!browser) return;
  localStorage.setItem(filterKey, JSON.stringify(filters));
}

$effect(() => {
  // Reload filters and re-fetch when route changes.
  const key = filterKey;
  if (key && key !== activeKey) {
    activeKey = key;
    filters = loadFilters(key);
    stats = null;
    rows = [];
    void refresh();
  }
});

$effect(() => {
  void filters.status;
  persistFilters();
  void refresh();
});

function startPolling() {
  if (pollHandle) return;
  pollHandle = setInterval(refresh, 10_000);
}
function stopPolling() {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}
function onVisibility() {
  if (!browser) return;
  if (document.hidden) stopPolling();
  else {
    void refresh();
    startPolling();
  }
}

onMount(() => {
  startPolling();
  document.addEventListener("visibilitychange", onVisibility);
});
onDestroy(() => {
  stopPolling();
  if (browser) document.removeEventListener("visibilitychange", onVisibility);
});

const openRunId = $derived($page.url.searchParams.get("run"));

function closePopover() {
  if (!browser) return;
  const url = new URL(window.location.href);
  url.searchParams.delete("run");
  void goto(url.pathname + (url.search ? url.search : ""), {
    replaceState: true,
    keepFocus: true,
    noScroll: true,
  });
}

async function runNow() {
  if (!project || !job || runNowBusy) return;
  runNowBusy = true;
  runNowError = null;
  try {
    await api.projects.runJob(project, job);
    await refresh();
  } catch (e) {
    runNowError = e instanceof Error ? e.message : String(e);
  } finally {
    runNowBusy = false;
  }
}

function setStatus(value: string) {
  filters = { ...filters, status: value || undefined };
}

function clearFilters() {
  filters = {};
}

const successCount = $derived(stats?.counts.find((c) => c.status === "success")?.n ?? 0);
const failureCount = $derived(stats?.counts.find((c) => c.status === "failure")?.n ?? 0);
const skippedCount = $derived(
  (stats?.counts.find((c) => c.status === "skipped_preflight")?.n ?? 0) +
    (stats?.counts.find((c) => c.status === "skipped_overlap")?.n ?? 0),
);
</script>

<section class="page">
  <header class="job-header">
    <div class="title-block">
      <h1>{project} <span class="sep">/</span> {job}</h1>
    </div>
    <div class="actions">
      <Button variant="filled" disabled={runNowBusy} onclick={runNow}>
        {runNowBusy ? "Running…" : "Run now"}
      </Button>
      <Button variant="outlined" disabled>Disable</Button>
      <Button variant="text" disabled>View YAML</Button>
    </div>
  </header>

  {#if runNowError}
    <div class="error">Run-now failed: {runNowError}</div>
  {/if}

  {#if loadError && !stats}
    <div class="error">Couldn't load job: {loadError}</div>
  {:else if !stats}
    <div class="loading">Loading…</div>
  {:else}
    <StatCardsRow
      cards={[
        { label: "Successful", value: successCount, color: "var(--md-sys-color-tertiary)" },
        { label: "Failed", value: failureCount, color: "var(--md-sys-color-error)" },
        { label: "Skipped", value: skippedCount },
        { label: "Cost (24h)", value: `$${stats.totals.c.toFixed(4)}` },
      ]}
    />

    <div class="filters">
      <label>
        <span class="lbl">status</span>
        <select value={filters.status ?? ""} onchange={(e) => setStatus((e.currentTarget as HTMLSelectElement).value)}>
          <option value="">all statuses</option>
          {#each STATUSES as s (s)}
            <option value={s}>{s}</option>
          {/each}
        </select>
      </label>
      <button type="button" class="text-button" onclick={clearFilters}>Clear</button>
    </div>

    <RunsTable {rows} showProject={false} showJob={false} emptyText="No runs for this job yet." />
  {/if}
</section>

{#if openRunId}
  <RunPopover runId={Number(openRunId)} onClose={closePopover} />
{/if}

<style>
.page {
  padding: var(--space-xl);
  max-width: 1280px;
  margin: 0 auto;
}
.job-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
  flex-wrap: wrap;
  margin-bottom: var(--space-md);
}
.title-block h1 {
  margin: 0;
  font-size: var(--font-size-3xl);
  font-weight: 500;
  word-break: break-all;
}
.sep { opacity: 0.45; margin-inline: 0.4rem; }
.actions {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}
.filters {
  display: flex;
  align-items: end;
  gap: var(--space-md);
  margin: var(--space-md) 0 var(--space-md);
  flex-wrap: wrap;
}
label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: var(--font-size-sm);
}
.lbl {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.7;
}
select {
  background: var(--md-sys-color-surface-container);
  color: var(--md-sys-color-on-surface);
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
  padding: 6px 10px;
  border-radius: 8px;
  font: inherit;
  min-width: 180px;
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
.loading {
  opacity: 0.65;
  padding: var(--space-md) 0;
}
.error {
  color: var(--md-sys-color-on-error-container);
  background: var(--md-sys-color-error-container);
  padding: var(--space-md);
  border-radius: 12px;
  margin-bottom: var(--space-md);
}
</style>
