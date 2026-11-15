-- Which entry paid a bill's due date (the Bills page history). One row per bill and due date: paying that date
-- again, after its entry was deleted, replaces the row. Amount and paid day are read from the entry, never copied.
CREATE TABLE bill_payments (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  recurring_id TEXT NOT NULL REFERENCES recurring(id),
  due          TEXT NOT NULL,
  entry_id     TEXT NOT NULL REFERENCES entry_groups(id),
  PRIMARY KEY (recurring_id, due)
);
CREATE INDEX bill_payments_entry ON bill_payments(entry_id);
