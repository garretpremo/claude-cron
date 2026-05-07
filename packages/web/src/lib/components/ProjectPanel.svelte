<script lang="ts">
import { browser } from "$app/environment";
import { goto } from "$app/navigation";
import { api } from "$lib/api";
if (browser) void import("@m3e/card");

interface Props {
  project: string;
  activeCount: number;
  isFavorite: boolean;
  onFavoriteChange: (project: string, next: boolean) => void;
}
const { project, activeCount, isFavorite, onFavoriteChange }: Props = $props();

async function toggleFavorite(e: Event) {
  e.stopPropagation();
  const next = !isFavorite;
  onFavoriteChange(project, next); // optimistic
  try {
    if (next) await api.favorites.set(project);
    else await api.favorites.unset(project);
  } catch {
    // Roll back if the request fails.
    onFavoriteChange(project, !next);
  }
}

function open() {
  void goto(`/projects/${encodeURIComponent(project)}`);
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    open();
  }
}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<m3e-card
  variant="elevated"
  class="project-panel"
  role="button"
  tabindex="0"
  onclick={open}
  onkeydown={onKey}
>
  <div slot="content" class="body">
    <header class="head">
      <h3 class="name" title={project}>{project}</h3>
      <button
        type="button"
        class="star"
        class:active={isFavorite}
        onclick={toggleFavorite}
        aria-label={isFavorite ? "Unfavorite" : "Favorite"}
        aria-pressed={isFavorite}
      >
        <m3e-icon name={isFavorite ? "star" : "star_border"}></m3e-icon>
      </button>
    </header>
    <div class="activity">{activeCount} runs (24h)</div>
  </div>
</m3e-card>

<style>
:global(.project-panel) {
  display: block;
  cursor: pointer;
}
.body {
  padding: var(--space-md);
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-sm);
}
.name {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.star {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: inherit;
  opacity: 0.55;
  border-radius: 50%;
  transition: opacity 150ms ease, background 150ms ease, color 150ms ease;
}
.star:hover {
  opacity: 1;
  background: var(--md-sys-color-surface-container-high);
}
.star.active {
  opacity: 1;
  color: var(--md-sys-color-tertiary);
}
.activity {
  margin-top: var(--space-sm);
  font-size: var(--font-size-sm);
  opacity: 0.75;
}
</style>
