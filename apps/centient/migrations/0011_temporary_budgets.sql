-- Temporary budgets: a budget for a fixed run of days, [starts_on, ends_on) in Asia/Jakarta. Both NULL is a cycle
-- budget, so every existing row stays one. A temporary and a cycle budget on the same target live side by side;
-- two temporary ones may not overlap in dates (checked by the budgets service, an index cannot).
ALTER TABLE budgets ADD COLUMN starts_on TEXT;
ALTER TABLE budgets ADD COLUMN ends_on TEXT;
DROP INDEX budgets_target;
CREATE UNIQUE INDEX budgets_target ON budgets(workspace_id, IFNULL(category_id,''), IFNULL(envelope_id,''), currency_code, IFNULL(starts_on,'')) WHERE deleted_at IS NULL;
