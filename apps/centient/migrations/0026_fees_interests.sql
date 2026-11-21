-- The seeded "Fees" category also holds plan interest now (slice 2 of cards & pay later), so it is renamed
-- "Fees & Interests" (owner, 2026-11-22). The app looks it up by this name. A workspace that already has a
-- category with the new name keeps both as they are.
UPDATE categories SET name = 'Fees & Interests'
WHERE name = 'Fees' AND kind = 'EXPENSE'
  AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.workspace_id = categories.workspace_id AND c.name = 'Fees & Interests');
