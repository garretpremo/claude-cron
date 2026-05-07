<script lang="ts">
import { browser } from "$app/environment";
import type { Snippet } from "svelte";
if (browser) void import("@m3e/shape");

interface Props {
  name?: string;
  size?: string;
  color?: string;
  // Override the package's internal `.wrapper { overflow: hidden }`. Useful
  // when the morph transition uses a spring/overshoot timing function and the
  // bulge would otherwise be clipped at the host's square edge.
  unclip?: boolean;
  onclick?: (e: MouseEvent) => void;
  children?: Snippet;
}
let { name = "circle", size = "96px", color, unclip = false, onclick, children }: Props = $props();

let host = $state<HTMLElement | undefined>();

$effect(() => {
  if (!browser || !unclip || !host) return;
  let cancelled = false;
  customElements.whenDefined("m3e-shape").then(() => {
    if (cancelled) return;
    const root = host?.shadowRoot;
    if (!root) return;
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(
      ":host { overflow: visible !important; } .wrapper { overflow: visible !important; }",
    );
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  });
  return () => {
    cancelled = true;
  };
});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<m3e-shape
  bind:this={host}
  {name}
  {onclick}
  style:--m3e-shape-size={size}
  style:--m3e-shape-container-color={color ?? null}
>
  {@render children?.()}
</m3e-shape>
