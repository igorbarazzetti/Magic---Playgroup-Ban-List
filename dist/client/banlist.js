const site = {
  playgroupName: 'Playgroup da Amizade',
  playgroupInitials: 'PA',
  pageTitle: 'Códice dos Banidos',
  pageSubtitle: 'A banlist oficial do nosso formato',
  logoPath: '/playgroup-logo.svg',
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

const fallbackCards = [
  { id: 'fallback-black-lotus', oracle_id: 'fallback-black-lotus', name: 'Black Lotus', type_line: 'Artifact', oracle_text: '{T}, Sacrifice Black Lotus: Add three mana of any one color.', mana_cost: '{0}', cmc: 0, rarity: 'rare', artist: 'Christopher Rush', set_name: 'Limited Edition Alpha', color_identity: [], formats: ['commander', 'duel', 'legacy', 'modern', 'pauper', 'pioneer', 'standard'], image: '', scryfall_uri: 'https://scryfall.com/card/lea/232/black-lotus' },
  { id: 'fallback-oko', oracle_id: 'fallback-oko', name: 'Oko, Thief of Crowns', type_line: 'Legendary Planeswalker — Oko', oracle_text: '+2: Create a Food token.\n−1: Target artifact or creature loses all abilities and becomes a green Elk creature with base power and toughness 3/3.\n−5: Exchange control of target artifact or creature and target creature.', mana_cost: '{1}{G}{U}', cmc: 3, rarity: 'mythic', artist: 'Chris Rallis', set_name: 'Throne of Eldraine', color_identity: ['G', 'U'], formats: ['modern', 'legacy', 'pauper'], image: '', scryfall_uri: 'https://scryfall.com/card/eld/197/oko-thief-of-crowns' },
  { id: 'fallback-tibalt', oracle_id: 'fallback-tibalt', name: 'Tibalt’s Trickery', type_line: 'Instant', oracle_text: 'Counter target spell. Choose at random a nonland card with a different name from it. Its controller may cast that card without paying its mana cost.', mana_cost: '{1}{R}', cmc: 2, rarity: 'rare', artist: 'Nils Hamm', set_name: 'Kaldheim', color_identity: ['R'], formats: ['modern', 'pauper'], image: '', scryfall_uri: 'https://scryfall.com/card/khm/153/tibalts-trickery' },
  { id: 'fallback-initiative', oracle_id: 'fallback-initiative', name: 'White Plume Adventurer', type_line: 'Creature — Human Nomad', oracle_text: 'When White Plume Adventurer enters the battlefield, you take the initiative.\nAt the beginning of your upkeep, untap target creature. It gets +1/+1 and gains vigilance until end of turn.', mana_cost: '{2}{W}', cmc: 3, rarity: 'uncommon', artist: 'Zoltan Boros', set_name: 'Commander Legends: Battle for Baldur’s Gate', color_identity: ['W'], formats: ['legacy', 'pauper'], image: '', scryfall_uri: 'https://scryfall.com/card/clb/36/white-plume-adventurer' },
];

const state = { cards: [], filtered: [], selectedFormats: new Set(), query: '', identity: '', type: '', cmc: '', rarity: '', sort: 'name-asc', view: 'cards', visible: 48, modalCard: null, modalFace: 0, lastFocus: null, loadingMore: false, loadToken: 0 };
const cacheKey = `codex-banlist-cache:${site.scryfallQuery}`;
const cacheTtl = 1000 * 60 * 60 * 6;
const $ = (id) => document.getElementById(id);
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const slug = (value = '') => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function imageFor(card, face = 0, size = 'normal') {
  const source = card.card_faces?.[face] || card;
  return source.image_uris?.[size] || source.image_uris?.normal || card.image_uris?.[size] || card.image_uris?.normal || card.image || makePlaceholder(card.name, card.colors?.[0]);
}

function makePlaceholder(name, color = '') {
  const accent = color === 'R' ? '#b84f34' : color === 'U' ? '#446d91' : color === 'G' ? '#4e754d' : color === 'W' ? '#a8906d' : color === 'B' ? '#6b4850' : '#9b7145';
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 700"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#160b0b"/><stop offset=".5" stop-color="${accent}"/><stop offset="1" stop-color="#0b0808"/></linearGradient></defs><rect width="500" height="700" fill="url(#g)"/><path d="M50 50h400v600H50z" fill="none" stroke="#e2b36c" opacity=".5"/><text x="250" y="340" fill="#f2e7d2" font-family="Georgia" font-size="26" text-anchor="middle">${escapeHtml(name).slice(0, 32)}</text><text x="250" y="378" fill="#e2b36c" font-family="Arial" font-size="12" text-anchor="middle" letter-spacing="3">RELÍQUIA SELADA</text></svg>`)}`;
}

function normalizeCard(card) {
  const bannedFormats = formats.filter(({ key }) => card.legalities?.[key] === 'banned').map(({ key }) => key);
  const faces = card.card_faces?.map((face) => ({ name: face.name, type_line: face.type_line, oracle_text: face.oracle_text, mana_cost: face.mana_cost, image_uris: face.image_uris })) || [];
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
    if (!cached || !Array.isArray(cached.cards) || Date.now() - cached.savedAt > cacheTtl) return null;
    return dedupeCards(cached.cards);
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
  state.sort = params.get('sort') || 'name-asc';
  state.view = params.get('view') === 'list' ? 'list' : 'cards';
  state.selectedFormats = new Set((params.get('formats') || '').split(',').filter((key) => formats.some((format) => format.key === key)));
  $('searchInput').value = state.query;
  if ($('mobileSearchInput')) $('mobileSearchInput').value = state.query;
  $('identityFilter').value = state.identity;
  $('typeFilter').value = state.type;
  $('cmcFilter').value = state.cmc;
  $('rarityFilter').value = state.rarity;
  $('sortFilter').value = state.sort;
}

function syncUrl() {
  const params = new URLSearchParams();
  if (state.query) params.set('q', state.query);
  if (state.selectedFormats.size) params.set('formats', [...state.selectedFormats].join(','));
  if (state.identity) params.set('identity', state.identity);
  if (state.type) params.set('type', state.type);
  if (state.cmc) params.set('cmc', state.cmc);
  if (state.rarity) params.set('rarity', state.rarity);
  if (state.sort !== 'name-asc') params.set('sort', state.sort);
  if (state.view === 'list') params.set('view', 'list');
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
    return textMatch && formatMatch && identityMatch && typeMatch && cmcMatch && rarityMatch;
  });
  const sorters = {
    'name-asc': (a, b) => a.name.localeCompare(b.name),
    'name-desc': (a, b) => b.name.localeCompare(a.name),
    'cmc-asc': (a, b) => (a.cmc || 0) - (b.cmc || 0) || a.name.localeCompare(b.name),
    'cmc-desc': (a, b) => (b.cmc || 0) - (a.cmc || 0) || a.name.localeCompare(b.name),
    'formats-desc': (a, b) => b.formats.length - a.formats.length || a.name.localeCompare(b.name),
    color: (a, b) => cardIdentity(a).localeCompare(cardIdentity(b)) || a.name.localeCompare(b.name),
  };
  state.filtered.sort(sorters[state.sort] || sorters['name-asc']);
  state.visible = 48;
  render();
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
  $('activeFilters').innerHTML = chips.map(([key, label]) => `<span class="filter-chip">${escapeHtml(label)} <button type="button" data-remove-filter="${key}" aria-label="Remover filtro ${escapeHtml(label)}">×</button></span>`).join('');
  const mobileFilterCount = $('mobileFilterCount');
  if (mobileFilterCount) { mobileFilterCount.textContent = chips.length; mobileFilterCount.hidden = !chips.length; }
}

