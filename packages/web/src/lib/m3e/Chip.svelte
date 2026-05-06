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

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<m3e-chip {selected} {disabled} {onclick}>{@render children?.()}</m3e-chip>
