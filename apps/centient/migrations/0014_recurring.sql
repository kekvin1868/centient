-- Recurring bills and subscriptions, and credit card statements. The `recurring` table is from 0001 and was
-- unused until now.
ALTER TABLE accounts ADD COLUMN statement_day INTEGER CHECK (statement_day BETWEEN 1 AND 31);

-- service: a key from the app's list of known services (netflix, pln, ...); NULL = typed by hand.
ALTER TABLE recurring ADD COLUMN service TEXT;
ALTER TABLE recurring ADD COLUMN paused_at TEXT;
-- The pocket that pays it; NULL = the account's Main pocket.
ALTER TABLE recurring ADD COLUMN envelope_id TEXT REFERENCES envelopes(id);
-- The day of the month it falls on, kept apart from next_due so a bill on the 31st returns to the 31st after February.
ALTER TABLE recurring ADD COLUMN due_day INTEGER NOT NULL DEFAULT 1 CHECK (due_day BETWEEN 1 AND 31);

-- Merchants the owner said are not a subscription ("Found in your entries" -> Hide).
CREATE TABLE recurring_hidden (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  merchant     TEXT NOT NULL,
  PRIMARY KEY (workspace_id, merchant)
);
