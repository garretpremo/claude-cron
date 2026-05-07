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
import FilterChip from "$lib/m3e/FilterChip.svelte";
import Icon from "$lib/m3e/Icon.svelte";

const project = $derived($page.params.project ?? "");
const job = $derived($page.params.job ?? "");
const filterKey = $derived(`claude-cron:filters:job:${project}:${job}`);

// ---------- Filter shape & defaults ----------
type Range = "1h" | "24h" | "7d" | "30d" | "all";
type RunType = "live" | "test";

const OUTCOME_STATUSES = [
  "success",
  "failure",
  "timeout",
  "interrupted",
  "abandoned",
  "config_error",
] as const;
const SKIPPED_STATUSES = ["skipped_preflight", "skipped_overlap"] as const;
const ACTIVE_STATUSES = ["running"] as const;

const ALL_NON_SKIPPED: string[] = [...OUTCOME_STATUSES, ...ACTIVE_STATUSES];
const DEFAULT_TYPE: RunType[] = ["live"];

interface JobFilters {
  range: Range;
  status: string[];
  type: RunType[];
}

const RANGE_LABELS: { value: Range; label: string }[] = [
  { value: "1h", label: "Last hour" },
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7d" },
  { value: "30d", label: "Last 30d" },
  { value: "all", label: "All time" },
];

const RANGE_MS: Record<Range, number | null> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "all": null,
};

// Server's jobStats `since` enum is "24h" | "7d" | "30d". Clamp UI range to it.
function rangeToStatsSince(r: Range): "24h" | "7d" | "30d" {
  if (r === "1h" || r === "24h") return "24h";
  if (r === "7d") return "7d";
  return "30d"; // "30d" | "all"
}

function defaults(): JobFilters {
  return {
    range: "24h",
    status: [...ALL_NON_SKIPPED],
    type: [...DEFAULT_TYPE],
  };
}

function loadFilters(key: string): JobFilters {
  if (!browser) return defaults();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Migrate old shape: { status?: string }
    if (
      typeof parsed.range === "undefined"
      && typeof parsed.type === "undefined"
    ) {
      const out = defaults();
      const oldStat = typeof parsed.status === "string" ? parsed.status : null;
      if (oldStat) out.status = [oldStat];
      return out;
    }
    const d = defaults();
    return {
      range: (typeof parsed.range === "string"
        ? parsed.range
        : d.range) as Range,
      status: Array.isArray(parsed.status)
        ? (parsed.status as string[])
        : d.status,
      type: Array.isArray(parsed.type)
        ? (parsed.type as RunType[])
        : d.type,
    };
  } catch {
    return defaults();
  }
}

function isDefault(f: JobFilters): boolean {
  if (f.range !== "24h") return false;
  if (
    f.status.length !== ALL_NON_SKIPPED.length
    || !ALL_NON_SKIPPED.every((s) => f.status.includes(s))
  ) {
    return false;
  }
  if (
    f.type.length !== DEFAULT_TYPE.length
    || !DEFAULT_TYPE.every((t) => f.type.includes(t))
  ) {
    return false;
  }
  return true;
}

let stats = $state<JobStatsDTO | null>(null);
let rows = $state<RunDTO[]>([]);
let filters = $state<JobFilters>(defaults());
let loadError = $state<string | null>(null);
let pollHandle: ReturnType<typeof setInterval> | null = null;
let runNowBusy = $state(false);
let runNowError = $state<string | null>(null);
let activeKey = "";

const filtersAreNonDefault = $derived(!isDefault(filters));
const showSkipped = $derived(
  SKIPPED_STATUSES.some((s) => filters.status.includes(s)),
);

