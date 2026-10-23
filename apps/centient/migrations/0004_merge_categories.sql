-- Merge legacy categories: workspaces created before the ten broad spending categories still have the old
-- fifteen (Coffee next to Food & Drink, and so on). Each old category is folded into its broad one:
-- everything that pointed at it (transactions, saved entry commands, budgets, aliases, recurring, inbox,
-- envelope links) is moved over, and the emptied old category is archived, not deleted.
-- Only exact old seed names of kind EXPENSE are touched; categories people made themselves stay as they are.
-- Keep each statement's body on one line where it matters for splitting on ";\n".

CREATE TABLE _legacy_map (old_name TEXT PRIMARY KEY, new_name TEXT NOT NULL);
INSERT INTO _legacy_map (old_name, new_name) VALUES
  ('Coffee', 'Food & Drink'), ('Groceries', 'Food & Drink'),
  ('Bills & Utilities', 'Home & Bills'), ('Housing', 'Home & Bills'),
  ('Entertainment', 'Fun'),
  ('Giving', 'Family & Giving'), ('Kondangan', 'Family & Giving'), ('Family', 'Family & Giving');

-- The broad category each workspace needs, created if missing and shown again if it was hidden.
INSERT INTO categories (id, workspace_id, name, kind)
  SELECT DISTINCT lower(hex(randomblob(16))), c.workspace_id, m.new_name, 'EXPENSE'
  FROM categories c JOIN _legacy_map m ON m.old_name = c.name
  WHERE c.kind = 'EXPENSE' AND NOT EXISTS (SELECT 1 FROM categories x WHERE x.workspace_id = c.workspace_id AND x.name = m.new_name)
  GROUP BY c.workspace_id, m.new_name;
UPDATE categories SET archived_at = NULL WHERE kind = 'EXPENSE' AND archived_at IS NOT NULL AND EXISTS (SELECT 1 FROM categories o JOIN _legacy_map m ON m.old_name = o.name WHERE o.workspace_id = categories.workspace_id AND o.kind = 'EXPENSE' AND m.new_name = categories.name);

-- old category id -> broad category id, per workspace
CREATE TABLE _cat_map (old_id TEXT PRIMARY KEY, new_id TEXT NOT NULL);
INSERT INTO _cat_map (old_id, new_id)
  SELECT o.id, n.id FROM categories o JOIN _legacy_map m ON m.old_name = o.name
  JOIN categories n ON n.workspace_id = o.workspace_id AND n.name = m.new_name AND n.kind = 'EXPENSE'
  WHERE o.kind = 'EXPENSE';

UPDATE transactions SET category_id = (SELECT new_id FROM _cat_map WHERE old_id = transactions.category_id) WHERE category_id IN (SELECT old_id FROM _cat_map);
UPDATE entry_groups SET command = json_set(command, '$.categoryId', (SELECT new_id FROM _cat_map WHERE old_id = json_extract(entry_groups.command, '$.categoryId'))) WHERE command IS NOT NULL AND json_extract(command, '$.categoryId') IN (SELECT old_id FROM _cat_map);
UPDATE recurring SET category_id = (SELECT new_id FROM _cat_map WHERE old_id = recurring.category_id) WHERE category_id IN (SELECT old_id FROM _cat_map);
UPDATE inbox_items SET category_id = (SELECT new_id FROM _cat_map WHERE old_id = inbox_items.category_id) WHERE category_id IN (SELECT old_id FROM _cat_map);
UPDATE aliases SET value = (SELECT new_id FROM _cat_map WHERE old_id = aliases.value) WHERE kind = 'CATEGORY' AND value IN (SELECT old_id FROM _cat_map);
INSERT OR IGNORE INTO envelope_categories (envelope_id, category_id) SELECT ec.envelope_id, m.new_id FROM envelope_categories ec JOIN _cat_map m ON m.old_id = ec.category_id;
DELETE FROM envelope_categories WHERE category_id IN (SELECT old_id FROM _cat_map);

-- Budgets: several old budgets (and maybe one on the broad category) can land on the same target.
-- One survives per target (the broad category's own budget if it has one); the others' limits are
-- added to it, month by month, and they are soft-deleted.
CREATE TABLE _budget_map (budget_id TEXT PRIMARY KEY, keep_id TEXT NOT NULL);
INSERT INTO _budget_map (budget_id, keep_id)
  SELECT b.id, COALESCE(
    (SELECT t.id FROM budgets t WHERE t.workspace_id = b.workspace_id AND t.deleted_at IS NULL AND t.category_id = m.new_id AND IFNULL(t.envelope_id, '') = IFNULL(b.envelope_id, '')),
    (SELECT MIN(b2.id) FROM budgets b2 JOIN _cat_map m2 ON m2.old_id = b2.category_id WHERE b2.workspace_id = b.workspace_id AND b2.deleted_at IS NULL AND m2.new_id = m.new_id AND IFNULL(b2.envelope_id, '') = IFNULL(b.envelope_id, '')))
  FROM budgets b JOIN _cat_map m ON m.old_id = b.category_id WHERE b.deleted_at IS NULL;
INSERT INTO budget_limits (budget_id, effective_from, amount)
  SELECT bm.keep_id, l.effective_from, l.amount FROM budget_limits l JOIN _budget_map bm ON bm.budget_id = l.budget_id WHERE bm.budget_id <> bm.keep_id
  ON CONFLICT (budget_id, effective_from) DO UPDATE SET amount = amount + excluded.amount;
UPDATE budgets SET deleted_at = datetime('now') WHERE id IN (SELECT budget_id FROM _budget_map WHERE budget_id <> keep_id);
UPDATE budgets SET category_id = (SELECT new_id FROM _cat_map WHERE old_id = budgets.category_id) WHERE deleted_at IS NULL AND category_id IN (SELECT old_id FROM _cat_map);

UPDATE categories SET archived_at = datetime('now') WHERE id IN (SELECT old_id FROM _cat_map) AND archived_at IS NULL;

DROP TABLE _budget_map;
DROP TABLE _cat_map;
DROP TABLE _legacy_map;
