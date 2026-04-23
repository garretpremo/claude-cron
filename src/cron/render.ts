import type { Job } from "../job/schema";

export interface RenderInput {
  project: string;
  job: Job;
  binaryPath: string;
}

export function renderCronLine(i: RenderInput): string {
  const cmd = `${i.binaryPath} run ${i.project}/${i.job.name}`;
  if (!i.job.enabled) return `# disabled: ${i.job.schedule} ${cmd}`;
  return `${i.job.schedule} ${cmd}`;
}
