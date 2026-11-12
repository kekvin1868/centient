-- The Inbox: payments found outside the log box (a CSV import now; photos and other channels later) that wait
-- for the owner's OK. inbox_items is from 0001 and has had no code and no rows, and nothing points at it, so it
-- is rebuilt rather than altered (its source CHECK cannot change in place).
-- New: source CSV, kind (a BALANCE item is a balance check, never a transaction), import_id (the rows of one
-- import, so it can be undone), note, and links to entries instead of transactions (an edit replaces an
-- entry's transaction rows, so only the entry id is stable).
DROP TABLE inbox_items;
CREATE TABLE inbox_items (
  id                  TEXT PRIMARY KEY,
  workspace_id        TEXT NOT NULL REFERENCES workspaces(id),
  source              TEXT NOT NULL CHECK (source IN ('SCREENSHOT','UPLOAD','EMAIL','TEXT','STATEMENT','CSV')),
  kind                TEXT NOT NULL DEFAULT 'TRANSACTION' CHECK (kind IN ('TRANSACTION','BALANCE')),
  status              TEXT NOT NULL CHECK (status IN ('REVIEW','SAVED','DISMISSED')),
  import_id           TEXT,
  blob_key            TEXT,
  content_hash        TEXT,
  external_ref        TEXT,
  statement_import_id TEXT REFERENCES statement_imports(id),
  amount              INTEGER,               -- signed minor units: below zero is money out
  currency_code       TEXT REFERENCES currencies(code),
  occurred_at         TEXT,                  -- YYYY-MM-DD
  merchant            TEXT,
  note                TEXT,
  account_id          TEXT REFERENCES accounts(id),
  envelope_id         TEXT REFERENCES envelopes(id),
  category_id         TEXT REFERENCES categories(id),
  suggested_entry_id  TEXT REFERENCES entry_groups(id),  -- an entry that looks like the same payment
  entry_id            TEXT REFERENCES entry_groups(id),  -- the entry it became (Add) or was matched to (Link)
  raw_text            TEXT,
  error               TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX inbox_hash ON inbox_items(workspace_id, content_hash) WHERE content_hash IS NOT NULL;
CREATE UNIQUE INDEX inbox_ref  ON inbox_items(workspace_id, external_ref) WHERE external_ref IS NOT NULL AND source <> 'STATEMENT';
CREATE INDEX inbox_ws_status ON inbox_items(workspace_id, status, occurred_at);
CREATE INDEX inbox_import ON inbox_items(workspace_id, import_id) WHERE import_id IS NOT NULL;
