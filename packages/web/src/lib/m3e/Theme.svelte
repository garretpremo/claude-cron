<script lang="ts">
interface Props {
  color?: string;
  scheme?: "light" | "dark" | "auto";
  motion?: "standard" | "expressive";
  children?: import("svelte").Snippet;
}
let { color = "#4A90D9", scheme = "light", motion = "expressive", children }: Props = $props();
</script>

<m3e-theme {color} {scheme} {motion}>
  {@render children?.()}
</m3e-theme>