async function refresh() {
  if (!project || !job) return;
  try {
    const params: Record<string, string | number | string[] | undefined> = {
      project,
      job,
      limit: 200,
    };
    if (filters.status.length > 0) {
      params.status = filters.status;
    } else {
      params.status = ["__none__"];
    }
    const ms = RANGE_MS[filters.range];
    if (ms !== null) params.since = Date.now() - ms;
    if (filters.type.length === 1) {
      params.is_test = filters.type[0] === "test" ? "true" : "false";
    }
    if (filters.type.length === 0) {
      params.is_test = "true";
      params.status = ["__none__"];
    }
    const [s, r] = await Promise.all([
      api.dashboard.jobStats(project, job, rangeToStatsSince(filters.range)),
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
  void filters.range;
  void filters.status.length;
  void filters.status.join(",");
  void filters.type.join(",");
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

// ---------- Mutators ----------
function setRange(r: Range) {
  filters = { ...filters, range: r };
}
function toggleStatus(s: string) {
  const cur = filters.status;
  filters = {
    ...filters,
    status: cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s],
  };
}
function toggleSkippedGroup() {
  if (showSkipped) {
    filters = {
      ...filters,
      status: filters.status.filter(
        (s) => !SKIPPED_STATUSES.includes(s as typeof SKIPPED_STATUSES[number]),
      ),
    };
  } else {
    const next = new Set(filters.status);
    for (const s of SKIPPED_STATUSES) next.add(s);
    filters = { ...filters, status: [...next] };
  }
}
function toggleType(t: RunType) {
  const cur = filters.type;
  filters = {
    ...filters,
    type: cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t],
  };
}
function clearAll() {
  filters = defaults();
}

const successCount = $derived(stats?.counts.find((c) => c.status === "success")?.n ?? 0);
const failureCount = $derived(stats?.counts.find((c) => c.status === "failure")?.n ?? 0);
const skippedCount = $derived(
  (stats?.counts.find((c) => c.status === "skipped_preflight")?.n ?? 0) +
    (stats?.counts.find((c) => c.status === "skipped_overlap")?.n ?? 0),
);

const statsRangeLabel = $derived.by(() => {
  const since = rangeToStatsSince(filters.range);
  if (since === "24h") return "last 24h";
  if (since === "7d") return "last 7d";
  return "last 30d";
});

const sidebarSummaryLine = $derived.by(() => {
  const bits: string[] = [];
  bits.push(`${filters.status.length} statuses`);
  bits.push(RANGE_LABELS.find((r) => r.value === filters.range)?.label.toLowerCase() ?? filters.range);
  return bits.join(" · ");
});
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
    <div class="error">
      <p><strong>{project} / {job}</strong> isn't loadable.</p>
      <p class="detail">{loadError}</p>
      <p>
        <a href="/projects/{project}" class="back-link">← Back to project</a>
        <span class="sep">·</span>
        <a href="/" class="back-link">Back to dashboard</a>
      </p>
    </div>
  {:else if !stats}
    <div class="loading">Loading…</div>
  {:else}
    {#snippet sidebarBody()}
      <!-- Time range -->
      <div class="facet">
        <div class="facet-head">
          <h3 class="facet-title">Time range</h3>
        </div>
        <div class="chip-group">
          {#each RANGE_LABELS as r (r.value)}
            <FilterChip
              selected={filters.range === r.value}
              onclick={() => setRange(r.value)}
            >{r.label}</FilterChip>
          {/each}
        </div>
      </div>

      <!-- Status -->
      <div class="facet">
        <div class="facet-head">
          <h3 class="facet-title">Status</h3>
          <button
            type="button"
            class="link-btn"
            onclick={toggleSkippedGroup}
          >{showSkipped ? "Hide skipped" : "Show skipped"}</button>
        </div>

        <div class="subgroup-label">Outcomes</div>
        <div class="chip-group">
          {#each OUTCOME_STATUSES as s (s)}
            <FilterChip
              selected={filters.status.includes(s)}
              onclick={() => toggleStatus(s)}
            >{s}</FilterChip>
          {/each}
        </div>

        <div class="subgroup-label">Active</div>
        <div class="chip-group">
          {#each ACTIVE_STATUSES as s (s)}
            <FilterChip
              selected={filters.status.includes(s)}
              onclick={() => toggleStatus(s)}
            >{s}</FilterChip>
          {/each}
        </div>

        {#if showSkipped}
          <div class="subgroup-label">Skipped</div>
          <div class="chip-group">
            {#each SKIPPED_STATUSES as s (s)}
              <FilterChip
                selected={filters.status.includes(s)}
                onclick={() => toggleStatus(s)}
              >{s}</FilterChip>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Type -->
      <div class="facet">
        <div class="facet-head">
          <h3 class="facet-title">Type</h3>
        </div>
        <div class="chip-group">
          <FilterChip
            selected={filters.type.includes("live")}
            onclick={() => toggleType("live")}
          >live</FilterChip>
          <FilterChip
            selected={filters.type.includes("test")}
            onclick={() => toggleType("test")}
          >test</FilterChip>
        </div>
      </div>

      {#if filtersAreNonDefault}
        <div class="clear-row">
          <button type="button" class="link-btn" onclick={clearAll}
            >Clear all filters</button>
        </div>
      {/if}
    {/snippet}

    <div class="layout">
      <!-- Sidebar (>=960px) -->
      <aside class="sidebar wide-only">
        {@render sidebarBody()}
      </aside>

      <!-- Main content -->
      <div class="content">
        <!-- Mobile / narrow: collapsed filters disclosure -->
        <details class="narrow-filters narrow-only">
          <summary>
            <span class="summary-icon"><Icon name="filter_list" /></span>
            <span class="summary-text">Filters · {sidebarSummaryLine}</span>
          </summary>
          <div class="narrow-filters-body">
            {@render sidebarBody()}
          </div>
        </details>

        <StatCardsRow
          cards={[
            { label: "Successful", value: successCount, color: "var(--md-sys-color-tertiary)" },
            { label: "Failed", value: failureCount, color: "var(--md-sys-color-error)" },
            { label: "Skipped", value: skippedCount },
            { label: `Cost (${statsRangeLabel})`, value: `$${stats.totals.c.toFixed(4)}` },
          ]}
        />
        <div class="stats-caption">Stats reflect {statsRangeLabel}.</div>

        {#if rows.length === 0 && filtersAreNonDefault}
          <div class="empty-state">
            <div class="empty-icon"><Icon name="filter_alt_off" size="48px" /></div>
            <div class="empty-headline">No runs match these filters</div>
            <div class="empty-body">Try widening the time range or clearing a filter.</div>
            <div class="empty-action">
              <Button variant="filled" onclick={clearAll}>Clear filters</Button>
            </div>
          </div>
        {:else}
          <RunsTable {rows} showProject={false} showJob={false} emptyText="No runs for this job yet." />
        {/if}
      </div>
    </div>
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

/* ---------- Layout ---------- */
.layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: var(--space-xl);
  align-items: start;
  margin-top: var(--space-md);
}
.sidebar {
  position: sticky;
  top: var(--space-xl);
  align-self: start;
  max-height: calc(100vh - 2 * var(--space-xl));
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding-right: 4px;
}
.content { min-width: 0; }

@media (max-width: 960px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .wide-only { display: none; }
}
@media (min-width: 961px) {
  .narrow-only { display: none; }
}

/* ---------- Facet cards ---------- */
.facet {
  background: var(--md-sys-color-surface-container);
  border-radius: 16px;
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
.facet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}
.facet-title {
  margin: 0;
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--md-sys-color-on-surface-variant);
  font-weight: 600;
}
.subgroup-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.6;
  margin-top: var(--space-xs);
}
.chip-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* ---------- Link button ---------- */
.link-btn {
  background: transparent;
  border: none;
  color: var(--md-sys-color-primary);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
  font: inherit;
  font-size: var(--font-size-xs);
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0.02em;
}
.link-btn:hover {
  background: color-mix(in srgb, var(--md-sys-color-primary) 8%, transparent);
}
.clear-row {
  display: flex;
  justify-content: flex-start;
  padding: 0 var(--space-xs);
}

/* ---------- Narrow disclosure ---------- */
.narrow-filters {
  background: var(--md-sys-color-surface-container);
  border-radius: 16px;
  padding: var(--space-md);
  margin-bottom: var(--space-lg);
}
.narrow-filters > summary {
  list-style: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--font-size-sm);
  color: var(--md-sys-color-on-surface);
}
.narrow-filters > summary::-webkit-details-marker { display: none; }
.narrow-filters[open] > summary {
  margin-bottom: var(--space-md);
}
.narrow-filters-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}
.summary-icon { display: inline-flex; }
.summary-text {
  color: var(--md-sys-color-on-surface-variant);
}

/* ---------- Stats caption ---------- */
.stats-caption {
  font-size: var(--font-size-xs);
  color: var(--md-sys-color-on-surface-variant);
  margin: var(--space-xs) 0 var(--space-md);
  opacity: 0.85;
}

/* ---------- Empty state ---------- */
.empty-state {
  text-align: center;
  padding: var(--space-3xl) 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md);
}
.empty-icon {
  color: var(--md-sys-color-on-surface-variant);
  display: inline-flex;
}
.empty-headline {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-medium);
  color: var(--md-sys-color-on-surface);
}
.empty-body {
  color: var(--md-sys-color-on-surface-variant);
  max-width: 420px;
}
.empty-action { margin-top: var(--space-sm); }

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
.error p { margin: 0 0 var(--space-sm); }
.error p:last-child { margin-bottom: 0; }
.error .detail { opacity: 0.75; font-size: var(--font-size-sm); }
.back-link {
  color: var(--md-sys-color-on-error-container);
  font-weight: 500;
}
</style>
