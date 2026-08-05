const site = {
  playgroupName: 'Playgroup da Amizade',
  playgroupInitials: 'PA',
  pageTitle: 'Códice dos Banidos',
  pageSubtitle: 'A banlist oficial do nosso formato',
  logoPath: './playgroup-logo.svg',
  scryfallQuery: '(banned:standard OR banned:pioneer OR banned:modern OR banned:legacy OR banned:commander OR banned:duel OR banned:pauper)',
  backgroundCards: ['Jace, the Mind Sculptor', 'Liliana of the Veil', 'Chandra, Torch of Defiance', 'Teferi, Hero of Dominaria', 'Nissa, Who Shakes the World', 'Nicol Bolas, Dragon-God', 'Karn Liberated', "Elspeth, Sun's Champion"],
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

const state = {
  cards: [], filtered: [], selectedFormats: new Set(), query: '', identity: '', type: '', cmc: '', rarity: '', set: '',
  sort: 'name-asc', view: 'cards', visible: 48, modalCard: null, modalFace: 0, lastFocus: null,
  savedScroll: 0, loadingMore: false, loadToken: 0, rawDetailsReady: false,
};
const cacheKey = `codex-banlist-cache:${site.scryfallQuery}`;
const cacheTtl = 1000 * 60 * 60 * 6;
const $ = (id) => document.getElementById(id);
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const slug = (value = '') => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const nameCollator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
const sortableName = (value = '') => slug(value).replace(/^[^a-z0-9]+/, '');
const compareNames = (a, b) => nameCollator.compare(sortableName(a?.name), sortableName(b?.name));

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
  return slug(card?.type_line || '').includes('legendary');
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
  return { ...card, formats: bannedFormats, image: imageFor(card), faces, oracle_id: card.oracle_id || card.id };
}

function dedupeCards(cards) {
  const byOracle = new Map();
  cards.forEach((card) => { const normalized = normalizeCard(card); if (!byOracle.has(normalized.oracle_id)) byOracle.set(normalized.oracle_id, normalized); });
  return [...byOracle.values()].filter((card) => card.formats.length || card.id.startsWith('fallback-'));
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
  state.query = params.get('q') || '';
  state.identity = params.get('identity') || '';
  state.type = params.get('type') || '';
  state.cmc = params.get('cmc') || '';
  state.rarity = params.get('rarity') || '';
  state.set = params.get('set') || '';
  state.sort = params.get('sort') || 'name-asc';
  state.view = params.get('view') === 'list' ? 'list' : 'cards';
  state.selectedFormats = new Set((params.get('formats') || '').split(',').filter((key) => formats.some((format) => format.key === key)));
  $('searchInput').value = state.query;
  $('identityFilter').value = state.identity;
  $('typeFilter').value = state.type;
  $('cmcFilter').value = state.cmc;
  $('rarityFilter').value = state.rarity;
  if ($('setFilter')) $('setFilter').value = state.set;
  $('sortFilter').value = state.sort;
  if ($('searchClear')) $('searchClear').hidden = !state.query;
}

function currentParams({ includeCard = Boolean(state.modalCard) } = {}) {
  const params = new URLSearchParams();
  if (state.query) params.set('q', state.query);
  if (state.selectedFormats.size) params.set('formats', [...state.selectedFormats].join(','));
  if (state.identity) params.set('identity', state.identity);
  if (state.type) params.set('type', state.type);
  if (state.cmc) params.set('cmc', state.cmc);
  if (state.rarity) params.set('rarity', state.rarity);
  if (state.set) params.set('set', state.set);
  if (state.sort !== 'name-asc') params.set('sort', state.sort);
  if (state.view === 'list') params.set('view', 'list');
  if (includeCard && state.modalCard) params.set('card', state.modalCard.id);
  return params;
}

function syncUrl() {
  const params = currentParams({ includeCard: false });
  history.replaceState(null, '', `${location.pathname}${params.toString() ? `?${params}` : ''}`);
}

function cardIdentity(card) {
  const colors = card.color_identity || [];
  return colors.length === 0 ? 'C' : colors.length > 1 ? 'M' : colors[0];
}

