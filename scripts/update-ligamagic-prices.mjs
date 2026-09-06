#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = resolve(projectRoot, 'data');
const catalogPath = resolve(dataRoot, 'catalog', 'scryfall-index.json');
const priceIndexPath = resolve(dataRoot, 'ligamagic-catalog-prices.json');
const detailsRoot = resolve(dataRoot, 'ligamagic-details');
const legacyPath = resolve(dataRoot, 'ligamagic-prices.json');
const catalogQuery = '(game:paper) usd<20.00 prefer:best';
const catalogPriceQuery = '(game:paper) usd<20.00 prefer:usd-low';
const banlistQuery = '(banned:standard OR banned:pioneer OR banned:modern OR banned:legacy OR banned:commander OR banned:duel OR banned:pauper) -set:sunf -set:unf';
const trackedFormats = ['standard', 'pioneer', 'modern', 'legacy', 'commander', 'duel', 'pauper'];
const sourceName = 'LigaMagic';
const sourceHomepage = 'https://www.ligamagic.com.br/';
const catalogRefreshMs = 24 * 60 * 60 * 1000;
const maintenanceIntervalMs = Math.max(6 * 60 * 60 * 1000, Number(process.env.LIGAMAGIC_MAINTENANCE_INTERVAL_MS || 12 * 60 * 60 * 1000));
const maintenanceLimit = Math.max(1, Number(process.env.LIGAMAGIC_MAINTENANCE_LIMIT || 100));
const defaultDelayMs = Math.max(10_000, Number(process.env.LIGAMAGIC_REQUEST_DELAY_MS || 25_000));
const maximumDelayMs = Math.max(defaultDelayMs, Number(process.env.LIGAMAGIC_REQUEST_DELAY_MAX_MS || 35_000));
const maximumRunMs = Math.max(60_000, Number(process.env.LIGAMAGIC_MAX_RUN_MS || 50 * 60 * 1000));
const blockCooldownMs = Math.max(60 * 60 * 1000, Number(process.env.LIGAMAGIC_BLOCK_COOLDOWN_MS || 6 * 60 * 60 * 1000));
const challengeCooldownBaseMs = Math.max(24 * 60 * 60 * 1000, Number(process.env.LIGAMAGIC_CHALLENGE_COOLDOWN_MS || 24 * 60 * 60 * 1000));
const challengeCooldownMaxMs = Math.max(challengeCooldownBaseMs, Number(process.env.LIGAMAGIC_CHALLENGE_COOLDOWN_MAX_MS || 72 * 60 * 60 * 1000));
const publishedDecksUrl = process.env.FORMATINHO_PUBLISHED_DECKS_URL || 'https://formatinho.igorb.com.br/api/decks/price-priority';
const deterministicFailureLimit = 2;
const bootstrapCardsPerDayEstimate = 6_000;
const requestHeaders = {
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  'User-Agent': 'Playgroup-da-Amizade/2.0 (personal use; source: LigaMagic; https://formatinho.igorb.com.br)',
};
const jsonHeaders = {
  Accept: 'application/json',
  'User-Agent': 'Playgroup-da-Amizade/2.0 (catalog and price cache; https://github.com/igorbarazzetti/Magic---Playgroup-Ban-List)',
};

export const catalogTuple = Object.freeze({ id: 0, oracleId: 1, name: 2, colorMask: 3, type: 4, cmc: 5, rarity: 6, set: 7, usdCents: 8, formats: 9 });
export const priceTuple = Object.freeze({ cents: 0, status: 1, checkedAt: 2 });

function parseOptions(argv) {
  const options = { force: false, prepareOnly: false, dryRun: false, refreshCatalog: false, repairCatalogPrices: false, limit: 300, cardName: '' };
  for (const argument of argv) {
    if (argument === '--force') options.force = true;
    else if (argument === '--prepare-only') options.prepareOnly = true;
    else if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--refresh-catalog') options.refreshCatalog = true;
    else if (argument === '--repair-catalog-prices') options.repairCatalogPrices = true;
    else if (argument.startsWith('--limit=')) options.limit = Math.max(1, Number(argument.slice(8)) || 300);
    else if (argument.startsWith('--card=')) options.cardName = argument.slice(7).trim();
  }
  return options;
}

function normalizeName(value = '') {
  return String(value).toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function decodeHtml(value = '') {
  const entities = { amp: '&', apos: "'", quot: '"', lt: '<', gt: '>', aacute: 'á', agrave: 'à', acirc: 'â', atilde: 'ã', ccedil: 'ç', eacute: 'é', ecirc: 'ê', iacute: 'í', oacute: 'ó', ocirc: 'ô', otilde: 'õ', uacute: 'ú', nbsp: ' ' };
  return String(value).replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (_match, entity) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return entities[entity.toLowerCase()] || `&${entity};`;
  });
}

export function ligaMagicLookupName(cardName) {
  return String(cardName || '').split(/\s*\/\/\s*/, 1)[0].trim().replace(/^["“”]([\s\S]*)["“”]$/, '$1').trim();
}

