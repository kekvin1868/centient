-- One bill like the bank (src/domain/cardBill.ts). A plan's slices ride the card's bills: slice 1 on first_bill
-- (YYYY-MM, the month that bill closes), one per bill after it. price is what the limit blocks (no interest);
-- amount_per_installment − the slice's share of price is that slice's interest, posted at its closing by the
-- daily job. bought_on is the day the price went on the card; paid_before the slices paid before the plan was
-- added; purchase_entry_id the logged purchase (NULL when it was already in the balance).
-- Old plans get 0% interest and their first bill worked out from when they were added (owner: start fresh).
ALTER TABLE installment_plans ADD COLUMN price INTEGER CHECK (price > 0);
ALTER TABLE installment_plans ADD COLUMN bought_on TEXT;
ALTER TABLE installment_plans ADD COLUMN first_bill TEXT;
ALTER TABLE installment_plans ADD COLUMN paid_before INTEGER NOT NULL DEFAULT 0;
ALTER TABLE installment_plans ADD COLUMN purchase_entry_id TEXT REFERENCES entry_groups(id);

UPDATE installment_plans SET
  price = amount_per_installment * installments,
  bought_on = substr(created_at, 1, 10),
  paid_before = (SELECT COUNT(DISTINCT installment_no) FROM installment_payments p
                 WHERE p.plan_id = installment_plans.id AND p.entry_id IS NULL);
UPDATE installment_plans SET first_bill = (
  SELECT strftime('%Y-%m', date(bought_on, 'start of month',
    CASE WHEN CAST(substr(bought_on, 9, 2) AS INTEGER) <= COALESCE(a.statement_day, 31) THEN '+0 months' ELSE '+1 months' END,
    '-' || paid_before || ' months'))
  FROM accounts a WHERE a.id = installment_plans.account_id);

-- Interest lines the daily job posted: one per plan and slice, so a run can never post one twice. Deleting the
-- entry (the bank waived it) keeps the row, so it is not posted again.
CREATE TABLE plan_interest (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  plan_id      TEXT NOT NULL REFERENCES installment_plans(id),
  slice_no     INTEGER NOT NULL CHECK (slice_no >= 1),
  entry_id     TEXT NOT NULL REFERENCES entry_groups(id),
  PRIMARY KEY (plan_id, slice_no)
);
