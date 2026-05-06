<script lang="ts">
import { browser } from "$app/environment";
import type { Snippet } from "svelte";
if (browser) void import("@m3e/card");

interface Props {
  variant?: "filled" | "outlined" | "elevated";
  header?: Snippet;
  footer?: Snippet;
  children?: Snippet;
}
let { variant = "outlined", header, footer, children }: Props = $props();
</script>

<m3e-card {variant}>
  {#if header}<div slot="header">{@render header()}</div>{/if}
  <div slot="content">{@render children?.()}</div>
  {#if footer}<div slot="footer">{@render footer()}</div>{/if}
</m3e-card>