export function ligaMagicUrl(cardName) {
  const lookupName = ligaMagicLookupName(cardName);
  return `https://www.ligamagic.com.br/?view=cards/card&card=${encodeURIComponent(lookupName)}`;
}

export function extractLigaMagicResultUrl(html, cardName) {
  const expectedName = normalizeName(cardName);
  const anchors = String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi);
  for (const match of anchors) {
    const text = decodeHtml(match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
      .replace(/&(?:l|r)dquo;/gi, '"')
      .replace(/&(?:l|r)squo;/gi, "'");
    if (normalizeName(text) !== expectedName) continue;
    const href = decodeHtml(match[1]);
    try {
      const url = new URL(href, sourceHomepage);
      if (url.hostname !== 'www.ligamagic.com.br' || url.searchParams.get('view') !== 'cards/card' || !url.searchParams.get('card')) continue;
      return url.toString();
    } catch {
      // Ignora links malformados presentes no HTML e continua procurando.
    }
  }
  return null;
}

function parsePrice(value) {
  const amount = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function priceToCents(value) {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null;
}

function extractInlineJsonArray(html, variableName) {
  const source = String(html);
  const assignment = new RegExp(`var\\s+${variableName}\\s*=\\s*\\[`, 'i').exec(source);
  if (!assignment) return null;

  const arrayStart = source.indexOf('[', assignment.index);
  let depth = 0;
  let quote = '';
  for (let index = arrayStart; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === '[') depth += 1;
    else if (character === ']' && --depth === 0) return JSON.parse(source.slice(arrayStart, index + 1));
  }
  throw new Error(`O array ${variableName} está incompleto na página.`);
}

function comparableCardName(value) {
  return normalizeName(decodeHtml(value).replace(/\s*\([^()]*\)\s*$/, ''));
}

export function extractCheapestNormalPrinting(html, expectedCardName = '') {
  const editions = extractInlineJsonArray(html, 'cards_editions');
  const cards = editions || extractInlineJsonArray(html, 'cardsjson');
  if (!cards) throw new Error('A lista de impressões não foi encontrada na página.');

  const expected = comparableCardName(expectedCardName);
  const candidates = cards
    .filter((printing) => editions || !expected || [printing?.nEN, printing?.nPT]
      .some((name) => comparableCardName(name) === expected))
    .map((edition) => ({
      price: parsePrice(editions ? edition?.price?.['0']?.p : edition?.p1a ?? edition?.precoMenor),
      printingName: decodeHtml(editions ? edition?.name || '' : edition?.ed_sNome || edition?.sNomeEdicao || edition?.nEN || ''),
      printingCode: String(editions ? edition?.code || '' : edition?.sSigla || '').toUpperCase(),
      collectorNumber: String(editions ? edition?.num || '' : edition?.sN || ''),
    }))
    .filter((edition) => edition.price !== null)
    .sort((left, right) => left.price - right.price);
  return candidates[0] || null;
}

async function readJson(path, fallback = null) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error?.code === 'ENOENT') return fallback; throw error; }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  const compact = path === catalogPath || path === priceIndexPath;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, compact ? undefined : 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
}

async function sleep(milliseconds) {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function fetchWithRetry(url, { headers = jsonHeaders, expect = 'json', stopOnBlock = false, deadline = Infinity } = {}) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        const deadlineError = new Error('Limite de tempo da execução atingido.');
        deadlineError.code = 'RUN_DEADLINE';
        throw deadlineError;
      }
      const response = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(Math.max(1, Math.min(30_000, remaining))) });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        error.retryAfter = Number(response.headers.get('retry-after')) || null;
        error.cloudflareChallenge = String(response.headers.get('cf-mitigated') || '').toLowerCase() === 'challenge';
        throw error;
      }
      return expect === 'text' ? response.text() : response.json();
    } catch (error) {
      lastError = error;
      if (error?.code === 'RUN_DEADLINE' || Date.now() >= deadline) {
        const deadlineError = new Error('Limite de tempo da execução atingido.');
        deadlineError.code = 'RUN_DEADLINE';
        throw deadlineError;
      }
      const status = Number(error?.status || String(error?.message || '').match(/HTTP\s+(\d+)/)?.[1]);
      if (stopOnBlock && [403, 429].includes(status)) break;
      const retriable = !Number.isFinite(status) || status === 408 || status === 429 || status >= 500;
      if (!retriable || attempt === 2) break;
      const retryAfterMs = Number(error?.retryAfter) > 0 ? Number(error.retryAfter) * 1000 : status === 429 ? 60_000 : 10_000 * (attempt + 1);
      if (Date.now() + retryAfterMs >= deadline) {
        const deadlineError = new Error('Limite de tempo da execução atingido.');
        deadlineError.code = 'RUN_DEADLINE';
        throw deadlineError;
      }
      await sleep(retryAfterMs);
    }
  }
  throw lastError;
}

