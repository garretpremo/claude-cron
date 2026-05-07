import { openSync, closeSync, unlinkSync, constants, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface Lock {
  release(): Promise<void>;
}

/**
 * Non-blocking exclusive lock via O_EXCL create. Returns null if already held.
 * Stale lockfiles are recovered by the abandoned-run DB sweep, not here.
 */
export async function acquireLock(path: string): Promise<Lock | null> {
  mkdirSync(dirname(path), { recursive: true });
  let fd: number;
  try {
    fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  } catch (e: any) {
    if (e.code === "EEXIST") return null;
    throw e;
  }
  return {
    async release() {
      try { closeSync(fd); } catch {}
      try { unlinkSync(path); } catch {}
    },
  };
}
