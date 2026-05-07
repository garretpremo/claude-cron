<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { browser } from "$app/environment";
import { page } from "$app/stores";
import { goto } from "$app/navigation";
import { api, type RunDTO, type ProjectDTO } from "$lib/api";
import RunsTable from "$lib/components/RunsTable.svelte";
import RunPopover from "$lib/components/RunPopover.svelte";
import Button from "$lib/m3e/Button.svelte";
import Chip from "$lib/m3e/FilterChip.svelte";
import Icon from "$lib/m3e/Icon.svelte";

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

interface ActivityFilters {
  range: Range;
  status: string[];          // explicit list
  projects?: string[];       // undefined = "all projects"
  type: RunType[];
}

const KEY = "claude-cron:filters:activity";

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

function defaults(): ActivityFilters {
  return {
    range: "24h",
    status: [...ALL_NON_SKIPPED],
    projects: undefined,
    type: [...DEFAULT_TYPE],
  };
}

function loadFilters(): ActivityFilters {
  if (!browser) return defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Migrate old shape: { project?: string; status?: string }
    if (
      typeof parsed.range === "undefined"
      && typeof parsed.status !== "object"
      && typeof parsed.projects === "undefined"
    ) {
      const out = defaults();
      const oldProj = typeof parsed.project === "string" ? parsed.project : null;
      const oldStat = typeof parsed.status === "string" ? parsed.status : null;
      if (oldProj) out.projects = [oldProj];
      if (oldStat) out.status = [oldStat];
      return out;
    }
    // Best-effort merge with defaults so missing fields don't crash the page.
    const d = defaults();
    return {
      range: (typeof parsed.range === "string"
        ? parsed.range
        : d.range) as Range,
      status: Array.isArray(parsed.status)
        ? (parsed.status as string[])
        : d.status,
      projects: Array.isArray(parsed.projects)
        ? (parsed.projects as string[])
        : undefined,
      type: Array.isArray(parsed.type)
        ? (parsed.type as RunType[])
        : d.type,
    };
  } catch {
    return defaults();
  }
}

