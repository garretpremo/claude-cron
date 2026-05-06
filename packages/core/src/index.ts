// Database
export { openDb } from "./db/connection";
export {
  insertRun,
  finishRun,
  appendEvent,
  abandonStaleRuns,
  getRecentRuns,
  deleteOldRuns,
  type RunStatus,
  type EventType,
  type InsertRunInput,
  type FinishRunInput,
  type RunRow,
} from "./db/queries";
export * as queries from "./db/queries";

// Jobs
export { JobSchema, type Job } from "./job/schema";
export {
  loadJobsFromDir,
  JobLoadError,
  type LoadedJob,
  type LoadErrorEntry,
  type LoadResult,
} from "./job/loader";
export {
  readRegistry,
  writeRegistry,
  addProject,
  removeProject,
  findByName,
  findByPath,
  type ProjectEntry,
  type Registry,
} from "./job/registry";

// Executor
export {
  executeRun,
  type ExecuteRunInput,
  type ExecuteRunResult,
} from "./executor/run";

// Commands (used by server actions controller)
export { cmdSync, type SyncOpts } from "./commands/sync";

// Cron (used by server status controller)
export { readCrontab, writeCrontab, spliceBlock } from "./cron/sync";

// Paths and util
export {
  ROOT,
  PROJECTS_TOML,
  DB_PATH,
  SECRETS_ENV,
  GLOBAL_DIR,
  LOCKS_DIR,
  lockPath,
  jobsDir,
} from "./util/paths";
export * as paths from "./util/paths";
