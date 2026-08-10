const site = {
  playgroupName: 'Formatinho',
  playgroupInitials: 'PA',
  pageTitle: 'Códice do Formatinho',
  pageSubtitle: 'A banlist oficial do nosso formato',
  logoPath: './formatinho-logo.png?v=4',
  scryfallQuery: '(banned:standard OR banned:pioneer OR banned:modern OR banned:legacy OR banned:commander OR banned:duel OR banned:pauper) -set:sunf -set:unf',
  catalogQuery: '(game:paper) usd<20.00 prefer:best',
  backgroundCards: ['Teferi, Hero of Dominaria', "Elspeth, Sun's Champion", 'Chandra, Torch of Defiance', 'Nissa, Who Shakes the World'],
  desktopBackgrounds: [
    { name: 'Ajani', image: './hero-desktop/ajani-1920.jpg', credit: 'ilustração de personagem · uso pessoal' },
    { name: 'Chandra Nalaar', image: './hero-desktop/chandra-nalaar-1920.jpg', credit: 'ilustração de personagem · uso pessoal' },
    { name: 'Garruk', image: './hero-desktop/garruk-1920.jpg', credit: 'ilustração de personagem · uso pessoal' },
    { name: 'Jace Beleren', image: './hero-desktop/jace-beleren-1920.jpg', credit: 'ilustração de personagem · uso pessoal' },
    { name: 'Liliana Vess', image: './hero-desktop/liliana-vess-1920.jpg', credit: 'ilustração de personagem · uso pessoal' },
  ],
  backgroundInterval: 14000,
};

const formats = [
  { key: 'standard', label: 'Standard', short: 'STD', color: '#e6d6b9' },
  { key: 'pioneer', label: 'Pioneer', short: 'PIO', color: '#6e9bc2' },
  { key: 'modern', label: 'Modern', short: 'MOD', color: '#d87955' },
  { key: 'legacy', label: 'Legacy', short: 'LEG', color: '#9f79bc' },
  { key: 'commander', label: 'Commander', short: 'EDH', color: '#7db26d' },
  { key: 'duel', label: 'Duel Commander', short: 'DC', color: '#d4b15d' },
  { key: 'pauper', label: 'Pauper', short: 'PAU', color: '#9b9b95' },
];

const deckFormats = [
  ...formats,
  { key: 'formatinho', label: 'Formatinho', short: 'FMT', color: '#71d8d1', custom: true },
];

const colorFilters = [
  { key: 'W', label: 'Branco' },
  { key: 'U', label: 'Azul' },
  { key: 'B', label: 'Preto' },
  { key: 'R', label: 'Vermelho' },
  { key: 'G', label: 'Verde' },
  { key: 'C', label: 'Incolor' },
];

function createViewState(tab) {
  return {
    tab, cards: [], filtered: [], selectedFormats: new Set(), selectedColors: new Set(), colorMatch: 'exact', query: '', type: '', cmc: '', rarity: '', set: '',
    sort: 'name-asc', view: 'cards', visible: 48, modalCard: null, modalFace: 0, lastFocus: null,
    savedScroll: 0, loadingMore: false, loadToken: 0, rawDetailsReady: false, loaded: false,
    deckFormat: 'formatinho', deckLastFocus: null, maxPrice: 99, showBanned: false,
    oracleMatchKey: '', oracleMatches: null, oracleSearchToken: 0, oracleSearchAbort: null,
    scryfallSearchCards: null, scryfallSearchKey: '', scryfallSearchToken: 0, scryfallSearchAbort: null, scryfallSearchPending: false,
  };
}
const viewStates = { banlist: createViewState('banlist'), catalog: createViewState('catalog') };
let state = viewStates.banlist;
const cacheKey = `codex-banlist-cache:${site.scryfallQuery}`;
const cacheTtl = 1000 * 60 * 60 * 6;
const ligaMagicPriceBookUrl = 'https://raw.githubusercontent.com/igorbarazzetti/Magic---Playgroup-Ban-List/main/data/ligamagic-prices.json';
const repositoryDataBase = 'https://raw.githubusercontent.com/igorbarazzetti/Magic---Playgroup-Ban-List/main/data';
const localDataBase = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? './data' : repositoryDataBase;
const isLocalPreview = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const catalogIndexUrl = isLocalPreview ? `${localDataBase}/catalog/scryfall-index.json` : '/api/catalog/index';
const catalogPriceIndexUrl = isLocalPreview ? `${localDataBase}/ligamagic-catalog-prices.json` : '/api/catalog/prices';
const catalogFallbackUrls = {
  'catalog-index-v1': `${repositoryDataBase}/catalog/scryfall-index.json`,
  'catalog-prices-v1': `${repositoryDataBase}/ligamagic-catalog-prices.json`,
};
let ligaMagicPriceBookPromise;
let catalogIndex;
let catalogPriceIndex;
const catalogHydrationCache = new Map();
const catalogCardById = new Map();
const catalogHydrating = new Set();
const catalogHydrationPromises = new Map();
const catalogDetailShards = new Map();
const catalogOracleSearchCache = new Map();
let catalogHydrationObserver;
let catalogHydrationTimer;
const catalogHydrationQueue = new Map();
let pendingFilterFrame;
let catalogWorker;
let catalogWorkerReady = false;
let catalogWorkerReadyPromise;
let catalogWorkerRequestId = 0;
let catalogFilterToken = 0;
const catalogWorkerRequests = new Map();
const catalogWorkerFilterTimeoutMs = 5000;
const scryfallRequestTimeoutMs = 15000;
const catalogCacheDbName = 'formatinho-catalog-cache-v1';
let catalogCacheDbPromise;
const deckCardCache = new Map();
const savedDeckCache = new Map();
const deckBuilderStorageKey = 'formatinho-deck-builder:v1';
const deckBuilderReturnKey = 'formatinho-deck-builder-return:v1';
const deckBuilderEditStorageKey = 'formatinho-deck-builder-edit:v1';
const deckBuilderEditDraftPrefix = 'formatinho-deck-builder-edit-draft:v1';
let deckBuilder = { version: 1, main: {}, sideboard: {}, updatedAt: 0 };
let deckBuilderEdit = null;
let deckBuilderValidation = null;
let deckBuilderValidationToken = 0;
let deckBuilderValidationTimer;
let deckBuilderWasValid = false;
let pendingValidatedDeck = null;
let validatedDecks = [];
let validatedDecksLoaded = false;
let currentSavedDeck = null;
let savedDeckPriceBook = null;
let deferredInstallPrompt = null;
const $ = (id) => document.getElementById(id);
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const slug = (value = '') => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const colorBit = { W: 1, U: 2, B: 4, R: 8, G: 16 };
const colorsMask = (colors = []) => colors.reduce((mask, color) => mask | (colorBit[color] || 0), 0);
function parseCardSearch(value = '') {
  const exactPhrases = [...String(value).matchAll(/"([^"]+)"/g)]
    .map((match) => slug(match[1]).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const freeText = slug(String(value).replace(/"[^"]*"/g, ' ').replace(/"/g, ' ')).replace(/\s+/g, ' ').trim();
  return { exactPhrases, freeText };
}
function isScryfallSyntaxSearch(value = '') {
  const query = String(value).trim();
  return /(?:^|\s)-?[a-z][\w-]*:|(?:^|\s)[a-z][\w-]*(?:<=|>=|!=|=|<|>)/i.test(query);
}
function sourceCards() { return state.scryfallSearchCards || state.cards; }
function setCatalogPhase(phase) {
  if (document.body) document.body.dataset.catalogPhase = phase;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = scryfallRequestTimeoutMs) {
  const controller = new AbortController();
  const externalSignal = options.signal;
  const abortFromExternalSignal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromExternalSignal();
  else externalSignal?.addEventListener('abort', abortFromExternalSignal, { once: true });
  const timeout = setTimeout(() => controller.abort(new DOMException('Tempo limite excedido', 'TimeoutError')), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromExternalSignal);
  }
}
function colorMatchHint(mode = state.colorMatch) {
  return {
    exact: 'Mostra apenas cartas cuja identidade é exatamente as cores selecionadas.',
    includes: 'Mostra cartas que incluam pelo menos uma das cores selecionadas.',
    minimum: 'Mostra cartas que tenham todas as cores selecionadas, mesmo que tenham outras cores.',
  }[mode] || 'Escolha como comparar as cores selecionadas.';
}
function selectedColorCriteria() {
  const selected = [...state.selectedColors];
  return {
    selected,
    mask: colorsMask(selected),
    selectedColorless: selected.includes('C'),
    selectedColored: selected.filter((color) => color !== 'C'),
  };
}

function colorIdentityMatches(cardColors = [], criteria = selectedColorCriteria()) {
  if (!criteria.selected.length) return true;
  const { selected, selectedColorless, selectedColored, mask } = criteria;
  const isColorless = cardColors.length === 0;
  if (state.colorMatch === 'exact') {
    if (selectedColorless) return selected.length === 1 && isColorless;
    return !isColorless && colorsMask(cardColors) === mask;
  }
  if (state.colorMatch === 'minimum') {
    if (selectedColorless) return selected.length === 1 && isColorless;
    return selectedColored.every((color) => cardColors.includes(color));
  }
  return (selectedColorless && isColorless) || selectedColored.some((color) => cardColors.includes(color));
}
const nameCollator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
const sortableName = (value = '') => slug(value).replace(/^[^a-z0-9]+/, '');
const compareNames = (a, b) => nameCollator.compare(a?._sortName || sortableName(a?.name), b?._sortName || sortableName(b?.name));

function prepareCard(card) {
  if (!card) return card;
  card._sortName = sortableName(card.name);
  card._typeLineNormalized = slug(card.type_line || '');
  card._searchable = slug([card.name, card.type_line, card.oracle_text, card.artist, card.set_name].filter(Boolean).join(' '));
  card._oracleText = slug([card.oracle_text, ...(card.card_faces || []).map((face) => face.oracle_text)].filter(Boolean).join(' ')).replace(/\s+/g, ' ');
  card._colorMask = colorsMask(card.color_identity || []);
  card._cmcValue = Number(card.cmc || 0);
  card._catalogPriceReady = false;
  return card;
}

function cardFrameClass(card) {
  const line = slug(card?.type_line || '');
  if (!line) return 'other';
  if (line.includes('instant')) return 'instant';
  if (line.includes('sorcery')) return 'sorcery';
  if (line.includes('land')) return 'land';
  if (line.includes('planeswalker')) return 'planeswalker';
  if (line.includes('artifact')) return 'artifact';
  if (line.includes('enchantment')) return 'enchantment';
  if (line.includes('battle')) return 'battle';
  if (line.includes('creature')) return 'creature';
  return 'other';
}

function cardRarityClass(card) {
  const rarity = (card?.rarity || 'common').toLowerCase();
  return ['common', 'uncommon', 'rare', 'mythic', 'special'].includes(rarity) ? rarity : 'special';
}

function isLegendaryCard(card) {
  return (card?._typeLineNormalized || slug(card?.type_line || '')).includes('legendary');
}

function manaSymbolImage(symbol) {
  const safeSymbol = String(symbol || '').toUpperCase().trim();
  const isSimpleMana =
    /^[0-9]$/.test(safeSymbol) ||
    /^(?:[WUBRGC]|P|X|Y|Z|HW|S|Q|T)$/.test(safeSymbol) ||
    safeSymbol.length === 1;
  const url = `https://svgs.scryfall.io/card-symbols/${safeSymbol}.svg`;
  return isSimpleMana
    ? `<img class="mana-symbol mana-symbol--icon" loading="lazy" src="${url}" alt="${safeSymbol}" />`
    : `<span class="mana-symbol mana-symbol--legacy">${escapeHtml(safeSymbol)}</span>`;
}

function setSymbolImage(card) {
  const setCode = String(card?.set || '').toLowerCase();
  if (!setCode) return '';
  return `<img class="card-tile__set-symbol" src="https://svgs.scryfall.io/sets/${setCode}.svg" alt="${escapeHtml(card.set_name || card.set)}" loading="lazy" />`;
}

function setLineMarkup(card) {
  const code = String(card?.set || '').toUpperCase();
  const symbol = setSymbolImage(card);
  const name = escapeHtml(card?.set_name || code || 'Scryfall');
  if (!code) return `<span>${name}</span>`;
  return `${symbol}<span class="set-name">${name}</span><span class="set-code">${escapeHtml(code)}</span>`;
}

function imageFor(card, face = 0, size = 'normal') {
  const source = card.card_faces?.[face] || card;
  return source.image_uris?.[size] || source.image_uris?.normal || card.image_uris?.[size] || card.image_uris?.normal || card.image || makePlaceholder(card.name, card.colors?.[0]);
}

function imageSrcSet(card, face = 0) {
  const source = card.card_faces?.[face] || card;
  const images = source.image_uris || card.image_uris || {};
  return [images.small && `${images.small} 146w`, images.normal && `${images.normal} 488w`, images.large && `${images.large} 672w`].filter(Boolean).join(', ');
}

function makePlaceholder(name, color = '') {
  return '';
}

function normalizeCard(card) {
  const bannedFormats = formats.filter(({ key }) => card.legalities?.[key] === 'banned').map(({ key }) => key);
  const faces = card.card_faces ? card.card_faces.map((face) => ({ ...face })) : [];
  return prepareCard({ ...card, formats: bannedFormats, image: imageFor(card), faces, oracle_id: card.oracle_id || card.id });
}

function dedupeCards(cards) {
  const byOracle = new Map();
  cards.forEach((card) => { const normalized = normalizeCard(card); if (!byOracle.has(normalized.oracle_id)) byOracle.set(normalized.oracle_id, normalized); });
  return [...byOracle.values()].filter((card) => card.formats.length || card.id.startsWith('fallback-'));
}
function dedupeSearchCards(cards) {
  const byOracle = new Map();
  cards.forEach((card) => { const normalized = normalizeCard(card); if (!byOracle.has(normalized.oracle_id)) byOracle.set(normalized.oracle_id, normalized); });
  return [...byOracle.values()];
}

function readCardsCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (!cached || !Array.isArray(cached.cards)) return null;
    return { cards: dedupeCards(cached.cards), savedAt: cached.savedAt || 0, stale: Date.now() - (cached.savedAt || 0) > cacheTtl };
  } catch { return null; }
}

function writeCardsCache(cards) {
  try { localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), cards })); } catch { /* Storage can be unavailable or full. */ }
}

async function fetchBanlistProgressively(onPage) {
  const cards = [];
  let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(site.scryfallQuery)}&unique=cards&order=name`;
  let firstPage = true;
  while (url) {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Scryfall ${response.status}`);
    const payload = await response.json();
    cards.push(...(payload.data || []));
    onPage(dedupeCards(cards), firstPage);
    firstPage = false;
    url = payload.has_more && payload.next_page ? payload.next_page : '';
    if (url) await new Promise((resolve) => setTimeout(resolve, 55));
  }
  return dedupeCards(cards);
}

function readUrl() {
  const params = new URLSearchParams(location.search);
  const requestedTab = params.get('tab') === 'catalog' ? 'catalog' : 'banlist';
  state = viewStates[requestedTab];
  state.query = params.get('q') || '';
  const legacyIdentity = params.get('identity') || '';
  const selectedColors = (params.get('colors') || legacyIdentity).split(',');
  state.selectedColors = new Set(selectedColors.filter((key) => colorFilters.some((color) => color.key === key)));
  state.colorMatch = ['exact', 'includes', 'minimum'].includes(params.get('colorMatch')) ? params.get('colorMatch') : 'exact';
  state.type = params.get('type') || '';
  state.cmc = params.get('cmc') || '';
  state.rarity = params.get('rarity') || '';
  state.set = params.get('set') || '';
  state.sort = params.get('sort') || 'name-asc';
  state.view = params.get('view') === 'list' ? 'list' : 'cards';
  state.selectedFormats = new Set((params.get('formats') || '').split(',').filter((key) => formats.some((format) => format.key === key)));
  state.maxPrice = requestedTab === 'catalog' ? Math.max(0, Math.min(99, Number(params.get('maxPrice') || 99))) : 99;
  state.showBanned = requestedTab === 'catalog' && params.get('banned') === 'show';
  $('searchInput').value = state.query;
  $('typeFilter').value = state.type;
  $('cmcFilter').value = state.cmc;
  $('rarityFilter').value = state.rarity;
  if ($('setFilter')) $('setFilter').value = state.set;
  $('sortFilter').value = state.sort;
  if ($('priceFilter')) $('priceFilter').value = state.maxPrice;
  if ($('priceFilterValue')) $('priceFilterValue').textContent = `R$ ${state.maxPrice}`;
  if ($('showBannedCatalog')) $('showBannedCatalog').checked = state.showBanned;
  if ($('colorMatchMode')) $('colorMatchMode').value = state.colorMatch;
  if ($('colorMatchHint')) $('colorMatchHint').textContent = colorMatchHint();
  if ($('searchClear')) $('searchClear').hidden = !state.query;
  updateCollectionUi();
}

function currentParams({ includeCard = Boolean(state.modalCard) } = {}) {
  const params = new URLSearchParams();
  if (new URLSearchParams(location.search).get('page') === 'decks') params.set('page', 'decks');
  if (state.tab === 'catalog') params.set('tab', 'catalog');
  if (state.query) params.set('q', state.query);
  if (state.selectedFormats.size) params.set('formats', [...state.selectedFormats].join(','));
  if (state.selectedColors.size) params.set('colors', [...state.selectedColors].join(','));
  if (state.selectedColors.size && state.colorMatch !== 'exact') params.set('colorMatch', state.colorMatch);
  if (state.type) params.set('type', state.type);
  if (state.cmc) params.set('cmc', state.cmc);
  if (state.rarity) params.set('rarity', state.rarity);
  if (state.set) params.set('set', state.set);
  if (state.sort !== 'name-asc') params.set('sort', state.sort);
  if (state.view === 'list') params.set('view', 'list');
  if (state.tab === 'catalog' && state.maxPrice !== 99) params.set('maxPrice', String(state.maxPrice));
  if (state.tab === 'catalog' && state.showBanned) params.set('banned', 'show');
  if (includeCard && state.modalCard) params.set('card', state.modalCard.id);
  return params;
}

function syncUrl() {
  const params = currentParams({ includeCard: false });
  history.replaceState(null, '', `${location.pathname}${params.toString() ? `?${params}` : ''}`);
}

