-- Interest typed by hand from the bank statement ("Log interest" on a card bill), tagged by where it came from:
-- the unpaid part of an older bill (from_month, YYYY-MM) or a plan whose slice went unpaid (plan_id). The entry is
-- an ordinary EXPENSE on the card in "Fees & Interests"; deleting it drops the line (the join skips deleted
-- entries). A plan's own monthly interest is posted by the daily job into plan_interest instead.
CREATE TABLE card_interest (
  entry_id     TEXT PRIMARY KEY REFERENCES entry_groups(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  from_month   TEXT,
  plan_id      TEXT REFERENCES installment_plans(id),
  CHECK ((from_month IS NULL) <> (plan_id IS NULL))
);