function renderCards() {
  const visibleCards = state.filtered.slice(0, state.visible);
  $('cardGrid').classList.toggle('is-list', state.view === 'list');
  $('cardGrid').innerHTML = visibleCards.map((card) => {
    const badges = card.formats.slice(0, 3).map((format) => `<span class="format-badge">${formats.find((item) => item.key === format)?.short || format}</span>`).join('');
    const more = card.formats.length > 3 ? `<span class="format-badge format-badge--more">+${card.formats.length - 3}</span>` : '';
    const identity = (card.color_identity || []).map((color) => `<span class="card-pip card-pip--${color.toLowerCase()}" title="Identidade ${color}">${color}</span>`).join('');
    return `<button class="card-tile" type="button" data-card-id="${escapeHtml(card.id)}" aria-label="Ver detalhes de ${escapeHtml(card.name)}"><div class="card-tile__art"><img loading="lazy" src="${escapeHtml(imageFor(card))}" alt="${escapeHtml(card.name)}" /><span class="card-tile__seal">${card.formats.length}× selada</span></div><div class="card-tile__body"><strong class="card-tile__name">${escapeHtml(card.name)}</strong><div class="card-tile__meta"><span class="card-tile__set">${escapeHtml(card.set_name || 'Scryfall')}</span><span class="card-tile__identity">${identity}</span><span class="format-badges">${badges}${more}</span></div></div></button>`;
  }).join('');
  const hasMore = state.visible < state.filtered.length;
  $('loadMore').hidden = !hasMore;
  $('emptyState').hidden = Boolean(state.filtered.length) || !state.cards.length;
}

