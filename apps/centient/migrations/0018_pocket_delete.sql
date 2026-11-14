-- Deleting a pocket (pockets.remove): everything in it moves to its account's Main pocket first, then the row is
-- flagged here and renamed to free its name. Kept, not dropped, so old budgets that named it still point somewhere.
ALTER TABLE envelopes ADD COLUMN deleted_at TEXT;
