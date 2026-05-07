<script lang="ts">
import { browser } from "$app/environment";
import type { Snippet } from "svelte";
if (browser) void import("@m3e/chips");

interface Props {
  selected?: boolean;
  disabled?: boolean;
  onclick?: (e: MouseEvent) => void;
  children?: Snippet;
}
let { selected, disabled, onclick, children }: Props = $props();
</script>

<!--
  m3e-filter-chip is the interactive filter primitive: it ships state-layer
  hover/focus, ripple, and toggleable selected styling. m3e-chip (used by
  the sibling Chip.svelte) is documented as "non-interactive, display only"
  and is the wrong wrapper for a clickable filter.
-->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<m3e-filter-chip {selected} {disabled} {onclick}>{@render children?.()}</m3e-filter-chip>

<style>
m3e-filter-chip {
  cursor: pointer;
}
m3e-filter-chip[disabled] {
  cursor: default;
}
</style>
