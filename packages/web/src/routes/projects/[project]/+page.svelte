<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { browser } from "$app/environment";
import { page } from "$app/stores";
import { api, type ProjectDashboardDTO } from "$lib/api";
import StatCardsRow from "$lib/components/StatCardsRow.svelte";
import RunningJobsRow from "$lib/components/RunningJobsRow.svelte";
import JobPanel from "$lib/components/JobPanel.svelte";

const project = $derived($page.params.project ?? "");

let data = $state<ProjectDashboardDTO | null>(null);
let loadError = $state<string | null>(null);
let pollHandle: ReturnType<typeof setInterval> | null = null;
let activeProject = "";

async function refresh() {
  if (!project) return;
  try {
    data = await api.dashboard.project(project, "24h");
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

$effect(() => {
  // Re-fetch on route change (project param changes).
  if (project && project !== activeProject) {
    activeProject = project;
    data = null;
    void refresh();
  }
});

onMount(() => {
  startPolling();
  document.addEventListener("visibilitychange", onVisibility);
});
onDestroy(() => {
  stopPolling();
  if (browser) document.removeEventListener("visibilitychange", onVisibility);
});

const skippedTotal = $derived(
  data ? data.counts.skipped_preflight + data.counts.skipped_overlap : 0,
);
</script>

<section class="page">
  <h1>{project}</h1>

  {#if loadError && !data}
    <div class="error">Couldn't load project: {loadError}</div>
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

    <h2>Jobs</h2>
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
  word-break: break-all;
}
h2 {
  margin: var(--space-2xl) 0 var(--space-md);
  font-size: var(--font-size-xl);
  font-weight: 500;
}
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
  color: var(--md-sys-color-on-error-container);
  background: var(--md-sys-color-error-container);
  padding: var(--space-md);
  border-radius: 12px;
}
</style>