function isDefault(f: ActivityFilters): boolean {
  if (f.range !== "24h") return false;
  if (f.projects !== undefined) return false;
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

let filters = $state<ActivityFilters>(loadFilters());
let rows = $state<RunDTO[]>([]);
let total = $state<number>(0);
let projects = $state<ProjectDTO[]>([]);
let loadError = $state<string | null>(null);
let projectShowAll = $state<boolean>(false);

let pollHandle: ReturnType<typeof setInterval> | null = null;

const filtersAreNonDefault = $derived(!isDefault(filters));
const showSkipped = $derived(
  SKIPPED_STATUSES.some((s) => filters.status.includes(s)),
);

async function refresh() {
  try {
    const params: Record<string, string | number | string[] | undefined> = {
      limit: 200,
    };
    if (filters.projects && filters.projects.length > 0) {
      params.project = filters.projects;
    }
    if (filters.status.length > 0) {
      params.status = filters.status;
    } else {
      // Empty status array would otherwise return everything; force a
      // status filter that matches nothing.
      params.status = ["__none__"];
    }
    const ms = RANGE_MS[filters.range];
    if (ms !== null) params.since = Date.now() - ms;
    if (filters.type.length === 1) {
      params.is_test = filters.type[0] === "test" ? "true" : "false";
    }
    // If both live + test selected: omit is_test (= no filter).
    // If neither: force a no-match filter.
    if (filters.type.length === 0) {
      params.is_test = "true";
      params.status = ["__none__"];
    }
    const res = await api.runs.list(params);
    rows = res.runs;
    total = res.total;
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
  // Track all reactive fields to re-run on any filter change.
  void filters.range;
  void filters.status.length;
  void filters.status.join(",");
  void filters.projects?.join(",");
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
    // Hide skipped: drop both
    filters = {
      ...filters,
      status: filters.status.filter(
        (s) => !SKIPPED_STATUSES.includes(s as typeof SKIPPED_STATUSES[number]),
      ),
    };
  } else {
    // Show skipped: add both (de-duped)
    const next = new Set(filters.status);
    for (const s of SKIPPED_STATUSES) next.add(s);
    filters = { ...filters, status: [...next] };
  }
}

function toggleProject(name: string) {
  // If projects is undefined, "all" is selected — clicking deselects this one,
  // which means: explicit list of all projects MINUS this one.
  let cur: string[];
  if (filters.projects === undefined) {
    cur = projects.map((p) => p.name).filter((n) => n !== name);
  } else if (filters.projects.includes(name)) {
    cur = filters.projects.filter((n) => n !== name);
  } else {
    cur = [...filters.projects, name];
  }
  // If the explicit list ends up matching "all", normalize back to undefined.
  filters = {
    ...filters,
    projects:
      cur.length === projects.length
      && projects.every((p) => cur.includes(p.name))
        ? undefined
        : cur,
  };
}

function isProjectSelected(name: string): boolean {
  if (filters.projects === undefined) return true;
  return filters.projects.includes(name);
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

function removeStatus(s: string) {
  filters = { ...filters, status: filters.status.filter((x) => x !== s) };
}

function clearProjectFilter() {
  filters = { ...filters, projects: undefined };
}

function resetType() {
  filters = { ...filters, type: [...DEFAULT_TYPE] };
}

// ---------- Summary stats (failures + cost computed from visible rows) ----------
const visibleFailures = $derived(rows.filter((r) => r.status === "failure").length);
const visibleCost = $derived(rows.reduce((acc, r) => acc + (r.cost_usd ?? 0), 0));
const summaryNoun = $derived(total === 1 ? "run" : "runs");
const summarySuffix = $derived(filtersAreNonDefault ? "match" : "total");

// Sidebar collapsed-summary line, like "3 statuses · 2 projects · last 24h".
const sidebarSummaryLine = $derived.by(() => {
  const bits: string[] = [];
  bits.push(`${filters.status.length} statuses`);
  if (filters.projects === undefined) {
    bits.push(`all projects`);
  } else {
    bits.push(
      `${filters.projects.length} project${filters.projects.length === 1 ? "" : "s"}`,
    );
  }
  bits.push(RANGE_LABELS.find((r) => r.value === filters.range)?.label.toLowerCase() ?? filters.range);
  return bits.join(" · ");
});

const visibleProjects = $derived(
  projectShowAll ? projects : projects.slice(0, 8),
);
const projectOverflow = $derived(projects.length - 8);
</script>

<section class="activity">
  {#snippet sidebarBody()}
        <!-- Time range -->
        <div class="facet">
          <div class="facet-head">
            <h3 class="facet-title">Time range</h3>
          </div>
          <div class="chip-group">
            {#each RANGE_LABELS as r (r.value)}
              <Chip
                selected={filters.range === r.value}
                onclick={() => setRange(r.value)}
              >{r.label}</Chip>
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
              <Chip
                selected={filters.status.includes(s)}
                onclick={() => toggleStatus(s)}
              >{s}</Chip>
            {/each}
          </div>

          <div class="subgroup-label">Active</div>
          <div class="chip-group">
            {#each ACTIVE_STATUSES as s (s)}
              <Chip
                selected={filters.status.includes(s)}
                onclick={() => toggleStatus(s)}
              >{s}</Chip>
            {/each}
          </div>

          {#if showSkipped}
            <div class="subgroup-label">Skipped</div>
            <div class="chip-group">
              {#each SKIPPED_STATUSES as s (s)}
                <Chip
                  selected={filters.status.includes(s)}
                  onclick={() => toggleStatus(s)}
                >{s}</Chip>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Projects -->
        {#if projects.length > 0}
          <div class="facet">
            <div class="facet-head">
              <h3 class="facet-title">Project</h3>
            </div>
            <div class="chip-group">
              {#each visibleProjects as p (p.name)}
                <Chip
                  selected={isProjectSelected(p.name)}
                  onclick={() => toggleProject(p.name)}
                >{p.name}</Chip>
              {/each}
            </div>
            {#if projectOverflow > 0}
              <button
                type="button"
                class="link-btn"
                onclick={() => (projectShowAll = !projectShowAll)}
              >{projectShowAll ? "Show fewer" : `Show ${projectOverflow} more`}</button>
            {/if}
          </div>
        {/if}

        <!-- Type -->
        <div class="facet">
          <div class="facet-head">
            <h3 class="facet-title">Type</h3>
          </div>
          <div class="chip-group">
            <Chip
              selected={filters.type.includes("live")}
              onclick={() => toggleType("live")}
            >live</Chip>
            <Chip
              selected={filters.type.includes("test")}
              onclick={() => toggleType("test")}
            >test</Chip>
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
      <header class="header">
        <h1>Activity</h1>
        <p class="subtitle">Run history across all projects</p>
      </header>

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

      <!-- Summary bar -->
      <div class="summary-bar">
        <div class="summary-left">
          <strong>{total.toLocaleString()}</strong> {summaryNoun} {summarySuffix}
          <span class="dot">·</span>
          <strong>{visibleFailures.toLocaleString()}</strong> failure{visibleFailures === 1 ? "" : "s"}
          <span class="dot">·</span>
          <strong>${visibleCost.toFixed(2)}</strong> total
        </div>
      </div>

      <!-- Active filter chip row -->
      {#if filtersAreNonDefault}
        <div class="active-filters">
          {#if filters.range !== "24h"}
            <button
              type="button"
              class="active-chip"
              onclick={() => setRange("24h")}
            >range: {RANGE_LABELS.find((r) => r.value === filters.range)?.label.toLowerCase()}
              <span class="x">×</span>
            </button>
          {/if}
          {#if filters.projects !== undefined}
            <button
              type="button"
              class="active-chip"
              onclick={clearProjectFilter}
            >projects: {filters.projects.length}
              <span class="x">×</span>
            </button>
          {/if}
          {#each filters.status.filter((s) => !ALL_NON_SKIPPED.includes(s)) as s (s)}
            <button
              type="button"
              class="active-chip"
              onclick={() => removeStatus(s)}
            >+ status: {s}
              <span class="x">×</span>
            </button>
          {/each}
          {#each ALL_NON_SKIPPED.filter((s) => !filters.status.includes(s)) as s (s)}
            <button
              type="button"
              class="active-chip"
              onclick={() => toggleStatus(s)}
            >− status: {s}
              <span class="x">×</span>
            </button>
          {/each}
          {#if !(filters.type.length === DEFAULT_TYPE.length && DEFAULT_TYPE.every((t) => filters.type.includes(t)))}
            <button
              type="button"
              class="active-chip"
              onclick={resetType}
            >type: {filters.type.join(",") || "none"}
              <span class="x">×</span>
            </button>
          {/if}
        </div>
      {/if}

      {#if loadError}
        <div class="error">Couldn't load runs: {loadError}</div>
      {:else if rows.length === 0 && filtersAreNonDefault}
        <!-- Filtered-to-zero empty state -->
        <div class="empty-state">
          <div class="empty-icon"><Icon name="filter_alt_off" size="48px" /></div>
          <div class="empty-headline">No runs match these filters</div>
          <div class="empty-body">Try widening the time range or clearing a filter.</div>
          <div class="empty-action">
            <Button variant="filled" onclick={clearAll}>Clear filters</Button>
          </div>
        </div>
      {:else if rows.length === 0}
        <div class="empty-state">
          <div class="empty-icon"><Icon name="history" size="48px" /></div>
          <div class="empty-headline">No runs yet</div>
          <div class="empty-body">Once a scheduled job fires it'll show up here.</div>
          <div class="empty-action">
            <Button variant="text" href="/">View jobs</Button>
          </div>
        </div>
      {:else}
        <RunsTable {rows} />
      {/if}
    </div>
  </div>
</section>

{#if openRunId}
  <RunPopover runId={Number(openRunId)} onClose={closePopover} />
{/if}

<style>
.activity {
  padding: var(--space-xl);
  max-width: 1280px;
  margin: 0 auto;
}

/* ---------- Layout ---------- */
.layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: var(--space-xl);
  align-items: start;
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
  /* nicer scrollbar gutter */
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

/* ---------- Header ---------- */
.header {
  margin-bottom: var(--space-xl);
}
h1 {
  font-size: var(--font-size-4xl);
  font-weight: var(--font-weight-regular);
  line-height: var(--line-height-tight);
  letter-spacing: var(--letter-spacing-tight);
  color: var(--md-sys-color-on-surface);
  margin: 0;
}
.subtitle {
  margin: 4px 0 0;
  font-size: var(--font-size-body-large);
  color: var(--md-sys-color-on-surface-variant);
  line-height: var(--line-height-base);
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

/* ---------- Summary bar ---------- */
.summary-bar {
  background: var(--md-sys-color-surface-container-low);
  border-radius: 16px;
  padding: var(--space-md) var(--space-lg);
  margin-bottom: var(--space-md);
  font-size: var(--font-size-md);
  color: var(--md-sys-color-on-surface);
}
.summary-left {
  font-variant-numeric: tabular-nums;
}
.summary-left strong {
  font-weight: 600;
  color: var(--md-sys-color-on-surface);
}
.summary-left .dot {
  margin: 0 6px;
  color: var(--md-sys-color-on-surface-variant);
}

/* ---------- Active filter chips ---------- */
.active-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: var(--space-md);
}
.active-chip {
  background: var(--md-sys-color-surface-container-high);
  color: var(--md-sys-color-on-surface);
  border: 1px solid color-mix(in srgb, var(--md-sys-color-on-surface) 12%, transparent);
  border-radius: 999px;
  padding: 4px 10px;
  font: inherit;
  font-size: var(--font-size-xs);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.active-chip:hover {
  background: var(--md-sys-color-surface-container-highest);
}
.active-chip .x {
  opacity: 0.7;
  font-weight: 600;
  margin-left: 2px;
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

/* ---------- Error ---------- */
.error {
  color: var(--md-sys-color-on-error-container);
  background: var(--md-sys-color-error-container);
  padding: var(--space-md);
  border-radius: 12px;
}
</style>
