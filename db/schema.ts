export const validatedDecksSchema = {
  table: "validated_decks",
  columns: {
    id: "TEXT PRIMARY KEY",
    name: "TEXT NOT NULL",
    pilot: "TEXT NOT NULL DEFAULT ''",
    format: "TEXT NOT NULL",
    deckJson: "TEXT NOT NULL",
    cardCount: "INTEGER NOT NULL",
    uniqueCount: "INTEGER NOT NULL",
    coverName: "TEXT NOT NULL DEFAULT ''",
    coverImage: "TEXT NOT NULL DEFAULT ''",
    createdAt: "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
  },
} as const;
