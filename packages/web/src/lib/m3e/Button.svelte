<script lang="ts">
import { browser } from "$app/environment";
import type { Snippet } from "svelte";
if (browser) void import("@m3e/button");

interface Props {
  variant?: "filled" | "outlined" | "text" | "elevated" | "tonal";
  size?: "small" | "medium" | "large";
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  href?: string;
  icon?: Snippet;
  children?: Snippet;
  onclick?: (e: MouseEvent) => void;
}
const {
  variant = "filled",
  size = "medium",
  disabled,
  type = "button",
  href,
  icon,
  children,
  onclick,
}: Props = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<m3e-button {variant} {size} {disabled} {type} {href} {onclick}>
  {@render icon?.()}
  {@render children?.()}
</m3e-button>
