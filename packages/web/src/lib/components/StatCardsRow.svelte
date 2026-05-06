<script lang="ts">
import { browser } from "$app/environment";
if (browser) void import("@m3e/card");

export interface StatCard {
  label: string;
  value: string | number;
  color?: string;
  delta?: string;
}

interface Props {
  cards: StatCard[];
}
let { cards }: Props = $props();
</script>

<div class="row">
  {#each cards as card (card.label)}
    <m3e-card variant="elevated" class="stat-card">
      <div slot="content" class="stat-body">
        <div class="value" style:color={card.color ?? "var(--md-sys-color-primary)"}>
          {card.value}
        </div>
        <div class="label">{card.label}</div>
        {#if card.delta}
          <div class="delta">{card.delta}</div>
        {/if}
      </div>
    </m3e-card>
  {/each}
</div>

<style>
.row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--space-md);
  margin-block: var(--space-lg);
}
:global(.stat-card) {
  display: block;
}
.stat-body {
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.value {
  font-size: 2.5rem;
  font-weight: 600;
  line-height: 1;
}
.label {
  font-size: var(--font-size-sm);
  opacity: 0.75;
  margin-top: var(--space-xs);
}
.delta {
  font-size: var(--font-size-xs);
  margin-top: 2px;
  opacity: 0.6;
}
</style>