function updateCollectionUi() {
  const catalog = state.tab === 'catalog';
  document.querySelectorAll('[data-collection-tab]').forEach((button) => {
    const active = button.dataset.collectionTab === state.tab;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  if ($('collectionWorkspace')) $('collectionWorkspace').setAttribute('aria-labelledby', catalog ? 'catalogTab' : 'banlistTab');
  if ($('archiveEyebrow')) $('archiveEyebrow').textContent = catalog ? 'Biblioteca do Formatinho' : 'Grimório da banlist';
  if ($('archiveTitle')) $('archiveTitle').textContent = catalog ? 'Encontre cartas para o seu deck' : 'Cartas seladas pelo conselho';
  if ($('archiveHint')) $('archiveHint').innerHTML = catalog ? '<span aria-hidden="true">↓</span> Preços reais e estimados em reais' : '<span aria-hidden="true">↓</span> Toque em uma carta para ver os detalhes';
  if ($('catalogPriceGroup')) $('catalogPriceGroup').hidden = !catalog;
  document.querySelectorAll('[data-catalog-sort]').forEach((option) => { option.hidden = !catalog; });
  const formatsOption = $('sortFilter')?.querySelector('option[value="formats-desc"]');
  if (formatsOption) formatsOption.hidden = catalog;
  if (catalog && state.sort === 'formats-desc') state.sort = 'name-asc';
  if ($('sortFilter')) $('sortFilter').value = state.sort;
  if ($('priceFilter')) $('priceFilter').value = state.maxPrice;
  if ($('priceFilterValue')) $('priceFilterValue').textContent = `R$ ${state.maxPrice}`;
  if ($('showBannedCatalog')) $('showBannedCatalog').checked = state.showBanned;
  if ($('modalBackLabel')) $('modalBackLabel').textContent = catalog ? 'Lista de cartas' : 'Banlist';
  document.body.classList.toggle('is-catalog', catalog);
}

function restoreControlsFromState() {
  $('searchInput').value = state.query;
  $('typeFilter').value = state.type;
  $('cmcFilter').value = state.cmc;
  $('rarityFilter').value = state.rarity;
  $('sortFilter').value = state.sort;
  $('searchClear').hidden = !state.query;
  if ($('colorMatchMode')) $('colorMatchMode').value = state.colorMatch;
  if ($('colorMatchHint')) $('colorMatchHint').textContent = colorMatchHint();
  updateCollectionUi();
}

async function switchCollectionTab(tab, { pushHistory = true, restoreScroll = true } = {}) {
  if (!viewStates[tab] || tab === state.tab) return;
  state.savedScroll = scrollY;
  state = viewStates[tab];
  restoreControlsFromState();
  populateSetFilter();
  if (pushHistory) {
    const params = currentParams({ includeCard: false });
    history.pushState(null, '', `${location.pathname}${params.toString() ? `?${params}` : ''}`);
  }
  if (!state.loaded) {
    if (tab === 'catalog') await loadCatalog(); else await loadCards();
  } else {
    $('loadingState').hidden = true;
    $('errorState').hidden = true;
    applyFiltersSync({ allowPendingOracle: true });
    void refreshActiveRemoteFilters(state);
  }
  if (restoreScroll) requestAnimationFrame(() => scrollTo({ top: state.savedScroll, behavior: 'auto' }));
}

function colorsFromMask(mask = 0) {
  return [['W', 1], ['U', 2], ['B', 4], ['R', 8], ['G', 16]].filter(([, bit]) => Number(mask) & bit).map(([color]) => color);
}

function catalogCardFromTuple(tuple) {
  const [id, oracleId, name, mask, type, cmc, rarity, set, usd, bannedFormats] = tuple;
  const labels = { creature: 'Creature', instant: 'Instant', sorcery: 'Sorcery', artifact: 'Artifact', enchantment: 'Enchantment', planeswalker: 'Planeswalker', land: 'Land', battle: 'Battle', other: 'Card' };
  const usdAmount = usd === null || usd === undefined || usd === '' ? null : Number(usd);
  return prepareCard({
    id, oracle_id: oracleId, name, color_identity: colorsFromMask(mask), type_line: labels[type] || 'Card', catalog_type: type,
    cmc, rarity, set, set_name: catalogIndex?.sets?.[set] || String(set || '').toUpperCase(), prices: { usd: Number.isFinite(usdAmount) && usdAmount > 0 ? (usdAmount / 100).toFixed(2) : null },
    formats: bannedFormats ? String(bannedFormats).split(',').filter(Boolean) : [], isCatalogStub: true,
  });
}

function isBasicLandCard(card) {
  const typeLine = slug(card?.type_line || '');
  if (typeLine.includes('basic land') || typeLine.includes('terreno basico')) return true;
  const name = slug(String(card?.name || '').split('//')[0]).trim();
  return new Set(['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes', 'snow covered plains', 'snow covered island', 'snow covered swamp', 'snow covered mountain', 'snow covered forest']).has(name);
}

function resolvedCardPrice(card) {
  if (!card) return null;
  if (isBasicLandCard(card)) return { value: 0, source: 'Regra do Formatinho', estimated: false, stale: false, checkedAt: null };
  const tuple = catalogPriceIndex?.prices?.[card.oracle_id || card.id];
  const ligaCents = tuple?.[0] === null || tuple?.[0] === undefined || tuple?.[0] === '' ? null : Number(tuple[0]);
  if (Number.isFinite(ligaCents) && ligaCents > 0 && ['a', 's'].includes(tuple[1])) {
    return { value: ligaCents / 100, source: 'LigaMagic', estimated: false, stale: tuple[1] === 's', checkedAt: tuple[2] ? new Date(Number(tuple[2]) * 1000).toISOString() : null };
  }
  const ligaEntry = savedDeckPriceBook?.cards?.[card.oracle_id || card.id];
  const ligaPrice = Number(ligaEntry?.price_brl);
  if (['available', 'stale'].includes(ligaEntry?.status) && Number.isFinite(ligaPrice) && ligaPrice > 0) {
    return { value: ligaPrice, source: 'LigaMagic', estimated: false, stale: ligaEntry.status === 'stale', checkedAt: ligaEntry.checked_at || null };
  }
  const rawUsd = card?.prices?.usd;
  const usd = rawUsd === null || rawUsd === undefined || rawUsd === '' ? null : Number(rawUsd);
  const exchange = catalogIndex?.usd_brl || savedDeckPriceBook?.usd_brl || {};
  const rate = Number(exchange.rate);
  return Number.isFinite(usd) && usd > 0 && Number.isFinite(rate) && rate > 0
    ? { value: usd * rate, source: 'Scryfall + PTAX', estimated: true, stale: Boolean(exchange.stale), checkedAt: exchange.as_of || exchange.checked_at || null }
    : null;
}

function effectiveCatalogPrice(card) {
  if (card?._catalogPriceReady && card._catalogPrice) return card._catalogPrice;
  const price = resolvedCardPrice(card);
  if (price) {
    card._catalogPrice = price;
    card._catalogPriceReady = true;
  }
  return price;
}

async function fetchScryfallPages(query, { signal, onPage } = {}) {
  const cards = [];
  let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=cards&order=name`;
  while (url) {
    const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json;q=0.9,*/*;q=0.8' }, signal });
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`Scryfall ${response.status}`);
    const payload = await response.json();
    const pageCards = payload.data || [];
    cards.push(...pageCards);
    onPage?.(pageCards, cards);
    url = payload.has_more && payload.next_page ? payload.next_page : '';
    if (url) await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return cards;
}

function clearScryfallSyntaxSearch() {
  state.scryfallSearchAbort?.abort();
  state.scryfallSearchAbort = null;
  state.scryfallSearchPending = false;
  state.scryfallSearchCards = null;
  state.scryfallSearchKey = '';
}

async function ensureScryfallSyntaxSearch() {
  if (!isScryfallSyntaxSearch(state.query)) {
    clearScryfallSyntaxSearch();
    return false;
  }
  const key = `${state.tab}:${state.query}`;
  if (state.scryfallSearchKey === key && state.scryfallSearchCards && !state.scryfallSearchPending) return true;
  if (state.scryfallSearchKey === key && state.scryfallSearchPending) return true;
  clearScryfallSyntaxSearch();
  const controller = new AbortController();
  const token = ++state.scryfallSearchToken;
  state.scryfallSearchAbort = controller;
  state.scryfallSearchPending = true;
  state.scryfallSearchKey = key;
  state.scryfallSearchCards = [];
  state.loadingMore = true;
  const showBlockingLoader = !state.cards.length;
  if (showBlockingLoader) $('loadingState').hidden = false;
  const scope = state.tab === 'catalog' ? (catalogIndex?.query || site.catalogQuery) : site.scryfallQuery;
  const partialByOracle = new Map();
  try {
    const cards = await fetchScryfallPages(`(${scope}) (${state.query})`, {
      signal: controller.signal,
      onPage: (pageCards) => {
        if (token !== state.scryfallSearchToken || state.scryfallSearchKey !== key) return;
        pageCards.forEach((card) => {
          const normalized = normalizeCard(card);
          if (!partialByOracle.has(normalized.oracle_id) && (state.tab === 'catalog' || normalized.formats.length)) partialByOracle.set(normalized.oracle_id, normalized);
        });
        state.scryfallSearchCards = [...partialByOracle.values()];
        scheduleApplyFilters();
      },
    });
    if (token !== state.scryfallSearchToken || state.scryfallSearchKey !== key) return true;
    state.scryfallSearchCards = state.tab === 'catalog' ? dedupeSearchCards(cards) : dedupeCards(cards);
  } catch (error) {
    if (error?.name === 'AbortError' || token !== state.scryfallSearchToken) return true;
    state.scryfallSearchCards = [];
    showToast('A sintaxe não retornou cartas. Confira a consulta do Scryfall.');
  } finally {
    if (token === state.scryfallSearchToken && state.scryfallSearchKey === key) {
      state.loadingMore = false;
      state.scryfallSearchPending = false;
      state.scryfallSearchAbort = null;
      if (showBlockingLoader) $('loadingState').hidden = true;
      applyFilters();
    }
  }
  return true;
}

function catalogServerFilterSyntax() {
  return [
    state.type && `t:${state.type}`,
    state.cmc && (state.cmc === '6' ? 'mv>=6' : `mv=${state.cmc}`),
    state.rarity && state.rarity !== 'special' && `r:${state.rarity}`,
    state.set && `set:${state.set}`,
  ].filter(Boolean).join(' ');
}

function catalogOracleKey(phrases) {
  return `${phrases.join('|')}::${catalogServerFilterSyntax()}`;
}

async function ensureCatalogOracleMatches() {
  if (state.tab !== 'catalog') return;
  const phrases = parseCardSearch(state.query).exactPhrases;
  const serverFilters = catalogServerFilterSyntax();
  const key = catalogOracleKey(phrases);
  if (!phrases.length) {
    state.oracleSearchAbort?.abort(); state.oracleSearchAbort = null;
    state.oracleMatchKey = ''; state.oracleMatches = null; return;
  }
  if (state.oracleMatchKey === key && state.oracleMatches) return;
  state.oracleSearchAbort?.abort();
  const cached = catalogOracleSearchCache.get(key);
  if (cached) {
    state.oracleMatchKey = key;
    state.oracleMatches = new Set(cached.map((card) => card.oracle_id || card.id));
    cached.forEach((card) => catalogHydrationCache.set(card.id, card));
    return;
  }
  const controller = new AbortController();
  state.oracleSearchAbort = controller;
  const token = ++state.oracleSearchToken;
  const showBlockingLoader = !state.cards.length;
  if (showBlockingLoader) $('loadingState').hidden = false;
  try {
    const phraseQuery = phrases.map((phrase) => `o:"${phrase.replace(/"/g, '\\"')}"`).join(' ');
    const cards = await fetchScryfallPages(`${catalogIndex?.query || '(game:paper) usd<20.00 prefer:best'} ${phraseQuery} ${serverFilters}`, { signal: controller.signal });
    if (token !== state.oracleSearchToken || state.tab !== 'catalog') return;
    catalogOracleSearchCache.set(key, cards);
    if (catalogOracleSearchCache.size > 8) catalogOracleSearchCache.delete(catalogOracleSearchCache.keys().next().value);
    state.oracleMatchKey = key;
    state.oracleMatches = new Set(cards.map((card) => card.oracle_id || card.id));
    cards.forEach((card) => catalogHydrationCache.set(card.id, card));
  } catch (error) {
    if (error?.name === 'AbortError' || token !== state.oracleSearchToken) return;
    if (token !== state.oracleSearchToken || state.tab !== 'catalog') return;
    state.oracleMatchKey = key;
    state.oracleMatches = new Set();
    showToast('Não foi possível consultar o texto das cartas agora.');
  } finally {
    if (token === state.oracleSearchToken) {
      state.oracleSearchAbort = null;
      if (showBlockingLoader) $('loadingState').hidden = true;
    }
  }
}

async function refreshActiveRemoteFilters(targetState = state) {
  try {
    if (await ensureScryfallSyntaxSearch()) return;
    await ensureCatalogOracleMatches();
    if (state === targetState) applyFilters();
  } catch (error) {
    if (state !== targetState) return;
    console.warn('Falha no refinamento remoto; mantendo os filtros locais.', error);
    applyFiltersSync({ allowPendingOracle: true });
  }
}

function cardIdentity(card) {
  const colors = card.color_identity || [];
  return colors.length === 0 ? 'C' : colors.length > 1 ? 'M' : colors[0];
}

function cardTypeMatches(card, type) {
  if (!type) return true;
  if (card.catalog_type) return type === card.catalog_type;
  const line = card._typeLineNormalized || slug(card.type_line);
  if (type === 'creature') return line.includes('creature');
  if (type === 'instant') return line.includes('instant');
  if (type === 'sorcery') return line.includes('sorcery');
  if (type === 'artifact') return line.includes('artifact');
  if (type === 'enchantment') return line.includes('enchantment');
  if (type === 'planeswalker') return line.includes('planeswalker');
  if (type === 'land') return line.includes('land');
  if (type === 'battle') return line.includes('battle');
  return !/(creature|instant|sorcery|artifact|enchantment|planeswalker|land|battle)/.test(line);
}

function rejectCatalogWorkerRequests(error = new Error('Filtro do catálogo reiniciado')) {
  for (const pending of catalogWorkerRequests.values()) {
    clearTimeout(pending.timeout);
    pending.reject(error);
  }
  catalogWorkerRequests.clear();
}

function resetCatalogWorker(error) {
  catalogWorker?.terminate();
  catalogWorker = null;
  catalogWorkerReady = false;
  catalogWorkerReadyPromise = null;
  rejectCatalogWorkerRequests(error);
}

function initializeCatalogWorker() {
  if (catalogWorkerReadyPromise) return catalogWorkerReadyPromise;
  if (!('Worker' in window)) return Promise.resolve(false);
  catalogWorkerReadyPromise = new Promise((resolve) => {
    try {
      catalogWorker = new Worker('./catalog-worker.js?v=codex-58');
      const workerInstance = catalogWorker;
      const timeout = setTimeout(() => {
        if (catalogWorker === workerInstance) resetCatalogWorker(new Error('Inicialização do filtro excedeu o tempo limite'));
        resolve(false);
      }, 8000);
      workerInstance.addEventListener('message', ({ data }) => {
        if (data?.type === 'ready') {
          clearTimeout(timeout); catalogWorkerReady = true; resolve(true); return;
        }
        if (data?.type !== 'result') return;
        const pending = catalogWorkerRequests.get(data.requestId);
        if (!pending) return;
        catalogWorkerRequests.delete(data.requestId);
        clearTimeout(pending.timeout);
        pending.resolve(data.indexes || []);
      });
      workerInstance.addEventListener('error', () => {
        clearTimeout(timeout);
        if (catalogWorker === workerInstance) resetCatalogWorker(new Error('Filtro otimizado indisponível'));
        resolve(false);
      });
      workerInstance.postMessage({
        type: 'init',
        tuples: catalogIndex?.cards || [],
        sets: catalogIndex?.sets || {},
        prices: catalogPriceIndex?.prices || {},
        usdBrlRate: catalogIndex?.usd_brl?.rate || 0,
      });
    } catch (error) {
      resetCatalogWorker(error); resolve(false);
    }
  });
  return catalogWorkerReadyPromise;
}

function requestCatalogWorkerFilter(criteria) {
  return new Promise((resolve, reject) => {
    if (!catalogWorker || !catalogWorkerReady) {
      reject(new Error('Filtro otimizado indisponível'));
      return;
    }
    const requestId = ++catalogWorkerRequestId;
    const timeout = setTimeout(() => {
      if (!catalogWorkerRequests.has(requestId)) return;
      catalogWorkerRequests.delete(requestId);
      const error = new Error('Filtro do catálogo excedeu o tempo limite');
      resetCatalogWorker(error);
      reject(error);
    }, catalogWorkerFilterTimeoutMs);
    catalogWorkerRequests.set(requestId, { resolve, reject, timeout });
    try {
      catalogWorker.postMessage({ type: 'filter', requestId, criteria });
    } catch (error) {
      clearTimeout(timeout);
      catalogWorkerRequests.delete(requestId);
      resetCatalogWorker(error);
      reject(error);
    }
  });
}

function canFilterCatalogInWorker() {
  return state.tab === 'catalog' && catalogWorkerReady && sourceCards() === state.cards && !state.scryfallSearchKey;
}

async function applyCatalogFiltersInWorker() {
  const targetState = state;
  const token = ++catalogFilterToken;
  const search = parseCardSearch(targetState.query);
  const oracleKey = catalogOracleKey(search.exactPhrases);
  const oracleMatches = search.exactPhrases.length && targetState.oracleMatchKey === oracleKey
    ? [...(targetState.oracleMatches || [])]
    : null;
  $('cardGrid').setAttribute('aria-busy', 'true');
  setCatalogPhase('filtering');
  try {
    const indexes = await requestCatalogWorkerFilter({
      freeText: search.freeText,
      oracleMatches,
      selectedFormats: [...targetState.selectedFormats],
      colors: [...targetState.selectedColors],
      colorMatch: targetState.colorMatch,
      type: targetState.type,
      cmc: targetState.cmc,
      rarity: targetState.rarity,
      set: targetState.set,
      showBanned: targetState.showBanned,
      maxPrice: targetState.maxPrice,
      sort: targetState.sort,
    });
    if (token !== catalogFilterToken || state !== targetState) return;
    targetState.filtered = indexes.map((index) => targetState.cards[index]).filter(Boolean);
    targetState.visible = 48;
    render();
  } catch (error) {
    console.warn('Filtro otimizado indisponível; usando o filtro local.', error);
    if (token === catalogFilterToken && state === targetState) applyFiltersSync();
  } finally {
    if (token === catalogFilterToken && state === targetState) {
      $('cardGrid').setAttribute('aria-busy', 'false');
      setCatalogPhase('ready');
    }
  }
}

function applyFilters() {
  if (pendingFilterFrame) { cancelAnimationFrame(pendingFilterFrame); pendingFilterFrame = 0; }
  if (canFilterCatalogInWorker()) {
    void applyCatalogFiltersInWorker();
    return;
  }
  applyFiltersSync();
}

function applyFiltersSync({ allowPendingOracle = false } = {}) {
  if (pendingFilterFrame) { cancelAnimationFrame(pendingFilterFrame); pendingFilterFrame = 0; }
  const search = parseCardSearch(state.query);
  const syntaxSearchActive = Boolean(state.scryfallSearchKey);
  const catalog = state.tab === 'catalog';
  const oracleKey = catalogOracleKey(search.exactPhrases);
  const colorCriteria = selectedColorCriteria();
  const selectedCmc = state.cmc ? Number(state.cmc) : null;
  const filtered = [];

  for (const sourceCard of sourceCards()) {
    const card = sourceCard._searchable === undefined ? prepareCard(sourceCard) : sourceCard;
    if (!syntaxSearchActive) {
      if (search.freeText && !card._searchable.includes(search.freeText)) continue;
      if (search.exactPhrases.length) {
        if (catalog) {
          if (state.oracleMatchKey !== oracleKey) {
            if (!allowPendingOracle) continue;
          } else if (!state.oracleMatches?.has(card.oracle_id || card.id)) continue;
        } else if (!search.exactPhrases.every((phrase) => card._oracleText.includes(phrase))) continue;
      }
    }
    if (state.selectedFormats.size && !card.formats.some((format) => state.selectedFormats.has(format))) continue;
    if (!colorIdentityMatches(card.color_identity || [], colorCriteria)) continue;
    if (!cardTypeMatches(card, state.type)) continue;
    if (selectedCmc !== null && (state.cmc === '6' ? card._cmcValue < 6 : card._cmcValue !== selectedCmc)) continue;
    if (state.rarity && (state.rarity === 'special' ? ['common', 'uncommon', 'rare', 'mythic'].includes(card.rarity) : card.rarity !== state.rarity)) continue;
    if (state.set && card.set !== state.set) continue;
    if (catalog) {
      if (!state.showBanned && card.formats.length) continue;
      const price = effectiveCatalogPrice(card);
      if (!price || price.value > state.maxPrice) continue;
    }
    filtered.push(card);
  }

  state.filtered = filtered;
  const sorters = {
    'cmc-asc': (a, b) => (a.cmc || 0) - (b.cmc || 0) || compareNames(a, b),
    'cmc-desc': (a, b) => (b.cmc || 0) - (a.cmc || 0) || compareNames(a, b),
    'formats-desc': (a, b) => b.formats.length - a.formats.length || compareNames(a, b),
    color: (a, b) => cardIdentity(a).localeCompare(cardIdentity(b)) || compareNames(a, b),
    'price-asc': (a, b) => (effectiveCatalogPrice(a)?.value ?? Infinity) - (effectiveCatalogPrice(b)?.value ?? Infinity) || compareNames(a, b),
    'price-desc': (a, b) => (effectiveCatalogPrice(b)?.value ?? -Infinity) - (effectiveCatalogPrice(a)?.value ?? -Infinity) || compareNames(a, b),
  };
  if (state.sort === 'name-desc') state.filtered.reverse();
  else if (state.sort !== 'name-asc') state.filtered.sort(sorters[state.sort] || compareNames);
  state.visible = 48;
  render();
  if (catalog) setCatalogPhase('ready');
}

function scheduleApplyFilters() {
  if (pendingFilterFrame) return;
  pendingFilterFrame = requestAnimationFrame(() => {
    pendingFilterFrame = 0;
    applyFilters();
  });
}

function populateSetFilter() {
  const select = $('setFilter');
  if (!select) return;
  const cacheKey = `${state.tab}:${state.cards.length}:${state.tab === 'catalog' ? catalogIndex?.generated_at || '' : ''}`;
  if (select.dataset.optionsKey === cacheKey) { select.value = state.set; return; }
  const entries = state.tab === 'catalog' && catalogIndex?.sets
    ? Object.entries(catalogIndex.sets)
    : [...new Map(state.cards.filter((card) => card.set).map((card) => [card.set, card.set_name || String(card.set).toUpperCase()])).entries()];
  const options = entries
    .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  select.innerHTML = `<option value="">Todas as coleções</option>${options.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('')}`;
  select.dataset.optionsKey = cacheKey;
  select.value = state.set;
}

function renderSeals() {
  if (state.tab === 'catalog') { $('formatSeals').innerHTML = ''; return; }
  const html = formats.map((format) => {
    const count = sourceCards().filter((card) => card.formats.includes(format.key)).length;
    const active = state.selectedFormats.has(format.key);
    return `<button class="format-seal${active ? ' is-active' : ''}" type="button" data-format="${format.key}" aria-pressed="${active}" style="--format-color:${format.color}" title="Mostrar cartas banidas em ${format.label}"><span class="format-seal__bar"></span><span class="format-seal__crest">${format.short}</span><span class="format-seal__copy"><strong>${format.label}</strong><small>${count} ${count === 1 ? 'carta' : 'cartas'} banidas</small></span></button>`;
  }).join('');
  $('formatSeals').innerHTML = html;
}

function renderColorFilters() {
  $('identityFilter')?.querySelectorAll('[data-color]').forEach((button) => {
    const active = state.selectedColors.has(button.dataset.color);
    button.setAttribute('aria-pressed', String(active));
  });
  if ($('colorMatchMode')) $('colorMatchMode').value = state.colorMatch;
  if ($('colorMatchHint')) $('colorMatchHint').textContent = colorMatchHint();
}