function render() {
  renderSeals(); renderActiveFilters(); renderCards();
  const progressLabel = state.loadingMore ? ' · atualizando arquivo' : '';
  $('resultCount').textContent = state.cards.length ? `${state.filtered.length} ${state.filtered.length === 1 ? 'carta encontrada' : 'cartas encontradas'}${progressLabel}` : 'Nenhuma carta carregada';
  $('filterCount').textContent = `${state.filtered.length} resultados`;
  const cardsView = $('cardsView'); const listView = $('listView');
  if (cardsView && listView) { cardsView.setAttribute('aria-pressed', String(state.view === 'cards')); listView.setAttribute('aria-pressed', String(state.view === 'list')); }
}

function rarityLabel(value) { return ({ common: 'Comum', uncommon: 'Incomum', rare: 'Rara', mythic: 'Mítica' }[value] || 'Especial'); }

function openCard(card) {
  state.modalCard = card; state.modalFace = 0; state.lastFocus = document.activeElement;
  const face = card.faces[0] || card;
  $('modalTitle').textContent = card.name; $('modalType').textContent = face.type_line || card.type_line || '—'; $('modalOracle').textContent = face.oracle_text || card.oracle_text || 'Sem texto de regra registrado.'; $('modalFlavor').textContent = card.flavor_text || '';
  $('modalSet').textContent = card.set_name || '—'; $('modalArtist').textContent = card.artist || '—'; $('modalRarity').textContent = rarityLabel(card.rarity); $('modalCmc').textContent = Number.isFinite(Number(card.cmc)) ? String(card.cmc) : '—'; $('modalImage').src = imageFor(card, 0, 'large'); $('modalImage').alt = card.name;
  $('modalMana').innerHTML = (face.mana_cost || card.mana_cost || '').replace(/\{([^}]+)\}/g, '<span class="mana-symbol">$1</span>');
  $('modalFormats').innerHTML = card.formats.map((key) => `<span class="format-badge">${escapeHtml(formats.find((format) => format.key === key)?.label || key)}</span>`).join('');
  $('modalScryfall').href = card.scryfall_uri || `https://scryfall.com/search?q=${encodeURIComponent(card.name)}`;
  $('flipCard').hidden = card.faces.length < 2; $('flipCard').textContent = '↻ Ver verso';
  const modal = $('cardModal'); if (typeof modal.showModal === 'function') modal.showModal(); else modal.setAttribute('open', '');
  $('closeCardModal').focus();
  syncUrl(); const params = new URLSearchParams(location.search); params.set('card', card.id); history.replaceState(null, '', `${location.pathname}?${params}`);
}

function closeCard() { const modal = $('cardModal'); if (modal.open) modal.close(); else modal.removeAttribute('open'); state.modalCard = null; const params = new URLSearchParams(location.search); params.delete('card'); history.replaceState(null, '', `${location.pathname}${params.toString() ? `?${params}` : ''}`); state.lastFocus?.focus?.(); }

function flipModalCard() { if (!state.modalCard?.faces.length) return; state.modalFace = state.modalFace ? 0 : 1; const face = state.modalCard.faces[state.modalFace]; $('modalImage').src = imageFor(state.modalCard, state.modalFace, 'large'); $('modalImage').alt = face.name || state.modalCard.name; $('modalType').textContent = face.type_line || state.modalCard.type_line; $('modalOracle').textContent = face.oracle_text || ''; $('modalMana').innerHTML = (face.mana_cost || '').replace(/\{([^}]+)\}/g, '<span class="mana-symbol">$1</span>'); $('flipCard').textContent = state.modalFace ? '↻ Ver frente' : '↻ Ver verso'; }

