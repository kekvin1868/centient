-- Budgets per currency: each budget counts spending in one currency, so the same category can have a budget in
-- rupiah and one in dollars. Existing budgets are rupiah. No REFERENCES currencies(code): SQLite refuses a
-- non-NULL default on an added foreign-key column; the API accepts listed codes only.
ALTER TABLE budgets ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'IDR';
DROP INDEX budgets_target;
CREATE UNIQUE INDEX budgets_target ON budgets(workspace_id, IFNULL(category_id,''), IFNULL(envelope_id,''), currency_code) WHERE deleted_at IS NULL;
