import { cmdRun, type RunOpts } from "./run";

export async function cmdTest(opts: Omit<RunOpts, "isTest">): Promise<number> {
  return cmdRun({ ...opts, isTest: true });
}
