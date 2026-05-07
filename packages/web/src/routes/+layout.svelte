<script lang="ts">
import "$lib/m3e/setup";
import "../styles/theme.css";
import "../styles/animations.css";
import "../styles/material-symbols.css";
import AppShell from "$lib/components/AppShell.svelte";
let { children } = $props();
</script>

<AppShell>
  {@render children?.()}
</AppShell>
