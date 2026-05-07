<script lang="ts">
import { browser } from "$app/environment";
import type { Snippet } from "svelte";
if (browser) void import("@m3e/drawer-container");

interface Props {
  start?: boolean;
  startMode?: "auto" | "side" | "modal";
  startId?: string;
  end?: boolean;
  endMode?: "auto" | "side" | "modal";
  endId?: string;
  startDivider?: boolean;
  endDivider?: boolean;
  startSlot?: Snippet;
  endSlot?: Snippet;
  children?: Snippet;
}

let {
  start = false,
  startMode = "auto",
  startId,
  end = false,
  endMode = "auto",
  endId,
  startDivider = false,
  endDivider = false,
  startSlot,
  endSlot,
  children,
}: Props = $props();
</script>

<m3e-drawer-container
  start={start ? "" : undefined}
  start-mode={startMode}
  end={end ? "" : undefined}
  end-mode={endMode}
  start-divider={startDivider ? "" : undefined}
  end-divider={endDivider ? "" : undefined}
>
  {#if startSlot}
    <aside slot="start" id={startId} class="m3e-drawer-start">
      {@render startSlot()}
    </aside>
  {/if}
  {@render children?.()}
  {#if endSlot}
    <aside slot="end" id={endId} class="m3e-drawer-end">
      {@render endSlot()}
    </aside>
  {/if}
</m3e-drawer-container>
