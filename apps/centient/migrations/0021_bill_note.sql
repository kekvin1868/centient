-- A bill's own note (customer ID, how it is paid). Optional; shown on the bill's page.
ALTER TABLE recurring ADD COLUMN note TEXT;
