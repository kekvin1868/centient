-- Installment plans for pay later and credit card accounts: a purchase paid back in N equal monthly
-- installments, optionally shared between people. Each person (party) owes a fixed share of every
-- installment; each share is marked paid on its own, which logs a transfer into the plan's account.
-- Proof of payment files live in R2; `attachments` holds their metadata.

CREATE TABLE attachments (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id),
  r2_key        TEXT NOT NULL UNIQUE,
  filename      TEXT NOT NULL,
  content_type  TEXT NOT NULL,
  size          INTEGER NOT NULL CHECK (size > 0),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE installment_plans (
  id                     TEXT PRIMARY KEY,
  workspace_id           TEXT NOT NULL REFERENCES workspaces(id),
  account_id             TEXT NOT NULL REFERENCES accounts(id),
  name                   TEXT NOT NULL,
  amount_per_installment INTEGER NOT NULL CHECK (amount_per_installment > 0),
  installments           INTEGER NOT NULL CHECK (installments BETWEEN 1 AND 60),
  first_due              TEXT NOT NULL,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at             TEXT
);
CREATE INDEX installment_plans_ws ON installment_plans(workspace_id, account_id) WHERE deleted_at IS NULL;

-- seq 0 is always the workspace owner ("You", iou_account_id NULL); others owe through an IOU account.
CREATE TABLE installment_parties (
  plan_id        TEXT NOT NULL REFERENCES installment_plans(id),
  seq            INTEGER NOT NULL CHECK (seq >= 0),
  name           TEXT NOT NULL,
  iou_account_id TEXT REFERENCES accounts(id),
  share          INTEGER NOT NULL CHECK (share > 0),
  PRIMARY KEY (plan_id, seq),
  CHECK ((seq = 0) = (iou_account_id IS NULL))
);

-- One row per paid share. entry_id is the logged transfer; NULL for installments already paid before the
-- plan was added. proof_id is the optional proof of payment.
CREATE TABLE installment_payments (
  plan_id        TEXT NOT NULL REFERENCES installment_plans(id),
  installment_no INTEGER NOT NULL CHECK (installment_no >= 1),
  party_seq      INTEGER NOT NULL,
  paid_at        TEXT NOT NULL,
  entry_id       TEXT REFERENCES entry_groups(id),
  proof_id       TEXT REFERENCES attachments(id),
  PRIMARY KEY (plan_id, installment_no, party_seq)
);
