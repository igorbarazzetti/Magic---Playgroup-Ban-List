CREATE TABLE IF NOT EXISTS authorized_users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  google_sub TEXT UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  last_login_at TEXT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES authorized_users(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS deck_revisions (
  id TEXT PRIMARY KEY NOT NULL,
  deck_id TEXT NOT NULL,
  editor_user_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (deck_id) REFERENCES validated_decks(id) ON DELETE CASCADE,
  FOREIGN KEY (editor_user_id) REFERENCES authorized_users(id)
);
--> statement-breakpoint
ALTER TABLE validated_decks ADD COLUMN owner_user_id TEXT REFERENCES authorized_users(id);
--> statement-breakpoint
ALTER TABLE validated_decks ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private'));
--> statement-breakpoint
ALTER TABLE validated_decks ADD COLUMN updated_at TEXT;
--> statement-breakpoint
ALTER TABLE validated_decks ADD COLUMN updated_by_user_id TEXT REFERENCES authorized_users(id);
--> statement-breakpoint
UPDATE validated_decks SET updated_at = created_at WHERE updated_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_expires
ON auth_sessions(user_id, expires_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_deck_revisions_deck_created
ON deck_revisions(deck_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_validated_decks_visibility_updated
ON validated_decks(visibility, updated_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_validated_decks_owner_updated
ON validated_decks(owner_user_id, updated_at DESC);

