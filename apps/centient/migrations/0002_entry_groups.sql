-- Entry groups: one thing the user logged, which may be several transactions (a split bill is an
-- expense plus a transfer to the IOU account; a transfer with a fee is a transfer plus an expense).
-- Edits and deletes act on the whole group. `command` is the JSON the user saved, so an edit can
-- rebuild every transaction in the group; it is NULL for system entries and backfilled rows.

CREATE TABLE entry_groups (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  kind         TEXT NOT NULL DEFAULT 'USER' CHECK (kind IN ('USER','OPENING','CORRECTION')),
  command      TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at   TEXT
);
CREATE INDEX entry_groups_ws ON entry_groups(workspace_id) WHERE deleted_at IS NULL;

ALTER TABLE transactions ADD COLUMN group_id TEXT REFERENCES entry_groups(id);
CREATE INDEX tx_group ON transactions(group_id);

-- Backfill: each existing transaction becomes its own group, reusing its id.
INSERT INTO entry_groups (id, workspace_id, kind, created_at, deleted_at)
  SELECT id, workspace_id, CASE WHEN note = 'Opening balance' THEN 'OPENING' ELSE 'USER' END, created_at, deleted_at FROM transactions;
UPDATE transactions SET group_id = id;

-- "Balance adjustment" now holds uncategorised balance corrections (signed INCOME), so it must not
-- appear in spending pickers.
UPDATE categories SET kind = 'INCOME' WHERE name = 'Balance adjustment';
