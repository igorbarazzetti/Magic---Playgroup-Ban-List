import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/index.js';

function database(createdAt = '2026-08-08T10:00:00.000Z', priorityRows = []) {
  const state = {
    createdAt,
    inserted: null,
    updated: null,
    priorityRows,
    viewer: { id: 'user-1', email: 'igor@example.com', display_name: 'Igor', avatar_url: '', role: 'member', status: 'active' },
    existing: {
      id: 'deck-1', name: 'Deck atual', pilot: 'Igor', format: 'formatinho',
      deck_json: JSON.stringify([{ name: 'Forest', quantity: 60, section: 'main' }]),
      card_count: 60, unique_count: 1, cover_name: 'Forest', cover_image: '',
      is_valid: 1, owner_user_id: null, visibility: 'public',
      updated_at: createdAt, created_at: createdAt,
    },
  };
  return {
    state,
    async batch() {},
    prepare(sql) {
      return {
        args: [],
        bind(...args) { this.args = args; return this; },
        async first() {
          if (sql.includes('FROM auth_sessions s JOIN authorized_users u')) {
            return state.viewer;
          }
          if (sql.includes('SELECT * FROM validated_decks WHERE id')) return state.existing;
          if (sql.includes('SELECT created_at')) return { created_at: state.createdAt };
          return null;
        },
        async all() {
          if (sql.includes('SELECT deck_json, created_at')) return { results: state.priorityRows };
          return { results: [] };
        },
        async run() {
          if (sql.includes('INSERT INTO validated_decks')) {
            state.inserted = {
              name: this.args[1], entries: JSON.parse(this.args[4]), coverName: this.args[7],
              valid: Boolean(this.args[9]), owner: this.args[10], visibility: this.args[11],
            };
            return { meta: { changes: 1 } };
          }
          if (sql.includes('UPDATE validated_decks')) {
            const expectedVersion = this.args.at(-1);
            if (expectedVersion !== state.createdAt) return { meta: { changes: 0 } };
            state.updated = { name: this.args[0], entries: JSON.parse(this.args[3]), coverName: this.args[6], valid: Boolean(this.args[8]) };
            state.createdAt = this.args[11];
            state.existing = { ...state.existing, updated_at: state.createdAt };
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
      };
    },
  };
}

const authHeaders = { 'content-type': 'application/json', cookie: 'formatinho_session=test-token' };

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
const delver = {
  name: 'Delver of Secrets // Insectile Aberration', set: 'isd', legalities: {},
  card_faces: [
    { name: 'Delver of Secrets', image_uris: { art_crop: 'https://cards.example/delver.jpg' } },
    { name: 'Insectile Aberration', image_uris: { art_crop: 'https://cards.example/insectile.jpg' } },
  ],
};

test('public deck editing revalidates and updates the existing deck', async () => {
  const db = database();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [forest] }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const response = await worker.fetch(new Request('https://formatinho.test/api/decks/deck-1', {
      method: 'PUT',
      headers: authHeaders,
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

test('a double-faced card found by its front face remains valid when editing', async () => {
  const db = database();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('/cards/collection')) {
      return new Response(JSON.stringify({ data: [], not_found: [{ name: delver.name }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/cards/named?fuzzy=Delver%20of%20Secrets')) {
      return new Response(JSON.stringify(delver), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
  };
  try {
    const response = await worker.fetch(new Request('https://formatinho.test/api/decks/deck-1', {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Monoblue', format: 'formatinho', valid: true,
        base_updated_at: '2026-08-08T10:00:00.000Z',
        entries: [{ name: delver.name, quantity: 60, section: 'main' }],
      }),
    }), { DB: db });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.deck.valid, true);
    assert.equal(payload.deck.entries[0].name, delver.name);
    assert.equal(db.state.updated.valid, true);
  } finally { globalThis.fetch = originalFetch; }
});

test('an incomplete deck can be saved and is persisted as invalid', async () => {
  const db = database();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [forest] }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const response = await worker.fetch(new Request('https://formatinho.test/api/decks', {
      method: 'POST',
      headers: authHeaders,
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

test('the server marks a Formatinho deck below 60 Main Deck cards as invalid', async () => {
  const db = database();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [forest] }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const response = await worker.fetch(new Request('https://formatinho.test/api/decks', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Deck com 59 cartas', format: 'formatinho', valid: true,
        entries: [{ name: 'Forest', quantity: 59, section: 'main' }],
      }),
    }), { DB: db });
    const payload = await response.json();
    assert.equal(response.status, 201);
    assert.equal(payload.deck.valid, false);
    assert.equal(db.state.inserted.valid, false);
  } finally { globalThis.fetch = originalFetch; }
});

test('the server accepts a Formatinho deck with more than 60 Main Deck cards', async () => {
  const db = database();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [forest] }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const response = await worker.fetch(new Request('https://formatinho.test/api/decks', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Deck com 61 cartas', format: 'formatinho', valid: true,
        entries: [{ name: 'Forest', quantity: 61, section: 'main' }],
      }),
    }), { DB: db });
    const payload = await response.json();
    assert.equal(response.status, 201);
    assert.equal(payload.deck.valid, true);
    assert.equal(db.state.inserted.valid, true);
  } finally { globalThis.fetch = originalFetch; }
});

test('public editing accepts an incomplete deck and keeps its invalid status', async () => {
  const db = database();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [forest] }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const response = await worker.fetch(new Request('https://formatinho.test/api/decks/deck-1', {
      method: 'PUT',
      headers: authHeaders,
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
      headers: authHeaders,
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
      headers: authHeaders,
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
      headers: authHeaders,
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
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Capa inválida', format: 'formatinho', cover_name: 'Island',
        entries: [{ name: 'Forest', quantity: 60, section: 'main' }],
      }),
    }), { DB: db });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /fazer parte do deck/i);
  } finally { globalThis.fetch = originalFetch; }
});