async function loadBackground() {
  try {
    const response = await fetch('https://api.scryfall.com/cards/collection', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ identifiers: site.backgroundCards.map((name) => ({ name })) }) });
    if (!response.ok) return;
    const payload = await response.json(); const scenes = (payload.data || []).filter((card) => card.image_uris?.art_crop).map((card) => ({ name: card.name, artist: card.artist, image: card.image_uris.art_crop }));
    if (!scenes.length) return;
    let current = 0; let active = 'a'; const show = (index, layer) => { const element = document.querySelector(`.scene__image--${layer}`); element.style.backgroundImage = `url("${scenes[index].image}")`; element.classList.add('is-active'); $('sceneName').textContent = scenes[index].name; $('sceneArtist').textContent = `arte de ${scenes[index].artist || 'artista não informado'}`; return element; };
    show(0, active); const preload = (index) => { const image = new Image(); image.src = scenes[index].image; return image; }; let nextImage = preload((current + 1) % scenes.length);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; if (reduced) return;
    setInterval(() => { const next = (current + 1) % scenes.length; const nextLayer = active === 'a' ? 'b' : 'a'; const activate = () => { document.querySelector(`.scene__image--${active}`).classList.remove('is-active'); show(next, nextLayer); active = nextLayer; current = next; nextImage = preload((current + 1) % scenes.length); }; if (nextImage.complete) activate(); else nextImage.onload = activate; }, site.backgroundInterval);
  } catch { /* fundo abstrato permanece ativo quando a coleção não responder */ }
}

function clearFilters() { state.selectedFormats.clear(); state.query = ''; state.identity = ''; state.type = ''; state.cmc = ''; state.rarity = ''; state.sort = 'name-asc'; $('searchInput').value = ''; if ($('mobileSearchInput')) $('mobileSearchInput').value = ''; $('identityFilter').value = ''; $('typeFilter').value = ''; $('cmcFilter').value = ''; $('rarityFilter').value = ''; $('sortFilter').value = 'name-asc'; syncUrl(); applyFilters(); }

function bindParallax() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || innerWidth < 700) return;
  let frame = 0; let x = 0; let y = 0;
  const paint = () => { frame = 0; document.documentElement.style.setProperty('--parallax-x', `${x.toFixed(2)}px`); document.documentElement.style.setProperty('--parallax-y', `${y.toFixed(2)}px`); };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
  addEventListener('pointermove', (event) => { x = ((event.clientX / innerWidth) - 0.5) * 7; y = ((event.clientY / innerHeight) - 0.5) * 5; schedule(); }, { passive: true });
  addEventListener('scroll', () => { y = Math.max(-6, Math.min(6, (scrollY || 0) * -0.012)); schedule(); }, { passive: true });
}