function cardTypeMatches(card, type) {
  if (!type) return true;
  const line = slug(card.type_line);
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

function applyFilters() {
  const q = slug(state.query.trim());
  state.filtered = state.cards.filter((card) => {
    const searchable = slug([card.name, card.type_line, card.oracle_text, card.artist, card.set_name].filter(Boolean).join(' '));
    const textMatch = !q || searchable.includes(q);
    const formatMatch = !state.selectedFormats.size || card.formats.some((format) => state.selectedFormats.has(format));
    const identityMatch = !state.identity || cardIdentity(card) === state.identity;
    const typeMatch = cardTypeMatches(card, state.type);
    const cmc = Number(card.cmc || 0);
    const cmcMatch = !state.cmc || (state.cmc === '6' ? cmc >= 6 : cmc === Number(state.cmc));
    const rarityMatch = !state.rarity || (state.rarity === 'special' ? !['common', 'uncommon', 'rare', 'mythic'].includes(card.rarity) : card.rarity === state.rarity);
    const setMatch = !state.set || card.set === state.set;
    return textMatch && formatMatch && identityMatch && typeMatch && cmcMatch && rarityMatch && setMatch;
  });
  const sorters = {
    'name-asc': compareNames,
    'name-desc': (a, b) => compareNames(b, a),
    'cmc-asc': (a, b) => (a.cmc || 0) - (b.cmc || 0) || compareNames(a, b),
    'cmc-desc': (a, b) => (b.cmc || 0) - (a.cmc || 0) || compareNames(a, b),
    'formats-desc': (a, b) => b.formats.length - a.formats.length || compareNames(a, b),
    color: (a, b) => cardIdentity(a).localeCompare(cardIdentity(b)) || compareNames(a, b),
  };
  state.filtered.sort(sorters[state.sort] || sorters['name-asc']);
  state.visible = 48;
  render();
}

function populateSetFilter() {
  const select = $('setFilter');
  if (!select) return;
  const options = [...new Map(state.cards.filter((card) => card.set).map((card) => [card.set, card.set_name || String(card.set).toUpperCase()])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  select.innerHTML = `<option value="">Todas as coleções</option>${options.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('')}`;
  select.value = state.set;
}

function renderSeals() {
  const html = formats.map((format) => {
    const count = state.cards.filter((card) => card.formats.includes(format.key)).length;
    const active = state.selectedFormats.has(format.key);
    return `<button class="format-seal${active ? ' is-active' : ''}" type="button" data-format="${format.key}" aria-pressed="${active}" style="--format-color:${format.color}" title="Mostrar cartas banidas em ${format.label}"><span class="format-seal__bar"></span><span class="format-seal__crest">${format.short}</span><span class="format-seal__copy"><strong>${format.label}</strong><small>${count} ${count === 1 ? 'carta' : 'cartas'} banidas</small></span></button>`;
  }).join('');
  $('formatSeals').innerHTML = html;
}

function renderActiveFilters() {
  const chips = [];
  if (state.query) chips.push(['q', `Busca: ${state.query}`]);
  state.selectedFormats.forEach((key) => chips.push([`format:${key}`, formats.find((format) => format.key === key)?.label || key]));
  const selectLabels = { identity: { W: 'Branco', U: 'Azul', B: 'Preto', R: 'Vermelho', G: 'Verde', C: 'Incolor', M: 'Multicolorida' }, type: { creature: 'Criatura', instant: 'Instantâneo', sorcery: 'Feitiço', artifact: 'Artefato', enchantment: 'Encantamento', planeswalker: 'Planeswalker', land: 'Terreno', battle: 'Batalha', other: 'Outros' }, cmc: { 0: 'Mana 0', 1: 'Mana 1', 2: 'Mana 2', 3: 'Mana 3', 4: 'Mana 4', 5: 'Mana 5', 6: 'Mana 6+' }, rarity: { common: 'Comum', uncommon: 'Incomum', rare: 'Rara', mythic: 'Mítica', special: 'Especial' } };
  [['identity', state.identity], ['type', state.type], ['cmc', state.cmc], ['rarity', state.rarity]].forEach(([key, value]) => { if (value) chips.push([key, selectLabels[key][value]]); });
  if (state.set) chips.push(['set', $('setFilter')?.selectedOptions?.[0]?.textContent || state.set.toUpperCase()]);
  $('activeFilters').innerHTML = chips.map(([key, label]) => `<span class="filter-chip">${escapeHtml(label)} <button type="button" data-remove-filter="${key}" aria-label="Remover filtro ${escapeHtml(label)}">×</button></span>`).join('');
  const mobileFilterCount = $('mobileFilterCount');
  const controlCount = chips.filter(([key]) => key !== 'q').length;
  if (mobileFilterCount) { mobileFilterCount.textContent = controlCount; mobileFilterCount.hidden = !controlCount; }
  if ($('searchClear')) $('searchClear').hidden = !state.query;
}

function renderCards() {
  const visibleCards = state.filtered.slice(0, state.visible);
  $('cardGrid').classList.toggle('is-list', state.view === 'list');
  $('cardGrid').innerHTML = visibleCards.map((card, index) => {
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
    const imageMarkup = image ? `<img loading="lazy" decoding="async" width="488" height="680" src="${escapeHtml(image)}"${srcset ? ` srcset="${escapeHtml(srcset)}" sizes="(max-width: 559px) calc(50vw - 22px), (max-width: 959px) calc(25vw - 20px), 220px"` : ''} alt="Carta ${escapeHtml(card.name)}" />` : '';
    return `<button class="card-tile card-tile--${frameClass} card-tile--${rarityClass}${legendaryClass}" style="--delay:${Math.min(index, 10) * 24}ms" type="button" data-card-id="${escapeHtml(card.id)}" aria-label="Ver ${escapeHtml(card.name)}. Banida em ${escapeHtml(formatsLabel)}"><div class="card-tile__art${image ? '' : ' is-error'}">${imageMarkup}<span class="card-tile__seal">${card.formats.length} ${card.formats.length === 1 ? 'formato' : 'formatos'}</span></div><div class="card-tile__body"><strong class="card-tile__name">${escapeHtml(card.name)}</strong><div class="card-tile__meta"><span class="card-tile__set">${setLine}</span><span class="card-tile__identity">${identity}</span><span class="format-badges">${badges}${more}</span></div></div></button>`;
  }).join('');
  $('cardGrid').setAttribute('aria-busy', 'false');
  bindCardImages($('cardGrid'));
  const hasMore = state.visible < state.filtered.length;
  $('loadMore').hidden = !hasMore;
  $('emptyState').hidden = Boolean(state.filtered.length) || !state.cards.length;
  renderEmptySuggestions();
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
  const query = slug(state.query).trim();
  if (!query) { target.innerHTML = ''; $('emptyMessage').textContent = 'Remova um dos filtros ativos para ampliar a consulta.'; return; }
  const suggestions = state.cards
    .map((card) => {
      const name = slug(card.name);
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
  renderSeals(); renderActiveFilters(); renderCards();
  const formatRail = document.querySelector('.format-rail');
  if (formatRail) formatRail.hidden = Boolean(state.cards.length && !state.filtered.length);
  const progressLabel = state.loadingMore ? ' · atualizando arquivo' : '';
  $('resultCount').textContent = state.cards.length ? `${state.filtered.length} ${state.filtered.length === 1 ? 'carta encontrada' : 'cartas encontradas'}${progressLabel}` : 'Nenhuma carta carregada';
  $('filterCount').textContent = `${state.filtered.length} ${state.filtered.length === 1 ? 'carta' : 'cartas'}`;
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
  const date = new Date(value);
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

function priceMarkup(prices = {}) {
  const rows = Object.entries(prices)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `<div class="modal-kv"><span class="modal-kv__label">${escapeHtml(prettyFieldLabel(key).replace('Usd', 'USD'))}</span><span class="modal-kv__value">${scalarValueMarkup(value)}</span></div>`);
  return rows.length ? rows.join('') : '<span class="modal-empty">—</span>';
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
  $('modalFormats').innerHTML = card.formats.map((key) => `<span class="format-badge">${escapeHtml(formats.find((format) => format.key === key)?.label || key)}</span>`).join('');
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
  $('modalPrices').innerHTML = priceMarkup(card.prices || {});
  $('modalPrints').innerHTML = printings.length ? printings.map((item) => `<span class="modal-chip">${escapeHtml(String(item))}</span>`).join('') : '<span class="modal-empty">—</span>';

  $('modalRelations').innerHTML = [
    objectListLinks('Partes e faces da carta', card.all_parts || [], (item) => `${item?.name || 'Parte'} ${item?.component ? `(${item.component})` : ''}`),
    objectListLinks('Partes internas', card.card_parts || [], (item) => `${item?.name || 'Parte'} ${item?.component ? `(${item.component})` : ''}`),
    linksMarkup('Metadados da relação', {
      component: card.component || '',
      component_of: card.component_of || '',
    }),
  ].join('');

  $('modalUris').innerHTML = [
    linksMarkup('Registros', { uri: card.uri || '' }),
    linksMarkup('Compras', card.purchase_uris || {}),
    linksMarkup('Relacionados', card.related_uris || {}),
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

function navigateModal(direction) {
  if (!state.modalCard) return;
  const index = state.filtered.findIndex((card) => card.id === state.modalCard.id);
  const next = state.filtered[index + direction];
  if (!next) return;
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
    const response = await fetch('https://api.scryfall.com/cards/collection', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ identifiers: site.backgroundCards.map((name) => ({ name })) }) });
    if (!response.ok) return;
    const payload = await response.json(); const scenes = (payload.data || []).filter((card) => card.image_uris?.art_crop).map((card) => ({ name: card.name, artist: card.artist, image: card.image_uris.art_crop }));
    if (!scenes.length) return;
    let current = 0;
    let active = 'a';
    const show = (index, layer) => {
      const element = scenesLayers[layer];
      element.style.backgroundImage = `url("${scenes[index].image}")`;
      element.classList.add('is-active');
      sceneName.textContent = scenes[index].name;
      sceneArtist.textContent = `arte de ${scenes[index].artist || 'artista não informado'} · via Scryfall`;
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
  state.selectedFormats.clear(); state.query = ''; state.identity = ''; state.type = ''; state.cmc = ''; state.rarity = ''; state.set = ''; state.sort = 'name-asc';
  $('searchInput').value = ''; $('identityFilter').value = ''; $('typeFilter').value = ''; $('cmcFilter').value = ''; $('rarityFilter').value = ''; $('setFilter').value = ''; $('sortFilter').value = 'name-asc';
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

function bind() {
  readUrl();

  $('formatSeals').addEventListener('click', (event) => {
    const button = event.target.closest('[data-format]');
    if (!button) return;
    const key = button.dataset.format;
    state.selectedFormats.has(key) ? state.selectedFormats.delete(key) : state.selectedFormats.add(key);
    syncUrl(); applyFilters();
  });

  const applySelect = (key, element) => element.addEventListener('change', () => { state[key] = element.value; syncUrl(); applyFilters(); });
  applySelect('identity', $('identityFilter')); applySelect('type', $('typeFilter')); applySelect('cmc', $('cmcFilter')); applySelect('rarity', $('rarityFilter')); applySelect('set', $('setFilter')); applySelect('sort', $('sortFilter'));

  let searchTimer;
  $('searchInput').addEventListener('input', (event) => {
    clearTimeout(searchTimer);
    $('searchClear').hidden = !event.target.value;
    searchTimer = setTimeout(() => { state.query = event.target.value.trim(); syncUrl(); applyFilters(); }, 170);
  });
  $('searchClear').addEventListener('click', () => { clearTimeout(searchTimer); $('searchInput').value = ''; state.query = ''; $('searchClear').hidden = true; syncUrl(); applyFilters(); $('searchInput').focus(); });

  const setView = (view) => { state.view = view; syncUrl(); render(); };
  $('cardsView').addEventListener('click', () => setView('cards'));
  $('listView').addEventListener('click', () => setView('list'));

  $('cardGrid').addEventListener('click', (event) => {
    const tile = event.target.closest('[data-card-id]');
    if (tile) openCard(state.cards.find((card) => card.id === tile.dataset.cardId));
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
    else if (key === 'q') { state.query = ''; $('searchInput').value = ''; }
    else state[key] = '';
    syncUrl(); readUrl(); applyFilters();
  });

  $('openFilters').addEventListener('click', openFilterSheet);
  $('closeFilters').addEventListener('click', () => closeFilterSheet());
  $('applyFilters').addEventListener('click', () => closeFilterSheet());
  $('filterPanel').addEventListener('click', (event) => { if (event.target === $('filterPanel')) closeFilterSheet(); });

  $('closeCardModal').addEventListener('click', closeCard);
  $('flipCard').addEventListener('click', flipModalCard);
  $('previousCard').addEventListener('click', () => navigateModal(-1));
  $('nextCard').addEventListener('click', () => navigateModal(1));
  $('cardModal').addEventListener('cancel', (event) => { event.preventDefault(); closeCard(); });
  document.querySelector('.modal-section--data').addEventListener('toggle', (event) => { if (event.target.open) hydrateRawDetails(); });

  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) { event.preventDefault(); $('searchInput').focus(); }
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

  $('shareButton').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); showToast('Link desta seleção copiado'); }
    catch { window.prompt('Copie o link desta seleção:', location.href); }
  });
  $('retryButton').addEventListener('click', loadCards);

  addEventListener('online', updateConnectionStatus);
  addEventListener('offline', updateConnectionStatus);
  matchMedia('(min-width: 960px)').addEventListener('change', () => { if ($('filterPanel').classList.contains('is-open')) closeFilterSheet({ restoreFocus: false }); });
  addEventListener('popstate', () => {
    const cardId = new URLSearchParams(location.search).get('card');
    if (!cardId && $('cardModal').open) dismissCard();
    else if (cardId && state.cards.length && state.modalCard?.id !== cardId) openCard(state.cards.find((card) => card.id === cardId), { pushHistory: false });
  });
  updateConnectionStatus();
}

async function loadCards() {
  const token = ++state.loadToken;
  const cached = readCardsCache();
  const cachedCards = cached?.cards || [];
  $('loadingState').hidden = Boolean(cachedCards.length); $('errorState').hidden = true; $('cardGrid').setAttribute('aria-busy', 'true'); $('cardGrid').innerHTML = ''; $('emptyState').hidden = true;
  if (cachedCards.length) {
    state.cards = cachedCards; state.loadingMore = true;
    $('totalCards').textContent = `${cachedCards.length}+`;
    $('lastUpdated').textContent = cached.stale ? 'cache antigo' : 'cache';
    populateSetFilter(); renderSeals(); applyFilters();
  }
  try {
    const fullCards = await fetchBanlistProgressively((partialCards, firstPage) => {
      if (token !== state.loadToken) return;
      if (firstPage || !cachedCards?.length) { $('loadingState').hidden = true; state.loadingMore = true; }
      state.cards = partialCards; $('totalCards').textContent = `${partialCards.length}+`; $('lastUpdated').textContent = 'buscando'; renderSeals(); applyFilters();
    });
    if (token !== state.loadToken || !fullCards.length) throw new Error('empty');
    state.cards = fullCards; state.loadingMore = false; $('totalCards').textContent = fullCards.length; $('lastUpdated').textContent = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date());
    writeCardsCache(fullCards); populateSetFilter(); renderSeals(); applyFilters();
  } catch {
    if (token !== state.loadToken) return;
    state.loadingMore = false;
    if (!state.cards.length) {
      state.cards = []; state.filtered = []; $('totalCards').textContent = '—'; $('lastUpdated').textContent = 'indisponível'; renderSeals(); render(); $('errorState').hidden = false;
    } else {
      $('lastUpdated').textContent = cached?.stale ? 'cache antigo' : 'cache';
      showToast('Não foi possível atualizar. Mantivemos o último arquivo disponível.'); render();
    }
  } finally {
    if (token !== state.loadToken) return;
    $('loadingState').hidden = true;
    $('cardGrid').setAttribute('aria-busy', 'false');
    const selectedId = new URLSearchParams(location.search).get('card');
    const selected = state.cards.find((card) => card.id === selectedId);
    if (selected) openCard(selected, { pushHistory: false, initial: true });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('brandInitials').textContent = site.playgroupInitials;
  $('brandName').textContent = site.playgroupName;
  $('pageTitle').textContent = site.pageTitle;
  $('pageSubtitle').textContent = site.pageSubtitle;
  $('formatCount').textContent = formats.length;
  bind(); loadCards(); loadBackground();
});
