-- Personal touches: a color per pocket (picked by the user, hex), an icon (emoji) per entry, and an icon
-- remembered per merchant so the next entry at the same place gets it too. NULL means the default.
-- The shape only (D1 rejects a long GLOB as "too complex"); the API checks it is real hex.
ALTER TABLE envelopes ADD COLUMN color TEXT CHECK (color IS NULL OR (length(color) = 7 AND substr(color, 1, 1) = '#'));
ALTER TABLE entry_groups ADD COLUMN icon TEXT CHECK (icon IS NULL OR length(icon) BETWEEN 1 AND 16);

CREATE TABLE merchant_icons (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  merchant     TEXT NOT NULL,
  icon         TEXT NOT NULL CHECK (length(icon) BETWEEN 1 AND 16),
  PRIMARY KEY (workspace_id, merchant)
);
