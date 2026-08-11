const VALID_FORMATS = new Set([
  "standard",
  "pioneer",
  "modern",
  "legacy",
  "commander",
  "duel",
  "pauper",
  "formatinho",
]);

const OFFICIAL_FORMATS = [
  "standard",
  "pioneer",
  "modern",
  "legacy",
  "commander",
  "duel",
  "pauper",
];

const json = (body, status = 200, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders,
  },
});

const normalizeName = (value = "") => String(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[\u2018\u2019\u02bc\uff07]/g, "'")
  .replace(/[^a-z0-9/]+/gi, " ")
  .replace(/\s+/g, " ")
  .trim()
  .toLocaleLowerCase("en-US");

function nameDistance(left, right, maximum) {
  if (Math.abs(left.length - right.length) > maximum) return maximum + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    let best = row;
    for (let column = 1; column <= right.length; column += 1) {
      const value = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
      current[column] = value;
      best = Math.min(best, value);
    }
    if (best > maximum) return maximum + 1;
    previous = current;
  }
  return previous[right.length];
}

function isConservativeCorrection(input, candidate) {
  const source = normalizeName(input);
  const target = normalizeName(String(candidate || "").split(/\s*\/\/\s*/)[0]);
  if (!source || !target || source === target) return source === target;
  if (source.split(" ").length !== target.split(" ").length) return false;
  const maximum = source.length >= 16 ? 2 : source.length >= 6 ? 1 : 0;
  return maximum > 0 && nameDistance(source, target, maximum) <= maximum;
}

const cleanText = (value, maxLength) => String(value || "")
  .replace(/[\u0000-\u001f\u007f]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, maxLength);

const SESSION_COOKIE = "formatinho_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
let googleJwksCache = { expiresAt: 0, keys: new Map() };

const normalizeEmail = (value = "") => cleanText(value, 254).toLocaleLowerCase("en-US");

function parseCsvSet(value = "") {
  return new Set(String(value || "").split(/[;,\n]/).map(normalizeEmail).filter(Boolean));
}

