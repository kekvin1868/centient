-- Pockets inside accounts. Until now a Pocket (envelope) was a jar that split all of a workspace's money by
-- purpose, across accounts. From here a Pocket belongs to one account, like a bank's sub-account (Jago's
-- Kantong): every account has a "Main" pocket plus any the user adds, and an account's balance is the sum
-- of its pockets. Also: a "Debit card" account type, soft-deleted categories, and a first-run flag.
--
-- Existing data: every account gets a Main pocket; every transaction's pocket lines are rebuilt from its
-- account lines (so all of an account's money starts in Main and every balance is unchanged); the old
-- shared jars go, and money moved between them (ALLOCATE) is soft-deleted because it has no meaning per
-- account. Budgets on a jar drop the jar (or go, if they had nothing else). Saved entry commands lose
-- their pocket ids, so an edit puts the money in the account's Main pocket.
--
-- How the tables change (D1 keeps foreign keys on, so a referenced table cannot simply be swapped):
-- envelopes is dropped and recreated only after every reference to its rows is gone (pocket lines,
-- budgets, inbox items, account defaults), so the drop is clean. accounts is referenced by every entry and
-- cannot be rebuilt that way, so "Debit card" is stored as kind BANK with subtype DEBIT_CARD; the D1
-- adapter maps it to and from kind DEBIT_CARD, which is all the rest of the code sees.

-- 1. Debit card.
ALTER TABLE accounts ADD COLUMN subtype TEXT CHECK (subtype IS NULL OR (subtype = 'DEBIT_CARD' AND kind = 'BANK'));

-- 2. Money moved between the old jars has no meaning per account.
UPDATE entry_groups SET deleted_at = datetime('now') WHERE deleted_at IS NULL AND id IN (SELECT group_id FROM transactions WHERE type = 'ALLOCATE');
UPDATE transactions SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE type = 'ALLOCATE' AND deleted_at IS NULL;

-- 3. Clear every reference to the old jars, then replace the table.
DELETE FROM allocations;
UPDATE budgets SET deleted_at = datetime('now') WHERE deleted_at IS NULL AND envelope_id IS NOT NULL AND (category_id IS NULL OR EXISTS (SELECT 1 FROM budgets o WHERE o.workspace_id = budgets.workspace_id AND o.category_id = budgets.category_id AND o.envelope_id IS NULL AND o.deleted_at IS NULL));
UPDATE budgets SET envelope_id = NULL WHERE envelope_id IS NOT NULL;
UPDATE inbox_items SET envelope_id = NULL WHERE envelope_id IS NOT NULL;
DELETE FROM envelope_categories;
UPDATE accounts SET default_envelope_id = NULL;
UPDATE entry_groups SET command = json_remove(command, '$.envelopeId', '$.fromEnvelopeId', '$.toEnvelopeId') WHERE command IS NOT NULL;
DROP TABLE envelopes;

CREATE TABLE envelopes (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id),
  account_id    TEXT NOT NULL REFERENCES accounts(id),
  name          TEXT NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'IDR' REFERENCES currencies(code),
  kind          TEXT NOT NULL DEFAULT 'SPENDING' CHECK (kind IN ('SPENDING','SAVINGS','GOAL')),
  target_amount INTEGER CHECK ((kind = 'GOAL') = (target_amount IS NOT NULL) AND (target_amount IS NULL OR target_amount > 0)),
  target_date   TEXT,
  archived_at   TEXT,
  UNIQUE (account_id, name)
);
CREATE INDEX envelopes_account ON envelopes(account_id);

-- 4. A Main pocket per account (deleted accounts too, so their soft-deleted history still balances), as
-- each account's default; every pocket line rebuilt from the account lines.
INSERT INTO envelopes (id, workspace_id, account_id, name, currency_code, kind)
  SELECT id || ':main', workspace_id, id, 'Main', currency_code, 'SPENDING' FROM accounts;
UPDATE accounts SET default_envelope_id = id || ':main';
INSERT INTO allocations (transaction_id, envelope_id, amount) SELECT transaction_id, account_id || ':main', amount FROM entries;

-- 5. Categories can be deleted (soft): gone from every list, entries moved to another category first.
ALTER TABLE categories ADD COLUMN deleted_at TEXT;

-- 6. First run: a new workspace starts with three accounts and asks for their balances once. Existing
-- workspaces are past that.
ALTER TABLE workspaces ADD COLUMN onboarded_at TEXT;
UPDATE workspaces SET onboarded_at = datetime('now');
