<script lang="ts">
import { page } from "$app/stores";
import AppBar from "$lib/m3e/AppBar.svelte";

type Crumb = { label: string; href?: string };

const crumbs = $derived.by<Crumb[]>(() => {
  const params = $page.params as Record<string, string | undefined>;
  const project = params.project;
  const job = params.job;
  if (!project) return [];
  const out: Crumb[] = [{ label: project, href: `/projects/${project}` }];
  if (job) out.push({ label: job });
  return out;
});
</script>

<AppBar size="small">
  {#snippet leadingIcon()}
    <m3e-icon-button toggle aria-label="Menu">
      <m3e-icon name="menu"></m3e-icon>
      <m3e-icon slot="selected" name="menu_open"></m3e-icon>
      <m3e-drawer-toggle for="nav-drawer"></m3e-drawer-toggle>
    </m3e-icon-button>
  {/snippet}
  {#snippet title()}
    <span class="title-row">
      <a href="/" class="brand">claude-cron</a>
      {#each crumbs as crumb (crumb.label)}
        <span class="sep" aria-hidden="true">/</span>
        {#if crumb.href}
          <a href={crumb.href} class="crumb">{crumb.label}</a>
        {:else}
          <span class="crumb crumb-current">{crumb.label}</span>
        {/if}
      {/each}
    </span>
  {/snippet}
</AppBar>

<style>
.title-row {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  min-width: 0;
}
.brand {
  text-decoration: none;
  color: inherit;
  font-weight: 600;
}
.sep {
  opacity: 0.45;
}
.crumb {
  text-decoration: none;
  color: inherit;
  opacity: 0.85;
}
.crumb-current {
  opacity: 1;
  font-weight: 500;
}
</style>
