-- Balance Tracker schema v1. Amounts are integers in the currency's minor units.
-- D1 enforces foreign keys by default. Trigger bodies stay on one line so the
-- test helper can split statements on ";\n".

CREATE TABLE users (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE workspaces (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  cycle_start_day INTEGER NOT NULL DEFAULT 1 CHECK (cycle_start_day BETWEEN 1 AND 31)
);

CREATE TABLE workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  user_id      TEXT NOT NULL REFERENCES users(id),
  role         TEXT NOT NULL CHECK (role IN ('OWNER','MEMBER')),
  last_seen_at TEXT,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE currencies (
  code     TEXT PRIMARY KEY,
  kind     TEXT NOT NULL CHECK (kind IN ('FIAT','CRYPTO')),
  decimals INTEGER NOT NULL
);
INSERT INTO currencies VALUES ('IDR','FIAT',0), ('USD','FIAT',2), ('USDT','CRYPTO',6), ('BTC','CRYPTO',8);

CREATE TABLE envelopes (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id),
  name          TEXT NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'IDR' REFERENCES currencies(code),
  kind          TEXT NOT NULL DEFAULT 'SPENDING' CHECK (kind IN ('SPENDING','SAVINGS','GOAL')),
  target_amount INTEGER CHECK ((kind = 'GOAL') = (target_amount IS NOT NULL) AND (target_amount IS NULL OR target_amount > 0)),
  target_date   TEXT,
  archived_at   TEXT,
  UNIQUE (workspace_id, name)
);

CREATE TABLE accounts (
  id                  TEXT PRIMARY KEY,
  workspace_id        TEXT NOT NULL REFERENCES workspaces(id),
  name                TEXT NOT NULL,
  kind                TEXT NOT NULL CHECK (kind IN ('BANK','EWALLET','CASH','CREDIT_CARD','PAYLATER','EXCHANGE','IOU')),
  provider            TEXT,
  currency_code       TEXT NOT NULL DEFAULT 'IDR' REFERENCES currencies(code),
  default_envelope_id TEXT REFERENCES envelopes(id),
  due_day             INTEGER CHECK (due_day BETWEEN 1 AND 31),
  reconciled_at       TEXT,
  archived_at         TEXT,
  UNIQUE (workspace_id, name)
);

CREATE TABLE categories (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('EXPENSE','INCOME')),
  archived_at  TEXT,
  UNIQUE (workspace_id, name)
);

-- 200 active categories per workspace; blocks both insert and un-archive
CREATE TRIGGER categories_cap_insert BEFORE INSERT ON categories WHEN (SELECT COUNT(*) FROM categories WHERE workspace_id = NEW.workspace_id AND archived_at IS NULL) >= 200 BEGIN SELECT RAISE(ABORT, 'CATEGORY_LIMIT'); END;

CREATE TRIGGER categories_cap_unarchive BEFORE UPDATE OF archived_at ON categories WHEN OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL AND (SELECT COUNT(*) FROM categories WHERE workspace_id = NEW.workspace_id AND archived_at IS NULL) >= 200 BEGIN SELECT RAISE(ABORT, 'CATEGORY_LIMIT'); END;

CREATE TABLE envelope_categories (
  envelope_id TEXT NOT NULL REFERENCES envelopes(id),
  category_id TEXT NOT NULL REFERENCES categories(id),
  PRIMARY KEY (envelope_id, category_id)
);

CREATE TABLE transactions (
  id                TEXT PRIMARY KEY,
  workspace_id      TEXT NOT NULL REFERENCES workspaces(id),
  type              TEXT NOT NULL CHECK (type IN ('INCOME','EXPENSE','TRANSFER','ALLOCATE')),
  occurred_at       TEXT NOT NULL,              -- ISO 8601 with +07:00
  category_id       TEXT REFERENCES categories(id),
  merchant          TEXT,                       -- normalized lowercase; feeds category history
  note              TEXT,
  original_amount   INTEGER,
  original_currency TEXT REFERENCES currencies(code),
  spread_cycles     INTEGER NOT NULL DEFAULT 1 CHECK (spread_cycles BETWEEN 1 AND 36),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at        TEXT,
  CHECK ((type IN ('INCOME','EXPENSE')) = (category_id IS NOT NULL))
);
CREATE INDEX tx_ws_date     ON transactions(workspace_id, occurred_at) WHERE deleted_at IS NULL;
CREATE INDEX tx_ws_merchant ON transactions(workspace_id, merchant, occurred_at) WHERE deleted_at IS NULL;

