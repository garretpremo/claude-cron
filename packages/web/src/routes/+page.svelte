<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { browser } from "$app/environment";
import { api, type DashboardDTO } from "$lib/api";
import StatCardsRow from "$lib/components/StatCardsRow.svelte";
import RunningJobsRow from "$lib/components/RunningJobsRow.svelte";
import ProjectPanel from "$lib/components/ProjectPanel.svelte";
import JobPanel from "$lib/components/JobPanel.svelte";

let data = $state<DashboardDTO | null>(null);
let favorites = $state<Set<string>>(new Set());
let loadError = $state<string | null>(null);
let pollHandle: ReturnType<typeof setInterval> | null = null;

async function refresh() {
  try {
    const [d, f] = await Promise.all([
      api.dashboard.global("24h"),
      api.favorites.list(),
    ]);
    data = d;
    favorites = new Set(f.favorites);
    loadError = null;
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }
}

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
  void refresh().then(startPolling);
  document.addEventListener("visibilitychange", onVisibility);
});
onDestroy(() => {
  stopPolling();
  if (browser) document.removeEventListener("visibilitychange", onVisibility);
});

function onFavoriteChange(project: string, next: boolean) {
  const upd = new Set(favorites);
  if (next) upd.add(project);
  else upd.delete(project);
  favorites = upd;
}

const sortedProjects = $derived(
  data
    ? data.top_projects.slice().sort((a, b) => {
        const af = favorites.has(a.project);
        const bf = favorites.has(b.project);
        if (af !== bf) return af ? -1 : 1;
        return b.active_count - a.active_count;
      })
    : [],
);

const skippedTotal = $derived(
  data ? data.counts.skipped_preflight + data.counts.skipped_overlap : 0,
);
</script>

<section class="page">
  <h1>Dashboard</h1>

  {#if loadError && !data}
    <div class="error">Couldn't load dashboard: {loadError}</div>
  {:else if !data}
    <div class="loading">Loading…</div>
  {:else}
    <StatCardsRow
      cards={[
        { label: "Successful", value: data.counts.success, color: "var(--md-sys-color-tertiary)" },
        { label: "Failed", value: data.counts.failure, color: "var(--md-sys-color-error)" },
        { label: "Skipped", value: skippedTotal },
        { label: "Running", value: data.running.length, color: "var(--md-sys-color-primary)" },
      ]}
    />

    <RunningJobsRow running={data.running} />

    <h2>Projects</h2>
    {#if sortedProjects.length === 0}
      <div class="placeholder">No project activity in the last 24h.</div>
    {:else}
      <div class="grid">
        {#each sortedProjects as p (p.project)}
          <ProjectPanel
            project={p.project}
            activeCount={p.active_count}
            isFavorite={favorites.has(p.project)}
            {onFavoriteChange}
          />
        {/each}
      </div>
    {/if}

    <h2 class="recent">
      Recent activity
      <a href="/activity" class="see-all">View all →</a>
    </h2>
    {#if data.top_jobs.length === 0}
      <div class="placeholder">No job activity in the last 24h.</div>
    {:else}
      <div class="grid">
        {#each data.top_jobs as j (`${j.project}::${j.job}`)}
          <JobPanel
            project={j.project}
            job={j.job}
            success={j.success_count}
            failure={j.failure_count}
            skipped={j.skipped_count}
          />
        {/each}
      </div>
    {/if}
  {/if}
</section>

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
h2 {
  margin: var(--space-2xl) 0 var(--space-md);
  font-size: var(--font-size-xl);
  font-weight: 500;
}
h2.recent {
  display: flex;
  align-items: baseline;
  gap: var(--space-md);
}
.see-all {
  font-size: var(--font-size-sm);
  font-weight: 400;
  color: var(--md-sys-color-primary);
  text-decoration: none;
}
.see-all:hover { text-decoration: underline; }
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-md);
}
.loading, .placeholder {
  opacity: 0.65;
  padding: var(--space-md) 0;
}
.error {
  color: var(--md-sys-color-error);
  padding: var(--space-md);
  background: var(--md-sys-color-error-container);
  color: var(--md-sys-color-on-error-container);
  border-radius: 12px;
}
</style>
