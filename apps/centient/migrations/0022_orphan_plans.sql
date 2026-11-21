-- Deleting an account left its installment plans live, so they stayed on the Bills page with a PAY key that
-- opened nothing. accounts.remove now deletes them too; this catches the ones already left behind.
UPDATE installment_plans SET deleted_at = (SELECT a.deleted_at FROM accounts a WHERE a.id = installment_plans.account_id)
WHERE deleted_at IS NULL
  AND account_id IN (SELECT id FROM accounts WHERE deleted_at IS NOT NULL);
