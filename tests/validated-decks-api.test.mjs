import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';

function database(createdAt = '2026-08-08T10:00:00.000Z', priorityRows = []) {
  const state = { createdAt, inserted: null, updated: null, priorityRows };
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
        async all() {
          if (sql.includes('SELECT deck_json, created_at')) return { results: state.priorityRows };
          return { results: [] };
        },
        async run() {
          if (sql.includes('INSERT INTO validated_decks')) {
            state.inserted = { name: this.args[1], entries: JSON.parse(this.args[4]), coverName: this.args[7], valid: Boolean(this.args[9]) };
            return { meta: { changes: 1 } };
          }
          if (sql.includes('UPDATE validated_decks')) {
            const expectedVersion = this.args.at(-1);
            if (expectedVersion !== state.createdAt) return { meta: { changes: 0 } };
            state.updated = { name: this.args[0], entries: JSON.parse(this.args[3]), coverName: this.args[6], valid: Boolean(this.args[8]) };
            state.createdAt = this.args[9];
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
const island = {
  name: 'Island', set: 'fdn', legalities: {},
  image_uris: { art_crop: 'https://cards.example/island.jpg' },
};
const bannedCard = {
  name: 'Black Lotus', set: 'lea', legalities: { vintage: 'restricted', legacy: 'banned' },
  image_uris: { art_crop: 'https://cards.example/lotus.jpg' },
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

test('an incomplete deck can be saved and is persisted as invalid', async () => {
  const db = database();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [forest] }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const response = await worker.fetch(new Request('https://formatinho.test/api/decks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Rascunho verde', format: 'formatinho', valid: false,
        entries: [{ name: 'Forest', quantity: 52, section: 'main' }],
      }),
    }), { DB: db });
    const payload = await response.json();
    assert.equal(response.status, 201);
    assert.equal(payload.deck.valid, false);
    assert.equal(db.state.inserted.valid, false);
    assert.equal(db.state.inserted.entries[0].quantity, 52);
  } finally { globalThis.fetch = originalFetch; }
});

test('public editing accepts an incomplete deck and keeps its invalid status', async () => {
  const db = database();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [forest] }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const response = await worker.fetch(new Request('https://formatinho.test/api/decks/deck-1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Mono Green em construção', format: 'formatinho', valid: false,
        base_updated_at: '2026-08-08T10:00:00.000Z',
        entries: [{ name: 'Forest', quantity: 52, section: 'main' }],
      }),
    }), { DB: db });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.deck.valid, false);
    assert.equal(db.state.updated.valid, false);
  } finally { globalThis.fetch = originalFetch; }
});

test('the server never marks a banned deck as valid even if the client requests it', async () => {
  const db = database();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [bannedCard] }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const response = await worker.fetch(new Request('https://formatinho.test/api/decks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Lista proibida', format: 'formatinho', valid: true,
        entries: [{ name: 'Black Lotus', quantity: 60, section: 'main' }],
      }),
    }), { DB: db });
    const payload = await response.json();
    assert.equal(response.status, 201);
    assert.equal(payload.deck.valid, false);
    assert.equal(db.state.inserted.valid, false);
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

test('published decks expose a compact deduplicated price-priority list', async () => {
  const db = database('2026-08-08T10:00:00.000Z', [
    {
      created_at: '2026-08-10T12:00:00.000Z',
      deck_json: JSON.stringify([
        { name: 'Delver of Secrets // Insectile Aberration', quantity: 4, section: 'main' },
        { name: 'Island', quantity: 18, section: 'main' },
      ]),
    },
    {
      created_at: '2026-08-09T12:00:00.000Z',
      deck_json: JSON.stringify([
        { name: 'Delver of Secrets // Insectile Aberration', quantity: 2, section: 'sideboard' },
        { name: 'Colossus Hammer', quantity: 4, section: 'main' },
      ]),
    },
  ]);

  const response = await worker.fetch(new Request('https://formatinho.test/api/decks/price-priority'), { DB: db });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=60, stale-while-revalidate=300');
  assert.equal(payload.deck_count, 2);
  assert.deepEqual(payload.cards, [
    ['Delver of Secrets', '2026-08-10T12:00:00.000Z'],
    ['Island', '2026-08-10T12:00:00.000Z'],
    ['Colossus Hammer', '2026-08-09T12:00:00.000Z'],
  ]);
});

test('a published deck can choose any of its cards as the featured cover', async () => {
  const db = database();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [forest, island] }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const response = await worker.fetch(new Request('https://formatinho.test/api/decks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Terras favoritas', format: 'formatinho', cover_name: 'Island',
        entries: [
          { name: 'Forest', quantity: 30, section: 'main' },
          { name: 'Island', quantity: 30, section: 'main' },
        ],
      }),
    }), { DB: db });
    const payload = await response.json();
    assert.equal(response.status, 201);
    assert.equal(payload.deck.cover_name, 'Island');
    assert.equal(payload.deck.cover_image, 'https://cards.example/island.jpg');
    assert.equal(db.state.inserted.coverName, 'Island');
  } finally { globalThis.fetch = originalFetch; }
});

test('the featured cover must belong to the published deck', async () => {
  const db = database();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [forest] }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const response = await worker.fetch(new Request('https://formatinho.test/api/decks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Capa inválida', format: 'formatinho', cover_name: 'Island',
        entries: [{ name: 'Forest', quantity: 60, section: 'main' }],
      }),
    }), { DB: db });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /fazer parte do deck/i);
  } finally { globalThis.fetch = originalFetch; }
});