function renderActiveFilters() {
  const chips = [];
  if (state.query) chips.push(['q', `Busca: ${state.query}`]);
  state.selectedFormats.forEach((key) => chips.push([`format:${key}`, formats.find((format) => format.key === key)?.label || key]));
  if (state.selectedColors.size) chips.push(['colorMatch', { exact: 'Cores exatas', includes: 'Incluindo cores', minimum: 'Todas as cores' }[state.colorMatch]]);
  state.selectedColors.forEach((key) => chips.push([`color:${key}`, colorFilters.find((color) => color.key === key)?.label || key]));
  const selectLabels = { type: { creature: 'Criatura', instant: 'Instantâneo', sorcery: 'Feitiço', artifact: 'Artefato', enchantment: 'Encantamento', planeswalker: 'Planeswalker', land: 'Terreno', battle: 'Batalha', other: 'Outros' }, cmc: { 0: 'Mana 0', 1: 'Mana 1', 2: 'Mana 2', 3: 'Mana 3', 4: 'Mana 4', 5: 'Mana 5', 6: 'Mana 6+' }, rarity: { common: 'Comum', uncommon: 'Incomum', rare: 'Rara', mythic: 'Mítica', special: 'Especial' } };
  [['type', state.type], ['cmc', state.cmc], ['rarity', state.rarity]].forEach(([key, value]) => { if (value) chips.push([key, selectLabels[key][value]]); });
  if (state.set) chips.push(['set', $('setFilter')?.selectedOptions?.[0]?.textContent || state.set.toUpperCase()]);
  if (state.tab === 'catalog' && state.maxPrice !== 99) chips.push(['maxPrice', `Até R$ ${state.maxPrice}`]);
  if (state.tab === 'catalog' && state.showBanned) chips.push(['showBanned', 'Incluindo banidas']);
  $('activeFilters').innerHTML = chips.map(([key, label]) => `<span class="filter-chip">${escapeHtml(label)} <button type="button" data-remove-filter="${key}" aria-label="Remover filtro ${escapeHtml(label)}">×</button></span>`).join('');
  const mobileFilterCount = $('mobileFilterCount');
  const controlCount = chips.filter(([key]) => key !== 'q').length;
  if (mobileFilterCount) { mobileFilterCount.textContent = controlCount; mobileFilterCount.hidden = !controlCount; }
  if ($('searchClear')) $('searchClear').hidden = !state.query;
}

function cardTileMarkup(card, index = 0) {
  const frameClass = cardFrameClass(card);
  const rarityClass = cardRarityClass(card);
  const legendaryClass = isLegendaryCard(card) ? ' card-tile--legendary' : '';
  const setLine = setLineMarkup(card);
  const badges = card.formats.slice(0, 3).map((format) => {
    const item = formats.find((candidate) => candidate.key === format);
    return `<span class="format-badge" title="Banida em ${escapeHtml(item?.label || format)}">${escapeHtml(item?.short || format)}</span>`;
  }).join('');
  const more = card.formats.length > 3 ? `<span class="format-badge format-badge--more">+${card.formats.length - 3}</span>` : '';
  const identity = (card.color_identity || []).map((color) => manaSymbolImage(color)).join('');
  const srcset = imageSrcSet(card);
  const image = imageFor(card, 0, 'small');
  const formatsLabel = card.formats.map((key) => formats.find((item) => item.key === key)?.label || key).join(', ');
  const imageMarkup = image ? `<img loading="${index < 4 ? 'eager' : 'lazy'}" decoding="async" fetchpriority="${index < 4 ? 'high' : 'low'}" width="488" height="680" src="${escapeHtml(image)}"${srcset ? ` srcset="${escapeHtml(srcset)}" sizes="(max-width: 559px) calc(50vw - 22px), (max-width: 959px) calc(25vw - 20px), 220px"` : ''} alt="Carta ${escapeHtml(card.name)}" />` : '';
  const price = state.tab === 'catalog' ? effectiveCatalogPrice(card) : null;
  const priceMarkup = price ? `<span class="card-price${price.estimated ? ' is-estimated' : ''}" title="${price.source === 'Regra do Formatinho' ? 'Preço definido pela regra do Formatinho' : price.estimated ? 'Estimativa pelo Scryfall convertida pela PTAX' : `Preço ${price.stale ? 'desatualizado ' : ''}da LigaMagic`}">${priceSourceDot(price)}${price.estimated ? '~ ' : ''}${escapeHtml(formatBrlPrice(price.value))}${price.estimated ? '<small>estimado</small>' : ''}</span>` : '';
  const banWarning = state.tab === 'catalog' && card.formats.length ? '<span class="card-tile__ban-warning">Banida</span>' : '';
  const setAndPrice = state.tab === 'catalog' ? `<div class="card-tile__catalog-row"><span class="card-tile__set">${setLine}</span>${priceMarkup}</div>` : `<span class="card-tile__set">${setLine}</span>`;
  const ariaFormats = formatsLabel ? `. Banida em ${formatsLabel}` : '';
  const builderQuantity = deckBuilderQuantityForCard(card);
  const addLabel = builderQuantity
    ? `Adicionar outra cópia de ${card.name} ao Main Deck. ${builderQuantity} no deck atual.`
    : `Adicionar ${card.name} ao Main Deck`;
  return `<article class="card-tile card-tile--${frameClass} card-tile--${rarityClass}${legendaryClass}" style="--delay:${Math.min(index, 10) * 24}ms" data-card-id="${escapeHtml(card.id)}" data-card-key="${escapeHtml(card.oracle_id || card.id)}"${card.isCatalogStub ? ' data-catalog-stub="true"' : ''}><button class="card-tile__open-card" type="button" data-open-card aria-label="Ver ${escapeHtml(card.name)}${escapeHtml(ariaFormats)}"></button><div class="card-tile__art${image ? '' : card.isCatalogStub ? ' is-loading' : ' is-error'}">${imageMarkup}</div><div class="card-tile__body"><strong class="card-tile__name">${escapeHtml(card.name)}</strong><div class="card-tile__meta">${setAndPrice}<span class="card-tile__identity">${identity}</span><span class="format-badges">${badges}${more}${banWarning}</span></div></div><button class="card-tile__add" type="button" data-add-card aria-label="${escapeHtml(addLabel)}" title="Adicionar ao Main Deck">+</button></article>`;
}

function queueCatalogHydration(card) {
  if (!card?.isCatalogStub || catalogHydrating.has(card.id)) return;
  catalogHydrationQueue.set(card.id, card);
  clearTimeout(catalogHydrationTimer);
  catalogHydrationTimer = setTimeout(() => {
    const queued = [...catalogHydrationQueue.values()];
    catalogHydrationQueue.clear();
    void hydrateCatalogCards(queued);
  }, 40);
}

function observeCatalogCards() {
  catalogHydrationObserver?.disconnect();
  catalogHydrationObserver = null;
  if (state.tab !== 'catalog') return;
  const tiles = [...$('cardGrid').querySelectorAll('[data-catalog-stub="true"]')];
  if (!tiles.length) return;
  if (!('IntersectionObserver' in window)) {
    tiles.slice(0, 12).forEach((tile) => queueCatalogHydration(catalogCardById.get(tile.dataset.cardId)));
    return;
  }
  catalogHydrationObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      queueCatalogHydration(catalogCardById.get(entry.target.dataset.cardId));
    });
  }, { rootMargin: '600px 0px' });
  tiles.forEach((tile) => catalogHydrationObserver.observe(tile));
}

function patchHydratedCatalogTiles(cards) {
  if (state.tab !== 'catalog') return;
  const grid = $('cardGrid');
  const positions = new Map([...grid.children].map((tile, index) => [tile.dataset.cardId, index]));
  cards.forEach((card) => {
    const index = positions.get(card.id);
    if (index === undefined) return;
    const tile = [...grid.children][index];
    tile.outerHTML = cardTileMarkup(card, index);
    bindCardImages([...grid.children][index]);
  });
}

function renderCards() {
  const visibleCards = state.filtered.slice(0, state.visible);
  $('cardGrid').classList.toggle('is-list', state.view === 'list');
  $('cardGrid').innerHTML = visibleCards.map(cardTileMarkup).join('');
  $('cardGrid').setAttribute('aria-busy', 'false');
  bindCardImages($('cardGrid'));
  const hasMore = state.visible < state.filtered.length;
  $('loadMore').hidden = !hasMore;
  $('emptyState').hidden = Boolean(state.filtered.length) || !sourceCards().length;
  renderEmptySuggestions();
  observeCatalogCards();
}

async function hydrateCatalogCards(cards) {
  const requested = cards.filter((card) => card?.isCatalogStub);
  const pending = requested.map((card) => catalogHydrationPromises.get(card.id)).filter(Boolean);
  const stubs = requested.filter((card) => !catalogHydrating.has(card.id));
  if (!stubs.length) { if (pending.length) await Promise.allSettled(pending); return; }
  stubs.forEach((card) => catalogHydrating.add(card.id));
  const work = (async () => {
    const updated = [];
    const mergeCard = (stub, fullCard) => {
      if (!fullCard) return;
      catalogHydrationCache.set(stub.id, fullCard);
      const bannedFormats = [...stub.formats];
      const fallbackUsd = stub.prices?.usd || null;
      const hydratedCard = normalizeCard(fullCard);
      const hydratedUsd = hydratedCard.prices?.usd;
      if ((hydratedUsd === null || hydratedUsd === undefined || hydratedUsd === '') && fallbackUsd) hydratedCard.prices = { ...hydratedCard.prices, usd: fallbackUsd };
      Object.assign(stub, hydratedCard, { formats: bannedFormats, isCatalogStub: false });
      prepareCard(stub);
      updated.push(stub);
    };
    const missing = [];
    stubs.forEach((stub) => {
      const cached = catalogHydrationCache.get(stub.id);
      if (cached) mergeCard(stub, cached); else missing.push(stub);
    });
    for (let start = 0; start < missing.length; start += 75) {
      const batch = missing.slice(start, start + 75);
      if (!batch.length) continue;
      const response = await fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: batch.map((card) => ({ id: card.id })) }),
      });
      if (!response.ok) throw new Error(`Scryfall ${response.status}`);
      const payload = await response.json();
      const byId = new Map((payload.data || []).map((card) => [card.id, card]));
      batch.forEach((stub) => mergeCard(stub, byId.get(stub.id)));
    }
    patchHydratedCatalogTiles(updated);
  })().catch(() => {}).finally(() => {
    stubs.forEach((card) => catalogHydrating.delete(card.id));
    stubs.forEach((card) => catalogHydrationPromises.delete(card.id));
  });
  stubs.forEach((card) => catalogHydrationPromises.set(card.id, work));
  await Promise.allSettled([work, ...pending]);
}

function bindCardImages(scope) {
  scope?.querySelectorAll('.card-tile__art img').forEach((image) => {
    const art = image.closest('.card-tile__art');
    const loaded = () => image.classList.add('is-loaded');
    const failed = () => art?.classList.add('is-error');
    if (image.complete && image.naturalWidth) loaded();
    else if (image.complete) failed();
    else { image.addEventListener('load', loaded, { once: true }); image.addEventListener('error', failed, { once: true }); }
  });
}

function editDistance(left, right) {
  const a = String(left); const b = String(right);
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length];
}

function renderEmptySuggestions() {
  const target = $('emptySuggestions');
  if (!target || state.filtered.length) { if (target) target.innerHTML = ''; return; }
  if (isScryfallSyntaxSearch(state.query)) {
    target.innerHTML = '';
    $('emptyMessage').textContent = 'Nenhuma carta corresponde a essa consulta do Scryfall. Revise a sintaxe ou remova um filtro.';
    return;
  }
  const search = parseCardSearch(state.query);
  if (search.exactPhrases.length) {
    target.innerHTML = '';
    $('emptyMessage').textContent = 'Nenhuma carta contém exatamente essa frase no texto. Confira a grafia ou remova as aspas para ampliar a busca.';
    return;
  }
  const query = search.freeText;
  if (!query) { target.innerHTML = ''; $('emptyMessage').textContent = 'Remova um dos filtros ativos para ampliar a consulta.'; return; }
  const candidates = state.cards
    .filter((card) => {
      const name = card._sortName || sortableName(card.name);
      return name.includes(query) || query.includes(name) || (name[0] === query[0] && Math.abs(name.length - query.length) <= 6);
    })
    .slice(0, 600);
  const suggestions = candidates
    .map((card) => {
      const name = card._sortName || sortableName(card.name);
      const distance = editDistance(query, name);
      const similarity = 1 - distance / Math.max(query.length, name.length, 1);
      return { card, similarity };
    })
    .filter((item) => item.similarity >= .45)
    .sort((a, b) => b.similarity - a.similarity || compareNames(a.card, b.card))
    .slice(0, 3)
    .map(({ card }) => card.name);
  $('emptyMessage').textContent = suggestions.length ? 'Nenhuma correspondência exata. Talvez você esteja procurando por:' : 'Tente outro nome ou remova um dos filtros ativos.';
  target.innerHTML = suggestions.map((name) => `<button type="button" data-suggestion="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('');
}

function render() {
  renderSeals(); renderColorFilters(); renderActiveFilters(); renderCards();
  const formatRail = document.querySelector('.format-rail');
  if (formatRail) formatRail.hidden = state.tab === 'catalog' || Boolean(sourceCards().length && !state.filtered.length);
  const progressLabel = state.loadingMore ? ' · atualizando arquivo' : '';
  $('resultCount').textContent = sourceCards().length || state.loadingMore ? `${state.filtered.length} ${state.filtered.length === 1 ? 'carta encontrada' : 'cartas encontradas'}${progressLabel}` : 'Nenhuma carta carregada';
  $('filterCount').textContent = `${state.filtered.length} ${state.filtered.length === 1 ? 'carta' : 'cartas'}`;
  if ($('catalogCoverage')) {
    const coverage = catalogPriceIndex?.coverage;
    $('catalogCoverage').hidden = state.tab !== 'catalog' || !coverage;
    if (coverage) $('catalogCoverage').textContent = `${coverage.confirmed_count || 0} preços LigaMagic · ${coverage.percent || 0}% consultado`;
  }
  const cardsView = $('cardsView'); const listView = $('listView');
  if (cardsView && listView) { cardsView.setAttribute('aria-pressed', String(state.view === 'cards')); listView.setAttribute('aria-pressed', String(state.view === 'list')); }
}

function rarityLabel(value) { return ({ common: 'Comum', uncommon: 'Incomum', rare: 'Rara', mythic: 'Mítica' }[value] || 'Especial'); }

function renderKvRows(id, rows) {
  const target = $(id);
  if (!target) return;
  const entries = rows.filter((row) => row && row.value !== '');
  target.innerHTML = entries.length
    ? entries.map((row) => `<div class="modal-kv"><span class="modal-kv__label">${escapeHtml(row.label)}</span><span class="modal-kv__value">${row.value}</span></div>`).join('')
    : `<div class="modal-kv modal-kv--empty"><span class="modal-kv__value">—</span></div>`;
}

function formatBoolean(value) {
  if (value === true) return 'Sim';
  if (value === false) return 'Não';
  return '—';
}

function formatList(value) {
  if (!Array.isArray(value) || !value.length) return '—';
  return value
    .map((item) => {
      if (item === null || item === undefined || item === '') return '';
      if (typeof item === 'object') return escapeHtml(JSON.stringify(item));
      return escapeHtml(String(item));
    })
    .filter(Boolean)
    .map((item) => `<span class="modal-chip">${item}</span>`)
    .join('');
}

function formatCardColorSymbols(values) {
  if (!Array.isArray(values) || !values.length) return '—';
  return values.map((symbol) => manaSymbolImage(String(symbol))).join('');
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return formatList(value);
  if (typeof value === 'boolean') return formatBoolean(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '—';
  if (typeof value === 'object') return escapeHtml(JSON.stringify(value));
  return escapeHtml(String(value));
}

function formatDate(value) {
  if (!value) return '—';
  const simpleDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  const date = simpleDate
    ? new Date(Number(simpleDate[1]), Number(simpleDate[2]) - 1, Number(simpleDate[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(String(value));
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
}

function formatRuleText(value) {
  return escapeHtml(value || 'Sem texto de regra registrado.').replace(/\r?\n/g, '<br />');
}

function faceValue(card, face, field) {
  return face?.[field] !== undefined && face?.[field] !== null && face?.[field] !== '' ? face[field] : card?.[field] ?? '—';
}

function prettyFieldLabel(field = '') {
  return String(field)
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b[a-z]/g, (match) => match.toUpperCase());
}

function scalarValueMarkup(value) {
  if (value === null || value === undefined || value === '') return '<span class="modal-empty">—</span>';
  if (typeof value === 'boolean') return formatBoolean(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '—';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^https?:\/\//.test(trimmed)) return `<a class="modal-link modal-link--inline" href="${escapeHtml(trimmed)}" target="_blank" rel="noreferrer">${escapeHtml(trimmed)}</a>`;
    return escapeHtml(trimmed).replace(/\r?\n/g, '<br />');
  }
  return escapeHtml(JSON.stringify(value));
}

function isPrimitiveForTree(value) {
  return value === null || value === undefined || value === '' || ['string', 'number', 'boolean'].includes(typeof value);
}

function renderJsonTree(value, depth = 0, seen = new WeakSet()) {
  if (depth > 5) return '<span class="modal-empty">—</span>';

  if (isPrimitiveForTree(value)) {
    return `<span class="modal-json-scalar">${scalarValueMarkup(value)}</span>`;
  }

  if (Array.isArray(value)) {
    if (!value.length) return '<span class="modal-empty">—</span>';
    const onlyPrimitive = value.every((item) => isPrimitiveForTree(item));
    if (onlyPrimitive) {
      return `<div class="modal-chip-list">${value.map((item) => `<span class="modal-chip">${scalarValueMarkup(item)}</span>`).join('')}</div>`;
    }
    return `<div class="modal-json-array">${value
      .map(
        (item, index) => `<details class="modal-json-obj" ${index ? '' : 'open'}>\
          <summary>${index + 1} item</summary>\
          <div class="modal-json-group">${renderJsonTree(item, depth + 1, seen)}</div>\
        </details>`,
      )
      .join('')}</div>`;
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return '<span class="modal-empty">…</span>';
    seen.add(value);
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    if (!entries.length) return '<span class="modal-empty">—</span>';
    return `<div class="modal-json-object">${entries
      .map(
        ([key, item]) => `<div class="modal-json-row"><span class="modal-json-key">${escapeHtml(prettyFieldLabel(key))}</span><div class="modal-json-value">${renderJsonTree(item, depth + 1, seen)}</div></div>`,
      )
      .join('')}</div>`;
  }

  return '<span class="modal-empty">—</span>';
}

function ligaMagicUrl(card) {
  return `https://www.ligamagic.com.br/?view=cards/card&card=${encodeURIComponent(card?.name || '')}`;
}

function formatBrlPrice(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
}

function priceSourceDot(priceOrEstimated) {
  const price = typeof priceOrEstimated === 'object' ? priceOrEstimated : null;
  const estimated = price ? Boolean(price.estimated) : Boolean(priceOrEstimated);
  const isFormatinhoRule = price?.source === 'Regra do Formatinho';
  const label = isFormatinhoRule
    ? 'Preço definido pela regra do Formatinho'
    : estimated
      ? 'Estimativa do Scryfall convertida pela PTAX'
      : 'Preço atualizado pela LigaMagic';
  return `<span class="price-source-dot ${estimated ? 'is-scryfall' : 'is-ligamagic'}" title="${label}" aria-label="${label}"></span>`;
}

function formatMarketTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'data indisponível';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function priceMarkup(card) {
  const fallbackUrl = ligaMagicUrl(card);
  return `<div class="market-ligamagic" id="modalLigaMagicPrice" aria-live="polite"><div class="modal-kv"><span class="modal-kv__label">Menor preço normal</span><span class="modal-kv__value">Consultando arquivo de mercado…</span></div><p class="market-ligamagic__note">Fonte: LigaMagic · cópia Normal/NM mais barata entre as impressões.</p></div><a id="modalLigaMagicLink" class="market-link" href="${escapeHtml(fallbackUrl)}" target="_blank" rel="noreferrer"><span>Ver na LigaMagic</span><span aria-hidden="true">↗</span></a>`;
}

async function getLigaMagicPriceBook() {
  if (!ligaMagicPriceBookPromise) {
    ligaMagicPriceBookPromise = fetch(ligaMagicPriceBookUrl, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`LigaMagic ${response.status}`);
        const book = await response.json();
        if (!book || typeof book.cards !== 'object') throw new Error('Arquivo de mercado inválido');
        return book;
      })
      .catch(() => null);
  }
  return ligaMagicPriceBookPromise;
}