function bind() {
  readUrl();
  $('formatSeals').addEventListener('click', (event) => { const button = event.target.closest('[data-format]'); if (!button) return; const key = button.dataset.format; state.selectedFormats.has(key) ? state.selectedFormats.delete(key) : state.selectedFormats.add(key); syncUrl(); applyFilters(); });
  const applySelect = (key, element) => { element.addEventListener('change', () => { state[key] = element.value; syncUrl(); applyFilters(); }); };
  applySelect('identity', $('identityFilter')); applySelect('type', $('typeFilter')); applySelect('cmc', $('cmcFilter')); applySelect('rarity', $('rarityFilter')); applySelect('sort', $('sortFilter'));
  let searchTimer; const searchInputs = [$('searchInput'), $('mobileSearchInput')].filter(Boolean); searchInputs.forEach((input) => input.addEventListener('input', (event) => { clearTimeout(searchTimer); searchInputs.forEach((item) => { if (item !== event.target) item.value = event.target.value; }); searchTimer = setTimeout(() => { state.query = event.target.value.trim(); syncUrl(); applyFilters(); }, 240); }));
  const setView = (view) => { state.view = view; syncUrl(); render(); }; $('cardsView')?.addEventListener('click', () => setView('cards')); $('listView')?.addEventListener('click', () => setView('list'));
  $('cardGrid').addEventListener('click', (event) => { const tile = event.target.closest('[data-card-id]'); if (tile) openCard(state.cards.find((card) => card.id === tile.dataset.cardId)); });
  $('loadMore').addEventListener('click', () => { state.visible += 48; renderCards(); }); $('clearFilters').addEventListener('click', clearFilters); $('emptyClear').addEventListener('click', clearFilters);
  $('activeFilters').addEventListener('click', (event) => { const button = event.target.closest('[data-remove-filter]'); if (!button) return; const key = button.dataset.removeFilter; if (key.startsWith('format:')) state.selectedFormats.delete(key.slice(7)); else if (key === 'q') state.query = ''; else state[key] = ''; syncUrl(); readUrl(); applyFilters(); });
  const closeFilterSheet = () => $('filterPanel').classList.remove('is-open'); $('openFilters').addEventListener('click', () => $('filterPanel').classList.add('is-open')); $('closeFilters').addEventListener('click', closeFilterSheet); $('filterPanel').addEventListener('click', (event) => { if (event.target === $('filterPanel')) closeFilterSheet(); }); let filterTouchStart = 0; $('filterPanel').addEventListener('touchstart', (event) => { filterTouchStart = event.touches[0]?.clientY || 0; }, { passive: true }); $('filterPanel').addEventListener('touchend', (event) => { const delta = (event.changedTouches[0]?.clientY || 0) - filterTouchStart; if (delta > 70) closeFilterSheet(); }, { passive: true });
  $('closeCardModal').addEventListener('click', closeCard); $('flipCard').addEventListener('click', flipModalCard); $('cardModal').addEventListener('click', (event) => { if (event.target === $('cardModal')) closeCard(); }); $('cardModal').addEventListener('cancel', (event) => { event.preventDefault(); closeCard(); });
  document.addEventListener('keydown', (event) => { if (event.key === '/' && document.activeElement?.tagName !== 'INPUT') { event.preventDefault(); (window.innerWidth < 700 ? $('mobileSearchInput') : $('searchInput'))?.focus(); } if (event.key === 'Escape' && $('filterPanel').classList.contains('is-open')) $('filterPanel').classList.remove('is-open'); if (event.key === 'Tab' && $('cardModal').open) { const focusable = [...$('cardModal').querySelectorAll('button,a')].filter((item) => !item.hidden); if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus(); } else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) { event.preventDefault(); focusable[0].focus(); } } });
  $('shareButton').addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.href); $('shareButton').innerHTML = '<span aria-hidden="true">✓</span> URL copiada'; setTimeout(() => { $('shareButton').innerHTML = '<span aria-hidden="true">↗</span> Compartilhar'; }, 1800); } catch { window.prompt('Copie a URL filtrada:', location.href); } }); $('retryButton').addEventListener('click', loadCards);
}

async function loadCards() {
  const token = ++state.loadToken;
  const cachedCards = readCardsCache();
  $('loadingState').hidden = !cachedCards?.length; $('errorState').hidden = true; $('cardGrid').innerHTML = ''; $('emptyState').hidden = true;
  if (cachedCards?.length) { state.cards = cachedCards; state.loadingMore = true; $('totalCards').textContent = `${cachedCards.length}+`; $('lastUpdated').textContent = 'cache'; renderSeals(); applyFilters(); }
  try {
    const fullCards = await fetchBanlistProgressively((partialCards, firstPage) => {
      if (token !== state.loadToken) return;
      if (firstPage || !cachedCards?.length) { $('loadingState').hidden = true; state.loadingMore = true; }
      state.cards = partialCards; $('totalCards').textContent = `${partialCards.length}+`; $('lastUpdated').textContent = 'buscando'; renderSeals(); applyFilters();
    });
    if (token !== state.loadToken || !fullCards.length) throw new Error('empty');
    state.cards = fullCards; state.loadingMore = false; $('totalCards').textContent = fullCards.length; $('lastUpdated').textContent = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date()); writeCardsCache(fullCards); renderSeals(); applyFilters();
  } catch {
    if (token !== state.loadToken) return;
    state.loadingMore = false;
    if (!state.cards.length) { state.cards = fallbackCards.map((card) => ({ ...card, image: card.image || makePlaceholder(card.name, card.color_identity[0]) })); $('totalCards').textContent = '—'; $('lastUpdated').textContent = 'offline'; renderSeals(); applyFilters(); $('errorState').hidden = false; } else { $('lastUpdated').textContent = 'cache'; render(); }
  } finally {
    if (token !== state.loadToken) return;
    $('loadingState').hidden = true;
    const selectedId = new URLSearchParams(location.search).get('card'); const selected = state.cards.find((card) => card.id === selectedId); if (selected) openCard(selected);
  }
}

document.addEventListener('DOMContentLoaded', () => { const initials = $('brandInitials'); if (initials) initials.textContent = site.playgroupInitials; $('brandName').textContent = site.playgroupName; $('pageTitle').textContent = site.pageTitle; $('pageSubtitle').textContent = site.pageSubtitle; $('formatCount').textContent = formats.length; bind(); bindParallax(); loadCards(); loadBackground(); });
