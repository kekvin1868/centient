-- What the bank's statement says for one card bill ("Enter statement"): its total and, when printed, the minimum
-- payment. Typed from the paper, never worked out. One row per card per bill (closed_on = the bill's closing day,
-- YYYY-MM-DD); typing it again replaces it. The app compares the total with its own bill to show any gap.
CREATE TABLE card_statements (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  account_id   TEXT NOT NULL REFERENCES accounts(id),
  closed_on    TEXT NOT NULL,
  total        INTEGER NOT NULL CHECK (total >= 0),
  minimum      INTEGER CHECK (minimum IS NULL OR (minimum >= 0 AND minimum <= total)),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (workspace_id, account_id, closed_on)
);
