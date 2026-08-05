#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultOutput = resolve(projectRoot, 'data', 'ligamagic-prices.json');
const refreshIntervalMs = 48 * 60 * 60 * 1000;
const requestDelayMs = Math.max(1500, Number(process.env.LIGAMAGIC_REQUEST_DELAY_MS || 3000));
const sourceName = 'LigaMagic';
const sourceHomepage = 'https://www.ligamagic.com.br/';
const scryfallQuery = '(banned:standard OR banned:pioneer OR banned:modern OR banned:legacy OR banned:commander OR banned:duel OR banned:pauper) -set:sunf -set:unf';
const requestHeaders = {
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  'User-Agent': 'Playgroup-da-Amizade/1.0 (personal use; source: LigaMagic; https://codice-dos-banidos.igorbarazzetti.chatgpt.site)',
};
const scryfallHeaders = {
  Accept: 'application/json',
  'User-Agent': 'Playgroup-da-Amizade/1.0 (price cache refresh; https://github.com/igorbarazzetti/Magic---Playgroup-Ban-List)',
};

function parseOptions(argv) {
  const options = { force: false, limit: null, output: defaultOutput };
  argv.forEach((argument) => {
    if (argument === '--force') options.force = true;
    if (argument.startsWith('--limit=')) options.limit = Number(argument.slice(8));
    if (argument.startsWith('--output=')) options.output = resolve(projectRoot, argument.slice(9));
  });
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

function ligaMagicUrl(cardName) {
  return `https://www.ligamagic.com.br/?view=cards/card&card=${encodeURIComponent(cardName)}`;
}

function parsePrice(value) {
  const amount = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function extractCheapestNormalPrinting(html) {
  const match = html.match(/var\s+cards_editions\s*=\s*(\[[\s\S]*?\]);/i);
  if (!match) throw new Error('A lista de impressões não foi encontrada na página.');
  const editions = JSON.parse(match[1]);
  const candidates = editions
    .map((edition) => ({
      price: parsePrice(edition?.price?.['0']?.p),
      printingName: decodeHtml(edition?.name || ''),
      printingCode: String(edition?.code || '').toUpperCase(),
      collectorNumber: String(edition?.num || ''),
    }))
    .filter((edition) => edition.price !== null)
    .sort((left, right) => left.price - right.price);
  return candidates[0] || null;
}

async function readPriceBook(path) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : { cards: {} };
  } catch (error) {
    if (error?.code === 'ENOENT') return { cards: {} };
    throw error;
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
}

async function sleep(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchWithRetry(url, headers) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      const status = Number(String(error?.message || '').match(/HTTP\s+(\d+)/)?.[1]);
      // Uma página inexistente não se recupera com novas tentativas. Repetimos
      // somente indisponibilidades transitórias para não alongar a coleta inteira.
      const retriable = !Number.isFinite(status) || status === 408 || status === 429 || status >= 500;
      if (!retriable) break;
      if (attempt < 2) await sleep(2000 * (attempt + 1));
    }
  }
  throw lastError;
}

async function fetchBanlistCards() {
  const cards = [];
  let nextUrl = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(scryfallQuery)}&unique=cards&order=name`;
  while (nextUrl) {
    const response = await fetchWithRetry(nextUrl, scryfallHeaders);
    const payload = await response.json();
    cards.push(...(payload.data || []));
    nextUrl = payload.has_more && payload.next_page ? payload.next_page : '';
    if (nextUrl) await sleep(120);
  }
  const unique = new Map();
  cards.forEach((card) => {
    const oracleId = card.oracle_id || card.id;
    if (!unique.has(oracleId)) unique.set(oracleId, card);
  });
  return [...unique.values()].sort((left, right) => normalizeName(left.name).localeCompare(normalizeName(right.name), 'pt-BR'));
}

async function collectPrice(card, previousEntry, throttle) {
  const sourceUrl = ligaMagicUrl(card.name);
  try {
    await throttle();
    const response = await fetchWithRetry(sourceUrl, requestHeaders);
    const cheapest = extractCheapestNormalPrinting(await response.text());
    const checkedAt = new Date().toISOString();
    if (!cheapest) {
      return {
        status: 'unavailable',
        name: card.name,
        price_brl: null,
        finish: 'normal',
        condition: 'NM',
        source_url: sourceUrl,
        checked_at: checkedAt,
      };
    }
    return {
      status: 'available',
      name: card.name,
      price_brl: cheapest.price,
      finish: 'normal',
      condition: 'NM',
      printing_name: cheapest.printingName,
      printing_code: cheapest.printingCode,
      collector_number: cheapest.collectorNumber,
      source_url: sourceUrl,
      checked_at: checkedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha desconhecida';
    if (previousEntry?.price_brl) {
      return { ...previousEntry, status: 'stale', name: card.name, source_url: sourceUrl, attempted_at: new Date().toISOString(), last_error: message };
    }
    return {
      status: 'unavailable',
      name: card.name,
      price_brl: null,
      finish: 'normal',
      condition: 'NM',
      source_url: sourceUrl,
      attempted_at: new Date().toISOString(),
      last_error: message,
    };
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const previousBook = await readPriceBook(options.output);
  const previousUpdate = Date.parse(previousBook.generated_at || '');
  if (!options.force && !options.limit && Number.isFinite(previousUpdate) && Date.now() - previousUpdate < refreshIntervalMs) {
    console.log('Os preços ainda estão dentro da janela de 48 horas; nada para atualizar.');
    return;
  }

  const cards = await fetchBanlistCards();
  const selectedCards = Number.isFinite(options.limit) && options.limit > 0 ? cards.slice(0, options.limit) : cards;
  const nextCards = options.limit ? { ...(previousBook.cards || {}) } : {};
  let nextRequestAt = 0;
  const throttle = async () => {
    const wait = Math.max(0, nextRequestAt - Date.now());
    if (wait) await sleep(wait);
    nextRequestAt = Date.now() + requestDelayMs;
  };

  console.log(`Consultando ${selectedCards.length} carta(s) com intervalo mínimo de ${requestDelayMs} ms.`);
  for (const [index, card] of selectedCards.entries()) {
    const oracleId = card.oracle_id || card.id;
    nextCards[oracleId] = await collectPrice(card, previousBook.cards?.[oracleId], throttle);
    const result = nextCards[oracleId];
    const amount = result.price_brl ? `R$ ${result.price_brl.toFixed(2)}` : result.status;
    console.log(`[${index + 1}/${selectedCards.length}] ${card.name}: ${amount}`);
  }

  const allEntries = Object.values(nextCards);
  const book = {
    schema_version: 1,
    source: {
      name: sourceName,
      homepage: sourceHomepage,
      attribution: 'Preços consultados na LigaMagic para uso pessoal do playgroup.',
    },
    refresh_interval_hours: 48,
    generated_at: new Date().toISOString(),
    summary: {
      available: allEntries.filter((entry) => entry.status === 'available').length,
      unavailable: allEntries.filter((entry) => entry.status === 'unavailable').length,
      stale: allEntries.filter((entry) => entry.status === 'stale').length,
    },
    cards: Object.fromEntries(Object.entries(nextCards).sort(([left], [right]) => left.localeCompare(right))),
  };
  await writeJson(options.output, book);
  console.log(`Arquivo de preços atualizado: ${options.output}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
