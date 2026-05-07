<script lang="ts">
import type { Snippet } from "svelte";
import DrawerContainer from "$lib/m3e/DrawerContainer.svelte";
import Theme from "$lib/m3e/Theme.svelte";
import { themeState } from "$lib/stores/theme.svelte";
import Sidebar from "./Sidebar.svelte";
import Topbar from "./Topbar.svelte";

interface Props { children?: Snippet }
let { children }: Props = $props();
</script>

<Theme color={themeState.color} scheme={themeState.scheme} motion="expressive">
  <Topbar />
  <DrawerContainer start startMode="auto" startId="nav-drawer">
    {#snippet startSlot()}
      <Sidebar />
    {/snippet}
    <main class="page-content">
      {@render children?.()}
    </main>
  </DrawerContainer>
</Theme>

<style>
:global(html) {
  overflow: hidden;
}
:global(body) {
  height: 100dvh;
  display: flex;
  flex-direction: column;
  margin: 0;
}
:global(m3e-theme) {
  display: contents;
}
:global(m3e-app-bar) {
  --m3e-app-bar-container-color: var(--md-sys-color-surface-container);
  flex: none;
  z-index: 4;
}
:global(m3e-drawer-container) {
  flex: 1;
  min-height: 0;
  --m3e-drawer-container-width: auto;
}
:global(.m3e-drawer-start) {
  padding: var(--space-sm);
  min-width: 240px;
  box-sizing: border-box;
}
.page-content {
  height: 100%;
  overflow: auto;
  min-width: 0;
}
</style>
