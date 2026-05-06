<script lang="ts">
import Button from "$lib/m3e/Button.svelte";
import Card from "$lib/m3e/Card.svelte";
import {
  PRESETS,
  type ThemeScheme,
  isActivePreset,
  setPreset,
  setScheme,
  themeState,
} from "$lib/stores/theme.svelte";

const SCHEMES: { value: ThemeScheme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const SURFACE_TOKENS = [
  "surface",
  "surface-container-lowest",
  "surface-container-low",
  "surface-container",
  "surface-container-high",
  "surface-container-highest",
  "surface-variant",
  "inverse-surface",
] as const;

const ACCENT_CONTAINERS = [
  "primary-container",
  "secondary-container",
  "tertiary-container",
  "error-container",
] as const;
</script>

<section>
  <h1>Settings</h1>
  <p class="body-large">
    Configure how the claude-cron dashboard looks. Choices apply globally and
    persist across reloads (stored in <code>localStorage</code> under
    <code>claude-cron:theme</code> and <code>claude-cron:scheme</code>).
  </p>

  <h2>Theme</h2>
  <p class="body-large">Pick a seed color. M3E generates the full palette from it.</p>

  <h3>Presets</h3>
  <div class="presets">
    {#each PRESETS as preset (preset.color)}
      {@const active = isActivePreset(preset)}
      <button
        type="button"
        class="preset"
        class:active
        onclick={() => setPreset(preset)}
        aria-pressed={active}
      >
        <span class="swatch" style:background={preset.color}></span>
        <span class="preset-text">
          <span class="preset-name">{preset.name}</span>
          <span class="preset-blurb">{preset.blurb}</span>
          <span class="preset-hex">{preset.color}</span>
        </span>
      </button>
    {/each}
  </div>

  <h3>Scheme</h3>
  <div class="scheme-row">
    {#each SCHEMES as s (s.value)}
      <Button
        variant={themeState.scheme === s.value ? "filled" : "outlined"}
        onclick={() => setScheme(s.value)}
      >{s.label}</Button>
    {/each}
  </div>

  <h3>Surfaces</h3>
  <p class="muted">Each tile uses its named token as <code>background</code> and the matching <code>on-*</code> token for text.</p>
  <div class="surfaces">
    {#each SURFACE_TOKENS as token (token)}
      {@const onToken = token === "inverse-surface" ? "inverse-on-surface" : "on-surface"}
      <div
        class="tile"
        style:background="var(--md-sys-color-{token})"
        style:color="var(--md-sys-color-{onToken})"
      >
        <div class="tile-name">{token}</div>
        <div class="tile-sample body-large">The quick brown fox jumps.</div>
      </div>
    {/each}
  </div>

  <h3>Accent containers</h3>
  <div class="surfaces accent">
    {#each ACCENT_CONTAINERS as token (token)}
      {@const onToken = `on-${token}`}
      <div
        class="tile"
        style:background="var(--md-sys-color-{token})"
        style:color="var(--md-sys-color-{onToken})"
      >
        <div class="tile-name">{token}</div>
        <div class="tile-sample body-large">Action surface.</div>
      </div>
    {/each}
  </div>

  <h3>Components</h3>
  <div class="components">
    <Card variant="elevated">
      {#snippet header()}
        <strong>Elevated card</strong>
      {/snippet}
      Cards inherit the active palette via M3 surface tokens.
      {#snippet footer()}
        <Button variant="text">Cancel</Button>
        <Button variant="filled">Confirm</Button>
      {/snippet}
    </Card>
  </div>
</section>

<style>
h2, h3 {
  margin-top: var(--space-2xl);
  margin-bottom: var(--space-md);
}
.muted {
  opacity: 0.75;
  margin-top: calc(var(--space-md) * -1);
  margin-bottom: var(--space-md);
}

.presets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-md);
}
.preset {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md);
  background: var(--md-sys-color-surface-container);
  color: var(--md-sys-color-on-surface);
  border: 2px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  font: inherit;
  transition: border-color 200ms ease, background 200ms ease;
}
.preset:hover {
  background: var(--md-sys-color-surface-container-high);
}
.preset.active {
  border-color: var(--md-sys-color-primary);
  background: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
}
.swatch {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, currentColor 24%, transparent);
}
.preset-text {
  display: grid;
  gap: 2px;
}
.preset-name {
  font-weight: 600;
}
.preset-blurb {
  font-size: 0.85em;
  opacity: 0.85;
}
.preset-hex {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75em;
  opacity: 0.6;
}

.scheme-row {
  display: flex;
  gap: var(--space-md);
}

.surfaces {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-sm);
}
.surfaces.accent {
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}
.tile {
  padding: var(--space-md) var(--space-lg);
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-height: 96px;
}
.tile-name {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8em;
  opacity: 0.85;
}

.components {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-lg);
}
</style>
