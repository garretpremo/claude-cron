-- Collapse consecutive skipped_preflight runs into a single counter row.
-- skip_count = how many consecutive preflight skips the row represents.
-- On a collapsed row, started_at is the streak's first skip; fire_time,
-- ended_at, exit_code and summary reflect the most recent skip.
ALTER TABLE runs ADD COLUMN skip_count INTEGER NOT NULL DEFAULT 1;

-- One-time compaction of historical rows. Streaks are consecutive
-- skipped_preflight runs per (project, job, is_test) ordered by started_at:
-- keep each streak's most recent row, rewind its started_at to the streak's
-- first skip, and delete the rest along with their events. The explicit
-- events DELETE guards against DBs whose events table predates the
-- ON DELETE CASCADE foreign key.
CREATE TEMP TABLE skip_compact AS
WITH marked AS (
  SELECT id, status, started_at, project, job, is_test,
         SUM(status <> 'skipped_preflight') OVER (
           PARTITION BY project, job, is_test
           ORDER BY started_at, id
         ) AS grp
  FROM runs
),
streaks AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY project, job, is_test, grp
           ORDER BY started_at DESC, id DESC
         ) AS rn,
         COUNT(*) OVER (PARTITION BY project, job, is_test, grp) AS cnt,
         MIN(started_at) OVER (PARTITION BY project, job, is_test, grp) AS first_started
  FROM marked
  WHERE status = 'skipped_preflight'
)
SELECT id, rn, cnt, first_started FROM streaks WHERE cnt > 1;

UPDATE runs SET
  skip_count = (SELECT cnt FROM skip_compact c WHERE c.id = runs.id),
  started_at = (SELECT first_started FROM skip_compact c WHERE c.id = runs.id)
WHERE id IN (SELECT id FROM skip_compact WHERE rn = 1);

DELETE FROM events WHERE run_id IN (SELECT id FROM skip_compact WHERE rn > 1);

DELETE FROM runs WHERE id IN (SELECT id FROM skip_compact WHERE rn > 1);

DROP TABLE skip_compact;
