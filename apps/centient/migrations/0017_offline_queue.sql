-- Offline queue: the phone keeps entry changes made with no signal and sends them later, so a save can arrive
-- twice (the first answer was lost) or late (another device changed the entry meanwhile).

-- A ticket is the code a save carries (the Idempotency-Key header). A repeat with a known ticket gets the first
-- answer again and nothing runs. `request` = method, path and a hash of the body, so a ticket reused for another
-- save is refused. `status` / `response` stay NULL when the write landed but its answer was never stored.
-- The daily job deletes rows older than 30 days.
CREATE TABLE tickets (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  key          TEXT NOT NULL,
  request      TEXT NOT NULL,
  status       INTEGER,
  response     TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, key)
);
CREATE INDEX tickets_created ON tickets(created_at);

-- Counts an entry's edits: an edit made against an older version is refused (ENTRY_CHANGED), so a change made
-- on another device is never overwritten without asking.
ALTER TABLE entry_groups ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
