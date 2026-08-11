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
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS validated_decks_created_at_idx ON validated_decks(created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS validated_decks_format_created_at_idx ON validated_decks(format, created_at DESC)"),
  ]);
}

function publicDeck(row, includeEntries = false) {
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
    created_at: row.created_at,
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

async function listDecks(env) {
  await ensureDeckSchema(env.DB);
  const result = await env.DB.prepare(`SELECT id, name, pilot, format, card_count, unique_count,
    cover_name, cover_image, is_valid, created_at FROM validated_decks ORDER BY created_at DESC LIMIT 250`).all();
  return json({ decks: (result.results || []).map((row) => publicDeck(row)) });
}

async function listDeckPricePriorities(env) {
  await ensureDeckSchema(env.DB);
  const result = await env.DB.prepare(`SELECT deck_json, created_at
    FROM validated_decks ORDER BY created_at DESC LIMIT 1000`).all();
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

async function getDeck(env, id) {
  await ensureDeckSchema(env.DB);
  const row = await env.DB.prepare("SELECT * FROM validated_decks WHERE id = ? LIMIT 1").bind(id).first();
  return row ? json({ deck: publicDeck(row, true) }) : json({ error: "Deck não encontrado." }, 404);
}

async function createDeck(request, env) {
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
    (id, name, pilot, format, deck_json, card_count, unique_count, cover_name, cover_image, is_valid, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
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
      created_at: createdAt,
    },
  }, 201);
}

async function updateDeck(request, env, id) {
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
  const updatedAt = new Date().toISOString();

  await ensureDeckSchema(env.DB);
  const existing = await env.DB.prepare("SELECT created_at FROM validated_decks WHERE id = ? LIMIT 1").bind(id).first();
  if (!existing) return json({ error: "Deck não encontrado." }, 404);
  if (existing.created_at !== baseUpdatedAt) return json({ error: "Este deck foi alterado por outra pessoa. Reabra a versão mais recente antes de editar." }, 409);

  const result = await env.DB.prepare(`UPDATE validated_decks SET name = ?, pilot = ?, format = ?, deck_json = ?,
    card_count = ?, unique_count = ?, cover_name = ?, cover_image = ?, is_valid = ?, created_at = ?
    WHERE id = ? AND created_at = ?`)
  .bind(name, pilot, format, JSON.stringify(canonicalEntries), cardCount, canonicalEntries.length,
      coverName, coverImage, isValid ? 1 : 0, updatedAt, id, baseUpdatedAt)
    .run();
  if (!Number(result.meta?.changes || 0)) return json({ error: "Este deck mudou enquanto você editava. Reabra a versão mais recente." }, 409);

  return json({ deck: {
    id, name, pilot, format, entries: canonicalEntries, card_count: cardCount,
    unique_count: canonicalEntries.length, cover_name: coverName,
    cover_image: coverImage, valid: isValid, created_at: updatedAt,
  } });
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
      if (url.pathname.startsWith("/api/catalog/")) {
        if (request.method !== "GET") return json({ error: "Método não permitido." }, 405);
        return getCatalogResource(request, url.pathname.slice(13));
      }

      if (url.pathname === "/api/decks") {
        if (request.method === "GET") return listDecks(env);
        if (request.method === "POST") return createDeck(request, env);
        return json({ error: "Método não permitido." }, 405);
      }

      if (url.pathname === "/api/decks/price-priority") {
        if (request.method === "GET") return listDeckPricePriorities(env);
        return json({ error: "Método não permitido." }, 405);
      }

      if (url.pathname.startsWith("/api/decks/")) {
        const id = decodeURIComponent(url.pathname.slice(11));
        if (request.method === "GET") return getDeck(env, id);
        if (request.method === "PUT") return updateDeck(request, env, id);
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
