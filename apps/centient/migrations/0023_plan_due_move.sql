-- Moving a running plan's due dates: first_due is now the due date of installment anchor_no (1 until the
-- dates are moved). Later installments follow a month apart; paid ones before it keep showing "Paid".
ALTER TABLE installment_plans ADD COLUMN anchor_no INTEGER NOT NULL DEFAULT 1;