async function getCatalogPriceDetail(oracleId) {
  const prefix = String(oracleId || 'xx').slice(0, 2).toLowerCase();
  if (!catalogDetailShards.has(prefix)) {
    catalogDetailShards.set(prefix, fetch(`${localDataBase}/ligamagic-details/${prefix}.json`, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((response) => response.ok ? response.json() : {})
      .catch(() => ({})));
  }
  const shard = await catalogDetailShards.get(prefix);
  return shard?.[oracleId] || null;
}

async function hydrateCatalogMarketPrice(card) {
  const target = $('modalLigaMagicPrice');
  const inlinePrice = $('modalInlinePrice');
  if (!target || !inlinePrice) return;
  const price = effectiveCatalogPrice(card);
  const link = $('modalLigaMagicLink');
  inlinePrice.classList.remove('is-stale', 'is-estimated');
  if (!price) {
    inlinePrice.hidden = true;
    target.innerHTML = '<div class="modal-kv"><span class="modal-kv__label">Preço em reais</span><span class="modal-kv__value">Indisponível</span></div><p class="market-ligamagic__note">Ainda não há preço confirmado nem estimativa para esta carta.</p>';
    return;
  }
  inlinePrice.innerHTML = `${priceSourceDot(price)}${price.estimated ? '~ ' : ''}${formatBrlPrice(price.value)}`;
  inlinePrice.classList.toggle('is-stale', price.stale && !price.estimated);
  inlinePrice.classList.toggle('is-estimated', price.estimated);
  inlinePrice.title = price.source === 'Regra do Formatinho'
    ? 'Preço definido pela regra do Formatinho'
    : price.estimated
      ? 'Estimativa pelo Scryfall convertida pela PTAX'
      : `${price.stale ? 'Último ' : ''}menor preço Normal/NM na LigaMagic`;
  inlinePrice.hidden = false;

  if (price.source === 'Regra do Formatinho') {
    if (link) link.hidden = true;
    target.classList.remove('is-stale');
    target.innerHTML = `<div class="modal-kv"><span class="modal-kv__label">Valor no Formatinho</span><strong class="market-ligamagic__price">${priceSourceDot(price)}${formatBrlPrice(price.value)}</strong></div><p class="market-ligamagic__note">Terrenos básicos não entram no orçamento de R$ 100,00 do deck.</p>`;
    return;
  }
  if (link) link.hidden = false;

  if (price.estimated) {
    const usd = Number(card?.prices?.usd);
    const rate = Number(catalogIndex?.usd_brl?.rate);
    target.classList.remove('is-stale');
    target.innerHTML = `<div class="modal-kv"><span class="modal-kv__label">Estimativa em reais</span><strong class="market-ligamagic__price">${priceSourceDot(true)}~ ${formatBrlPrice(price.value)}</strong></div><p class="market-ligamagic__note">Estimativa: US$ ${Number.isFinite(usd) ? usd.toFixed(2) : '—'} no Scryfall × PTAX de ${Number.isFinite(rate) ? rate.toFixed(4).replace('.', ',') : '—'}. O preço real da LigaMagic ainda entrará na cobertura.</p>`;
    return;
  }

  const detail = await getCatalogPriceDetail(card.oracle_id || card.id);
  if (state.modalCard?.id !== card.id) return;
  if (link) link.href = detail?.source_url || ligaMagicUrl(card);
  const printing = [detail?.printing_name, detail?.printing_code].filter(Boolean).join(' · ');
  target.classList.toggle('is-stale', price.stale);
  target.innerHTML = `<div class="modal-kv"><span class="modal-kv__label">${price.stale ? 'Último menor preço normal' : 'Menor preço normal'}</span><strong class="market-ligamagic__price">${priceSourceDot(false)}${formatBrlPrice(price.value)}</strong></div><p class="market-ligamagic__note">Fonte: LigaMagic · Normal/NM${printing ? ` · ${escapeHtml(printing)}` : ''} · consultado em ${escapeHtml(formatMarketTimestamp(detail?.checked_at || price.checkedAt))}${price.stale ? ' · atualização pendente' : ''}.</p>`;
}

async function hydrateLigaMagicPrice(card) {
  if (state.tab === 'catalog') return hydrateCatalogMarketPrice(card);
  const target = $('modalLigaMagicPrice');
  if (!target) return;
  const inlinePrice = $('modalInlinePrice');
  const hideInlinePrice = () => {
    if (!inlinePrice) return;
    inlinePrice.hidden = true;
    inlinePrice.textContent = '';
    inlinePrice.classList.remove('is-stale', 'is-estimated');
  };
  const showInlinePrice = (entry, { stale = false } = {}) => {
    if (!inlinePrice) return;
    inlinePrice.innerHTML = `${priceSourceDot(false)}${formatBrlPrice(entry.price_brl)}`;
    inlinePrice.title = `${stale ? 'Último ' : ''}menor preço Normal/NM na LigaMagic`;
    inlinePrice.classList.toggle('is-stale', stale);
    inlinePrice.hidden = false;
  };
  const showScryfallEstimate = (book) => {
    const usd = Number(card?.prices?.usd);
    const rate = Number(book?.usd_brl?.rate);
    if (!Number.isFinite(usd) || usd <= 0 || !Number.isFinite(rate) || rate <= 0) return false;
    const value = usd * rate;
    if (inlinePrice) {
      inlinePrice.innerHTML = `${priceSourceDot(true)}~ ${formatBrlPrice(value)}`;
      inlinePrice.title = 'Estimativa pelo Scryfall convertida pela PTAX';
      inlinePrice.classList.add('is-estimated');
      inlinePrice.hidden = false;
    }
    target.classList.remove('is-stale');
    target.innerHTML = `<div class="modal-kv"><span class="modal-kv__label">Estimativa em reais</span><strong class="market-ligamagic__price">${priceSourceDot(true)}~ ${formatBrlPrice(value)}</strong></div><p class="market-ligamagic__note">Estimativa: US$ ${usd.toFixed(2)} no Scryfall × PTAX de ${rate.toFixed(4).replace('.', ',')}. O preço real da LigaMagic ainda entrará na cobertura.</p>`;
    return true;
  };
  hideInlinePrice();
  const fallbackUrl = ligaMagicUrl(card);
  try {
    const book = await getLigaMagicPriceBook();
    if (state.modalCard?.id !== card.id || !$('modalLigaMagicPrice')) return;
    const entry = book?.cards?.[card.oracle_id || card.id];
    const link = $('modalLigaMagicLink');
    if (link) link.href = entry?.source_url || fallbackUrl;
    if (!book) {
      target.innerHTML = '<div class="modal-kv"><span class="modal-kv__label">Menor preço normal</span><span class="modal-kv__value">Indisponível</span></div><p class="market-ligamagic__note">Não foi possível abrir o arquivo de preços da LigaMagic agora.</p>';
      return;
    }
    if (!book.generated_at) {
      target.innerHTML = '<div class="modal-kv"><span class="modal-kv__label">Menor preço normal</span><span class="modal-kv__value">Preparando consulta</span></div><p class="market-ligamagic__note">A primeira coleta da LigaMagic está em andamento.</p>';
      return;
    }
    if (entry?.status === 'available' && Number.isFinite(Number(entry.price_brl))) {
      const printing = [entry.printing_name, entry.printing_code].filter(Boolean).join(' · ');
      target.classList.remove('is-stale');
      showInlinePrice(entry);
      target.innerHTML = `<div class="modal-kv"><span class="modal-kv__label">Menor preço normal</span><strong class="market-ligamagic__price">${priceSourceDot(false)}${formatBrlPrice(entry.price_brl)}</strong></div><p class="market-ligamagic__note">Fonte: LigaMagic · Normal/NM${printing ? ` · ${escapeHtml(printing)}` : ''} · consultado em ${escapeHtml(formatMarketTimestamp(entry.checked_at))}.</p>`;
      return;
    }
    if (entry?.status === 'stale' && Number.isFinite(Number(entry.price_brl))) {
      target.classList.add('is-stale');
      showInlinePrice(entry, { stale: true });
      target.innerHTML = `<div class="modal-kv"><span class="modal-kv__label">Último menor preço normal</span><strong class="market-ligamagic__price">${priceSourceDot(false)}${formatBrlPrice(entry.price_brl)}</strong></div><p class="market-ligamagic__note">Fonte: LigaMagic · última leitura em ${escapeHtml(formatMarketTimestamp(entry.checked_at))}. A atualização mais recente não respondeu.</p>`;
      return;
    }
    if (showScryfallEstimate(book)) return;
    target.classList.remove('is-stale');
    target.innerHTML = '<div class="modal-kv"><span class="modal-kv__label">Menor preço normal</span><span class="modal-kv__value">Indisponível</span></div><p class="market-ligamagic__note">Ainda não há uma cópia Normal/NM registrada na LigaMagic para esta carta.</p>';
  } catch {
    hideInlinePrice();
    if (state.modalCard?.id === card.id && $('modalLigaMagicPrice')) target.innerHTML = '<div class="modal-kv"><span class="modal-kv__label">Menor preço normal</span><span class="modal-kv__value">Indisponível</span></div><p class="market-ligamagic__note">Não foi possível abrir o arquivo de preços da LigaMagic agora.</p>';
  }
}

function legalitiesMarkup(legalities = {}) {
  const order = ['standard', 'future', 'historic', 'alchemy', 'pioneer', 'modern', 'legacy', 'vintage', 'pauper', 'penny', 'commander', 'oathbreaker', 'brawl', 'duel', 'oldschool', 'predh'];
  const formatLabels = { standard: 'Standard', future: 'Future', historic: 'Historic', timeless: 'Timeless', gladiator: 'Gladiator', alchemy: 'Alchemy', pioneer: 'Pioneer', modern: 'Modern', legacy: 'Legacy', vintage: 'Vintage', pauper: 'Pauper', penny: 'Penny', commander: 'Commander', oathbreaker: 'Oathbreaker', brawl: 'Brawl', duel: 'Duel Commander', oldschool: 'Old School', predh: 'PreDH', standardbrawl: 'Standard Brawl', competitivebrawl: 'Competitive Brawl', paupercommander: 'Pauper Commander', premodern: 'Premodern', tlr: 'TLR' };
  const statusLabels = { legal: 'permitida', not_legal: 'não disponível', banned: 'banida', restricted: 'restrita' };
  const entries = Object.entries(legalities);
  if (!entries.length) return '<span class="modal-empty">—</span>';
  const map = new Map(entries);
  const ordered = [...new Set(order.concat(entries.map(([key]) => key)))]
    .map((format) => {
      if (!map.has(format)) return '';
      const status = map.get(format);
      return `<span class="modal-chip modal-chip--${status}">${escapeHtml(formatLabels[format] || prettyFieldLabel(format))} · ${escapeHtml(statusLabels[status] || status)}</span>`;
    })
    .filter(Boolean)
    .join('');
  if (ordered) return ordered;
  return Object.entries(legalities)
    .map(([format, status]) => `<span class="modal-chip modal-chip--${status}">${escapeHtml(formatLabels[format] || prettyFieldLabel(format))} · ${escapeHtml(statusLabels[status] || status)}</span>`)
    .join('');
}

function linksMarkup(title, links = {}) {
  const rows = Object.entries(links)
    .filter(([, url]) => typeof url === 'string' && url)
    .map(([key, url]) => `<a class="modal-link modal-link--inline" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(key.replace(/_/g, ' '))}</a>`)
    .join('');
  if (!rows) return '';
  return `<div class="modal-links-group"><strong>${escapeHtml(title)}</strong><div class="modal-links-grid">${rows}</div></div>`;
}

function objectListLinks(title, entries = [], renderName = (item) => item?.name || item?.id || item?.object) {
  const rows = (entries || [])
    .map((item) => {
      const label = renderName(item);
      const href = item?.uri || (item?.id ? `https://api.scryfall.com/cards/${encodeURIComponent(item.id)}` : '');
      if (!label) return '';
      return href
        ? `<a class="modal-link modal-link--inline" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(label)}${item?.component ? ` (${escapeHtml(item.component)})` : ''}</a>`
        : `<span class="modal-link">${escapeHtml(label)}${item?.component ? ` (${escapeHtml(item.component)})` : ''}</span>`;
    })
    .filter(Boolean)
    .join('');
  if (!rows) return '';
  return `<div class="modal-links-group"><strong>${escapeHtml(title)}</strong><div class="modal-links-grid">${rows}</div></div>`;
}

function renderModalDetails(card, side = 0) {
  const face = card.faces?.[side] || card;
  const manaCost = faceValue(card, face, 'mana_cost') || '';
  const printings = card.printings || [];
  const setCode = String(card.set || '').toUpperCase();
  const setLabel = card.set_name || setCode || 'Scryfall';

  $('modalTitle').textContent = faceValue(card, face, 'name');
  $('modalType').textContent = faceValue(card, face, 'type_line');
  $('modalInlinePrice').hidden = true;
  $('modalInlinePrice').textContent = '';
  $('modalOracle').innerHTML = formatRuleText(faceValue(card, face, 'oracle_text'));
  $('modalFlavor').innerHTML = faceValue(card, face, 'flavor_text') === '—' ? '' : formatRuleText(faceValue(card, face, 'flavor_text'));
  $('modalSet').innerHTML = setLineMarkup(card);
  $('modalArtist').textContent = faceValue(card, face, 'artist');
  $('modalRarity').textContent = rarityLabel(card.rarity);
  $('modalCmc').textContent = String(card.cmc ?? '—');
  const modalImage = $('modalImage');
  modalImage.classList.remove('is-loaded');
  const modalSource = imageFor(card, side, 'normal');
  const modalArt = modalImage.closest('.modal-art');
  modalArt?.classList.toggle('is-error', !modalSource);
  if (modalSource) modalImage.src = modalSource; else modalImage.removeAttribute('src');
  modalImage.srcset = modalSource ? imageSrcSet(card, side) : '';
  modalImage.sizes = '(max-width: 759px) min(82vw, 360px), 430px';
  modalImage.alt = `Carta ${faceValue(card, face, 'name')}`;
  const markModalLoaded = () => modalImage.classList.add('is-loaded');
  if (modalImage.complete && modalImage.naturalWidth) markModalLoaded(); else modalImage.addEventListener('load', markModalLoaded, { once: true });
  $('modalMana').innerHTML = formatRuleText(manaCost).replace(/\{([^}]+)\}/g, (_match, symbol) => manaSymbolImage(symbol));
  const bannedFormats = Array.isArray(card.formats) ? card.formats : [];
  $('modalBanStatus').hidden = bannedFormats.length === 0;
  $('modalFormats').innerHTML = bannedFormats.map((key) => `<span class="format-badge">${escapeHtml(formats.find((format) => format.key === key)?.label || key)}</span>`).join('');
  $('modalScryfall').href = card.scryfall_uri || `https://scryfall.com/search?q=${encodeURIComponent(card.name)}`;

  renderKvRows('modalMeta', [
    { label: 'Nome base', value: faceValue(card, face, 'name') },
    { label: 'Nome impresso', value: faceValue(card, face, 'printed_name') },
    { label: 'Coleção', value: `${escapeHtml(setLabel)}${setCode ? ` <span class="modal-chip">${escapeHtml(setCode)}</span>` : ''}` },
    { label: 'Número', value: formatValue(card.collector_number) },
    { label: 'Idioma', value: formatValue(card.lang) },
    { label: 'Jogos', value: formatList(card.games || []) },
    { label: 'Cores', value: formatCardColorSymbols(card.colors || []) },
    { label: 'Identidade', value: formatCardColorSymbols(card.color_identity || []) },
    { label: 'Data de lançamento', value: formatDate(card.released_at) },
  ]);

  renderKvRows('modalGameplay', [
    { label: 'Custo de mana', value: manaCost ? formatRuleText(manaCost).replace(/\{([^}]+)\}/g, (_match, symbol) => manaSymbolImage(symbol)) : '—' },
    { label: 'CMC', value: formatValue(card.cmc) },
    { label: 'Poder', value: formatValue(faceValue(card, face, 'power')) },
    { label: 'Resistência', value: formatValue(faceValue(card, face, 'toughness')) },
    { label: 'Lealdade', value: formatValue(faceValue(card, face, 'loyalty')) },
    { label: 'Defesa', value: formatValue(faceValue(card, face, 'defense')) },
    { label: 'Layout', value: formatValue(card.layout) },
    { label: 'Frame', value: `${formatValue(card.frame)}${card.frame_effect ? ` / ${formatValue(card.frame_effect)}` : ''}` },
    { label: 'Borda', value: formatValue(card.border_color) },
    { label: 'Keywords', value: formatList(card.keywords || []) },
  ]);

  $('modalLegalities').innerHTML = legalitiesMarkup(card.legalities);
  $('modalPrices').innerHTML = priceMarkup(card);
  hydrateLigaMagicPrice(card);
  $('modalPrints').innerHTML = printings.length ? printings.map((item) => `<span class="modal-chip">${escapeHtml(String(item))}</span>`).join('') : '<span class="modal-empty">—</span>';

  $('modalRelations').innerHTML = [
    objectListLinks('Partes e faces da carta', card.all_parts || [], (item) => `${item?.name || 'Parte'} ${item?.component ? `(${item.component})` : ''}`),
    objectListLinks('Partes internas', card.card_parts || [], (item) => `${item?.name || 'Parte'} ${item?.component ? `(${item.component})` : ''}`),
    linksMarkup('Metadados da relação', {
      component: card.component || '',
      component_of: card.component_of || '',
    }),
  ].join('');

  state.rawDetailsReady = false;
  if ($('modalRawData')) $('modalRawData').textContent = 'Abra esta seção para carregar o JSON completo.';
  if ($('modalAllScryfallData')) $('modalAllScryfallData').innerHTML = '<span class="modal-empty">Os dados técnicos serão preparados quando esta seção for aberta.</span>';
  $('flipCard').hidden = !card.faces.length;
  $('flipCard').textContent = state.modalFace === 0 ? '↻ Ver verso' : '↻ Ver frente';
  const index = state.filtered.findIndex((item) => item.id === card.id);
  $('modalPosition').textContent = index >= 0 ? `${index + 1} de ${state.filtered.length}` : 'Detalhes da carta';
  $('previousCard').disabled = index <= 0;
  $('nextCard').disabled = index < 0 || index >= state.filtered.length - 1;
}

function hydrateRawDetails() {
  if (!state.modalCard || state.rawDetailsReady) return;
  state.rawDetailsReady = true;
  $('modalRawData').textContent = JSON.stringify(state.modalCard, null, 2);
  $('modalAllScryfallData').innerHTML = renderJsonTree(state.modalCard, 0);
}

function modalUrl(card) {
  const params = currentParams({ includeCard: false });
  if (card) params.set('card', card.id);
  return `${location.pathname}${params.toString() ? `?${params}` : ''}`;
}

function openCard(card, { pushHistory = true, initial = false } = {}) {
  if (!card) return;
  const alreadyOpen = $('cardModal').open;
  if (!alreadyOpen) {
    state.savedScroll = window.scrollY;
    state.lastFocus = document.activeElement;
  }
  state.modalCard = card;
  state.modalFace = 0;
  renderModalDetails(card, 0);
  const modal = $('cardModal');
  if (!alreadyOpen) {
    if (typeof modal.showModal === 'function') modal.showModal();
    else modal.setAttribute('open', '');
    document.body.classList.add('is-locked');
  }
  document.querySelectorAll('.modal-section').forEach((section, index) => { section.open = index === 0; });
  const modalScroll = document.querySelector('.modal-scroll');
  if (modalScroll) modalScroll.scrollTop = 0;
  $('closeCardModal').focus();
  if (pushHistory) history.pushState({ cardEntry: true }, '', modalUrl(card));
  else if (initial) history.replaceState({ cardInitial: true }, '', modalUrl(card));
}

function dismissCard({ restoreFocus = true } = {}) {
  const modal = $('cardModal');
  if (modal.open) modal.close(); else modal.removeAttribute('open');
  state.modalCard = null;
  state.modalFace = 0;
  document.body.classList.remove('is-locked');
  requestAnimationFrame(() => {
    window.scrollTo({ top: state.savedScroll, behavior: 'auto' });
    if (restoreFocus) state.lastFocus?.focus?.({ preventScroll: true });
  });
}

function closeCard() {
  if (history.state?.cardEntry) { history.back(); return; }
  history.replaceState(null, '', modalUrl(null));
  dismissCard();
}

async function navigateModal(direction) {
  if (!state.modalCard) return;
  const index = state.filtered.findIndex((card) => card.id === state.modalCard.id);
  const next = state.filtered[index + direction];
  if (!next) return;
  if (next.isCatalogStub) await hydrateCatalogCards([next]);
  state.modalCard = next;
  state.modalFace = 0;
  renderModalDetails(next, 0);
  document.querySelectorAll('.modal-section').forEach((section, sectionIndex) => { section.open = sectionIndex === 0; });
  const modalScroll = document.querySelector('.modal-scroll');
  if (modalScroll) modalScroll.scrollTop = 0;
  history.replaceState(history.state, '', modalUrl(next));
}

function flipModalCard() {
  if (!state.modalCard?.faces.length) return;
  state.modalFace = state.modalFace ? 0 : 1;
  renderModalDetails(state.modalCard, state.modalFace);
}

async function loadBackground() {
  const sceneLayerA = document.querySelector('.hero-art__layer--a');
  const sceneLayerB = document.querySelector('.hero-art__layer--b');
  const sceneName = $('sceneName');
  const sceneArtist = $('sceneArtist');
  if (!sceneLayerA || !sceneLayerB || !sceneName || !sceneArtist) return;
  const scenesLayers = { a: sceneLayerA, b: sceneLayerB };
  try {
    let scenes = site.desktopBackgrounds;
    if (!matchMedia('(min-width: 960px)').matches) {
      const response = await fetch('https://api.scryfall.com/cards/collection', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ identifiers: site.backgroundCards.map((name) => ({ name })) }) });
      if (!response.ok) return;
      const payload = await response.json();
      scenes = (payload.data || []).filter((card) => card.image_uris?.art_crop).map((card) => ({ name: card.name, artist: card.artist, image: card.image_uris.art_crop }));
    }
    if (!scenes.length) return;
    let current = 0;
    let active = 'a';
    const show = (index, layer) => {
      const element = scenesLayers[layer];
      element.style.backgroundImage = `url("${scenes[index].image}")`;
      element.classList.add('is-active');
      sceneName.textContent = scenes[index].name;
      sceneArtist.textContent = scenes[index].credit || `arte de ${scenes[index].artist || 'artista não informado'} · via Scryfall`;
      return element;
    };
    show(0, active);
    const preload = (index) => { const image = new Image(); image.src = scenes[index].image; return image; };
    let nextImage = preload((current + 1) % scenes.length);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; if (reduced) return;
    setInterval(() => {
      const next = (current + 1) % scenes.length;
      const nextLayer = active === 'a' ? 'b' : 'a';
      const activate = () => {
        scenesLayers[active].classList.remove('is-active');
        show(next, nextLayer);
        active = nextLayer;
        current = next;
        nextImage = preload((current + 1) % scenes.length);
      };
      if (nextImage.complete) activate(); else nextImage.onload = activate;
    }, site.backgroundInterval);
  } catch { /* fundo abstrato permanece ativo quando a coleção não responder */ }
}

