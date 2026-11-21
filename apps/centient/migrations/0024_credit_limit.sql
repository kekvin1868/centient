-- A credit card / pay later account's limit (minor units). Its balance stays the debt (below zero = owed);
-- what is left to spend is credit_limit + balance. NULL = not set.
ALTER TABLE accounts ADD COLUMN credit_limit INTEGER CHECK (credit_limit IS NULL OR credit_limit > 0);
