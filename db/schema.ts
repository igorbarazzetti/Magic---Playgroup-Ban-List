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
    isValid: "INTEGER NOT NULL DEFAULT 1",
    ownerUserId: "TEXT",
    visibility: "TEXT NOT NULL DEFAULT 'public'",
    updatedAt: "TEXT",
    updatedByUserId: "TEXT",
    createdAt: "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP",
  },
} as const;

export const authorizedUsersSchema = {
  table: "authorized_users",
  columns: {
    id: "TEXT PRIMARY KEY",
    email: "TEXT NOT NULL UNIQUE",
    googleSub: "TEXT UNIQUE",
    displayName: "TEXT NOT NULL DEFAULT ''",
    avatarUrl: "TEXT NOT NULL DEFAULT ''",
    role: "TEXT NOT NULL DEFAULT 'member'",
    status: "TEXT NOT NULL DEFAULT 'active'",
    createdAt: "TEXT NOT NULL",
    lastLoginAt: "TEXT",
  },
} as const;
