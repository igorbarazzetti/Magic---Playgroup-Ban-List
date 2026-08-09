import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';

function database(createdAt = '2026-08-08T10:00:00.000Z') {
  const state = { createdAt, updated: null };
  return {
    state,
    async batch() {},
    prepare(sql) {
      return {
        args: [],
        bind(...args) { this.args = args; return this; },
        async first() {
          if (sql.includes('SELECT created_at')) return { created_at: state.createdAt };
          return null;
        },
        async run() {
          if (sql.includes('UPDATE validated_decks')) {
            const expectedVersion = this.args.at(-1);
            if (expectedVersion !== state.createdAt) return { meta: { changes: 0 } };
            state.updated = { name: this.args[0], entries: JSON.parse(this.args[3]) };
            state.createdAt = this.args[8];
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
      };
    },
  };
}

const forest = {
  name: 'Forest', set: 'fdn', legalities: {},
  image_uris: { art_crop: 'https://cards.example/forest.jpg' },
};

test('public deck editing revalidates and updates the existing deck', async () => {
  const db = database();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [forest] }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const response = await worker.fetch(new Request('https://formatinho.test/api/decks/deck-1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Mono Green atualizado', pilot: 'Igor', format: 'formatinho',
        base_updated_at: '2026-08-08T10:00:00.000Z',
        entries: [{ name: 'Forest', quantity: 60, section: 'main' }],
      }),
    }), { DB: db });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).deck.name, 'Mono Green atualizado');
    assert.equal(db.state.updated.entries[0].quantity, 60);
  } finally { globalThis.fetch = originalFetch; }
});

test('public deck editing rejects a stale version instead of overwriting it', async () => {
  const db = database('2026-08-08T11:00:00.000Z');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [forest] }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const response = await worker.fetch(new Request('https://formatinho.test/api/decks/deck-1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Versão antiga', format: 'formatinho', base_updated_at: '2026-08-08T10:00:00.000Z',
        entries: [{ name: 'Forest', quantity: 60, section: 'main' }],
      }),
    }), { DB: db });
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /alterado por outra pessoa/i);
  } finally { globalThis.fetch = originalFetch; }
});