function clearFilters() {
  clearScryfallSyntaxSearch();
  state.oracleSearchAbort?.abort(); state.oracleSearchAbort = null;
  state.selectedFormats.clear(); state.selectedColors.clear(); state.colorMatch = 'exact'; state.query = ''; state.type = ''; state.cmc = ''; state.rarity = ''; state.set = ''; state.sort = 'name-asc'; state.maxPrice = 99; state.showBanned = false; state.oracleMatchKey = ''; state.oracleMatches = null;
  $('searchInput').value = ''; $('typeFilter').value = ''; $('cmcFilter').value = ''; $('rarityFilter').value = ''; $('setFilter').value = ''; $('sortFilter').value = 'name-asc';
  if ($('priceFilter')) $('priceFilter').value = 99;
  if ($('priceFilterValue')) $('priceFilterValue').textContent = 'R$ 99';
  if ($('showBannedCatalog')) $('showBannedCatalog').checked = false;
  if ($('colorMatchMode')) $('colorMatchMode').value = 'exact';
  if ($('colorMatchHint')) $('colorMatchHint').textContent = colorMatchHint();
  $('searchClear').hidden = true;
  syncUrl(); applyFilters();
}

function bindParallax() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || innerWidth < 700) return;
  let frame = 0; let x = 0; let y = 0;
  const paint = () => { frame = 0; document.documentElement.style.setProperty('--parallax-x', `${x.toFixed(2)}px`); document.documentElement.style.setProperty('--parallax-y', `${y.toFixed(2)}px`); };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
  addEventListener('pointermove', (event) => { x = ((event.clientX / innerWidth) - 0.5) * 7; y = ((event.clientY / innerHeight) - 0.5) * 5; schedule(); }, { passive: true });
  addEventListener('scroll', () => { y = Math.max(-6, Math.min(6, (scrollY || 0) * -0.012)); schedule(); }, { passive: true });
}

function showToast(message) {
  const toast = $('toast');
  clearTimeout(showToast.timer);
  toast.textContent = message;
  toast.hidden = false;
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 2200);
}

function updateConnectionStatus() {
  const offline = !navigator.onLine;
  $('connectionBanner').hidden = !offline;
}

function closeFilterSheet({ restoreFocus = true } = {}) {
  $('filterPanel').classList.remove('is-open');
  $('filterPanel').removeAttribute('role');
  $('filterPanel').removeAttribute('aria-modal');
  $('openFilters').setAttribute('aria-expanded', 'false');
  if (!$('cardModal').open) document.body.classList.remove('is-locked');
  if (restoreFocus && innerWidth < 960) $('openFilters').focus({ preventScroll: true });
}

function openFilterSheet() {
  $('filterPanel').classList.add('is-open');
  $('openFilters').setAttribute('aria-expanded', 'true');
  if (innerWidth < 960) {
    $('filterPanel').setAttribute('role', 'dialog');
    $('filterPanel').setAttribute('aria-modal', 'true');
    document.body.classList.add('is-locked');
  }
  setTimeout(() => { if ($('filterPanel').classList.contains('is-open')) $('closeFilters').focus(); }, 240);
}

function renderDeckFormats() {
  $('deckFormatChoices').innerHTML = deckFormats.map((format) => `
    <button class="deck-format" type="button" role="radio" data-deck-format="${format.key}" aria-checked="${state.deckFormat === format.key}" tabindex="${state.deckFormat === format.key ? '0' : '-1'}" style="--format-color:${format.color}">
      <span class="deck-format__seal" aria-hidden="true">${format.short}</span>
      <span class="deck-format__copy"><strong>${format.label}</strong><small>${state.deckFormat === format.key ? 'Selecionado' : 'Selecionar'}</small></span>
    </button>`).join('');
}

function selectDeckFormat(key, { focus = false } = {}) {
  if (!deckFormats.some((format) => format.key === key)) return;
  state.deckFormat = key;
  renderDeckFormats();
  $('deckValidationResult').hidden = true;
  if (focus) $('deckFormatChoices').querySelector(`[data-deck-format="${key}"]`)?.focus();
}

function parseDeckList(value) {
  const entries = new Map();
  const sectionNames = new Set(['deck', 'mainboard', 'main deck', 'sideboard', 'commander', 'commanders', 'companion', 'maybeboard', 'lista', 'baralho', 'comandante', 'reserva']);

  String(value || '').split(/\r?\n/).forEach((originalLine) => {
    let line = originalLine.trim();
    if (!line || /^(?:\/\/|#)/.test(line)) return;
    const heading = slug(line.replace(/:\s*$/, '').replace(/\s*\(\d+\)\s*$/, '')).trim();
    if (sectionNames.has(heading)) return;
    line = line.replace(/^SB:\s*/i, '').trim();

    let quantity = 1;
    let name = line;
    const compactQuantity = line.match(/^(\d+)[xX]\s*(.+)$/);
    const spacedQuantity = line.match(/^(\d+)\s+(.+)$/);
    if (compactQuantity) { quantity = Number(compactQuantity[1]); name = compactQuantity[2]; }
    else if (spacedQuantity) { quantity = Number(spacedQuantity[1]); name = spacedQuantity[2]; }
    if (!quantity || quantity > 999) return;

    name = name
      .replace(/\s+\*[^*]+\*\s*$/g, '')
      .replace(/\s+\([A-Z0-9]{2,8}\)\s+[A-Z0-9-]+\s*$/i, '')
      .replace(/\s+\[[A-Z0-9]{2,8}(?::[^\]]+)?\]\s*(?:[A-Z0-9-]+)?\s*$/i, '')
      .replace(/\s+\{[^}]+\}\s*$/g, '')
      .trim();
    if (!name || /^\d+$/.test(name)) return;

    const key = normalizeDeckName(name);
    if (!key) return;
    const existing = entries.get(key);
    if (existing) existing.quantity += quantity;
    else entries.set(key, { key, name, quantity });
  });

  return [...entries.values()];
}

