import type { Job } from "../job/schema";

export interface ResolvePromptInput {
  claude: Job["claude"];
  cwd: string;
  timeoutMs: number;
  env?: Record<string, string>;
}

export interface ResolvePromptResult {
  prompt: string;
  fromCmd: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export async function resolvePrompt(
  i: ResolvePromptInput
): Promise<ResolvePromptResult> {
  if (i.claude.prompt !== null) {
    return {
      prompt: i.claude.prompt,
      fromCmd: false,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }
  if (i.claude.prompt_cmd === null) {
    throw new Error("neither prompt nor prompt_cmd set (schema bug)");
  }

  const proc = Bun.spawn(["bash", "-c", i.claude.prompt_cmd], {
    cwd: i.cwd,
    env: { ...process.env, ...(i.env ?? {}) },
    stdout: "pipe",
    stderr: "pipe",
  });

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    try {
      proc.kill("SIGKILL");
    } catch {}
  }, i.timeoutMs);

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timeout);

  if (timedOut) throw new Error("prompt_cmd timed out");
  if (exitCode !== 0) {
    throw new Error(`prompt_cmd failed with exit code ${exitCode}: ${stderr}`);
  }
  const prompt = stdout.trim();
  if (prompt === "") {
    throw new Error("prompt_cmd produced empty output");
  }

  return { prompt, fromCmd: true, stdout, stderr, exitCode };
}