function parseCookies(request) {
  return new Map(String(request.headers.get("cookie") || "").split(";").map((part) => {
    const index = part.indexOf("=");
    if (index < 0) return ["", ""];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function base64UrlBytes(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64UrlJson(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlBytes(value)));
}

function maxAgeSeconds(headers) {
  const match = String(headers.get("cache-control") || "").match(/max-age=(\d+)/i);
  return Math.max(60, Number(match?.[1]) || 3600);
}

async function googleJwk(kid) {
  if (googleJwksCache.expiresAt > Date.now() && googleJwksCache.keys.has(kid)) return googleJwksCache.keys.get(kid);
  const response = await fetch(GOOGLE_JWKS_URL, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("As chaves de identidade do Google não responderam.");
  const payload = await response.json();
  googleJwksCache = {
    expiresAt: Date.now() + maxAgeSeconds(response.headers) * 1000,
    keys: new Map((payload.keys || []).map((key) => [key.kid, key])),
  };
  return googleJwksCache.keys.get(kid);
}

async function verifyGoogleCredential(credential, audience) {
  const parts = String(credential || "").split(".");
  if (parts.length !== 3 || !audience) throw new Error("Credencial do Google inválida.");
  const header = base64UrlJson(parts[0]);
  const claims = base64UrlJson(parts[1]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Assinatura do Google inválida.");
  const jwk = await googleJwk(header.kid);
  if (!jwk) throw new Error("Chave do Google não encontrada.");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const validSignature = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64UrlBytes(parts[2]), signed);
  const now = Math.floor(Date.now() / 1000);
  const audienceMatches = Array.isArray(claims.aud) ? claims.aud.includes(audience) : claims.aud === audience;
  if (!validSignature || !audienceMatches || !["accounts.google.com", "https://accounts.google.com"].includes(claims.iss)
    || Number(claims.exp || 0) <= now || Number(claims.iat || 0) > now + 120 || claims.email_verified !== true) {
    throw new Error("Credencial do Google expirada ou inválida.");
  }
  const email = normalizeEmail(claims.email);
  if (!claims.sub || !email) throw new Error("A conta Google não informou uma identidade válida.");
  return { sub: String(claims.sub), email, name: cleanText(claims.name, 100), avatar: cleanText(claims.picture, 500) };
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function publicUser(row) {
  return row ? {
    id: row.id,
    email: row.email,
    name: row.display_name || row.email,
    avatar: row.avatar_url || "",
    role: row.role === "admin" ? "admin" : "member",
  } : null;
}

function requestHasSafeOrigin(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

async function ensureAccessSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS authorized_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      google_sub TEXT UNIQUE,
      display_name TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'member',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      last_login_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS deck_revisions (
      id TEXT PRIMARY KEY,
      deck_id TEXT NOT NULL,
      editor_user_id TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_expires ON auth_sessions(user_id, expires_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_deck_revisions_deck_created ON deck_revisions(deck_id, created_at DESC)"),
  ]);
}

async function provisionedUser(db, env, identity) {
  let row = await db.prepare("SELECT * FROM authorized_users WHERE email = ? COLLATE NOCASE LIMIT 1").bind(identity.email).first();
  if (!row) {
    const admins = parseCsvSet(env.FORMATINHO_ADMIN_EMAILS);
    const allowed = parseCsvSet(env.FORMATINHO_ALLOWED_EMAILS);
    if (!admins.has(identity.email) && !allowed.has(identity.email)) return null;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO authorized_users
      (id, email, google_sub, display_name, avatar_url, role, status, created_at, last_login_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`)
      .bind(id, identity.email, identity.sub, identity.name, identity.avatar, admins.has(identity.email) ? "admin" : "member", now, now)
      .run();
    row = { id, email: identity.email, google_sub: identity.sub, display_name: identity.name, avatar_url: identity.avatar, role: admins.has(identity.email) ? "admin" : "member", status: "active" };
  }
  if (row.status !== "active" || (row.google_sub && row.google_sub !== identity.sub)) return null;
  const now = new Date().toISOString();
  await db.prepare(`UPDATE authorized_users SET google_sub = COALESCE(google_sub, ?), display_name = ?, avatar_url = ?, last_login_at = ? WHERE id = ?`)
    .bind(identity.sub, identity.name, identity.avatar, now, row.id).run();
  return { ...row, google_sub: row.google_sub || identity.sub, display_name: identity.name || row.display_name, avatar_url: identity.avatar || row.avatar_url };
}

async function currentUser(request, env) {
  await ensureAccessSchema(env.DB);
  const token = parseCookies(request).get(SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(`SELECT u.id, u.email, u.display_name, u.avatar_url, u.role, u.status
    FROM auth_sessions s JOIN authorized_users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active' LIMIT 1`)
    .bind(tokenHash, new Date().toISOString()).first();
  return publicUser(row);
}

async function authConfig(env) {
  return json({ google_client_id: cleanText(env.GOOGLE_CLIENT_ID, 300), enabled: Boolean(env.GOOGLE_CLIENT_ID) });
}

async function authSession(request, env) {
  return json({ user: await currentUser(request, env) });
}

async function loginWithGoogle(request, env) {
  if (!requestHasSafeOrigin(request)) return json({ error: "Origem de login inválida." }, 403);
  if (!env.GOOGLE_CLIENT_ID) return json({ error: "O login Google ainda não foi configurado." }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Credencial de login inválida." }, 400); }
  let identity;
  try { identity = await verifyGoogleCredential(body?.credential, env.GOOGLE_CLIENT_ID); }
  catch (error) { return json({ error: error.message || "Não foi possível validar sua conta Google." }, 401); }
  await ensureAccessSchema(env.DB);
  const row = await provisionedUser(env.DB, env, identity);
  if (!row) return json({ error: "Este e-mail ainda não possui acesso ao Formatinho." }, 403);
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  await env.DB.prepare("INSERT INTO auth_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(tokenHash, row.id, expiresAt, createdAt).run();
  return json({ user: publicUser(row) }, 200, {
    "set-cookie": `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`,
  });
}

async function logout(request, env) {
  if (!requestHasSafeOrigin(request)) return json({ error: "Origem inválida." }, 403);
  const token = parseCookies(request).get(SESSION_COOKIE);
  if (token) await env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
  return json({ ok: true }, 200, { "set-cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` });
}

async function ensureDeckSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS validated_decks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      pilot TEXT NOT NULL DEFAULT '',
      format TEXT NOT NULL,
      deck_json TEXT NOT NULL,
      card_count INTEGER NOT NULL,
      unique_count INTEGER NOT NULL,
      cover_name TEXT NOT NULL DEFAULT '',
      cover_image TEXT NOT NULL DEFAULT '',
      is_valid INTEGER NOT NULL DEFAULT 1,
      owner_user_id TEXT,
      visibility TEXT NOT NULL DEFAULT 'public',
      updated_at TEXT,
      updated_by_user_id TEXT,
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS validated_decks_created_at_idx ON validated_decks(created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS validated_decks_format_created_at_idx ON validated_decks(format, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_validated_decks_visibility_updated ON validated_decks(visibility, updated_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_validated_decks_owner_updated ON validated_decks(owner_user_id, updated_at DESC)"),
  ]);
}

function publicDeck(row, includeEntries = false, viewer = null) {
  const visibility = row.visibility === "private" ? "private" : "public";
  const isOwner = Boolean(viewer && row.owner_user_id && row.owner_user_id === viewer.id);
  const isAdmin = viewer?.role === "admin";
  const deck = {
    id: row.id,
    name: row.name,
    pilot: row.pilot || "",
    format: row.format,
    card_count: Number(row.card_count),
    unique_count: Number(row.unique_count),
    cover_name: row.cover_name || "",
    cover_image: row.cover_image || "",
    valid: row.is_valid == null ? true : Boolean(Number(row.is_valid)),
    visibility,
    is_owner: isOwner,
    can_edit: Boolean(viewer && (visibility === "public" || isOwner || isAdmin)),
    can_change_visibility: Boolean(viewer && (isOwner || isAdmin)),
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
  };

  if (includeEntries) {
    try {
      deck.entries = JSON.parse(row.deck_json);
    } catch {
      deck.entries = [];
    }
  }

  return deck;
}

function cardNameKeys(card) {
  return [card?.name, ...(card?.card_faces || []).map((face) => face.name)]
    .filter(Boolean)
    .map(normalizeName);
}

async function fetchCards(entries) {
  const cardsByName = new Map();

  for (let start = 0; start < entries.length; start += 75) {
    const batch = entries.slice(start, start + 75);
    const response = await fetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      headers: {
        Accept: "application/json;q=0.9,*/*;q=0.8",
        "Content-Type": "application/json",
        "User-Agent": "Codice-do-Formatinho/1.0 validated-decks",
      },
      body: JSON.stringify({ identifiers: batch.map((entry) => ({ name: entry.name })) }),
    });

    if (!response.ok) throw new Error(`Scryfall respondeu ${response.status}`);
    const payload = await response.json();
    for (const card of payload.data || []) {
      for (const key of cardNameKeys(card)) cardsByName.set(key, card);
    }

    for (const entry of batch.filter((item) => !cardsByName.has(normalizeName(item.name)))) {
      const query = String(entry.name || "").split(/\s*\/\/\s*/)[0].trim();
      const fuzzyResponse = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(query)}`, {
        headers: {
          Accept: "application/json;q=0.9,*/*;q=0.8",
          "User-Agent": "Codice-do-Formatinho/1.0 validated-decks",
        },
      });
      const fuzzyCard = fuzzyResponse.ok ? await fuzzyResponse.json() : null;
      if (fuzzyCard && isConservativeCorrection(query, fuzzyCard.name)) {
        cardsByName.set(normalizeName(entry.name), fuzzyCard);
        for (const key of cardNameKeys(fuzzyCard)) cardsByName.set(key, fuzzyCard);
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    if (start + 75 < entries.length) {
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }

  return cardsByName;
}

function validateCards(entries, format, cardsByName) {
  const issues = [];

  for (const entry of entries) {
    const card = cardsByName.get(normalizeName(entry.name));
    if (!card) {
      issues.push({ name: entry.name, reason: "Carta não encontrada no Scryfall." });
      continue;
    }

    if (format === "formatinho") {
      const banned = !["sunf", "unf"].includes(card.set)
        && OFFICIAL_FORMATS.some((key) => card.legalities?.[key] === "banned");
      if (banned) issues.push({ name: card.name, reason: "Banida no Formatinho." });
      continue;
    }

    const legality = card.legalities?.[format];
    if (legality === "banned") {
      issues.push({ name: card.name, reason: `Banida em ${format}.` });
    } else if (legality === "not_legal" || !legality) {
      issues.push({ name: card.name, reason: `Não é válida em ${format}.` });
    } else if (legality === "restricted" && entry.quantity > 1) {
      issues.push({ name: card.name, reason: "Restrita a uma cópia." });
    }
  }

  return issues;
}

function resolveDeckCover(canonicalEntries, cardsByName, requestedName = "") {
  const requestedKey = normalizeName(requestedName);
  const requestedEntry = requestedKey
    ? canonicalEntries.find((entry) => normalizeName(entry.name) === requestedKey)
    : null;
  if (requestedKey && !requestedEntry) return null;
  const candidates = [
    requestedEntry,
    ...canonicalEntries.filter((entry) => entry.section !== "sideboard"),
    ...canonicalEntries,
  ].filter(Boolean);
  for (const entry of candidates) {
    const card = cardsByName.get(normalizeName(entry.name));
    if (card) return { entry, card };
  }
  return { entry: requestedEntry || candidates[0] || canonicalEntries[0], card: null };
}

async function listDecks(env, viewer = null) {
  await ensureDeckSchema(env.DB);
  const result = await env.DB.prepare(`SELECT id, name, pilot, format, card_count, unique_count,
    cover_name, cover_image, is_valid, owner_user_id, visibility, updated_at, created_at
    FROM validated_decks WHERE visibility = 'public' ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 250`).all();
  return json({ decks: (result.results || []).map((row) => publicDeck(row, false, viewer)) });
}

async function listMyDecks(env, viewer) {
  await ensureDeckSchema(env.DB);
  const result = await env.DB.prepare(`SELECT id, name, pilot, format, card_count, unique_count,
    cover_name, cover_image, is_valid, owner_user_id, visibility, updated_at, created_at
    FROM validated_decks WHERE owner_user_id = ? ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 250`)
    .bind(viewer.id).all();
  return json({ decks: (result.results || []).map((row) => publicDeck(row, false, viewer)) });
}

async function listDeckPricePriorities(env) {
  await ensureDeckSchema(env.DB);
  const result = await env.DB.prepare(`SELECT deck_json, created_at
    FROM validated_decks WHERE visibility = 'public' ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 1000`).all();
  const latestPublicationByName = new Map();

  for (const row of result.results || []) {
    let entries = [];
    try {
      entries = JSON.parse(row.deck_json);
    } catch {
      continue;
    }

    for (const entry of Array.isArray(entries) ? entries : []) {
      if (Number(entry?.quantity || 0) <= 0) continue;
      const name = cleanText(entry?.name, 160).split(/\s*\/\/\s*/, 1)[0].trim();
      const key = normalizeName(name);
      if (!key) continue;
      const previous = latestPublicationByName.get(key);
      if (!previous || String(row.created_at) > previous[1]) {
        latestPublicationByName.set(key, [name, row.created_at]);
      }
    }
  }

  const cards = [...latestPublicationByName.values()]
    .sort((left, right) => String(right[1]).localeCompare(String(left[1])) || left[0].localeCompare(right[0], "en"));
  return json({
    generated_at: new Date().toISOString(),
    deck_count: (result.results || []).length,
    cards,
  }, 200, { "cache-control": "public, max-age=60, stale-while-revalidate=300" });
}

async function getDeck(env, id, viewer = null) {
  await ensureDeckSchema(env.DB);
  const row = await env.DB.prepare("SELECT * FROM validated_decks WHERE id = ? LIMIT 1").bind(id).first();
  if (!row) return json({ error: "Deck não encontrado." }, 404);
  if (row.visibility === "private" && !viewer) return json({ error: "Deck não encontrado." }, 404);
  if (row.visibility === "private" && row.owner_user_id !== viewer?.id && viewer?.role !== "admin") {
    return json({ error: "Você não tem acesso a este deck." }, 403);
  }
  return json({ deck: publicDeck(row, true, viewer) });
}

async function createDeck(request, env, viewer) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 100_000) return json({ error: "A lista é grande demais." }, 413);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Dados do deck inválidos." }, 400);
  }

  const name = cleanText(body?.name, 80);
  const pilot = cleanText(body?.pilot, 60);
  const format = cleanText(body?.format, 20).toLowerCase();
  const requestedCoverName = cleanText(body?.cover_name, 160);
  const visibility = body?.visibility === "public" ? "public" : "private";
  if (!name) return json({ error: "Dê um nome ao deck." }, 400);
  if (!VALID_FORMATS.has(format)) return json({ error: "Formato inválido." }, 400);
  if (!Array.isArray(body?.entries) || body.entries.length < 1 || body.entries.length > 300) {
    return json({ error: "A lista precisa ter entre 1 e 300 cartas diferentes." }, 400);
  }

  const mergedEntries = new Map();
  for (const item of body.entries) {
    const cardName = cleanText(item?.name, 160);
    const quantity = Math.trunc(Number(item?.quantity));
    const section = item?.section === "sideboard" ? "sideboard" : "main";
    if (!cardName || !Number.isFinite(quantity) || quantity < 1 || quantity > 99) {
      return json({ error: "Há uma carta ou quantidade inválida na lista." }, 400);
    }
    const key = `${section}:${normalizeName(cardName)}`;
    const current = mergedEntries.get(key);
    const total = (current?.quantity || 0) + quantity;
    if (total > 99) return json({ error: `Quantidade inválida para ${cardName}.` }, 400);
    mergedEntries.set(key, { name: current?.name || cardName, quantity: total, section });
  }

  const entries = [...mergedEntries.values()];
  const cardCount = entries.reduce((total, entry) => total + entry.quantity, 0);
  const mainCardCount = entries.filter((entry) => entry.section !== "sideboard").reduce((total, entry) => total + entry.quantity, 0);
  if (cardCount > 1_000) return json({ error: "A lista excede o limite de 1.000 cartas." }, 400);

  let cardsByName;
  try {
    cardsByName = await fetchCards(entries);
  } catch {
    return json({ error: "Não foi possível confirmar o deck com o Scryfall. Tente novamente." }, 503);
  }

  const issues = validateCards(entries, format, cardsByName);
  const requestedValid = typeof body?.valid === "boolean" ? body.valid : true;
  const isValid = requestedValid && issues.length === 0 && (format !== "formatinho" || mainCardCount >= 60);

  const canonicalEntries = entries.map((entry) => {
    const card = cardsByName.get(normalizeName(entry.name));
    return { name: card?.name || entry.name, quantity: entry.quantity, section: entry.section };
  });
  const cover = resolveDeckCover(canonicalEntries, cardsByName, requestedCoverName);
  if (!cover) return json({ error: "A carta de destaque precisa fazer parte do deck." }, 400);
  const coverCard = cover.card;
  const coverName = cover.entry?.name || canonicalEntries[0]?.name || "";
  const coverImage = coverCard?.image_uris?.art_crop
    || coverCard?.image_uris?.normal
    || coverCard?.card_faces?.[0]?.image_uris?.art_crop
    || coverCard?.card_faces?.[0]?.image_uris?.normal
    || "";
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await ensureDeckSchema(env.DB);
  await env.DB.prepare(`INSERT INTO validated_decks
    (id, name, pilot, format, deck_json, card_count, unique_count, cover_name, cover_image, is_valid,
      owner_user_id, visibility, updated_at, updated_by_user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      id,
      name,
      pilot,
      format,
      JSON.stringify(canonicalEntries),
      cardCount,
      canonicalEntries.length,
      coverName,
      coverImage,
      isValid ? 1 : 0,
      viewer.id,
      visibility,
      createdAt,
      viewer.id,
      createdAt,
    )
    .run();

  return json({
    deck: {
      id,
      name,
      pilot,
      format,
      entries: canonicalEntries,
      card_count: cardCount,
      unique_count: canonicalEntries.length,
      cover_name: coverName,
      cover_image: coverImage,
      valid: isValid,
      visibility,
      is_owner: true,
      can_edit: true,
      can_change_visibility: true,
      created_at: createdAt,
      updated_at: createdAt,
    },
  }, 201);
}

async function updateDeck(request, env, id, viewer) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 100_000) return json({ error: "A lista é grande demais." }, 413);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Dados do deck inválidos." }, 400); }

  const name = cleanText(body?.name, 80);
  const pilot = cleanText(body?.pilot, 60);
  const format = cleanText(body?.format, 20).toLowerCase();
  const requestedCoverName = cleanText(body?.cover_name, 160);
  const baseUpdatedAt = cleanText(body?.base_updated_at, 40);
  if (!name) return json({ error: "Dê um nome ao deck." }, 400);
  if (!baseUpdatedAt) return json({ error: "Reabra o deck antes de editar." }, 409);
  if (!VALID_FORMATS.has(format)) return json({ error: "Formato inválido." }, 400);
  if (!Array.isArray(body?.entries) || body.entries.length < 1 || body.entries.length > 300) return json({ error: "A lista precisa ter entre 1 e 300 cartas diferentes." }, 400);

  const mergedEntries = new Map();
  for (const item of body.entries) {
    const cardName = cleanText(item?.name, 160);
    const quantity = Math.trunc(Number(item?.quantity));
    const section = item?.section === "sideboard" ? "sideboard" : "main";
    if (!cardName || !Number.isFinite(quantity) || quantity < 1 || quantity > 99) return json({ error: "Há uma carta ou quantidade inválida na lista." }, 400);
    const key = `${section}:${normalizeName(cardName)}`;
    const current = mergedEntries.get(key);
    const total = (current?.quantity || 0) + quantity;
    if (total > 99) return json({ error: `Quantidade inválida para ${cardName}.` }, 400);
    mergedEntries.set(key, { name: current?.name || cardName, quantity: total, section });
  }

  const entries = [...mergedEntries.values()];
  const cardCount = entries.reduce((total, entry) => total + entry.quantity, 0);
  const mainCardCount = entries.filter((entry) => entry.section !== "sideboard").reduce((total, entry) => total + entry.quantity, 0);
  if (cardCount > 1_000) return json({ error: "A lista excede o limite de 1.000 cartas." }, 400);
  let cardsByName;
  try { cardsByName = await fetchCards(entries); } catch { return json({ error: "Não foi possível confirmar o deck com o Scryfall. Tente novamente." }, 503); }
  const issues = validateCards(entries, format, cardsByName);
  const requestedValid = typeof body?.valid === "boolean" ? body.valid : true;
  const isValid = requestedValid && issues.length === 0 && (format !== "formatinho" || mainCardCount >= 60);

  const canonicalEntries = entries.map((entry) => {
    const card = cardsByName.get(normalizeName(entry.name));
    return { name: card?.name || entry.name, quantity: entry.quantity, section: entry.section };
  });
  const cover = resolveDeckCover(canonicalEntries, cardsByName, requestedCoverName);
  if (!cover) return json({ error: "A carta de destaque precisa fazer parte do deck." }, 400);
  const coverCard = cover.card;
  const coverName = cover.entry?.name || canonicalEntries[0]?.name || "";
  const coverImage = coverCard?.image_uris?.art_crop || coverCard?.image_uris?.normal || coverCard?.card_faces?.[0]?.image_uris?.art_crop || coverCard?.card_faces?.[0]?.image_uris?.normal || "";
  await ensureDeckSchema(env.DB);
  const existing = await env.DB.prepare("SELECT * FROM validated_decks WHERE id = ? LIMIT 1").bind(id).first();
  if (!existing) return json({ error: "Deck não encontrado." }, 404);
  const existingVisibility = existing.visibility === "private" ? "private" : "public";
  const isOwner = Boolean(existing.owner_user_id && existing.owner_user_id === viewer.id);
  const isAdmin = viewer.role === "admin";
  if (existingVisibility === "private" && !isOwner && !isAdmin) return json({ error: "Você não pode editar este deck privado." }, 403);
  const requestedVisibility = body?.visibility === "private" ? "private" : body?.visibility === "public" ? "public" : existingVisibility;
  if (requestedVisibility !== existingVisibility && !isOwner && !isAdmin) return json({ error: "Somente o proprietário pode alterar a visibilidade." }, 403);
  const existingVersion = existing.updated_at || existing.created_at;
  if (existingVersion !== baseUpdatedAt) return json({ error: "Este deck foi alterado por outra pessoa. Reabra a versão mais recente antes de editar." }, 409);
  const updatedAt = new Date().toISOString();
  const ownerUserId = existing.owner_user_id || (requestedVisibility === "private" ? viewer.id : null);

  const result = await env.DB.prepare(`UPDATE validated_decks SET name = ?, pilot = ?, format = ?, deck_json = ?,
    card_count = ?, unique_count = ?, cover_name = ?, cover_image = ?, is_valid = ?, owner_user_id = ?, visibility = ?,
    updated_at = ?, updated_by_user_id = ? WHERE id = ? AND COALESCE(updated_at, created_at) = ?`)
  .bind(name, pilot, format, JSON.stringify(canonicalEntries), cardCount, canonicalEntries.length,
      coverName, coverImage, isValid ? 1 : 0, ownerUserId, requestedVisibility, updatedAt, viewer.id, id, baseUpdatedAt)
    .run();
  if (!Number(result.meta?.changes || 0)) return json({ error: "Este deck mudou enquanto você editava. Reabra a versão mais recente." }, 409);

  await ensureAccessSchema(env.DB);
  await env.DB.prepare("INSERT INTO deck_revisions (id, deck_id, editor_user_id, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), id, viewer.id, JSON.stringify(publicDeck(existing, true, viewer)), updatedAt).run();

  return json({ deck: {
    id, name, pilot, format, entries: canonicalEntries, card_count: cardCount,
    unique_count: canonicalEntries.length, cover_name: coverName,
    cover_image: coverImage, valid: isValid, visibility: requestedVisibility,
    is_owner: ownerUserId === viewer.id, can_edit: true,
    can_change_visibility: ownerUserId === viewer.id || isAdmin,
    created_at: existing.created_at, updated_at: updatedAt,
  } });
}

async function changeDeckVisibility(request, env, id, viewer) {
  if (!requestHasSafeOrigin(request)) return json({ error: "Origem inválida." }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Visibilidade inválida." }, 400); }
  const visibility = body?.visibility === "private" ? "private" : body?.visibility === "public" ? "public" : "";
  if (!visibility) return json({ error: "Escolha entre deck público ou privado." }, 400);
  await ensureDeckSchema(env.DB);
  const existing = await env.DB.prepare("SELECT * FROM validated_decks WHERE id = ? LIMIT 1").bind(id).first();
  if (!existing) return json({ error: "Deck não encontrado." }, 404);
  const isOwner = existing.owner_user_id === viewer.id;
  if (!isOwner && viewer.role !== "admin") return json({ error: "Somente o proprietário pode alterar a visibilidade." }, 403);
  const updatedAt = new Date().toISOString();
  const ownerUserId = existing.owner_user_id || viewer.id;
  await env.DB.prepare("UPDATE validated_decks SET visibility = ?, owner_user_id = ?, updated_at = ?, updated_by_user_id = ? WHERE id = ?")
    .bind(visibility, ownerUserId, updatedAt, viewer.id, id).run();
  return json({ deck: publicDeck({ ...existing, visibility, owner_user_id: ownerUserId, updated_at: updatedAt, updated_by_user_id: viewer.id }, true, viewer) });
}

const CATALOG_RESOURCES = {
  index: "https://raw.githubusercontent.com/igorbarazzetti/Magic---Playgroup-Ban-List/main/data/catalog/scryfall-index.json",
  prices: "https://raw.githubusercontent.com/igorbarazzetti/Magic---Playgroup-Ban-List/main/data/ligamagic-catalog-prices.json",
};

async function getCatalogResource(request, kind) {
  const sourceUrl = CATALOG_RESOURCES[kind];
  if (!sourceUrl) return json({ error: "Índice não encontrado." }, 404);
  const upstream = await fetch(sourceUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Codice-do-Formatinho/1.0 catalog-cache",
    },
    cf: { cacheEverything: true, cacheTtl: 3600 },
  });
  if (!upstream.ok) return json({ error: "O catálogo não pôde ser atualizado agora." }, 502);
  const headers = new Headers(upstream.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "public, max-age=3600, stale-while-revalidate=86400");
  headers.set("x-formatinho-cache", upstream.headers.get("cf-cache-status") || "edge");
  headers.delete("set-cookie");
  return new Response(upstream.body, { status: 200, headers });
}

const worker = {
  async fetch(request, env, context) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/auth/config") {
        if (request.method === "GET") return authConfig(env);
        return json({ error: "Método não permitido." }, 405);
      }

      if (url.pathname === "/api/auth/session") {
        if (request.method === "GET") return authSession(request, env);
        return json({ error: "Método não permitido." }, 405);
      }

      if (url.pathname === "/api/auth/google") {
        if (request.method === "POST") return loginWithGoogle(request, env);
        return json({ error: "Método não permitido." }, 405);
      }

      if (url.pathname === "/api/auth/logout") {
        if (request.method === "POST") return logout(request, env);
        return json({ error: "Método não permitido." }, 405);
      }

      if (url.pathname.startsWith("/api/catalog/")) {
        if (request.method !== "GET") return json({ error: "Método não permitido." }, 405);
        return getCatalogResource(request, url.pathname.slice(13));
      }

      if (url.pathname === "/api/me/decks") {
        if (request.method !== "GET") return json({ error: "Método não permitido." }, 405);
        const viewer = await currentUser(request, env);
        return viewer ? listMyDecks(env, viewer) : json({ error: "Entre com Google para acessar seus decks." }, 401);
      }

      if (url.pathname === "/api/decks") {
        const viewer = await currentUser(request, env);
        if (request.method === "GET") return listDecks(env, viewer);
        if (request.method === "POST") {
          if (!requestHasSafeOrigin(request)) return json({ error: "Origem inválida." }, 403);
          return viewer ? createDeck(request, env, viewer) : json({ error: "Entre com Google para salvar um deck." }, 401);
        }
        return json({ error: "Método não permitido." }, 405);
      }

      if (url.pathname === "/api/decks/price-priority") {
        if (request.method === "GET") return listDeckPricePriorities(env);
        return json({ error: "Método não permitido." }, 405);
      }

      if (url.pathname.startsWith("/api/decks/") && url.pathname.endsWith("/visibility")) {
        if (request.method !== "PATCH") return json({ error: "Método não permitido." }, 405);
        const viewer = await currentUser(request, env);
        if (!viewer) return json({ error: "Entre com Google para alterar este deck." }, 401);
        const id = decodeURIComponent(url.pathname.slice(11, -11));
        return changeDeckVisibility(request, env, id, viewer);
      }

      if (url.pathname.startsWith("/api/decks/")) {
        const id = decodeURIComponent(url.pathname.slice(11));
        const viewer = await currentUser(request, env);
        if (request.method === "GET") return getDeck(env, id, viewer);
        if (request.method === "PUT") {
          if (!requestHasSafeOrigin(request)) return json({ error: "Origem inválida." }, 403);
          return viewer ? updateDeck(request, env, id, viewer) : json({ error: "Entre com Google para editar este deck." }, 401);
        }
        return json({ error: "Método não permitido." }, 405);
      }

      if (url.pathname.startsWith("/api/")) return json({ error: "Rota não encontrada." }, 404);
    } catch (error) {
      console.error("validated-decks-api", error);
      return json({ error: "O arquivo de decks não pôde ser consultado agora." }, 500);
    }

    const isFileRequest = url.pathname.includes(".");
    // The asset server canonicalizes /index.html back to /. Fetching the root
    // directly keeps client-side routes such as /deckbuilder intact instead of
    // returning that redirect to the browser.
    if (!isFileRequest) url.pathname = "/";
    const response = await env.ASSETS.fetch(new Request(url, request));
    if (isFileRequest) {
      const headers = new Headers(response.headers);
      if (/\.(?:js|css|png|jpe?g|webp|avif|woff2?)$/i.test(url.pathname)) {
        headers.set("cache-control", "public, max-age=31536000, immutable");
      }
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
    const headers = new Headers(response.headers);
    headers.set("cache-control", "no-store, max-age=0");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};

export default worker;