async function fetchScryfallSearch(query, { order = 'name', dir = null } = {}) {
  const cards = [];
  const searchUrl = new URL('https://api.scryfall.com/cards/search');
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('unique', 'cards');
  searchUrl.searchParams.set('order', order);
  if (dir) searchUrl.searchParams.set('dir', dir);
  let url = searchUrl.toString();
  let page = 0;
  while (url) {
    const payload = await fetchWithRetry(url);
    page += 1;
    cards.push(...(payload.data || []));
    if (page === 1 || page % 20 === 0 || !payload.has_more) console.log(`Scryfall: ${cards.length}/${payload.total_cards || cards.length} cartas lidas.`);
    url = payload.has_more && payload.next_page ? payload.next_page : '';
    if (url) await sleep(150);
  }
  return cards;
}

function colorMask(colors = []) {
  const values = { W: 1, U: 2, B: 4, R: 8, G: 16 };
  return colors.reduce((mask, color) => mask | (values[color] || 0), 0);
}

function primaryType(typeLine = '') {
  const normalized = normalizeName(typeLine);
  for (const type of ['creature', 'instant', 'sorcery', 'artifact', 'enchantment', 'planeswalker', 'land', 'battle']) {
    if (normalized.includes(type)) return type;
  }
  return 'other';
}

export function usdCents(card) {
  const amount = Number(card?.prices?.usd);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null;
}

export function scryfallPriceCents(card) {
  const prices = [card?.prices?.usd, card?.prices?.usd_foil, card?.prices?.usd_etched]
    .map(priceToCents)
    .filter((amount) => amount !== null);
  return prices.length ? Math.min(...prices) : null;
}

async function fetchMissingScryfallUsd(cards) {
  const missing = cards.filter((card) => usdCents(card) === null);
  const prices = new Map();
  if (!missing.length) return prices;

  console.log(`Scryfall: completando o preço USD de ${missing.length} cartas com a impressão mais barata.`);
  const chunkSize = 20;
  for (let start = 0; start < missing.length; start += chunkSize) {
    const chunk = missing.slice(start, start + chunkSize);
    const oracleFilter = chunk.map((card) => `oracleid:${card.oracle_id || card.id}`).join(' OR ');
    const query = `(${oracleFilter}) ${catalogPriceQuery}`;
    const pricedCards = await fetchScryfallSearch(query, { order: 'usd', dir: 'asc' });
    for (const card of pricedCards) {
      const cents = scryfallPriceCents(card);
      if (cents !== null) prices.set(card.oracle_id || card.id, cents);
    }
    if (start + chunkSize < missing.length) await sleep(150);
  }
  console.log(`Scryfall: ${prices.size}/${missing.length} preços USD ausentes foram recuperados.`);
  return prices;
}

function cardFormats(card) {
  return trackedFormats.filter((format) => card?.legalities?.[format] === 'banned');
}

