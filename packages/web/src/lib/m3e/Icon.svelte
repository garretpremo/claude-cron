<script lang="ts">
interface Props {
  name: string;
  size?: string;
}
let { name, size }: Props = $props();
</script>

<m3e-icon {name} style:--m3e-icon-size={size ? size : null}></m3e-icon>
