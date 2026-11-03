-- Old names of an account, newest change last. Written by the accounts repo when a rename succeeds, so a
-- person renamed from "Abang" to "Obang" can still show "was Abang". Nothing reads the old name for a lookup.
CREATE TABLE account_name_history (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  account_id   TEXT NOT NULL REFERENCES accounts(id),
  old_name     TEXT NOT NULL,
  changed_at   TEXT NOT NULL
);
CREATE INDEX account_name_history_account ON account_name_history(workspace_id, account_id, changed_at);
