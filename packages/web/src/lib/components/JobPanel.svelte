<script lang="ts">
import { browser } from "$app/environment";
import { goto } from "$app/navigation";
if (browser) void import("@m3e/card");

interface Props {
  project: string;
  job: string;
  success: number;
  failure: number;
  skipped: number;
}
const { project, job, success, failure, skipped }: Props = $props();

function open() {
  void goto(
    `/projects/${encodeURIComponent(project)}/jobs/${encodeURIComponent(job)}`,
  );
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    open();
  }
}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<m3e-card
  variant="elevated"
  class="job-panel"
  role="button"
  tabindex="0"
  onclick={open}
  onkeydown={onKey}
>
  <div slot="content" class="body">
    <h3 class="name" title={job}>{job}</h3>
    <div class="project" title={project}>{project}</div>
    <div class="stats" aria-label="24-hour counts">
      <span class="stat success" title="successes">
        <span class="num">{success}</span>
        <span class="lbl">ok</span>
      </span>
      <span class="stat skipped" title="skipped">
        <span class="num">{skipped}</span>
        <span class="lbl">skip</span>
      </span>
      <span class="stat failure" title="failures">
        <span class="num">{failure}</span>
        <span class="lbl">fail</span>
      </span>
    </div>
  </div>
</m3e-card>

<style>
:global(.job-panel) {
  display: block;
  cursor: pointer;
}
.body {
  padding: var(--space-md);
}
.name {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.project {
  font-size: var(--font-size-xs);
  opacity: 0.7;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stats {
  display: flex;
  gap: var(--space-md);
  margin-top: var(--space-md);
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
  line-height: 1.1;
}
.num {
  font-weight: 600;
  font-size: var(--font-size-xl);
}
.lbl {
  font-size: var(--font-size-xs);
  opacity: 0.7;
}
.success .num { color: var(--md-sys-color-tertiary); }
.failure .num { color: var(--md-sys-color-error); }
.skipped .num { opacity: 0.7; }
</style>
