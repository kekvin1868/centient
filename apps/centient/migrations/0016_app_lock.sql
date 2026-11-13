-- App lock: a privacy screen on a device that is already signed in. A person turns it on by registering a
-- passkey (Face ID, fingerprint or the screen lock); from then on /api answers LOCKED to a browser that has
-- no live unlock session. Per user, not per workspace.
CREATE TABLE passkeys (
  id         TEXT PRIMARY KEY,                    -- the credential id (base64url)
  user_id    TEXT NOT NULL REFERENCES users(id),
  public_key TEXT NOT NULL,                       -- base64url
  counter    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX passkeys_user ON passkeys(user_id);

-- The one challenge a user's register or unlock ceremony is answering; used once, short-lived.
CREATE TABLE lock_challenges (
  user_id    TEXT PRIMARY KEY REFERENCES users(id),
  challenge  TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- A browser that passed the lock: its HttpOnly cookie names one of these.
CREATE TABLE unlock_sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
);
