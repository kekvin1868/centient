-- Soft delete for accounts and whole workspaces. Nothing is erased: rows are flagged with the time.
-- Deleting an account also flags every entry that touches it (see D1Catalog.deleteAccount).
-- A reset flags the workspace; the user's next request starts a fresh, seeded one.
ALTER TABLE workspaces ADD COLUMN deleted_at TEXT;
ALTER TABLE accounts ADD COLUMN deleted_at TEXT;
