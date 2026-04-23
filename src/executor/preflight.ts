export interface PreflightInput {
  run: string;
  timeoutMs: number;
  cwd: string;
  env?: Record<string, string>;
}

export interface PreflightResult {
  proceed: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

export async function runPreflight(i: PreflightInput): Promise<PreflightResult> {
  const start = Date.now();
  const proc = Bun.spawn(["bash", "-c", i.run], {
    cwd: i.cwd,
    env: { ...process.env, ...(i.env ?? {}) },
    stdout: "pipe",
    stderr: "pipe",
  });

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    try { proc.kill("SIGTERM"); } catch {}
    setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} }, 2_000);
  }, i.timeoutMs);

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timeout);

  return {
    proceed: !timedOut && exitCode === 0,
    exitCode: timedOut ? null : exitCode,
    stdout, stderr,
    durationMs: Date.now() - start,
    timedOut,
  };
}
