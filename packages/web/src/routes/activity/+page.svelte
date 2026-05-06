<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { browser } from "$app/environment";
import { page } from "$app/stores";
import { goto } from "$app/navigation";
import { api, type RunDTO, type ProjectDTO } from "$lib/api";
import RunsTable from "$lib/components/RunsTable.svelte";
import RunPopover from "$lib/components/RunPopover.svelte";

interface Filters {
  project?: string;
  status?: string;
}
const KEY = "claude-cron:filters:activity";
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

function loadFilters(): Filters {
  if (!browser) return {};
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Filters) : {};
  } catch {
    return {};
  }
}

let filters = $state<Filters>(loadFilters());
let rows = $state<RunDTO[]>([]);
let projects = $state<ProjectDTO[]>([]);
let loadError = $state<string | null>(null);

let pollHandle: ReturnType<typeof setInterval> | null = null;

async function refresh() {
  try {
    const params: Record<string, string | number | undefined> = { limit: 200 };
    if (filters.project) params.project = filters.project;
    if (filters.status) params.status = filters.status;
    const res = await api.runs.list(params);
    rows = res.runs;
    loadError = null;
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }
}

function persistFilters() {
  if (!browser) return;
  localStorage.setItem(KEY, JSON.stringify(filters));
}

$effect(() => {
  // Tracks both filter fields. Persist + refresh whenever filters change.
  void filters.project;
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

onMount(async () => {
  try {
    projects = await api.projects.list();
  } catch {
    projects = [];
  }
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

function clearFilters() {
  filters = {};
}

function setProject(value: string) {
  filters = { ...filters, project: value || undefined };
}
function setStatus(value: string) {
  filters = { ...filters, status: value || undefined };
}
</script>

<section class="page">
  <h1>Activity</h1>

  <div class="filters">
    <label>
      <span class="lbl">project</span>
      <select value={filters.project ?? ""} onchange={(e) => setProject((e.currentTarget as HTMLSelectElement).value)}>
        <option value="">all projects</option>
        {#each projects as p (p.name)}
          <option value={p.name}>{p.name}</option>
        {/each}
      </select>
    </label>
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

  {#if loadError}
    <div class="error">Couldn't load runs: {loadError}</div>
  {:else}
    <RunsTable {rows} />
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
h1 {
  margin: 0 0 var(--space-md);
  font-size: var(--font-size-3xl);
  font-weight: 500;
}
.filters {
  display: flex;
  align-items: end;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
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
.error {
  color: var(--md-sys-color-on-error-container);
  background: var(--md-sys-color-error-container);
  padding: var(--space-md);
  border-radius: 12px;
}
</style>
