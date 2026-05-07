<script lang="ts">
import { browser } from "$app/environment";
import Button from "$lib/m3e/Button.svelte";
import {
  PRESETS,
  type ThemeScheme,
  isActivePreset,
  setPreset,
  setScheme,
  themeState,
} from "$lib/stores/theme.svelte";
if (browser) {
  void import("@m3e/icon");
  void import("@m3e/tooltip");
}

const SCHEMES: { value: ThemeScheme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
</script>

<section>
  <h1>Theme</h1>
  <p class="body-large">
    Pick a seed color and scheme. Choices apply globally and persist on this
    device.<!--
    --><button
      id="theme-storage-trigger"
      type="button"
      class="info-trigger"
      aria-label="How is this stored?"
    >
      <m3e-icon name="info"></m3e-icon>
    </button>
    <m3e-rich-tooltip for="theme-storage-trigger">
      Stored in <code>localStorage</code> under
      <code>claude-cron:theme</code> and <code>claude-cron:scheme</code>.
    </m3e-rich-tooltip>
  </p>

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
</section>

<style>
h3 {
  margin-top: var(--space-2xl);
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

.info-trigger {
  appearance: none;
  background: transparent;
  border: none;
  padding: 0;
  margin: 0 0 0 0.35em;
  color: var(--md-sys-color-on-surface-variant);
  cursor: help;
  opacity: 0.6;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  vertical-align: -0.15em;
  --m3e-icon-size: 16px;
  transition: opacity 150ms ease, background 150ms ease;
}
.info-trigger:hover,
.info-trigger:focus-visible {
  opacity: 1;
  background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent);
  outline: none;
}
m3e-rich-tooltip code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.95em;
  background: color-mix(in srgb, currentColor 12%, transparent);
  padding: 1px 4px;
  border-radius: 4px;
}
</style>
