CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS projects (
  name          TEXT PRIMARY KEY,
  path          TEXT NOT NULL,
  registered_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project     TEXT NOT NULL,
  job         TEXT NOT NULL,
  fire_time   INTEGER NOT NULL,
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER,
  status      TEXT NOT NULL
              CHECK (status IN (
                'running', 'success', 'failure', 'timeout',
                'interrupted', 'abandoned',
                'skipped_preflight', 'skipped_overlap', 'config_error'
              )),
  exit_code   INTEGER,
  cost_usd    REAL,
  summary     TEXT,
  schedule    TEXT,
  is_test     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_runs_project_job_time ON runs(project, job, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status, started_at DESC);

CREATE TABLE IF NOT EXISTS events (
  run_id      INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  ts          INTEGER NOT NULL,
  event_type  TEXT NOT NULL
              CHECK (event_type IN (
                'start', 'preflight', 'prompt_cmd',
                'claude_stdout', 'claude_stderr',
                'end'
              )),
  payload     TEXT NOT NULL,
  PRIMARY KEY (run_id, seq)
);
