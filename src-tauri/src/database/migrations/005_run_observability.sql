DELETE FROM agent_event_traces
WHERE run_id IS NOT NULL
  AND rowid NOT IN (
    SELECT min_id FROM (
      SELECT MIN(rowid) AS min_id
      FROM agent_event_traces
      WHERE run_id IS NOT NULL
      GROUP BY run_id, seq
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_traces_run_seq
    ON agent_event_traces(run_id, seq)
    WHERE run_id IS NOT NULL;

DROP INDEX IF EXISTS idx_event_traces_run;

CREATE INDEX IF NOT EXISTS idx_agent_runs_project_started
    ON agent_runs(project_id, started_at DESC);
