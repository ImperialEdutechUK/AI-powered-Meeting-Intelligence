-- ActionBrief schema, initial.
--
-- One table. A brief is a self-contained JSON document plus the columns needed
-- to list, filter and search it. Keeping the render payload as JSONB means a
-- schema change to the document never requires a data migration.

CREATE TABLE IF NOT EXISTS briefs (
  id             UUID PRIMARY KEY,

  -- Listing and filtering columns, denormalised out of the payload.
  title          TEXT        NOT NULL,
  department     TEXT        NOT NULL,
  meeting_type   TEXT        NOT NULL,
  confidentiality TEXT       NOT NULL,
  date_label     TEXT        NOT NULL DEFAULT '',
  meeting_date   DATE,

  -- The full BriefBundle, validated by Zod on read and write.
  bundle         JSONB       NOT NULL,

  -- Denormalised QA summary so the library can badge rows without parsing JSON.
  grounding_score    SMALLINT NOT NULL DEFAULT 100,
  findings_high      SMALLINT NOT NULL DEFAULT 0,

  -- Provenance.
  source_file    TEXT        NOT NULL DEFAULT '',
  model          TEXT        NOT NULL DEFAULT '',
  cost_usd       NUMERIC(10, 6),
  created_by     TEXT        NOT NULL DEFAULT '',

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS briefs_created_at_idx  ON briefs (created_at DESC);
CREATE INDEX IF NOT EXISTS briefs_department_idx   ON briefs (department, created_at DESC);
CREATE INDEX IF NOT EXISTS briefs_meeting_date_idx ON briefs (meeting_date DESC NULLS LAST);

-- Free-text search over the title and the document summary.
CREATE INDEX IF NOT EXISTS briefs_search_idx ON briefs
  USING GIN (to_tsvector('english', title || ' ' || coalesce(bundle -> 'brief' ->> 'summary', '')));

-- Simple per-IP throttle store. Rows are pruned opportunistically on write.
CREATE TABLE IF NOT EXISTS rate_events (
  id         BIGSERIAL PRIMARY KEY,
  bucket     TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_events_bucket_idx ON rate_events (bucket, created_at DESC);

-- The opportunistic prune filters on created_at alone; index it so that DELETE
-- stays an index scan rather than a sequential one on every request.
CREATE INDEX IF NOT EXISTS rate_events_created_at_idx ON rate_events (created_at);
