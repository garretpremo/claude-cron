<script lang="ts">
import { browser } from "$app/environment";
import { goto } from "$app/navigation";
import { page } from "$app/stores";
import { tick } from "svelte";
if (browser) void import("@m3e/nav-menu");

type NavItem = { href: string; label: string; icon: string };

const items: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/activity", label: "Activity", icon: "history" },
  { href: "/theme", label: "Theme", icon: "palette" },
];

// `bind:this` on an M3E custom element infers the element class type which
// (via @m3e/core's Constructor mixin) doesn't satisfy HTMLElement here.
// Bind to a wrapping element instead — we only call querySelector.
let menuHost: HTMLElement | undefined = $state();
const currentPath = $derived($page.url.pathname);

const isSelected = (href: string) =>
  href === "/" ? currentPath === "/" : currentPath === href || currentPath.startsWith(`${href}/`);

// Reactive `selected={...}` doesn't stick on initial render — m3e-nav-menu's
// SelectionManager initializes during element upgrade and clears any
// pre-upgrade attribute set by Svelte. After upgrade we sync imperatively
// via the `selected` property, which routes through the manager.
$effect(() => {
  if (!browser || !menuHost) return;
  void currentPath;
  void customElements.whenDefined("m3e-nav-menu-item").then(async () => {
    await tick();
    const target = items.find((i) => isSelected(i.href));
    for (const item of items) {
      if (item === target) continue;
      const el = menuHost?.querySelector<HTMLElement>(`[data-href="${item.href}"]`);
      if (el) (el as unknown as { selected: boolean }).selected = false;
    }
    if (target) {
      const el = menuHost?.querySelector<HTMLElement>(`[data-href="${target.href}"]`);
      if (el) (el as unknown as { selected: boolean }).selected = true;
    }
  });
});

const navigate = (href: string) => (e: Event) => {
  e.preventDefault();
  void goto(href);
};
</script>

<div bind:this={menuHost} class="nav-host">
  <m3e-nav-menu>
    {#each items as item (item.href)}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <m3e-nav-menu-item
        data-href={item.href}
        onclick={navigate(item.href)}
      >
        <m3e-icon slot="icon" name={item.icon}></m3e-icon>
        <span slot="label">{item.label}</span>
      </m3e-nav-menu-item>
    {/each}
  </m3e-nav-menu>
</div>

<style>
.nav-host { display: contents; }
</style>