test('saving a deck requires an authenticated authorized user', async () => {
  const db = database();
  const response = await worker.fetch(new Request('https://formatinho.test/api/decks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Sem sessão', format: 'formatinho', entries: [{ name: 'Forest', quantity: 60, section: 'main' }] }),
  }), { DB: db });
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /entre com google/i);
});

test('a private deck is invisible to anonymous visitors', async () => {
  const db = database();
  db.state.existing = { ...db.state.existing, owner_user_id: 'user-1', visibility: 'private' };
  const response = await worker.fetch(new Request('https://formatinho.test/api/decks/deck-1'), { DB: db });
  assert.equal(response.status, 404);
});

test('a private deck is available to its owner', async () => {
  const db = database();
  db.state.existing = { ...db.state.existing, owner_user_id: 'user-1', visibility: 'private' };
  const response = await worker.fetch(new Request('https://formatinho.test/api/decks/deck-1', { headers: { cookie: 'formatinho_session=test-token' } }), { DB: db });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.deck.visibility, 'private');
  assert.equal(payload.deck.is_owner, true);
  assert.equal(payload.deck.can_change_visibility, true);
});

test('a private deck rejects a different authorized user', async () => {
  const db = database();
  db.state.existing = { ...db.state.existing, owner_user_id: 'user-1', visibility: 'private' };
  db.state.viewer = { ...db.state.viewer, id: 'user-2', email: 'friend@example.com' };
  const response = await worker.fetch(new Request('https://formatinho.test/api/decks/deck-1', { headers: { cookie: 'formatinho_session=test-token' } }), { DB: db });
  assert.equal(response.status, 403);
});

test('Google login verifies a signed ID token and creates a secure server session', async () => {
  const db = database();
  const clientId = 'formatinho-test.apps.googleusercontent.com';
  const keyPair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  publicJwk.kid = 'formatinho-test-key';
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';
  const encode = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'RS256', kid: publicJwk.kid, typ: 'JWT' });
  const claims = encode({
    iss: 'https://accounts.google.com', aud: clientId, sub: 'google-user-1',
    email: 'igor@example.com', email_verified: true, name: 'Igor', iat: now, exp: now + 600,
  });
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, new TextEncoder().encode(`${header}.${claims}`));
  const credential = `${header}.${claims}.${Buffer.from(signature).toString('base64url')}`;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => String(input).includes('googleapis.com/oauth2/v3/certs')
    ? new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' } })
    : originalFetch(input);
  try {
    const response = await worker.fetch(new Request('https://formatinho.test/api/auth/google', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://formatinho.test' },
      body: JSON.stringify({ credential }),
    }), { DB: db, GOOGLE_CLIENT_ID: clientId, FORMATINHO_ALLOWED_EMAILS: 'igor@example.com' });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.user.email, 'igor@example.com');
    assert.match(response.headers.get('set-cookie'), /formatinho_session=.*HttpOnly; Secure; SameSite=Lax/i);
  } finally { globalThis.fetch = originalFetch; }
});