function formatPtaxDate(date) {
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}-${date.getUTCFullYear()}`;
}

async function fetchPtax(previousRate = null) {
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 10 * 24 * 60 * 60 * 1000);
    const url = new URL('https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)');
    url.searchParams.set('@dataInicial', `'${formatPtaxDate(start)}'`);
    url.searchParams.set('@dataFinalCotacao', `'${formatPtaxDate(end)}'`);
    url.searchParams.set('$format', 'json');
    const payload = await fetchWithRetry(url.toString());
    const values = (payload.value || []).filter((entry) => Number(entry.cotacaoVenda) > 0).sort((a, b) => Date.parse(b.dataHoraCotacao) - Date.parse(a.dataHoraCotacao));
    const latest = values[0];
    if (!latest) throw new Error('A PTAX não retornou uma cotação válida.');
    return { rate: Number(latest.cotacaoVenda), as_of: latest.dataHoraCotacao, source: 'Banco Central do Brasil · PTAX' };
  } catch (error) {
    if (previousRate?.rate) return { ...previousRate, stale: true, last_error: error instanceof Error ? error.message : String(error) };
    throw error;
  }
}

async function refreshCatalog(previousCatalog, { force = false } = {}) {
  const generatedAt = Date.parse(previousCatalog?.generated_at || '');
  const shouldRefresh = force || !previousCatalog?.cards?.length || !Number.isFinite(generatedAt) || Date.now() - generatedAt >= catalogRefreshMs;
  if (!shouldRefresh) return previousCatalog;

  const usdBrl = await fetchPtax(previousCatalog?.usd_brl);

  console.log('Atualizando o índice compacto do Scryfall.');
  const catalogCards = await fetchScryfallSearch(catalogQuery);
  const fallbackUsd = await fetchMissingScryfallUsd(catalogCards);
  const bannedCards = await fetchScryfallSearch(banlistQuery);
  const bannedTargets = new Map();
  for (const card of bannedCards) bannedTargets.set(card.oracle_id || card.id, [card.oracle_id || card.id, card.name]);
  const sets = {};
  const compactCards = catalogCards.map((card) => {
    if (card.set) sets[card.set] = card.set_name || String(card.set).toUpperCase();
    return [
      card.id,
      card.oracle_id || card.id,
      card.name,
      colorMask(card.color_identity || []),
      primaryType(card.type_line),
      Number(card.cmc || 0),
      card.rarity || 'special',
      card.set || '',
      usdCents(card) ?? fallbackUsd.get(card.oracle_id || card.id) ?? null,
      cardFormats(card).join(','),
    ];
  }).sort((left, right) => normalizeName(left[catalogTuple.name]).localeCompare(normalizeName(right[catalogTuple.name]), 'pt-BR'));

  return {
    schema_version: 1,
    query: catalogQuery,
    price_query: catalogPriceQuery,
    generated_at: new Date().toISOString(),
    usd_brl: usdBrl,
    sets: Object.fromEntries(Object.entries(sets).sort(([, left], [, right]) => left.localeCompare(right, 'pt-BR'))),
    cards: compactCards,
    banlist_targets: [...bannedTargets.values()].sort((left, right) => normalizeName(left[1]).localeCompare(normalizeName(right[1]), 'pt-BR')),
  };
}

async function repairCatalogPrices(catalog) {
  if (!catalog?.cards?.length) throw new Error('O catálogo precisa existir antes de reparar os preços do Scryfall.');
  const missingCards = catalog.cards
    .filter((tuple) => tuple[catalogTuple.usdCents] === null || tuple[catalogTuple.usdCents] === undefined)
    .map((tuple) => ({ id: tuple[catalogTuple.id], oracle_id: tuple[catalogTuple.oracleId], prices: { usd: null } }));
  const fallbackUsd = await fetchMissingScryfallUsd(missingCards);
  const cards = catalog.cards.map((tuple) => {
    const cents = fallbackUsd.get(tuple[catalogTuple.oracleId]);
    if (cents === undefined || tuple[catalogTuple.usdCents] !== null) return tuple;
    const repaired = [...tuple];
    repaired[catalogTuple.usdCents] = cents;
    return repaired;
  });
  return { ...catalog, price_query: catalogPriceQuery, price_generated_at: new Date().toISOString(), cards };
}

function emptyPriceIndex() {
  return {
    schema_version: 1,
    source: { name: sourceName, homepage: sourceHomepage, attribution: 'Preços consultados na LigaMagic para uso pessoal do playgroup.' },
    generated_at: null,
    last_batch_at: null,
    mode: 'bootstrap',
    cooldown_until: null,
    failures: {},
    coverage: { target_count: 0, attempted_count: 0, confirmed_count: 0, unavailable_count: 0, stale_count: 0, percent: 0, estimated_completion_at: null },
    prices: {},
  };
}

function timestampSeconds(value) {
  const milliseconds = Date.parse(value || '');
  return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) : 0;
}

function detailPrefix(oracleId) {
  return String(oracleId || 'xx').slice(0, 2).toLowerCase();
}

async function createShardStore() {
  const cache = new Map();
  const touched = new Set();
  return {
    async get(oracleId) {
      const prefix = detailPrefix(oracleId);
      if (!cache.has(prefix)) cache.set(prefix, await readJson(resolve(detailsRoot, `${prefix}.json`), {}));
      return cache.get(prefix)?.[oracleId] || null;
    },
    async set(oracleId, entry) {
      const prefix = detailPrefix(oracleId);
      if (!cache.has(prefix)) cache.set(prefix, await readJson(resolve(detailsRoot, `${prefix}.json`), {}));
      cache.get(prefix)[oracleId] = entry;
      touched.add(prefix);
    },
    async delete(oracleId) {
      const prefix = detailPrefix(oracleId);
      if (!cache.has(prefix)) cache.set(prefix, await readJson(resolve(detailsRoot, `${prefix}.json`), {}));
      delete cache.get(prefix)[oracleId];
      touched.add(prefix);
    },
    async write() {
      for (const prefix of [...touched].sort()) {
        const shard = cache.get(prefix) || {};
        await writeJson(resolve(detailsRoot, `${prefix}.json`), Object.fromEntries(Object.entries(shard).sort(([left], [right]) => left.localeCompare(right))));
      }
    },
  };
}

async function migrateLegacy(priceIndex, legacyBook, shards) {
  for (const [oracleId, entry] of Object.entries(legacyBook?.cards || {})) {
    if (priceIndex.prices[oracleId]) continue;
    const checkedAt = entry.checked_at || entry.attempted_at || legacyBook.generated_at || new Date().toISOString();
    const status = entry.status === 'available' ? 'a' : entry.status === 'stale' ? 's' : 'u';
    const cents = priceToCents(entry.price_brl);
    priceIndex.prices[oracleId] = [cents, status, timestampSeconds(checkedAt)];
    await shards.set(oracleId, entry);
  }
}

async function removeBlockedPlaceholders(priceIndex, legacyBook, shards) {
  let removed = 0;
  for (const [oracleId, tuple] of Object.entries(priceIndex.prices || {})) {
    if (tuple?.[priceTuple.status] !== 'u') continue;
    const detail = await shards.get(oracleId);
    if (!/^HTTP\s+(403|429)\b/.test(String(detail?.last_error || ''))) continue;
    delete priceIndex.prices[oracleId];
    delete legacyBook.cards?.[oracleId];
    await shards.delete(oracleId);
    removed += 1;
  }
  if (removed) console.log(`${removed} bloqueios antigos foram removidos da cobertura para nova tentativa.`);
}

function targetCards(catalog) {
  const targets = new Map();
  for (const card of catalog.cards || []) targets.set(card[catalogTuple.oracleId], { oracleId: card[catalogTuple.oracleId], name: card[catalogTuple.name] });
  for (const [oracleId, name] of catalog.banlist_targets || []) targets.set(oracleId, { oracleId, name });
  return [...targets.values()].sort((left, right) => normalizeName(left.name).localeCompare(normalizeName(right.name), 'pt-BR'));
}

export function selectBatch(targets, prices, limit) {
  const missing = targets.filter((card) => !prices[card.oracleId]);
  if (missing.length) return { mode: 'bootstrap', cards: missing.slice(0, limit), missing: missing.length };
  const oldest = [...targets].sort((left, right) => Number(prices[left.oracleId]?.[priceTuple.checkedAt] || 0) - Number(prices[right.oracleId]?.[priceTuple.checkedAt] || 0));
  return { mode: 'maintenance', cards: oldest.slice(0, limit), missing: 0 };
}

export function selectPriorityCard(targets, cardName) {
  const expected = normalizeName(cardName);
  return targets.find((card) => normalizeName(card.name) === expected || normalizeName(ligaMagicLookupName(card.name)) === expected) || null;
}

const zeroCostBasicLandNames = new Set([
  'plains', 'island', 'swamp', 'mountain', 'forest', 'wastes',
  'snow covered plains', 'snow covered island', 'snow covered swamp',
  'snow covered mountain', 'snow covered forest',
]);

export function publishedDeckPriorityCards(targets, prices, publishedCards) {
  const targetByName = new Map();
  for (const target of targets) {
    targetByName.set(normalizeName(target.name), target);
    targetByName.set(normalizeName(ligaMagicLookupName(target.name)), target);
  }

  const priorities = new Map();
  for (const value of Array.isArray(publishedCards) ? publishedCards : []) {
    const name = Array.isArray(value) ? value[0] : value?.name;
    const publishedAt = Array.isArray(value) ? value[1] : value?.published_at;
    const normalized = normalizeName(ligaMagicLookupName(name));
    if (!normalized || zeroCostBasicLandNames.has(normalized)) continue;
    const target = targetByName.get(normalized);
    if (!target) continue;
    const publicationMilliseconds = Date.parse(publishedAt || '');
    if (!Number.isFinite(publicationMilliseconds)) continue;
    const publicationSeconds = Math.ceil(publicationMilliseconds / 1000);
    const checkedAt = Number(prices[target.oracleId]?.[priceTuple.checkedAt] || 0);
    if (checkedAt >= publicationSeconds) continue;
    const previous = priorities.get(target.oracleId);
    if (!previous || publicationSeconds > previous.publicationSeconds) {
      priorities.set(target.oracleId, { ...target, publicationSeconds });
    }
  }

  return [...priorities.values()]
    .sort((left, right) => right.publicationSeconds - left.publicationSeconds || normalizeName(left.name).localeCompare(normalizeName(right.name), 'pt-BR'))
    .map(({ publicationSeconds: _publicationSeconds, ...card }) => card);
}

export function prependPublishedDeckPriorities(selection, priorityCards, limit) {
  const cards = [];
  const seen = new Set();
  const regularCards = selection.cards || [];
  const priorityLimit = regularCards.length && limit > 1 ? Math.max(1, Math.floor(limit * 0.8)) : limit;
  const append = (card) => {
    if (!card || seen.has(card.oracleId) || cards.length >= limit) return;
    seen.add(card.oracleId);
    cards.push(card);
  };
  for (const card of priorityCards) {
    if (cards.length >= priorityLimit) break;
    append(card);
  }
  const priorityCount = cards.length;
  for (const card of regularCards) append(card);
  return { ...selection, cards, priorityCount };
}

export async function fetchPublishedDeckPriorities(url = publishedDecksUrl, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(url, {
      headers: jsonHeaders,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    return Array.isArray(payload?.cards) ? payload.cards : [];
  } catch (error) {
    console.warn(`Prioridade dos decks publicados indisponível; a fila normal será mantida (${error instanceof Error ? error.message : 'falha desconhecida'}).`);
    return [];
  }
}

export function requestDelayMs(random = Math.random) {
  const sample = Math.max(0, Math.min(1, Number(random()) || 0));
  return Math.round(defaultDelayMs + sample * (maximumDelayMs - defaultDelayMs));
}

export function challengeCooldownDurationMs(blockCount = 1) {
  const count = Math.max(1, Math.floor(Number(blockCount) || 1));
  const multiplier = 2 ** Math.min(10, count - 1);
  return Math.min(challengeCooldownMaxMs, challengeCooldownBaseMs * multiplier);
}

export function upgradeLegacyChallengeCooldown(priceIndex, now = Date.now()) {
  if (!priceIndex?.cooldown_until || priceIndex.cooldown_reason) return false;
  const currentUntil = Date.parse(priceIndex.cooldown_until);
  if (!Number.isFinite(currentUntil) || currentUntil <= now) return false;
  const blockCount = Math.max(1, Number(priceIndex.challenge_block_count) || 1);
  priceIndex.challenge_block_count = blockCount;
  priceIndex.cooldown_reason = 'cloudflare_challenge';
  priceIndex.last_blocked_at ||= priceIndex.last_batch_at || new Date(now).toISOString();
  priceIndex.cooldown_until = new Date(Math.max(currentUntil, now + challengeCooldownDurationMs(blockCount))).toISOString();
  return true;
}

export function isDeterministicFailure(statusCode, message = '') {
  return !statusCode && /lista de impressões não foi encontrada/i.test(String(message));
}

function coverageFor(targets, prices, mode) {
  const values = targets.map((card) => prices[card.oracleId]).filter(Boolean);
  const attempted = values.length;
  const remaining = Math.max(0, targets.length - attempted);
  const days = remaining / bootstrapCardsPerDayEstimate;
  return {
    target_count: targets.length,
    attempted_count: attempted,
    confirmed_count: values.filter((entry) => entry[priceTuple.status] === 'a').length,
    unavailable_count: values.filter((entry) => entry[priceTuple.status] === 'u').length,
    stale_count: values.filter((entry) => entry[priceTuple.status] === 's').length,
    percent: targets.length ? Number(((attempted / targets.length) * 100).toFixed(2)) : 0,
    estimated_completion_at: mode === 'bootstrap' && remaining ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : null,
  };
}

async function collectPrice(card, previousEntry, throttle, deadline) {
  const lookupName = ligaMagicLookupName(card.name);
  let sourceUrl = ligaMagicUrl(card.name);
  try {
    if (!await throttle()) return { entry: null, stopped: true };
    let html = await fetchWithRetry(sourceUrl, { headers: requestHeaders, expect: 'text', stopOnBlock: true, deadline });
    let cheapest;
    try {
      cheapest = extractCheapestNormalPrinting(html, lookupName);
    } catch (error) {
      const resolvedUrl = extractLigaMagicResultUrl(html, lookupName);
      if (!resolvedUrl || resolvedUrl === sourceUrl) throw error;
      sourceUrl = resolvedUrl;
      if (!await throttle()) return { entry: null, stopped: true };
      html = await fetchWithRetry(sourceUrl, { headers: requestHeaders, expect: 'text', stopOnBlock: true, deadline });
      cheapest = extractCheapestNormalPrinting(html, lookupName);
    }
    const checkedAt = new Date().toISOString();
    if (!cheapest) return { entry: { status: 'unavailable', name: card.name, price_brl: null, finish: 'normal', condition: 'NM', source_url: sourceUrl, checked_at: checkedAt }, statusCode: null };
    return {
      entry: {
        status: 'available', name: card.name, price_brl: cheapest.price, finish: 'normal', condition: 'NM',
        printing_name: cheapest.printingName, printing_code: cheapest.printingCode, collector_number: cheapest.collectorNumber,
        source_url: sourceUrl, checked_at: checkedAt,
      },
      statusCode: null,
    };
  } catch (error) {
    if (error?.code === 'RUN_DEADLINE') return { entry: null, stopped: true };
    const message = error instanceof Error ? error.message : 'Falha desconhecida';
    const statusCode = Number(error?.status || message.match(/HTTP\s+(\d+)/)?.[1]) || null;
    const cloudflareChallenge = Boolean(error?.cloudflareChallenge);
    if (previousEntry?.price_brl) return { entry: { ...previousEntry, status: 'stale', name: card.name, source_url: sourceUrl, attempted_at: new Date().toISOString(), last_error: message }, statusCode, cloudflareChallenge };
    return { entry: null, statusCode, error: message, cloudflareChallenge };
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const previousCatalog = await readJson(catalogPath, null);
  const catalog = options.repairCatalogPrices
    ? await repairCatalogPrices(previousCatalog)
    : await refreshCatalog(previousCatalog, { force: options.refreshCatalog });
  const priceIndex = await readJson(priceIndexPath, emptyPriceIndex());
  priceIndex.prices ||= {};
  priceIndex.failures ||= {};
  const legacyBook = await readJson(legacyPath, { cards: {} });
  const shards = await createShardStore();
  await migrateLegacy(priceIndex, legacyBook, shards);
  await removeBlockedPlaceholders(priceIndex, legacyBook, shards);
  const targets = targetCards(catalog);
  let selection = selectBatch(targets, priceIndex.prices, options.limit);
  if (selection.mode === 'maintenance') {
    selection = selectBatch(targets, priceIndex.prices, Math.min(options.limit, maintenanceLimit));
  }
  const lastBatchAt = Date.parse(priceIndex.last_batch_at || '');
  const maintenanceDue = options.force || !Number.isFinite(lastBatchAt) || Date.now() - lastBatchAt >= maintenanceIntervalMs;
  if (options.cardName) {
    const priorityCard = selectPriorityCard(targets, options.cardName);
    if (!priorityCard) throw new Error(`Carta prioritária não encontrada no catálogo: ${options.cardName}`);
    selection = { mode: 'priority', cards: [priorityCard], missing: selection.missing, priorityCount: 1 };
  } else if (!options.prepareOnly) {
    const publishedCards = await fetchPublishedDeckPriorities();
    const priorityCards = publishedDeckPriorityCards(targets, priceIndex.prices, publishedCards);
    const regularSelection = selection.mode === 'maintenance' && !maintenanceDue
      ? { ...selection, cards: [] }
      : selection;
    selection = prependPublishedDeckPriorities(regularSelection, priorityCards, options.limit);
  }
  selection.priorityCount ||= 0;
  const legacyCooldownUpgraded = upgradeLegacyChallengeCooldown(priceIndex);
  const cooldownUntil = Date.parse(priceIndex.cooldown_until || '');
  const cooldownActive = Number.isFinite(cooldownUntil) && Date.now() < cooldownUntil;

  if (options.dryRun) {
    console.log(JSON.stringify({ mode: selection.mode, selected: selection.cards.length, published_deck_priority: selection.priorityCount, missing: selection.missing, target_count: targets.length, maintenance_due: maintenanceDue, cooldown_active: cooldownActive, max_run_minutes: maximumRunMs / 60_000, delay_ms: [defaultDelayMs, maximumDelayMs] }, null, 2));
    return;
  }

  if (options.prepareOnly) {
    priceIndex.mode = selection.mode;
    priceIndex.coverage = coverageFor(targets, priceIndex.prices, selection.mode);
    priceIndex.generated_at = new Date().toISOString();
    priceIndex.usd_brl = catalog.usd_brl || priceIndex.usd_brl || null;
    legacyBook.usd_brl = catalog.usd_brl || legacyBook.usd_brl || null;
    await Promise.all([writeJson(catalogPath, catalog), writeJson(priceIndexPath, priceIndex), writeJson(legacyPath, legacyBook), shards.write()]);
    console.log(`Catálogo preparado com ${catalog.cards.length} cartas e ${priceIndex.coverage.attempted_count} preços migrados.`);
    return;
  }

  if (cooldownActive) {
    console.log(`Coleta pausada até ${priceIndex.cooldown_until} após bloqueios consecutivos da LigaMagic.`);
    const writes = [];
    if (JSON.stringify(catalog) !== JSON.stringify(previousCatalog)) writes.push(writeJson(catalogPath, catalog));
    if (legacyCooldownUpgraded) writes.push(writeJson(priceIndexPath, priceIndex));
    if (writes.length) await Promise.all(writes);
    return;
  }
  if (priceIndex.cooldown_until) priceIndex.cooldown_until = null;

  if (selection.mode === 'maintenance' && !maintenanceDue && selection.priorityCount === 0) {
    console.log(`A manutenção ainda está dentro da janela de ${Math.round(maintenanceIntervalMs / 3_600_000)} horas; nenhum lote foi iniciado.`);
    if (JSON.stringify(catalog) !== JSON.stringify(previousCatalog)) await writeJson(catalogPath, catalog);
    return;
  }

  let nextRequestAt = 0;
  const deadline = Date.now() + maximumRunMs;
  const throttle = async () => {
    const wait = Math.max(0, nextRequestAt - Date.now());
    if (Date.now() + wait >= deadline) return false;
    if (wait) await sleep(wait);
    if (Date.now() >= deadline) return false;
    nextRequestAt = Date.now() + requestDelayMs();
    return true;
  };
  const banlistIds = new Set((catalog.banlist_targets || []).map(([oracleId]) => oracleId));
  let consecutiveBlocks = 0;
  let processed = 0;
  let requested = 0;
  let stateChanged = false;
  if (selection.priorityCount) console.log(`${selection.priorityCount} cartas de decks publicados foram antecipadas neste lote.`);
  console.log(`Modo ${selection.mode}: consultando até ${selection.cards.length} cartas por no máximo ${Math.round(maximumRunMs / 60_000)} minutos, com intervalo de ${defaultDelayMs}–${maximumDelayMs} ms.`);

  for (const card of selection.cards) {
    if (Date.now() >= deadline) {
      console.log('Limite de 50 minutos atingido; encerrando o lote antes de iniciar outra consulta.');
      break;
    }
    const previousEntry = await shards.get(card.oracleId);
    const { entry, statusCode, error, stopped, cloudflareChallenge } = await collectPrice(card, previousEntry, throttle, deadline);
    if (stopped) {
      console.log('Limite de 50 minutos atingido durante a espera; encerrando o lote com segurança.');
      break;
    }
    requested += 1;
    if (cloudflareChallenge) {
      const blockCount = Math.max(0, Number(priceIndex.challenge_block_count) || 0) + 1;
      const cooldownMs = challengeCooldownDurationMs(blockCount);
      const blockedAt = new Date().toISOString();
      priceIndex.challenge_block_count = blockCount;
      priceIndex.cooldown_reason = 'cloudflare_challenge';
      priceIndex.last_blocked_at = blockedAt;
      priceIndex.cooldown_until = new Date(Date.now() + cooldownMs).toISOString();
      stateChanged = true;
      console.warn(`Desafio do Cloudflare detectado na primeira resposta; nenhuma nova consulta será feita antes de ${priceIndex.cooldown_until}.`);
      break;
    } else if (entry) {
      if (priceIndex.challenge_block_count || priceIndex.cooldown_reason || priceIndex.last_blocked_at) {
        delete priceIndex.challenge_block_count;
        delete priceIndex.cooldown_reason;
        delete priceIndex.last_blocked_at;
      }
      const checkedAt = entry.checked_at || entry.attempted_at || new Date().toISOString();
      const status = entry.status === 'available' ? 'a' : entry.status === 'stale' ? 's' : 'u';
      const cents = priceToCents(entry.price_brl);
      priceIndex.prices[card.oracleId] = [cents, status, timestampSeconds(checkedAt)];
      await shards.set(card.oracleId, entry);
      if (banlistIds.has(card.oracleId)) legacyBook.cards[card.oracleId] = entry;
      delete priceIndex.failures[card.oracleId];
      processed += 1;
      stateChanged = true;
      const amount = cents !== null ? `R$ ${(cents / 100).toFixed(2)}` : entry.status;
      console.log(`[${requested}/${selection.cards.length}] ${card.name}: ${amount}`);
    } else if (isDeterministicFailure(statusCode, error)) {
      const failure = priceIndex.failures[card.oracleId] || { count: 0 };
      const count = Number(failure.count || 0) + 1;
      const attemptedAt = new Date().toISOString();
      priceIndex.failures[card.oracleId] = { count, attempted_at: attemptedAt, error: String(error || 'Falha determinística') };
      stateChanged = true;
      if (count >= deterministicFailureLimit) {
        const unavailableEntry = {
          status: 'unavailable', name: card.name, price_brl: null, finish: 'normal', condition: 'NM',
          source_url: ligaMagicUrl(card.name), checked_at: attemptedAt,
          last_error: String(error || 'Sem impressões reconhecidas'), attempts: count,
        };
        priceIndex.prices[card.oracleId] = [null, 'u', timestampSeconds(attemptedAt)];
        await shards.set(card.oracleId, unavailableEntry);
        if (banlistIds.has(card.oracleId)) legacyBook.cards[card.oracleId] = unavailableEntry;
        delete priceIndex.failures[card.oracleId];
        processed += 1;
        console.warn(`[${requested}/${selection.cards.length}] ${card.name}: marcada como indisponível após ${count} tentativas determinísticas.`);
      } else {
        console.warn(`[${requested}/${selection.cards.length}] ${card.name}: falha determinística ${count}/${deterministicFailureLimit}; será tentada mais uma vez.`);
      }
    } else {
      console.warn(`[${requested}/${selection.cards.length}] ${card.name}: consulta não registrada (${error || 'falha temporária'}).`);
    }

    consecutiveBlocks = [403, 429].includes(statusCode) ? consecutiveBlocks + 1 : 0;
    if (consecutiveBlocks >= 2) {
      priceIndex.cooldown_until = new Date(Date.now() + blockCooldownMs).toISOString();
      priceIndex.cooldown_reason = 'rate_limit';
      priceIndex.last_blocked_at = new Date().toISOString();
      stateChanged = true;
      console.warn(`Circuito de segurança acionado após dois bloqueios consecutivos; coleta pausada até ${priceIndex.cooldown_until}.`);
      break;
    }
  }

  const nextSelection = selectBatch(targets, priceIndex.prices, 1);
  const now = new Date().toISOString();
  priceIndex.mode = nextSelection.mode;
  priceIndex.generated_at = now;
  priceIndex.usd_brl = catalog.usd_brl || priceIndex.usd_brl || null;
  if (requested) priceIndex.last_batch_at = now;
  priceIndex.coverage = coverageFor(targets, priceIndex.prices, nextSelection.mode);
  legacyBook.schema_version = legacyBook.schema_version || 1;
  legacyBook.source = legacyBook.source || priceIndex.source;
  legacyBook.refresh_interval_hours = 160 * 24;
  legacyBook.generated_at = now;
  legacyBook.usd_brl = catalog.usd_brl || legacyBook.usd_brl || null;
  const legacyValues = Object.values(legacyBook.cards || {});
  legacyBook.summary = {
    available: legacyValues.filter((entry) => entry.status === 'available').length,
    unavailable: legacyValues.filter((entry) => entry.status === 'unavailable').length,
    stale: legacyValues.filter((entry) => entry.status === 'stale').length,
  };
  priceIndex.prices = Object.fromEntries(Object.entries(priceIndex.prices).sort(([left], [right]) => left.localeCompare(right)));
  priceIndex.failures = Object.fromEntries(Object.entries(priceIndex.failures).sort(([left], [right]) => left.localeCompare(right)));
  legacyBook.cards = Object.fromEntries(Object.entries(legacyBook.cards || {}).sort(([left], [right]) => left.localeCompare(right)));

  if (stateChanged || requested || JSON.stringify(catalog) !== JSON.stringify(previousCatalog)) {
    await Promise.all([writeJson(catalogPath, catalog), writeJson(priceIndexPath, priceIndex), writeJson(legacyPath, legacyBook), shards.write()]);
  }
  if (!processed) console.warn('Nenhum preço foi registrado neste lote; falhas e proteções ainda foram preservadas.');
  console.log(`Lote concluído: ${processed} cartas registradas em ${requested} consultas. Cobertura ${priceIndex.coverage.attempted_count}/${priceIndex.coverage.target_count} (${priceIndex.coverage.percent}%).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  });
}
