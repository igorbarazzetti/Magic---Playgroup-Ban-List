CREATE TABLE IF NOT EXISTS validated_decks (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  pilot TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL,
  deck_json TEXT NOT NULL,
  card_count INTEGER NOT NULL,
  unique_count INTEGER NOT NULL,
  cover_name TEXT NOT NULL DEFAULT '',
  cover_image TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_validated_decks_created_at
ON validated_decks(created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_validated_decks_format_created_at
ON validated_decks(format, created_at DESC);
