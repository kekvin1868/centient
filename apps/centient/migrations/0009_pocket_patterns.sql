-- Each pocket card gets its own pattern (0-23: twelve patterns, then the same twelve turned 90 degrees), so
-- no two pockets in an account look alike. Main pockets take 0 by default; existing pockets are numbered in
-- the order they were made, per account.
ALTER TABLE envelopes ADD COLUMN pattern INTEGER NOT NULL DEFAULT 0 CHECK (pattern BETWEEN 0 AND 23);
UPDATE envelopes SET pattern = (
  SELECT COUNT(*) FROM envelopes e2 WHERE e2.account_id = envelopes.account_id AND e2.rowid < envelopes.rowid
) % 24;
