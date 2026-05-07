<script lang="ts">
import type { Snippet } from "svelte";
interface Props {
  size?: "small" | "medium" | "large";
  centered?: boolean;
  leadingIcon?: Snippet;
  title?: Snippet;
  trailingIcon?: Snippet;
}
let { size = "small", centered = false, leadingIcon, title, trailingIcon }: Props = $props();
</script>

<m3e-app-bar {size} {centered}>
  {#if leadingIcon}<div slot="leading-icon">{@render leadingIcon()}</div>{/if}
  {#if title}<div slot="title">{@render title()}</div>{/if}
  {#if trailingIcon}<div slot="trailing-icon">{@render trailingIcon()}</div>{/if}
</m3e-app-bar>
