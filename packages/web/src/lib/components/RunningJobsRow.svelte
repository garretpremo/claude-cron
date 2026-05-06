<script lang="ts">
import RunningJobCard from "./RunningJobCard.svelte";
import type { RunDTO } from "$lib/api";

interface Props {
  running: RunDTO[];
}
const { running }: Props = $props();
</script>

{#if running.length > 0}
  <section class="running-row">
    <h2 class="heading">Running now</h2>
    <div class="scroll-track">
      {#each running as run (run.id)}
        <RunningJobCard
          runId={run.id}
          project={run.project}
          job={run.job}
          startedAt={run.started_at}
        />
      {/each}
    </div>
  </section>
{/if}

<style>
.running-row {
  margin: var(--space-xl) 0;
}
.heading {
  margin: 0 0 var(--space-md);
  font-size: var(--font-size-xl);
  font-weight: 500;
}
.scroll-track {
  display: flex;
  gap: var(--space-md);
  overflow-x: auto;
  padding-bottom: var(--space-xs);
  scrollbar-width: thin;
}
</style>