function normalizeDeckName(value = '') {
  return slug(String(value))
    .replace(/[\u2018\u2019\u02bc\uff07]/g, "'")
    .replace(/[^a-z0-9/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function deckNameDistance(left, right, maximum) {
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

function isConservativeDeckCorrection(input, candidate) {
  const source = normalizeDeckName(input);
  const target = normalizeDeckName(candidate);
  if (!source || !target || source === target) return source === target;
  if (source.split(' ').length !== target.split(' ').length) return false;
  const maximum = source.length >= 16 ? 2 : source.length >= 6 ? 1 : 0;
  return maximum > 0 && deckNameDistance(source, target, maximum) <= maximum;
}

function updateDeckListCount() {
  const entries = parseDeckList($('deckListInput').value);
  const copies = entries.reduce((total, entry) => total + entry.quantity, 0);
  $('deckListCount').textContent = `${copies} ${copies === 1 ? 'carta lida' : 'cartas lidas'}`;
  $('clearDeckList').hidden = !$('deckListInput').value;
  $('deckValidationResult').hidden = true;
  pendingValidatedDeck = null;
}

function cardNameKeys(card) {
  return [card?.name, card?.printed_name, ...(card?.card_faces || []).flatMap((face) => [face.name, face.printed_name])]
    .filter(Boolean)
    .map(normalizeDeckName);
}

function deckEntryKeys(entry) {
  const name = String(entry?.name || '');
  return [...new Set([entry?.key, name, ...name.split(/\s*\/\/\s*/)].map(normalizeDeckName).filter(Boolean))];
}

function deckCardForEntry(entry) {
  return deckEntryKeys(entry).map((key) => deckCardCache.get(key)).find(Boolean) || null;
}

async function fetchDeckCards(entries) {
  const missing = entries.filter((entry) => !deckCardForEntry(entry));
  for (let start = 0; start < missing.length; start += 75) {
    const batch = missing.slice(start, start + 75);
    const response = await fetch('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: batch.map((entry) => ({ name: String(entry.name || '').split(/\s*\/\/\s*/)[0].trim() })) }),
    });
    if (!response.ok) throw new Error(`Scryfall ${response.status}`);
    const payload = await response.json();
    const cards = payload.data || [];
    batch.forEach((entry) => {
      const keys = deckEntryKeys(entry);
      const card = cards.find((candidate) => keys.some((key) => cardNameKeys(candidate).includes(key))) || null;
      keys.forEach((key) => deckCardCache.set(key, card));
      if (card) cardNameKeys(card).forEach((key) => deckCardCache.set(key, card));
    });
    const unresolved = batch.filter((entry) => !deckCardForEntry(entry));
    for (const entry of unresolved) {
      const query = String(entry.name || '').split(/\s*\/\/\s*/)[0].trim();
      const fuzzyResponse = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(query)}`, {
        headers: { Accept: 'application/json;q=0.9,*/*;q=0.8' },
      });
      const fuzzyCard = fuzzyResponse.ok ? await fuzzyResponse.json() : null;
      const card = fuzzyCard && isConservativeDeckCorrection(query, fuzzyCard.name) ? fuzzyCard : null;
      const keys = deckEntryKeys(entry);
      keys.forEach((key) => deckCardCache.set(key, card));
      if (card) cardNameKeys(card).forEach((key) => deckCardCache.set(key, card));
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    if (start + 75 < missing.length) await new Promise((resolve) => setTimeout(resolve, 80));
  }
  return new Map(entries.map((entry) => [entry.key, deckCardForEntry(entry)]));
}

function localBannedCard(entry, format) {
  return viewStates.banlist.cards.find((card) => cardNameKeys(card).includes(entry.key) && (format === 'formatinho' || card.formats?.includes(format)));
}

function deckIssueGroup(title, items) {
  if (!items.length) return '';
  return `<div class="deck-result__group"><h4>${escapeHtml(title)} <span>${items.length}</span></h4><ul class="deck-result__list">${items.map((item) => {
    const href = item.card?.scryfall_uri || `https://scryfall.com/search?q=${encodeURIComponent(`!\"${item.entry.name}\"`)}`;
    return `<li class="deck-result__item"><div><strong>${item.entry.quantity}× ${escapeHtml(item.card?.name || item.entry.name)}</strong><small>${escapeHtml(item.reason)}</small></div><a href="${escapeHtml(href)}" target="_blank" rel="noreferrer" aria-label="Ver ${escapeHtml(item.card?.name || item.entry.name)} no Scryfall">↗</a></li>`;
  }).join('')}</ul></div>`;
}

function evaluateDeckLegality(entries, format, cards, { partial = false } = {}) {
  const formatInfo = deckFormats.find((item) => item.key === format);
  const groups = { banned: [], notLegal: [], restricted: [], unknown: [] };

  entries.forEach((entry) => {
    const apiCard = cards.get(entry.key) || null;
    const localCard = localBannedCard(entry, format);
    const card = apiCard || localCard;
    const legality = apiCard?.legalities?.[format];
    const bannedInFormatinho = format === 'formatinho'
      && !['sunf', 'unf'].includes(apiCard?.set)
      && formats.some(({ key }) => apiCard?.legalities?.[key] === 'banned');
    if (legality === 'banned' || bannedInFormatinho || localCard) groups.banned.push({ entry, card, reason: `Banida em ${formatInfo.label} e não pode ser usada.` });
    else if (legality === 'not_legal') groups.notLegal.push({ entry, card, reason: `Não é válida no formato ${formatInfo.label}.` });
    else if (legality === 'restricted' && entry.quantity > 1) groups.restricted.push({ entry, card, reason: `Restrita a 1 cópia; a lista contém ${entry.quantity}.` });
    else if (!partial && !apiCard) groups.unknown.push({ entry, card: null, reason: 'Nome não encontrado no Scryfall. Confira a grafia.' });
  });

  const issueCount = Object.values(groups).reduce((total, items) => total + items.length, 0);
  const issueCopies = Object.values(groups).flat().reduce((total, item) => total + item.entry.quantity, 0);
  return { groups, issueCount, issueCopies, valid: !partial && issueCount === 0, formatInfo };
}

function renderDeckValidation({ entries, format, cards, partial = false }) {
  const evaluation = evaluateDeckLegality(entries, format, cards, { partial });
  const { groups, issueCount, issueCopies, valid, formatInfo } = evaluation;
  const totalCopies = entries.reduce((total, entry) => total + entry.quantity, 0);
  const coverCard = entries.map((entry) => cards.get(entry.key) || localBannedCard(entry, format)).find(Boolean) || null;
  pendingValidatedDeck = valid ? {
    entries: entries.map(({ name, quantity }) => ({ name, quantity })),
    format,
    totalCopies,
    uniqueCount: entries.length,
    coverName: coverCard?.name || entries[0]?.name || '',
    coverImage: coverCard?.image_uris?.art_crop || coverCard?.image_uris?.normal || coverCard?.card_faces?.[0]?.image_uris?.art_crop || '',
  } : null;
  const result = $('deckValidationResult');
  const statusClass = partial ? 'partial' : valid ? 'valid' : 'invalid';
  const icon = partial ? '!' : valid ? '✓' : '×';
  const title = partial ? 'Verificação parcial' : valid ? `Deck válido para ${formatInfo.label}` : `Deck inválido para ${formatInfo.label}`;
  const description = partial
    ? 'O Scryfall não respondeu. Conferimos apenas as cartas banidas já carregadas nesta página.'
    : valid
      ? 'Nenhuma carta proibida ou fora do formato foi encontrada.'
      : `${issueCount} ${issueCount === 1 ? 'carta precisa' : 'cartas precisam'} de atenção antes de jogar.`;

  result.className = `deck-result deck-result--${statusClass}`;
  result.innerHTML = `
    <div class="deck-result__summary"><span class="deck-result__icon" aria-hidden="true">${icon}</span><div class="deck-result__copy"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div></div>
    <div class="deck-result__meta"><div><strong>${entries.length}</strong><span>nomes</span></div><div><strong>${totalCopies}</strong><span>cartas</span></div><div><strong>${issueCopies}</strong><span>com problema</span></div></div>
    ${deckIssueGroup('Cartas banidas', groups.banned)}
    ${deckIssueGroup('Fora do formato', groups.notLegal)}
    ${deckIssueGroup('Cópias além do permitido', groups.restricted)}
    ${deckIssueGroup('Não reconhecidas', groups.unknown)}
    ${partial ? '<p class="deck-result__notice">Resultado incompleto: tente novamente quando a conexão com o Scryfall estiver disponível.</p>' : ''}
    ${valid ? '<div class="deck-save-prompt"><div class="deck-save-prompt__copy"><strong>Quer selar este deck no arquivo?</strong><span>Ele ficará visível na página de decks validados para inspirar o playgroup.</span></div><div class="deck-save-prompt__actions"><button type="button" data-save-deck-accept>Sim, salvar deck</button><button type="button" data-save-deck-decline>Agora não</button></div></div>' : ''}`;
  result.hidden = false;
  result.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
}

function renderDeckEmpty(message) {
  const result = $('deckValidationResult');
  result.className = 'deck-result deck-result--empty';
  result.innerHTML = `<div class="deck-result__summary"><span class="deck-result__icon" aria-hidden="true">!</span><div class="deck-result__copy"><h3>Não encontramos uma lista</h3><p>${escapeHtml(message)}</p></div></div>`;
  result.hidden = false;
}

async function validateDeck() {
  const entries = parseDeckList($('deckListInput').value);
  if (!entries.length) { renderDeckEmpty('Cole ao menos uma carta, por exemplo: 1 Sol Ring.'); $('deckListInput').focus(); return; }
  if (entries.length > 300) { renderDeckEmpty('A lista tem mais de 300 nomes diferentes. Divida-a em partes menores para validar.'); return; }

  const button = $('validateDeck');
  button.disabled = true;
  button.innerHTML = '<span aria-hidden="true">✦</span><span>Consultando o Scryfall…</span>';
  try {
    const cards = await fetchDeckCards(entries);
    renderDeckValidation({ entries, format: state.deckFormat, cards });
  } catch {
    renderDeckValidation({ entries, format: state.deckFormat, cards: new Map(), partial: true });
  } finally {
    button.disabled = false;
    button.innerHTML = '<span aria-hidden="true">✦</span><span>Validar novamente</span>';
  }
}

function openDeckValidator() {
  if (state.selectedFormats.size === 1) state.deckFormat = [...state.selectedFormats][0];
  renderDeckFormats();
  state.deckLastFocus = document.activeElement;
  const modal = $('deckValidatorModal');
  if (typeof modal.showModal === 'function') modal.showModal(); else modal.setAttribute('open', '');
  document.body.classList.add('is-locked');
  $('closeDeckValidator').focus();
}

function closeDeckValidator() {
  const modal = $('deckValidatorModal');
  if (modal.open) modal.close(); else modal.removeAttribute('open');
  if (!$('cardModal').open && !$('filterPanel').classList.contains('is-open')) document.body.classList.remove('is-locked');
  state.deckLastFocus?.focus?.({ preventScroll: true });
}

function renderDeckSaveForm() {
  if (!pendingValidatedDeck) return;
  const prompt = $('deckValidationResult').querySelector('.deck-save-prompt');
  if (!prompt) return;
  prompt.outerHTML = `
    <form class="deck-save-form" id="deckSaveForm">
      <div class="deck-save-form__heading"><strong>Como este deck será conhecido?</strong><span>O nome ficará público no arquivo do playgroup. O piloto é opcional.</span></div>
      <label for="deckSaveName">Nome do deck<input id="deckSaveName" name="name" maxlength="80" required placeholder="Ex.: Elfos da Lathril" autocomplete="off" /></label>
      <label for="deckSavePilot">Piloto<input id="deckSavePilot" name="pilot" maxlength="60" placeholder="Seu nome ou apelido" autocomplete="name" /></label>
      <div class="deck-save-form__actions"><button type="submit">Selar no arquivo</button><button type="button" data-save-deck-cancel>Cancelar</button></div>
    </form>`;
  $('deckSaveName')?.focus();
}

async function saveValidatedDeck(event) {
  event.preventDefault();
  if (!pendingValidatedDeck) return;
  const form = event.target;
  const submit = form.querySelector('button[type="submit"]');
  const name = String(new FormData(form).get('name') || '').trim();
  const pilot = String(new FormData(form).get('pilot') || '').trim();
  if (!name) { $('deckSaveName')?.focus(); return; }
  submit.disabled = true;
  submit.textContent = 'Conferindo e salvando…';
  try {
    await persistValidatedDeck(pendingValidatedDeck, { name, pilot });
    pendingValidatedDeck = null;
    form.outerHTML = '<div class="deck-save-success"><span aria-hidden="true">✓</span><div><strong>Deck selado no arquivo.</strong><a href="?page=decks&rev=28">Ver em Decks validados →</a></div></div>';
    showToast('Deck salvo no arquivo do playgroup');
  } catch (error) {
    submit.disabled = false;
    submit.textContent = 'Tentar salvar novamente';
    showToast(error.message || 'Não foi possível salvar o deck agora.');
  }
}

async function persistValidatedDeck(deck, { name, pilot = '' }) {
  const response = await fetch('/api/decks', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, pilot, format: deck.format, entries: deck.entries, valid: deck.valid !== false }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar o deck.');
  const saved = { ...payload.deck, entries: deck.entries };
  savedDeckCache.set(saved.id, saved);
  validatedDecks = [saved, ...validatedDecks.filter((item) => item.id !== saved.id)];
  validatedDecksLoaded = true;
  renderValidatedDecks();
  return saved;
}

async function updateValidatedDeck(deck, { name, pilot = '' }) {
  if (!deckBuilderEdit?.id) throw new Error('Nenhum deck está em edição.');
  const response = await fetch(`/api/decks/${encodeURIComponent(deckBuilderEdit.id)}`, {
    method: 'PUT',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, pilot, format: deck.format, entries: deck.entries, valid: deck.valid !== false, base_updated_at: deckBuilderEdit.baseUpdatedAt }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Não foi possível atualizar o deck.');
  const saved = { ...payload.deck, entries: payload.deck?.entries || deck.entries };
  deckBuilderEdit = { id: saved.id, name: saved.name, pilot: saved.pilot || '', format: saved.format, baseUpdatedAt: saved.created_at, draftVersion: 2 };
  persistDeckBuilderEdit();
  savedDeckCache.set(saved.id, saved);
  validatedDecks = [saved, ...validatedDecks.filter((item) => item.id !== saved.id)];
  validatedDecksLoaded = true;
  renderValidatedDecks();
  return saved;
}

function validatedDeckFormatLabel(key) {
  return deckFormats.find((format) => format.key === key)?.label || key || 'Formatinho';
}

function validatedDeckDate(value) {
  if (!value) return '—';
  const normalized = /T|Z/.test(value) ? value : `${String(value).replace(' ', 'T')}Z`;
  return formatDate(normalized);
}

function renderValidatedDecks() {
  if (!$('validatedDecksGrid')) return;
  const query = slug($('validatedDeckSearch')?.value || '').trim();
  const format = $('validatedDeckFormat')?.value || '';
  const filtered = validatedDecks.filter((deck) => (!query || slug(`${deck.name} ${deck.pilot || ''}`).includes(query)) && (!format || deck.format === format));
  $('validatedDeckCount').textContent = validatedDecks.length;
  $('validatedDeckResultCount').textContent = `${filtered.length} ${filtered.length === 1 ? 'deck' : 'decks'}`;
  $('validatedDecksGrid').innerHTML = filtered.map((deck) => {
    const image = deck.cover_image ? `<img src="${escapeHtml(deck.cover_image)}" alt="" loading="lazy" decoding="async" />` : '';
    const pilot = deck.pilot ? `Pilotado por ${escapeHtml(deck.pilot)}` : 'Piloto não informado';
    const isValid = deck.valid !== false;
    const status = isValid ? 'Validado' : 'Inválido';
    return `<button class="validated-deck-card${isValid ? '' : ' is-invalid'}" type="button" data-saved-deck-id="${escapeHtml(deck.id)}" aria-label="Abrir deck ${escapeHtml(deck.name)}, ${status.toLowerCase()}">
      <span class="validated-deck-card__art">${image}<span class="validated-deck-card__seal${isValid ? '' : ' is-invalid'}"><span aria-hidden="true">${isValid ? '✓' : '×'}</span> ${status}</span></span>
      <span class="validated-deck-card__body"><span class="validated-deck-card__format">${escapeHtml(validatedDeckFormatLabel(deck.format))}</span><h3>${escapeHtml(deck.name)}</h3><span class="validated-deck-card__pilot">${pilot}</span><span class="validated-deck-card__meta"><span>${Number(deck.card_count) || 0} cartas</span><span>${validatedDeckDate(deck.created_at)}</span></span><span class="validated-deck-card__open" aria-hidden="true">→</span></span>
    </button>`;
  }).join('');
  $('validatedDecksGrid').setAttribute('aria-busy', 'false');
  $('validatedDecksLoading').hidden = true;
  $('validatedDecksError').hidden = true;
  const empty = !filtered.length;
  $('validatedDecksEmpty').hidden = !empty;
  if (empty && validatedDecks.length) {
    $('validatedDecksEmpty').querySelector('h2').textContent = 'Nenhum deck com esses filtros';
    $('validatedDecksEmpty').querySelector('p').textContent = 'Tente outro nome ou selecione todos os formatos.';
  } else if (empty) {
    $('validatedDecksEmpty').querySelector('h2').textContent = 'Nenhum deck salvo ainda';
    $('validatedDecksEmpty').querySelector('p').textContent = 'Monte ou valide a primeira lista e inaugure o arquivo do playgroup.';
  }
  $('validatedDecksEmpty').querySelector('[data-open-deck-validator]').hidden = empty && validatedDecks.length > 0;
}

async function loadValidatedDecks({ force = false } = {}) {
  if (validatedDecksLoaded && !force) { renderValidatedDecks(); return; }
  $('validatedDecksLoading').hidden = false;
  $('validatedDecksError').hidden = true;
  $('validatedDecksEmpty').hidden = true;
  $('validatedDecksGrid').setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('/api/decks', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error(`Decks ${response.status}`);
    const payload = await response.json();
    validatedDecks = Array.isArray(payload.decks) ? payload.decks : [];
    validatedDecks.forEach((deck) => savedDeckCache.set(deck.id, deck));
    validatedDecksLoaded = true;
    renderValidatedDecks();
  } catch {
    $('validatedDecksLoading').hidden = true;
    $('validatedDecksGrid').setAttribute('aria-busy', 'false');
    $('validatedDecksError').hidden = false;
  }
}

async function openSavedDeck(id) {
  const modal = $('savedDeckModal');
  let deck = savedDeckCache.get(id);
  try {
    if (!deck?.entries) {
      const response = await fetch(`/api/decks/${encodeURIComponent(id)}`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) throw new Error('Deck não encontrado');
      deck = (await response.json()).deck;
      savedDeckCache.set(id, deck);
    }
    currentSavedDeck = deck;
    const isValid = deck.valid !== false;
    $('editSavedDeck').disabled = false;
    $('editSavedDeck').innerHTML = '<span aria-hidden="true">✎</span> Editar este deck';
    $('savedDeckTitle').textContent = deck.name;
    $('savedDeckEyebrow').textContent = `${isValid ? 'Deck aprovado' : 'Deck em construção'} · ${validatedDeckFormatLabel(deck.format)}`;
    const seal = modal.querySelector('.saved-deck-modal__seal');
    seal.classList.toggle('is-invalid', !isValid);
    seal.innerHTML = `<span aria-hidden="true">${isValid ? '✓' : '×'}</span> ${isValid ? 'Validado' : 'Inválido'}`;
    $('savedDeckPilot').textContent = deck.pilot ? `Pilotado por ${deck.pilot}` : 'Piloto não informado';
    const entries = Array.isArray(deck.entries) ? deck.entries.map((entry) => ({
      ...entry,
      key: entry.key || slug(entry.name).replace(/['’]/g, "'").replace(/\s+/g, ' ').trim(),
    })) : [];
    renderSavedDeckStats(deck, entries);
    renderSavedDeckList(entries);
    if (typeof modal.showModal === 'function') modal.showModal(); else modal.setAttribute('open', '');
    document.body.classList.add('is-locked');
    $('closeSavedDeck').focus();
    void hydrateSavedDeckPreviews(entries, deck.id);
  } catch {
    showToast('Não foi possível abrir este deck agora.');
  }
}

function savedDeckEntryImage(entry) {
  const card = deckCardForEntry(entry);
  const src = card ? imageFor(card, 0, 'small') : '';
  return src
    ? `<img src="${escapeHtml(src)}" alt="" loading="lazy" decoding="async" />`
    : '<span aria-hidden="true">✦</span>';
}

function savedDeckEntryPrice(entry) {
  const card = deckCardForEntry(entry);
  return resolvedCardPrice(card);
}

function savedDeckPricing(entries) {
  return entries.reduce((summary, entry) => {
    const price = savedDeckEntryPrice(entry);
    if (!price) { summary.missing += Number(entry.quantity) || 1; return summary; }
    summary.value += price.value * (Number(entry.quantity) || 1);
    summary.estimated ||= price.estimated;
    summary.quoted += Number(entry.quantity) || 1;
    return summary;
  }, { value: 0, quoted: 0, missing: 0, estimated: false });
}

function renderSavedDeckStats(deck, entries) {
  const pricing = savedDeckPricing(entries);
  const value = pricing.quoted ? `${priceSourceDot(pricing.estimated)}${pricing.estimated || pricing.missing ? '~ ' : ''}${formatBrlPrice(pricing.value)}${pricing.missing ? '+' : ''}` : '—';
  const label = pricing.missing ? 'valor parcial' : pricing.estimated ? 'valor estimado' : 'valor do deck';
  $('savedDeckStats').innerHTML = `<div><strong>${Number(deck.card_count) || 0}</strong><span>cartas</span></div><div><strong>${Number(deck.unique_count) || 0}</strong><span>nomes</span></div><div class="saved-deck-modal__value"><strong>${value}</strong><span>${label}</span></div><div><strong>${validatedDeckDate(deck.created_at)}</strong><span>${deck.valid === false ? 'última edição' : 'validado'}</span></div>`;
}

function renderSavedDeckList(entries) {
  $('savedDeckList').innerHTML = `<div class="saved-deck-list__heading"><strong>Lista completa</strong><span>${entries.length} nomes</span></div><ul>${entries.map((entry) => {
    const price = savedDeckEntryPrice(entry);
    const quantity = Number(entry.quantity) || 1;
    const subtotal = price ? price.value * quantity : null;
    const priceMarkup = price ? `<span class="saved-deck-entry__price${price.estimated ? ' is-estimated' : ''}"><small>${priceSourceDot(price)}${price.estimated ? '~ ' : ''}${formatBrlPrice(price.value)} × ${quantity}</small><strong>${priceSourceDot(price)}${price.estimated ? '~ ' : ''}${formatBrlPrice(subtotal)}</strong></span>` : '<span class="saved-deck-entry__price is-pending"><small>Preço</small><strong>pendente</strong></span>';
    return `<li><button class="saved-deck-entry" type="button" data-saved-deck-entry="${escapeHtml(entry.key)}" aria-label="Abrir detalhes de ${escapeHtml(entry.name)}"><span class="saved-deck-entry__art">${savedDeckEntryImage(entry)}</span><span class="saved-deck-entry__quantity">${quantity}×</span><strong>${escapeHtml(entry.name)}</strong>${priceMarkup}<span class="saved-deck-entry__open" aria-hidden="true">↗</span></button></li>`;
  }).join('')}</ul>`;
}

async function hydrateSavedDeckPreviews(entries, deckId) {
  try {
    const [, book] = await Promise.all([fetchDeckCards(entries), getLigaMagicPriceBook().catch(() => null)]);
    if (book) savedDeckPriceBook = book;
    if (currentSavedDeck?.id !== deckId || !$('savedDeckModal').open) return;
    renderSavedDeckStats(currentSavedDeck, entries);
    renderSavedDeckList(entries);
  } catch {
    // The text list remains fully usable if Scryfall artwork is temporarily unavailable.
  }
}

function closeSavedDeck() {
  const modal = $('savedDeckModal');
  if (modal.open) modal.close(); else modal.removeAttribute('open');
  currentSavedDeck = null;
  if (!$('deckValidatorModal').open && !$('cardModal').open) document.body.classList.remove('is-locked');
}

async function copySavedDeck() {
  if (!currentSavedDeck?.entries) return;
  const text = currentSavedDeck.entries.map((entry) => `${entry.quantity} ${entry.name}`).join('\n');
  try { await navigator.clipboard.writeText(text); showToast('Lista do deck copiada'); }
  catch { window.prompt('Copie a lista do deck:', text); }
}

function emptyDeckBuilder() {
  return { version: 1, main: {}, sideboard: {}, updatedAt: Date.now() };
}

function activeDeckBuilderStorageKey() {
  return deckBuilderEdit?.id ? `${deckBuilderEditDraftPrefix}:${deckBuilderEdit.id}` : deckBuilderStorageKey;
}

function loadDeckBuilderDraft() {
  try {
    const activeKey = activeDeckBuilderStorageKey();
    let raw = localStorage.getItem(activeKey);
    if (!raw && deckBuilderEdit?.id && deckBuilderEdit.draftVersion !== 2) {
      raw = localStorage.getItem(deckBuilderStorageKey);
      if (raw) localStorage.setItem(activeKey, raw);
    }
    const stored = JSON.parse(raw || 'null');
    if (!stored || stored.version !== 1 || !stored.main || !stored.sideboard) throw new Error('invalid');
    deckBuilder = { version: 1, main: stored.main, sideboard: stored.sideboard, updatedAt: Number(stored.updatedAt) || 0 };
  } catch {
    deckBuilder = emptyDeckBuilder();
  }
}

function persistDeckBuilderDraft() {
  deckBuilder.updatedAt = Date.now();
  try { localStorage.setItem(activeDeckBuilderStorageKey(), JSON.stringify(deckBuilder)); } catch { /* O rascunho continua ativo nesta sessão. */ }
}

function loadDeckBuilderEdit() {
  try {
    const editing = JSON.parse(localStorage.getItem(deckBuilderEditStorageKey) || 'null');
    deckBuilderEdit = editing?.id ? editing : null;
  } catch { deckBuilderEdit = null; }
}

async function editCurrentSavedDeck() {
  if (!currentSavedDeck?.entries?.length) return;
  const button = $('editSavedDeck');
  button.disabled = true;
  button.textContent = 'Preparando edição…';
  try {
    const entries = currentSavedDeck.entries.map((entry) => ({ ...entry, key: normalizeDeckName(entry.name) }));
    const cards = await ensureDeckBuilderData(entries);
    const next = emptyDeckBuilder();
    for (const entry of entries) {
      const card = cards.get(normalizeDeckName(entry.name));
      if (!card) throw new Error(`Não foi possível preparar ${entry.name}.`);
      const zone = entry.section === 'sideboard' ? 'sideboard' : 'main';
      const stored = deckBuilderStoredEntry(card, Number(entry.quantity) || 1);
      const existing = next[zone][stored.id];
      next[zone][stored.id] = existing ? { ...existing, quantity: Number(existing.quantity) + stored.quantity } : stored;
    }
    deckBuilder = next;
    deckBuilderEdit = {
      id: currentSavedDeck.id,
      name: currentSavedDeck.name,
      pilot: currentSavedDeck.pilot || '',
      format: currentSavedDeck.format,
      baseUpdatedAt: currentSavedDeck.created_at,
      draftVersion: 2,
    };
    persistDeckBuilderDraft();
    persistDeckBuilderEdit();
    closeSavedDeck();
    location.assign('/deckbuilder');
  } catch (error) {
    button.disabled = false;
    button.innerHTML = '<span aria-hidden="true">✎</span> Editar este deck';
    showToast(error.message || 'Não foi possível iniciar a edição agora.');
  }
}

function persistDeckBuilderEdit() {
  try {
    if (deckBuilderEdit?.id) localStorage.setItem(deckBuilderEditStorageKey, JSON.stringify(deckBuilderEdit));
    else localStorage.removeItem(deckBuilderEditStorageKey);
  } catch { /* A edição continua ativa nesta sessão. */ }
}

function exitDeckBuilderEdit() {
  if (!deckBuilderEdit) return;
  deckBuilderEdit = null;
  persistDeckBuilderEdit();
  loadDeckBuilderDraft();
  deckBuilderValidation = null;
  deckBuilderWasValid = false;
  $('deckBuilderSaveForm').hidden = true;
  document.querySelector('.deck-builder-save-success')?.remove();
  renderDeckBuilderMode();
  renderDeckBuilder();
  updateCardAddLabels();
  if (deckBuilderAllEntries().length) scheduleDeckBuilderValidation();
  showToast('Seu deck em construção foi restaurado');
}

function deckBuilderZoneEntries(zone) {
  return Object.values(deckBuilder[zone] || {}).filter((entry) => entry && Number(entry.quantity) > 0);
}

function deckBuilderAllEntries() {
  return ['main', 'sideboard'].flatMap((zone) => deckBuilderZoneEntries(zone).map((entry) => ({ ...entry, section: zone })));
}

function deckBuilderTotal(zone = 'main') {
  return deckBuilderZoneEntries(zone).reduce((total, entry) => total + (Number(entry.quantity) || 0), 0);
}

function deckBuilderEntryId(card) {
  return card?.oracle_id || card?.id || normalizeDeckName(card?.name || '');
}

function deckBuilderFindEntry(card, zone) {
  const id = deckBuilderEntryId(card);
  const entries = zone ? deckBuilderZoneEntries(zone) : deckBuilderAllEntries();
  return entries.find((entry) => entry.id === id || (card?.oracle_id && entry.oracleId === card.oracle_id) || normalizeDeckName(entry.name) === normalizeDeckName(card?.name));
}

function deckBuilderQuantityForCard(card) {
  return ['main', 'sideboard'].reduce((total, zone) => total + (Number(deckBuilderFindEntry(card, zone)?.quantity) || 0), 0);
}

function deckBuilderCard(entry) {
  return deckCardForEntry({ key: entry.key || normalizeDeckName(entry.name), name: entry.name });
}

function deckBuilderStoredEntry(card, quantity = 1) {
  const id = deckBuilderEntryId(card);
  return {
    id,
    key: normalizeDeckName(card.name),
    oracleId: card.oracle_id || card.id,
    cardId: card.id,
    name: card.name,
    quantity,
    image: imageFor(card, 0, 'small') || '',
    usd: card.prices?.usd || null,
  };
}

function deckBuilderReturnUrl() {
  const fallback = '/?tab=catalog';
  try {
    const value = localStorage.getItem(deckBuilderReturnKey) || fallback;
    return value.startsWith('/') && !value.startsWith('/deckbuilder') ? value : fallback;
  } catch { return fallback; }
}

function rememberDeckBuilderReturnUrl() {
  if (location.pathname === '/deckbuilder') return;
  try { localStorage.setItem(deckBuilderReturnKey, `${location.pathname}${location.search}${location.hash}`); } catch { /* Navegação ainda usa o catálogo padrão. */ }
}

function updateDeckBuilderLinks() {
  const returnUrl = deckBuilderReturnUrl();
  if ($('deckBuilderAddCards')) $('deckBuilderAddCards').href = returnUrl;
  if ($('deckBuilderAddCardsBottom')) $('deckBuilderAddCardsBottom').href = returnUrl;
}

function updateDeckBuilderFab() {
  const total = deckBuilderTotal('main');
  const fab = $('deckBuilderFab');
  if (!fab) return;
  const isBuilderPage = location.pathname === '/deckbuilder';
  fab.hidden = total < 1 || isBuilderPage;
  fab.classList.toggle('is-complete', total >= 60);
  $('deckBuilderFabCount').textContent = total > 999 ? '999+' : String(total);
  if ($('mobileMenuDeckCount')) $('mobileMenuDeckCount').textContent = total > 999 ? '999+' : String(total);
  fab.setAttribute('aria-label', `Abrir Deck Builder com ${total} ${total === 1 ? 'carta' : 'cartas'} no Main Deck`);
}

function updateCardAddLabels() {
  document.querySelectorAll('.card-tile[data-card-id]').forEach((tile) => {
    const card = sourceCards().find((item) => item.id === tile.dataset.cardId) || catalogCardById.get(tile.dataset.cardId);
    const button = tile.querySelector('[data-add-card]');
    if (!card || !button) return;
    const quantity = deckBuilderQuantityForCard(card);
    button.setAttribute('aria-label', quantity
      ? `Adicionar outra cópia de ${card.name} ao Main Deck. ${quantity} no deck atual.`
      : `Adicionar ${card.name} ao Main Deck`);
  });
}

function pulseDeckBuilderFab() {
  const fab = $('deckBuilderFab');
  if (!fab || fab.hidden) return;
  fab.classList.remove('is-receiving');
  requestAnimationFrame(() => fab.classList.add('is-receiving'));
  setTimeout(() => fab.classList.remove('is-receiving'), 360);
}

function animateCardToDeckBuilder(tile, card) {
  const fab = $('deckBuilderFab');
  if (!tile || !fab || fab.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) { pulseDeckBuilderFab(); return; }
  const sourceImage = tile.querySelector('.card-tile__art img');
  const source = (sourceImage || tile.querySelector('.card-tile__art'))?.getBoundingClientRect();
  const target = fab.getBoundingClientRect();
  if (!source || !target.width) { pulseDeckBuilderFab(); return; }
  const flight = document.createElement('img');
  flight.className = 'deck-flight-card';
  flight.alt = '';
  flight.src = sourceImage?.currentSrc || imageFor(card, 0, 'small');
  const width = Math.min(source.width, 150);
  const height = width * 680 / 488;
  const left = source.left + (source.width - width) / 2;
  const top = source.top + (source.height - height) / 2;
  Object.assign(flight.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
  document.body.append(flight);
  const destinationX = target.left + target.width / 2 - (left + width / 2);
  const destinationY = target.top + target.height / 2 - (top + height / 2);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    flight.style.transform = `translate3d(${destinationX}px,${destinationY}px,0) scale(.12) rotate(4deg)`;
    flight.style.opacity = '.08';
  }));
  flight.addEventListener('transitionend', (event) => {
    if (event.propertyName !== 'transform') return;
    flight.remove();
    pulseDeckBuilderFab();
  });
  setTimeout(() => { if (flight.isConnected) { flight.remove(); pulseDeckBuilderFab(); } }, 1250);
}

function addCardToDeckBuilder(card, tile) {
  if (!card) return;
  cardNameKeys(card).forEach((key) => deckCardCache.set(key, card));
  const id = deckBuilderEntryId(card);
  const existing = deckBuilder.main[id];
  deckBuilder.main[id] = existing
    ? { ...existing, quantity: Number(existing.quantity) + 1, image: existing.image || imageFor(card, 0, 'small') }
    : deckBuilderStoredEntry(card);
  persistDeckBuilderDraft();
  updateDeckBuilderFab();
  updateCardAddLabels();
  animateCardToDeckBuilder(tile, card);
  if (!$('deckBuilderPage')?.hidden) scheduleDeckBuilderValidation();

  if (card.isCatalogStub) {
    void hydrateCatalogCards([card]).then(() => {
      cardNameKeys(card).forEach((key) => deckCardCache.set(key, card));
      const entry = deckBuilder.main[id] || deckBuilder.sideboard[id];
      if (entry) {
        entry.image ||= imageFor(card, 0, 'small');
        entry.cardId = card.id;
        entry.oracleId = card.oracle_id || entry.oracleId;
        entry.usd = card.prices?.usd || entry.usd;
        persistDeckBuilderDraft();
        if (!$('deckBuilderPage')?.hidden) renderDeckBuilder();
      }
    });
  }
}

function deckBuilderPricing(entries = deckBuilderAllEntries()) {
  return entries.reduce((summary, entry) => {
    const card = deckBuilderCard(entry);
    const price = resolvedCardPrice(card);
    const quantity = Number(entry.quantity) || 0;
    if (!price) { summary.missing += quantity; return summary; }
    summary.value += price.value * quantity;
    summary.estimated ||= price.estimated;
    summary.quoted += quantity;
    return summary;
  }, { value: 0, quoted: 0, missing: 0, estimated: false });
}

function deckBuilderEntryMarkup(entry, zone) {
  const card = deckBuilderCard(entry);
  const quantity = Number(entry.quantity) || 1;
  const image = card ? imageFor(card, 0, 'small') : entry.image;
  const price = resolvedCardPrice(card);
  const subtotal = price ? price.value * quantity : null;
  const priceMarkup = price
    ? `<span class="deck-builder-entry__price${price.estimated ? ' is-estimated' : ''}"><small>${priceSourceDot(price)}${price.estimated ? '~ ' : ''}${formatBrlPrice(price.value)} × ${quantity}</small><strong>${priceSourceDot(price)}${price.estimated ? '~ ' : ''}${formatBrlPrice(subtotal)}</strong></span>`
    : '<span class="deck-builder-entry__price is-pending"><small>Preço</small><strong>Preparando…</strong></span>';
  const target = zone === 'main' ? 'sideboard' : 'main';
  const moveLabel = zone === 'main' ? '→ Sideboard' : '→ Main Deck';
  return `<li><article class="deck-builder-entry" data-builder-entry="${escapeHtml(entry.id)}" data-builder-zone="${zone}">
    <button class="deck-builder-entry__card" type="button" data-builder-open aria-label="Abrir detalhes de ${escapeHtml(entry.name)}">${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async" />` : '<span class="deck-builder-entry__placeholder" aria-hidden="true">✦</span>'}</button>
    <div class="deck-builder-entry__body"><button class="deck-builder-entry__name" type="button" data-builder-open>${escapeHtml(entry.name)}</button>${priceMarkup}
      <div class="deck-builder-entry__controls"><div class="deck-builder-quantity" aria-label="Quantidade de ${escapeHtml(entry.name)}"><button type="button" data-builder-action="decrease" aria-label="Diminuir ${escapeHtml(entry.name)}">−</button><span>${quantity}</span><button type="button" data-builder-action="increase" aria-label="Aumentar ${escapeHtml(entry.name)}">+</button></div>
        <div class="deck-builder-entry__actions"><button type="button" data-builder-action="move" data-builder-target="${target}">${moveLabel}</button><button type="button" data-builder-action="remove" aria-label="Remover ${escapeHtml(entry.name)}">×</button></div></div>
    </div></article></li>`;
}

function renderDeckBuilder() {
  updateDeckBuilderFab();
  updateDeckBuilderLinks();
  if (!$('deckBuilderPage') || $('deckBuilderPage').hidden) return;
  const mainEntries = deckBuilderZoneEntries('main');
  const sideEntries = deckBuilderZoneEntries('sideboard');
  const mainCount = deckBuilderTotal('main');
  const sideCount = deckBuilderTotal('sideboard');
  const pricing = deckBuilderPricing([...mainEntries, ...sideEntries]);
  $('deckBuilderMainCount').textContent = mainCount;
  $('deckBuilderSideCount').textContent = sideCount;
  $('deckBuilderMainMeta').textContent = `${mainCount} / 60 cartas`;
  $('deckBuilderSideMeta').textContent = `${sideCount} ${sideCount === 1 ? 'carta' : 'cartas'}`;
  $('deckBuilderTotalPrice').innerHTML = pricing.quoted
    ? `${priceSourceDot(pricing.estimated)}${pricing.estimated || pricing.missing ? '~ ' : ''}${formatBrlPrice(pricing.value)}${pricing.missing ? '+' : ''}`
    : 'R$ 0,00';
  $('deckBuilderMainList').innerHTML = mainEntries.map((entry) => deckBuilderEntryMarkup(entry, 'main')).join('');
  $('deckBuilderSideList').innerHTML = sideEntries.map((entry) => deckBuilderEntryMarkup(entry, 'sideboard')).join('');
  $('deckBuilderMainEmpty').hidden = mainEntries.length > 0;
  $('deckBuilderSideEmpty').hidden = sideEntries.length > 0;
  $('deckBuilderClear').disabled = mainEntries.length + sideEntries.length === 0;
  renderDeckBuilderStatus();
}

function renderDeckBuilderStatus() {
  const target = $('deckBuilderStatus');
  if (!target || $('deckBuilderPage')?.hidden) return;
  const seal = target.querySelector('.deck-builder-status__seal');
  const copy = target.querySelector('.deck-builder-status__copy');
  const save = $('deckBuilderSave');
  save.textContent = deckBuilderEdit ? 'Salvar alterações no deck' : 'Salvar deck';
  const total = deckBuilderTotal('main') + deckBuilderTotal('sideboard');
  target.classList.remove('is-valid', 'is-invalid', 'is-loading');
  if (!total) {
    seal.textContent = '◇';
    copy.innerHTML = '<h2>Comece adicionando cartas</h2><p>O Main Deck precisa chegar a 60 cartas e respeitar o limite de R$ 100,00.</p>';
    save.disabled = true;
    return;
  }
  if (!deckBuilderValidation) {
    target.classList.add('is-loading');
    seal.textContent = '✦';
    copy.innerHTML = '<h2>Conferindo o grimório…</h2><p>Atualizando quantidade, preços e legalidade.</p>';
    save.disabled = true;
    return;
  }
  const validation = deckBuilderValidation;
  target.classList.add(validation.valid ? 'is-valid' : 'is-invalid');
  seal.textContent = validation.valid ? '✓' : '×';
  copy.innerHTML = validation.valid
    ? '<h2>Deck válido no Formatinho</h2><p>60 cartas, orçamento e legalidade conferidos. A lista está pronta para ser selada.</p>'
    : `<h2>Deck ainda não é válido</h2><ul>${validation.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>`;
  save.textContent = validation.valid
    ? (deckBuilderEdit ? 'Salvar alterações no deck' : 'Salvar em decks validados')
    : (deckBuilderEdit ? 'Salvar alterações como inválido' : 'Salvar como deck inválido');
  save.disabled = !validation.pending;
  if (validation.valid && !deckBuilderWasValid && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    target.animate([{ transform: 'scale(.985)', opacity: .86 }, { transform: 'scale(1)', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  deckBuilderWasValid = validation.valid;
}

function combinedDeckBuilderEntries() {
  const merged = new Map();
  deckBuilderAllEntries().forEach((entry) => {
    const key = normalizeDeckName(entry.name);
    const current = merged.get(key);
    if (current) current.quantity += Number(entry.quantity) || 0;
    else merged.set(key, { key, name: entry.name, quantity: Number(entry.quantity) || 0 });
  });
  return [...merged.values()];
}

async function ensureDeckBuilderData(entries) {
  const catalogPromise = getCatalogData().then((data) => {
    catalogIndex ||= data.index;
    catalogPriceIndex ||= data.prices;
  }).catch(() => null);
  const marketPromise = getLigaMagicPriceBook().then((book) => { savedDeckPriceBook = book; }).catch(() => null);
  const cardsPromise = fetchDeckCards(entries);
  const [, , cards] = await Promise.all([catalogPromise, marketPromise, cardsPromise]);
  return cards;
}

async function validateDeckBuilder() {
  const token = ++deckBuilderValidationToken;
  const entries = combinedDeckBuilderEntries();
  if (!entries.length) { deckBuilderValidation = null; renderDeckBuilder(); return; }
  deckBuilderValidation = null;
  renderDeckBuilderStatus();
  try {
    const cards = await ensureDeckBuilderData(entries);
    if (token !== deckBuilderValidationToken) return;
    const legality = evaluateDeckLegality(entries, 'formatinho', cards);
    const mainCount = deckBuilderTotal('main');
    const pricing = deckBuilderPricing();
    const reasons = [];
    if (mainCount !== 60) reasons.push(`Main Deck: ${mainCount} / 60 cartas`);
    if (pricing.missing) reasons.push(`${pricing.missing} ${pricing.missing === 1 ? 'carta está' : 'cartas estão'} sem preço disponível`);
    else if (pricing.value > 100) reasons.push(`Preço: ${formatBrlPrice(pricing.value)} / R$ 100,00`);
    if (legality.issueCount) reasons.push(`${legality.issueCount} ${legality.issueCount === 1 ? 'carta não permitida' : 'cartas não permitidas'}`);
    const priceValid = !pricing.missing && pricing.value <= 100;
    const valid = mainCount === 60 && priceValid && legality.valid;
    const allEntries = deckBuilderAllEntries();
    const coverEntry = deckBuilderZoneEntries('main')[0] || allEntries[0];
    const coverCard = coverEntry ? deckBuilderCard(coverEntry) : null;
    deckBuilderValidation = {
      valid, reasons: valid ? [] : reasons, mainCount, pricing, legality,
      pending: {
        entries: allEntries.map((entry) => ({ name: entry.name, quantity: Number(entry.quantity), section: entry.section })),
        format: 'formatinho',
        valid,
        totalCopies: mainCount,
        uniqueCount: entries.length,
        coverName: coverCard?.name || coverEntry?.name || '',
        coverImage: coverCard?.image_uris?.art_crop || coverCard?.image_uris?.normal || coverEntry?.image || '',
      },
    };
    renderDeckBuilder();
  } catch {
    if (token !== deckBuilderValidationToken) return;
    deckBuilderValidation = { valid: false, reasons: ['Não foi possível concluir a conferência agora. Tente novamente quando a conexão voltar.'] };
    renderDeckBuilder();
  }
}

function scheduleDeckBuilderValidation() {
  deckBuilderValidation = null;
  deckBuilderWasValid = false;
  clearTimeout(deckBuilderValidationTimer);
  renderDeckBuilder();
  deckBuilderValidationTimer = setTimeout(() => { void validateDeckBuilder(); }, 180);
}

function mutateDeckBuilderEntry(zone, id, action, target) {
  const entry = deckBuilder[zone]?.[id];
  if (!entry) return;
  if (action === 'increase') entry.quantity = Math.min(999, Number(entry.quantity) + 1);
  if (action === 'decrease') entry.quantity = Number(entry.quantity) - 1;
  if (action === 'remove' || Number(entry.quantity) <= 0) delete deckBuilder[zone][id];
  if (action === 'move' && ['main', 'sideboard'].includes(target)) {
    const existing = deckBuilder[target][id];
    deckBuilder[target][id] = existing ? { ...existing, quantity: Number(existing.quantity) + Number(entry.quantity) } : { ...entry };
    delete deckBuilder[zone][id];
  }
  persistDeckBuilderDraft();
  $('deckBuilderSaveForm').hidden = true;
  scheduleDeckBuilderValidation();
}

async function openDeckBuilderCard(zone, id) {
  const entry = deckBuilder[zone]?.[id];
  if (!entry) return;
  let card = deckBuilderCard(entry);
  if (!card) {
    const cards = await fetchDeckCards([{ key: normalizeDeckName(entry.name), name: entry.name, quantity: entry.quantity }]);
    card = cards.get(normalizeDeckName(entry.name));
  }
  if (card) openCard(normalizeCard(card));
  else showToast('A carta ainda está sendo preparada. Tente novamente em instantes.');
}

async function saveDeckBuilder(event) {
  event.preventDefault();
  if (!deckBuilderValidation?.pending) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const name = String(data.get('name') || '').trim();
  const pilot = String(data.get('pilot') || '').trim();
  if (!name) { $('deckBuilderSaveName').focus(); return; }
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  submit.textContent = 'Conferindo e salvando…';
  try {
    const saved = deckBuilderEdit
      ? await updateValidatedDeck(deckBuilderValidation.pending, { name, pilot })
      : await persistValidatedDeck(deckBuilderValidation.pending, { name, pilot });
    form.hidden = true;
    form.reset();
    const success = document.createElement('div');
    success.className = 'deck-builder-save-success';
    const isValid = saved.valid !== false;
    success.classList.toggle('is-invalid', !isValid);
    success.innerHTML = `<span aria-hidden="true">${isValid ? '✓' : '×'}</span><div><strong>${deckBuilderEdit ? 'Alterações publicadas.' : 'Deck salvo no arquivo.'}</strong>${isValid ? '' : '<br><span>Marcado como inválido até cumprir as regras.</span>'}<br><a href="/?page=decks&rev=31">Ver no arquivo →</a></div>`;
    if (deckBuilderEdit) {
      deckBuilderEdit.name = saved.name;
      deckBuilderEdit.pilot = saved.pilot || '';
      deckBuilderEdit.baseUpdatedAt = saved.created_at;
      persistDeckBuilderEdit();
    }
    form.after(success);
    showToast(isValid ? 'Deck salvo como válido' : 'Deck salvo e marcado como inválido');
  } catch (error) {
    submit.disabled = false;
    submit.textContent = 'Tentar salvar novamente';
    showToast(error.message || 'Não foi possível salvar o deck agora.');
  }
}

function openMobileMenu() {
  const menu = $('mobileMenu');
  if (!menu) return;
  $('mobileMenuTrigger').setAttribute('aria-expanded', 'true');
  if (typeof menu.showModal === 'function') menu.showModal(); else menu.setAttribute('open', '');
  document.body.classList.add('is-locked');
  $('mobileMenuClose').focus();
}

function closeMobileMenu({ restoreFocus = true } = {}) {
  const menu = $('mobileMenu');
  if (!menu?.open && !menu?.hasAttribute('open')) return;
  if (menu.open) menu.close(); else menu.removeAttribute('open');
  $('mobileMenuTrigger').setAttribute('aria-expanded', 'false');
  if (!$('cardModal').open && !$('deckValidatorModal').open && !$('savedDeckModal').open) document.body.classList.remove('is-locked');
  if (restoreFocus) $('mobileMenuTrigger').focus();
}

function isInstalledWebApp() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

async function installFormatinhoApp() {
  const help = $('installAppHelp');
  if (isInstalledWebApp()) {
    $('installAppHint').textContent = 'O Formatinho já está instalado';
    help.hidden = false;
    $('installAppInstructions').textContent = 'Este aparelho já está usando o Formatinho como web app.';
    return;
  }
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => null);
    deferredInstallPrompt = null;
    return;
  }
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  help.hidden = false;
  $('installAppInstructions').textContent = isIos
    ? 'No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.'
    : 'Abra o menu do navegador e escolha “Adicionar à tela inicial” ou “Instalar aplicativo”.';
}

async function shareCurrentPage() {
  if (navigator.share) {
    try { await navigator.share({ title: document.title, url: location.href }); return; } catch (error) { if (error?.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(location.href); showToast('Link desta seleção copiado'); }
  catch { window.prompt('Copie o link desta seleção:', location.href); }
}

function renderDeckBuilderMode() {
  if (!$('deckBuilderPage')) return;
  if (deckBuilderEdit) {
    $('deckBuilderEyebrow').innerHTML = '<span aria-hidden="true">✦</span> Edição pública';
    $('deckBuilderTitle').textContent = 'Aprimore este deck';
    $('deckBuilderBrief').textContent = `Você está editando “${deckBuilderEdit.name}”. A lista será revalidada antes de publicar.`;
    $('deckBuilderExitEdit').hidden = false;
  } else {
    $('deckBuilderEyebrow').innerHTML = '<span aria-hidden="true">✦</span> Oficina do Formatinho';
    $('deckBuilderTitle').textContent = 'Monte seu deck';
    $('deckBuilderBrief').textContent = 'Organize sua lista, acompanhe o orçamento e veja a validação acontecer enquanto você constrói.';
    $('deckBuilderExitEdit').hidden = true;
  }
}

async function loadDeckBuilderPage() {
  renderDeckBuilderMode();
  renderDeckBuilder();
  const entries = combinedDeckBuilderEntries();
  if (!entries.length) return;
  await validateDeckBuilder();
}

function configurePageMode() {
  const builderPage = location.pathname.replace(/\/+$/, '') === '/deckbuilder';
  const decksPage = !builderPage && new URLSearchParams(location.search).get('page') === 'decks';
  $('homeHero').hidden = decksPage || builderPage;
  $('archiveSection').hidden = decksPage || builderPage;
  $('validatedDecksPage').hidden = !decksPage;
  $('deckBuilderPage').hidden = !builderPage;
  document.body.classList.toggle('is-decks-page', decksPage);
  document.body.classList.toggle('is-deck-builder-page', builderPage);
  document.querySelector('.brand-lockup').href = decksPage || builderPage ? '/' : '#top';
  if (decksPage) {
    document.title = 'Decks validados · Códice do Formatinho';
    document.querySelector('.skip-link').href = '#validatedDecksTitle';
    loadValidatedDecks();
  } else if (builderPage) {
    document.title = 'Deck Builder · Códice do Formatinho';
    document.querySelector('.skip-link').href = '#deckBuilderTitle';
    document.querySelector('.skip-link').textContent = 'Ir para o Deck Builder';
  }
  return { decksPage, builderPage };
}

function bind() {
  readUrl();

  $('mobileMenuTrigger').addEventListener('click', openMobileMenu);
  $('mobileMenuClose').addEventListener('click', () => closeMobileMenu());
  $('mobileMenu').addEventListener('cancel', (event) => { event.preventDefault(); closeMobileMenu(); });
  $('mobileMenu').addEventListener('click', (event) => { if (event.target === $('mobileMenu')) closeMobileMenu(); });
  $('mobileMenu').querySelectorAll('[data-mobile-menu-link]').forEach((link) => link.addEventListener('click', () => closeMobileMenu({ restoreFocus: false })));
  $('mobileMenuValidator').addEventListener('click', () => { closeMobileMenu({ restoreFocus: false }); openDeckValidator(); });
  $('installAppButton').addEventListener('click', installFormatinhoApp);
  $('mobileMenuShare').addEventListener('click', shareCurrentPage);
  addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    $('installAppHint').textContent = 'Instale com um toque neste aparelho';
  });
  addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    $('installAppHint').textContent = 'Instalado na tela inicial';
    $('installAppHelp').hidden = true;
  });

  $('collectionTabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-collection-tab]');
    if (button) switchCollectionTab(button.dataset.collectionTab);
  });
  $('collectionTabs').addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const order = ['banlist', 'catalog'];
    const current = order.indexOf(state.tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? order.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + order.length) % order.length;
    switchCollectionTab(order[next]).then(() => document.querySelector(`[data-collection-tab="${order[next]}"]`)?.focus());
  });

  $('formatSeals').addEventListener('click', (event) => {
    const button = event.target.closest('[data-format]');
    if (!button) return;
    const key = button.dataset.format;
    state.selectedFormats.has(key) ? state.selectedFormats.delete(key) : state.selectedFormats.add(key);
    syncUrl(); applyFilters();
  });

  $('identityFilter').addEventListener('click', (event) => {
    const button = event.target.closest('[data-color]');
    if (!button) return;
    const key = button.dataset.color;
    state.selectedColors.has(key) ? state.selectedColors.delete(key) : state.selectedColors.add(key);
    syncUrl(); applyFilters();
  });

  $('colorMatchMode').addEventListener('change', (event) => {
    state.colorMatch = event.target.value;
    syncUrl(); applyFilters();
  });

  const applySelect = (key, element, { refreshOracle = false } = {}) => element.addEventListener('change', () => {
    state[key] = element.value;
    syncUrl();
    applyFiltersSync({ allowPendingOracle: refreshOracle });
    if (refreshOracle) void refreshActiveRemoteFilters(state);
  });
  applySelect('type', $('typeFilter'), { refreshOracle: true });
  applySelect('cmc', $('cmcFilter'), { refreshOracle: true });
  applySelect('rarity', $('rarityFilter'), { refreshOracle: true });
  applySelect('set', $('setFilter'), { refreshOracle: true });
  applySelect('sort', $('sortFilter'));

  let searchTimer;
  $('searchInput').addEventListener('input', (event) => {
    clearTimeout(searchTimer);
    $('searchClear').hidden = !event.target.value;
    searchTimer = setTimeout(() => {
      state.query = event.target.value.trim();
      syncUrl();
      applyFiltersSync({ allowPendingOracle: true });
      void refreshActiveRemoteFilters(state);
    }, 220);
  });
  $('searchClear').addEventListener('click', () => { clearTimeout(searchTimer); $('searchInput').value = ''; state.query = ''; clearScryfallSyntaxSearch(); $('searchClear').hidden = true; syncUrl(); applyFilters(); $('searchInput').focus(); });

  const setView = (view) => { state.view = view; syncUrl(); render(); };
  $('cardsView').addEventListener('click', () => setView('cards'));
  $('listView').addEventListener('click', () => setView('list'));

  $('cardGrid').addEventListener('click', async (event) => {
    const tile = event.target.closest('[data-card-id]');
    if (!tile) return;
    const card = state.tab === 'catalog'
      ? catalogCardById.get(tile.dataset.cardId) || sourceCards().find((item) => item.id === tile.dataset.cardId)
      : sourceCards().find((item) => item.id === tile.dataset.cardId);
    if (event.target.closest('[data-add-card]')) { addCardToDeckBuilder(card, tile); return; }
    if (card?.isCatalogStub) await hydrateCatalogCards([card]);
    if (card) openCard(card);
  });
  $('loadMore').addEventListener('click', () => { state.visible += 48; renderCards(); });
  $('clearFilters').addEventListener('click', clearFilters);
  $('emptyClear').addEventListener('click', clearFilters);
  $('emptySuggestions').addEventListener('click', (event) => {
    const button = event.target.closest('[data-suggestion]');
    if (!button) return;
    state.query = button.dataset.suggestion;
    $('searchInput').value = state.query;
    syncUrl(); applyFilters();
  });
  $('activeFilters').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-filter]');
    if (!button) return;
    const key = button.dataset.removeFilter;
    if (key.startsWith('format:')) state.selectedFormats.delete(key.slice(7));
    else if (key.startsWith('color:')) state.selectedColors.delete(key.slice(6));
    else if (key === 'colorMatch') state.colorMatch = 'exact';
    else if (key === 'q') { state.query = ''; $('searchInput').value = ''; clearScryfallSyntaxSearch(); }
    else if (key === 'maxPrice') { state.maxPrice = 99; $('priceFilter').value = 99; $('priceFilterValue').textContent = 'R$ 99'; }
    else if (key === 'showBanned') { state.showBanned = false; $('showBannedCatalog').checked = false; }
    else state[key] = '';
    syncUrl(); restoreControlsFromState(); populateSetFilter();
    applyFiltersSync({ allowPendingOracle: true });
    void refreshActiveRemoteFilters(state);
  });

  let priceFilterTimer;
  const commitPriceFilter = () => {
    clearTimeout(priceFilterTimer);
    state.maxPrice = Number($('priceFilter').value);
    syncUrl(); applyFilters();
  };
  $('priceFilter').addEventListener('input', (event) => {
    $('priceFilterValue').textContent = `R$ ${event.target.value}`;
    clearTimeout(priceFilterTimer);
    priceFilterTimer = setTimeout(commitPriceFilter, 90);
  });
  $('priceFilter').addEventListener('change', commitPriceFilter);
  $('showBannedCatalog').addEventListener('change', (event) => { state.showBanned = event.target.checked; syncUrl(); applyFilters(); });

  $('openFilters').addEventListener('click', openFilterSheet);
  $('closeFilters').addEventListener('click', () => closeFilterSheet());
  $('applyFilters').addEventListener('click', () => closeFilterSheet());
  $('filterPanel').addEventListener('click', (event) => { if (event.target === $('filterPanel')) closeFilterSheet(); });

  $('openDeckValidator').addEventListener('click', openDeckValidator);
  $('closeDeckValidator').addEventListener('click', closeDeckValidator);
  $('deckValidatorModal').addEventListener('cancel', (event) => { event.preventDefault(); closeDeckValidator(); });
  $('deckValidatorModal').addEventListener('click', (event) => { if (event.target === $('deckValidatorModal')) closeDeckValidator(); });
  $('deckFormatChoices').addEventListener('click', (event) => {
    const button = event.target.closest('[data-deck-format]');
    if (button) selectDeckFormat(button.dataset.deckFormat);
  });
  $('deckFormatChoices').addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = deckFormats.findIndex((format) => format.key === state.deckFormat);
    const direction = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1;
    const next = deckFormats[(currentIndex + direction + deckFormats.length) % deckFormats.length];
    selectDeckFormat(next.key, { focus: true });
  });
  $('deckListInput').addEventListener('input', updateDeckListCount);
  $('clearDeckList').addEventListener('click', () => { $('deckListInput').value = ''; updateDeckListCount(); $('deckListInput').focus(); });
  $('validateDeck').addEventListener('click', validateDeck);
  $('deckValidationResult').addEventListener('click', (event) => {
    if (event.target.closest('[data-save-deck-accept]')) renderDeckSaveForm();
    if (event.target.closest('[data-save-deck-decline]')) { event.target.closest('.deck-save-prompt')?.remove(); pendingValidatedDeck = null; }
    if (event.target.closest('[data-save-deck-cancel]')) { event.target.closest('.deck-save-form')?.remove(); pendingValidatedDeck = null; }
  });
  $('deckValidationResult').addEventListener('submit', (event) => { if (event.target.matches('#deckSaveForm')) saveValidatedDeck(event); });

  $('openValidatorFromDecks').addEventListener('click', openDeckValidator);
  $('validatedDecksPage').addEventListener('click', (event) => { if (event.target.closest('[data-open-deck-validator]')) openDeckValidator(); });
  $('validatedDeckSearch').addEventListener('input', renderValidatedDecks);
  $('validatedDeckFormat').addEventListener('change', renderValidatedDecks);
  $('retryValidatedDecks').addEventListener('click', () => loadValidatedDecks({ force: true }));
  $('validatedDecksGrid').addEventListener('click', (event) => {
    const card = event.target.closest('[data-saved-deck-id]');
    if (card) openSavedDeck(card.dataset.savedDeckId);
  });
  $('closeSavedDeck').addEventListener('click', closeSavedDeck);
  $('savedDeckList').addEventListener('click', (event) => {
    const item = event.target.closest('[data-saved-deck-entry]');
    if (!item) return;
    const card = deckCardForEntry({ key: item.dataset.savedDeckEntry });
    if (!card) { showToast('A carta ainda está sendo preparada. Tente novamente em instantes.'); return; }
    openCard(normalizeCard(card));
  });
  $('copySavedDeck').addEventListener('click', copySavedDeck);
  $('editSavedDeck').addEventListener('click', editCurrentSavedDeck);
  $('savedDeckModal').addEventListener('cancel', (event) => { event.preventDefault(); closeSavedDeck(); });
  $('savedDeckModal').addEventListener('click', (event) => { if (event.target === $('savedDeckModal')) closeSavedDeck(); });

  $('deckBuilderFab').addEventListener('click', () => {
    rememberDeckBuilderReturnUrl();
    location.assign('/deckbuilder');
  });
  $('deckBuilderPage').addEventListener('click', (event) => {
    const item = event.target.closest('[data-builder-entry]');
    if (!item) return;
    const zone = item.dataset.builderZone;
    const id = item.dataset.builderEntry;
    if (event.target.closest('[data-builder-open]')) { void openDeckBuilderCard(zone, id); return; }
    const action = event.target.closest('[data-builder-action]');
    if (action) mutateDeckBuilderEntry(zone, id, action.dataset.builderAction, action.dataset.builderTarget);
  });
  $('deckBuilderSave').addEventListener('click', () => {
    if (!deckBuilderValidation?.pending) return;
    document.querySelector('.deck-builder-save-success')?.remove();
    $('deckBuilderSaveForm').hidden = false;
    if (deckBuilderEdit) {
      $('deckBuilderSaveName').value = deckBuilderEdit.name || '';
      $('deckBuilderSavePilot').value = deckBuilderEdit.pilot || '';
      $('deckBuilderSaveForm').querySelector('.deck-save-form__heading').innerHTML = `<strong>Publicar alterações neste deck?</strong><span>${deckBuilderValidation.valid ? 'A lista será publicada como válida.' : 'A lista continuará pública e será marcada como inválida até cumprir as regras.'}</span>`;
      $('deckBuilderSaveForm').querySelector('button[type="submit"]').textContent = 'Publicar alterações';
    } else {
      $('deckBuilderSaveForm').querySelector('.deck-save-form__heading').innerHTML = `<strong>Como este deck será conhecido?</strong><span>${deckBuilderValidation.valid ? 'O nome ficará público no arquivo do playgroup.' : 'O deck ficará público com o selo Inválido e poderá ser editado depois.'} O piloto é opcional.</span>`;
      $('deckBuilderSaveForm').querySelector('button[type="submit"]').textContent = deckBuilderValidation.valid ? 'Selar no arquivo' : 'Salvar como inválido';
    }
    $('deckBuilderSaveName').focus();
  });
  $('deckBuilderSaveCancel').addEventListener('click', () => { $('deckBuilderSaveForm').hidden = true; });
  $('deckBuilderExitEdit').addEventListener('click', exitDeckBuilderEdit);
  $('deckBuilderSaveForm').addEventListener('submit', saveDeckBuilder);
  $('deckBuilderClear').addEventListener('click', () => {
    const modal = $('deckBuilderClearModal');
    modal.returnValue = '';
    if (typeof modal.showModal === 'function') modal.showModal(); else modal.setAttribute('open', '');
  });
  $('deckBuilderClearModal').addEventListener('close', () => {
    if ($('deckBuilderClearModal').returnValue !== 'confirm') return;
    const clearedKey = activeDeckBuilderStorageKey();
    const wasEditing = Boolean(deckBuilderEdit);
    deckBuilder = emptyDeckBuilder();
    deckBuilderValidation = null;
    deckBuilderWasValid = false;
    try { localStorage.removeItem(clearedKey); } catch { /* Estado em memória já foi limpo. */ }
    if (wasEditing) {
      deckBuilderEdit = null;
      persistDeckBuilderEdit();
      loadDeckBuilderDraft();
    }
    $('deckBuilderSaveForm').hidden = true;
    document.querySelector('.deck-builder-save-success')?.remove();
    renderDeckBuilderMode();
    renderDeckBuilder();
    updateCardAddLabels();
    if (wasEditing && deckBuilderAllEntries().length) scheduleDeckBuilderValidation();
    showToast(wasEditing ? 'Edição descartada; seu deck foi restaurado' : 'Deck limpo');
  });

  $('closeCardModal').addEventListener('click', closeCard);
  $('flipCard').addEventListener('click', flipModalCard);
  $('previousCard').addEventListener('click', () => navigateModal(-1));
  $('nextCard').addEventListener('click', () => navigateModal(1));
  $('cardModal').addEventListener('cancel', (event) => { event.preventDefault(); closeCard(); });
  document.querySelector('.modal-section--data').addEventListener('toggle', (event) => { if (event.target.open) hydrateRawDetails(); });

  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !document.body.classList.contains('is-deck-builder-page') && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) { event.preventDefault(); (document.body.classList.contains('is-decks-page') ? $('validatedDeckSearch') : $('searchInput')).focus(); }
    if (event.key === 'Escape' && $('filterPanel').classList.contains('is-open')) { event.preventDefault(); closeFilterSheet(); }
    if (event.key === 'Tab' && $('filterPanel').classList.contains('is-open') && innerWidth < 960) {
      const focusable = [...$('filterPanel').querySelectorAll('button,select,input,[href]')].filter((item) => !item.hidden && !item.disabled);
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    if ($('cardModal').open && event.key === 'ArrowLeft') navigateModal(-1);
    if ($('cardModal').open && event.key === 'ArrowRight') navigateModal(1);
  });

  $('shareButton').addEventListener('click', shareCurrentPage);
  $('retryButton').addEventListener('click', () => { if (state.tab === 'catalog') retryCatalogLoad(); else loadCards(); });

  addEventListener('online', updateConnectionStatus);
  addEventListener('offline', updateConnectionStatus);
  matchMedia('(min-width: 960px)').addEventListener('change', () => { if ($('filterPanel').classList.contains('is-open')) closeFilterSheet({ restoreFocus: false }); });
  addEventListener('popstate', () => {
    const requestedTab = new URLSearchParams(location.search).get('tab') === 'catalog' ? 'catalog' : 'banlist';
    if (requestedTab !== state.tab) {
      readUrl();
      restoreControlsFromState();
      if (!state.loaded) { if (state.tab === 'catalog') loadCatalog(); else loadCards(); }
      else {
        $('loadingState').hidden = true;
        $('errorState').hidden = true;
        populateSetFilter();
        applyFiltersSync({ allowPendingOracle: true });
        void refreshActiveRemoteFilters(state);
      }
      return;
    }
    const cardId = new URLSearchParams(location.search).get('card');
    if (!cardId && $('cardModal').open) dismissCard();
    else if (cardId && state.cards.length && state.modalCard?.id !== cardId) openCard(state.cards.find((card) => card.id === cardId), { pushHistory: false });
  });
  updateConnectionStatus();
}

async function getCatalogData() {
  return getPersistentCatalogData();
}

function renderPriceCoverage(payload) {
  const root = $('priceCoverage');
  const track = $('priceCoverageTrack');
  const coverage = payload?.coverage;
  if (!root || !track || !coverage) return false;
  const target = Math.max(0, Number(coverage.target_count) || 0);
  const confirmed = Math.min(target || Infinity, Math.max(0, Number(coverage.confirmed_count) || 0));
  const percent = target ? Math.min(100, (confirmed / target) * 100) : 0;
  const countFormat = new Intl.NumberFormat('pt-BR');
  const percentFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  $('priceCoverageCount').textContent = countFormat.format(confirmed);
  $('priceCoverageTotal').textContent = countFormat.format(target);
  $('priceCoveragePercent').textContent = `${percentFormat.format(percent)}%`;
  root.style.setProperty('--price-coverage', `${percent}%`);
  root.classList.toggle('is-empty', confirmed === 0);
  root.hidden = false;
  root.setAttribute('aria-busy', 'false');
  track.setAttribute('aria-valuenow', percent.toFixed(1));
  track.setAttribute('aria-valuetext', `${countFormat.format(confirmed)} de ${countFormat.format(target)} cartas com preço confirmado pela LigaMagic, ${percentFormat.format(percent)} por cento`);
  return true;
}

async function hydratePriceCoverage() {
  const root = $('priceCoverage');
  if (!root) return;
  try {
    const response = await fetch(catalogPriceIndexUrl, { headers: { Accept: 'application/json' }, cache: 'no-cache' });
    if (!response.ok || !renderPriceCoverage(await response.json())) throw new Error('Cobertura indisponível');
  } catch {
    root.hidden = true;
  }
}

function openCatalogCacheDb() {
  if (catalogCacheDbPromise) return catalogCacheDbPromise;
  if (!('indexedDB' in window)) return Promise.resolve(null);
  catalogCacheDbPromise = new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    };
    const timeout = setTimeout(() => finish(null), 1200);
    let request;
    try {
      request = indexedDB.open(catalogCacheDbName, 1);
    } catch {
      finish(null);
      return;
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('resources')) request.result.createObjectStore('resources', { keyPath: 'key' });
    };
    request.onsuccess = () => finish(request.result);
    request.onerror = () => finish(null);
    request.onblocked = () => finish(null);
  });
  return catalogCacheDbPromise;
}

async function readPersistentCatalogResource(key) {
  const db = await openCatalogCacheDb();
  if (!db) return null;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    };
    const timeout = setTimeout(() => finish(null), 800);
    try {
      const transaction = db.transaction('resources', 'readonly');
      const request = transaction.objectStore('resources').get(key);
      request.onsuccess = () => finish(request.result || null);
      request.onerror = () => finish(null);
      transaction.onabort = () => finish(null);
    } catch {
      finish(null);
    }
  });
}

async function writePersistentCatalogResource(key, payload) {
  const db = await openCatalogCacheDb();
  if (!db) return;
  await new Promise((resolve) => {
    const transaction = db.transaction('resources', 'readwrite');
    transaction.objectStore('resources').put({ key, payload, storedAt: Date.now() });
    transaction.oncomplete = resolve;
    transaction.onerror = resolve;
    transaction.onabort = resolve;
  });
}

function validCatalogResource(key, payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (key === 'catalog-index-v1') {
    if (!Array.isArray(payload.cards) || payload.cards.length < 100) return false;
    const samples = [payload.cards[0], payload.cards[Math.floor(payload.cards.length / 2)], payload.cards.at(-1)];
    return samples.every((tuple) => Array.isArray(tuple) && tuple.length >= 9 && typeof tuple[0] === 'string' && typeof tuple[2] === 'string');
  }
  if (key === 'catalog-prices-v1') return payload.prices && typeof payload.prices === 'object';
  return true;
}

async function fetchCatalogResource(url, key, maxAge) {
  const cached = await readPersistentCatalogResource(key);
  const cachedIsValid = validCatalogResource(key, cached?.payload);
  const cacheIsFresh = cachedIsValid && Date.now() - Number(cached.storedAt || 0) < maxAge;
  const fetchFreshFrom = async (resourceUrl, timeoutMs, cacheMode) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(resourceUrl, { headers: { Accept: 'application/json' }, cache: cacheMode, signal: controller.signal });
      if (!response.ok) throw new Error(`${key} ${response.status}`);
      const payload = await response.json();
      if (!validCatalogResource(key, payload)) throw new Error(`${key} invalido`);
      void writePersistentCatalogResource(key, payload);
      return payload;
    } finally {
      clearTimeout(timeout);
    }
  };
  const fetchFresh = async () => {
    try {
      return await fetchFreshFrom(url, 12_000, 'default');
    } catch (primaryError) {
      const fallbackUrl = catalogFallbackUrls[key];
      if (!fallbackUrl || fallbackUrl === url) throw primaryError;
      console.warn(`Fonte principal de ${key} indisponível; tentando a cópia direta.`, primaryError);
      return fetchFreshFrom(`${fallbackUrl}?v=${Date.now()}`, 20_000, 'no-store');
    }
  };
  if (cacheIsFresh) {
    void fetchFresh().catch(() => {});
    return cached.payload;
  }
  try {
    return await fetchFresh();
  } catch (error) {
    if (cachedIsValid) return cached.payload;
    throw error;
  }
}

let persistentCatalogDataPromise;
async function getPersistentCatalogData() {
  if (!persistentCatalogDataPromise) {
    persistentCatalogDataPromise = Promise.all([
      fetchCatalogResource(catalogIndexUrl, 'catalog-index-v1', 12 * 60 * 60 * 1000),
      fetchCatalogResource(catalogPriceIndexUrl, 'catalog-prices-v1', 90 * 60 * 1000).catch(() => ({ prices: {}, coverage: null })),
    ]).then(([index, prices]) => ({ index, prices })).catch((error) => {
      persistentCatalogDataPromise = null;
      throw error;
    });
  }
  return persistentCatalogDataPromise;
}

async function buildCatalogCards(tuples, token, view) {
  const cards = new Array(tuples.length);
  for (let start = 0; start < tuples.length; start += 4000) {
    if (token !== view.loadToken) return [];
    const end = Math.min(start + 4000, tuples.length);
    for (let index = start; index < end; index += 1) cards[index] = catalogCardFromTuple(tuples[index]);
    if (end < tuples.length) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return cards;
}

function retryCatalogLoad() {
  const view = viewStates.catalog;
  resetCatalogWorker(new Error('Catálogo reiniciado pelo usuário'));
  persistentCatalogDataPromise = null;
  clearScryfallSyntaxSearch();
  view.oracleSearchAbort?.abort();
  view.oracleSearchAbort = null;
  view.oracleMatchKey = '';
  view.oracleMatches = null;
  view.loaded = false;
  void loadCatalog();
}

async function loadCatalog() {
  const view = viewStates.catalog;
  const token = ++view.loadToken;
  if (state === view) {
    setCatalogPhase('loading-data');
    $('loadingState').hidden = false; $('errorState').hidden = true; $('emptyState').hidden = true;
    $('cardGrid').setAttribute('aria-busy', 'true'); $('cardGrid').innerHTML = '';
  }
  try {
    const data = await getPersistentCatalogData();
    catalogIndex = data.index;
    catalogPriceIndex = data.prices;
    if (token !== view.loadToken) return;
    if (!Array.isArray(catalogIndex?.cards) || !catalogIndex.cards.length) throw new Error('Catalogo vazio');
    if (state === view) setCatalogPhase('building-cards');
    view.cards = await buildCatalogCards(catalogIndex.cards, token, view);
    if (token !== view.loadToken) return;
    catalogCardById.clear();
    view.cards.forEach((card) => catalogCardById.set(card.id, card));
    view.loadingMore = false;
    if (state !== view) return;
    populateSetFilter();
    applyFiltersSync({ allowPendingOracle: true });
    view.loaded = true;
    setCatalogPhase('rendered');
    void refreshActiveRemoteFilters(view);
    requestAnimationFrame(() => setTimeout(() => void initializeCatalogWorker(), 0));
    const selectedId = new URLSearchParams(location.search).get('card');
    const selected = view.cards.find((card) => card.id === selectedId);
    if (selected) {
      void hydrateCatalogCards([selected]).then(() => {
        if (state === view && view.loadToken === token) openCard(selected, { pushHistory: false, initial: true });
      });
    }
  } catch (error) {
    if (token !== view.loadToken || state !== view) return;
    console.error('Falha ao carregar a Lista de cartas.', error);
    setCatalogPhase('error');
    view.cards = []; view.filtered = []; view.loaded = false; render(); $('errorState').hidden = false;
  } finally {
    if (token === view.loadToken && state === view) {
      $('loadingState').hidden = true; $('cardGrid').setAttribute('aria-busy', 'false');
      if (view.loaded) setCatalogPhase('ready');
    }
  }
}

async function loadCards() {
  const view = viewStates.banlist;
  const token = ++view.loadToken;
  const cached = readCardsCache();
  const cachedCards = cached?.cards || [];
  if (state === view) { $('loadingState').hidden = Boolean(cachedCards.length); $('errorState').hidden = true; $('cardGrid').setAttribute('aria-busy', 'true'); $('cardGrid').innerHTML = ''; $('emptyState').hidden = true; }
  if (cachedCards.length) {
    view.cards = cachedCards; view.loadingMore = true;
    $('totalCards').textContent = `${cachedCards.length}+`;
    if (state === view) { populateSetFilter(); renderSeals(); applyFilters(); }
  }
  try {
    const fullCards = await fetchBanlistProgressively((partialCards, firstPage) => {
      if (token !== view.loadToken) return;
      view.cards = partialCards; view.loadingMore = true; $('totalCards').textContent = `${partialCards.length}+`;
      if (state === view) { if (firstPage || !cachedCards?.length) $('loadingState').hidden = true; renderSeals(); applyFilters(); }
    });
    if (token !== view.loadToken || !fullCards.length) throw new Error('empty');
    view.cards = fullCards; view.loadingMore = false; view.loaded = true; $('totalCards').textContent = fullCards.length;
    writeCardsCache(fullCards); if (state === view) { populateSetFilter(); renderSeals(); applyFilters(); }
  } catch {
    if (token !== view.loadToken) return;
    view.loadingMore = false;
    if (!view.cards.length) {
      view.cards = []; view.filtered = []; $('totalCards').textContent = '—';
      if (state === view) { renderSeals(); render(); $('errorState').hidden = false; }
    } else if (state === view) {
      view.loaded = true; showToast('Não foi possível atualizar. Mantivemos o último arquivo disponível.'); render();
    }
  } finally {
    if (token !== view.loadToken || state !== view) return;
    $('loadingState').hidden = true; $('cardGrid').setAttribute('aria-busy', 'false');
    const selectedId = new URLSearchParams(location.search).get('card');
    const selected = view.cards.find((card) => card.id === selectedId);
    if (selected) openCard(selected, { pushHistory: false, initial: true });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  loadDeckBuilderEdit();
  loadDeckBuilderDraft();
  $('brandLogo').src = site.logoPath;
  $('brandName').textContent = site.playgroupName;
  $('pageTitle').textContent = site.pageTitle;
  $('pageSubtitle').textContent = site.pageSubtitle;
  $('formatCount').textContent = formats.length;
  renderDeckFormats();
  void hydratePriceCoverage();
  $('validatedDeckFormat').innerHTML = `<option value="">Todos os formatos</option>${deckFormats.map((format) => `<option value="${format.key}">${format.label}</option>`).join('')}`;
  bind();
  const pageMode = configurePageMode();
  updateDeckBuilderFab();
  const cardsPromise = state.tab === 'catalog' && !pageMode.builderPage ? Promise.resolve() : loadCards();
  if (state.tab === 'catalog' && !pageMode.builderPage) void loadCatalog();
  else if (isScryfallSyntaxSearch(state.query)) void cardsPromise.then(() => refreshActiveRemoteFilters(state));
  loadBackground();
  if (pageMode.builderPage) {
    await cardsPromise.catch(() => null);
    await loadDeckBuilderPage();
  }
});