CREATE TABLE entries (
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  account_id     TEXT NOT NULL REFERENCES accounts(id),
  amount         INTEGER NOT NULL CHECK (amount <> 0),
  PRIMARY KEY (transaction_id, account_id)
);
CREATE INDEX entries_account ON entries(account_id);

CREATE TABLE allocations (
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  envelope_id    TEXT NOT NULL REFERENCES envelopes(id),
  amount         INTEGER NOT NULL CHECK (amount <> 0),
  PRIMARY KEY (transaction_id, envelope_id)
);
CREATE INDEX allocations_envelope ON allocations(envelope_id);

CREATE TABLE statement_imports (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id),
  account_id      TEXT NOT NULL REFERENCES accounts(id),
  file_key        TEXT NOT NULL,
  period_start    TEXT,
  period_end      TEXT,
  opening_balance INTEGER,
  closing_balance INTEGER,
  status          TEXT NOT NULL CHECK (status IN ('PARSED','REJECTED')),
  error           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE inbox_items (
  id                  TEXT PRIMARY KEY,
  workspace_id        TEXT NOT NULL REFERENCES workspaces(id),
  source              TEXT NOT NULL CHECK (source IN ('SCREENSHOT','UPLOAD','EMAIL','TEXT','STATEMENT')),
  status              TEXT NOT NULL CHECK (status IN ('REVIEW','SAVED','DISMISSED')),
  blob_key            TEXT,
  content_hash        TEXT,
  external_ref        TEXT,
  statement_import_id TEXT REFERENCES statement_imports(id),
  amount              INTEGER,
  currency_code       TEXT REFERENCES currencies(code),
  occurred_at         TEXT,
  merchant            TEXT,
  account_id          TEXT REFERENCES accounts(id),
  envelope_id         TEXT REFERENCES envelopes(id),
  category_id         TEXT REFERENCES categories(id),
  suggested_link_id   TEXT REFERENCES transactions(id),
  raw_text            TEXT,
  error               TEXT,
  transaction_id      TEXT REFERENCES transactions(id),
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX inbox_hash ON inbox_items(workspace_id, content_hash) WHERE content_hash IS NOT NULL;
CREATE UNIQUE INDEX inbox_ref  ON inbox_items(workspace_id, external_ref) WHERE external_ref IS NOT NULL AND source <> 'STATEMENT';
CREATE UNIQUE INDEX inbox_stmt_link ON inbox_items(transaction_id) WHERE source = 'STATEMENT' AND transaction_id IS NOT NULL;
CREATE INDEX inbox_ws_status ON inbox_items(workspace_id, status, created_at);

CREATE TABLE budgets (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  category_id  TEXT REFERENCES categories(id),
  envelope_id  TEXT REFERENCES envelopes(id),
  deleted_at   TEXT,
  CHECK (category_id IS NOT NULL OR envelope_id IS NOT NULL)
);
-- SQLite treats NULLs as distinct in UNIQUE, so key on IFNULL
CREATE UNIQUE INDEX budgets_target ON budgets(workspace_id, IFNULL(category_id,''), IFNULL(envelope_id,'')) WHERE deleted_at IS NULL;

CREATE TABLE budget_limits (
  budget_id      TEXT NOT NULL REFERENCES budgets(id),
  effective_from TEXT NOT NULL,
  amount         INTEGER NOT NULL CHECK (amount > 0),
  PRIMARY KEY (budget_id, effective_from)
);

CREATE TABLE budget_alerts (
  budget_id   TEXT NOT NULL REFERENCES budgets(id),
  cycle_start TEXT NOT NULL,
  threshold   INTEGER NOT NULL CHECK (threshold IN (80, 100)),
  sent_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (budget_id, cycle_start, threshold)
);

CREATE TABLE aliases (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  alias        TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('MERCHANT','ACCOUNT','CATEGORY')),
  value        TEXT NOT NULL,
  PRIMARY KEY (workspace_id, alias, kind)
);

CREATE TABLE recurring (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name         TEXT NOT NULL,
  account_id   TEXT NOT NULL REFERENCES accounts(id),
  category_id  TEXT NOT NULL REFERENCES categories(id),
  amount       INTEGER,
  every_months INTEGER NOT NULL DEFAULT 1 CHECK (every_months IN (1, 3, 6, 12)),
  next_due     TEXT NOT NULL,
  ends_on      TEXT,
  archived_at  TEXT
);

CREATE TABLE push_subscriptions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
