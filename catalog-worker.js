const colorBits = { W: 1, U: 2, B: 4, R: 8, G: 16 };
const nameCollator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
let records = [];
let priceEntries = {};
let usdBrlRate = 0;

const normalize = (value = '') => String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const sortableName = (value = '') => normalize(value).replace(/^[^a-z0-9]+/, '');
const selectedMask = (colors = []) => colors.reduce((mask, color) => mask | (colorBits[color] || 0), 0);

function buildRecords(tuples, sets = {}) {
  records = tuples.map((tuple, index) => {
    const [id, oracleId, name, mask, type, cmc, rarity, set, usdCents, bannedFormats] = tuple;
    return {
      index,
      id,
      oracleId: oracleId || id,
      name: sortableName(name),
      searchable: normalize(`${name || ''} ${type || ''} ${sets[set] || set || ''}`),
      mask: Number(mask) || 0,
      type: type || 'other',
      cmc: Number(cmc) || 0,
      rarity: rarity || '',
      set: set || '',
      usdCents: Number(usdCents) || 0,
      bannedFormats: bannedFormats ? String(bannedFormats).split(',') : [],
    };
  });
}

function colorMatches(recordMask, colors, mode) {
  if (!colors.length) return true;
  const wantsColorless = colors.includes('C');
  const colored = colors.filter((color) => color !== 'C');
  const mask = selectedMask(colored);
  const isColorless = recordMask === 0;
  if (mode === 'exact') return wantsColorless ? colors.length === 1 && isColorless : !isColorless && recordMask === mask;
  if (mode === 'minimum') return wantsColorless ? colors.length === 1 && isColorless : (recordMask & mask) === mask;
  return (wantsColorless && isColorless) || Boolean(recordMask & mask);
}

function effectivePrice(record) {
  const price = priceEntries[record.oracleId];
  const ligaCents = Number(price?.[0]);
  if (ligaCents > 0 && (price?.[1] === 'a' || price?.[1] === 's')) return ligaCents / 100;
  return record.usdCents > 0 && usdBrlRate > 0 ? (record.usdCents / 100) * usdBrlRate : null;
}

function compareRecords(sort) {
  const byName = (a, b) => nameCollator.compare(a.name, b.name);
  if (sort === 'cmc-asc') return (a, b) => a.cmc - b.cmc || byName(a, b);
  if (sort === 'cmc-desc') return (a, b) => b.cmc - a.cmc || byName(a, b);
  if (sort === 'formats-desc') return (a, b) => b.bannedFormats.length - a.bannedFormats.length || byName(a, b);
  if (sort === 'color') return (a, b) => a.mask - b.mask || byName(a, b);
  if (sort === 'price-asc') return (a, b) => (effectivePrice(a) ?? Infinity) - (effectivePrice(b) ?? Infinity) || byName(a, b);
  if (sort === 'price-desc') return (a, b) => (effectivePrice(b) ?? -Infinity) - (effectivePrice(a) ?? -Infinity) || byName(a, b);
  return byName;
}

function filterCatalog(criteria) {
  const exactOracleIds = criteria.oracleMatches ? new Set(criteria.oracleMatches) : null;
  const selectedFormats = criteria.selectedFormats?.length ? new Set(criteria.selectedFormats) : null;
  const result = [];
  for (const record of records) {
    if (criteria.freeText && !record.searchable.includes(criteria.freeText)) continue;
    if (exactOracleIds && !exactOracleIds.has(record.oracleId)) continue;
    if (selectedFormats && !record.bannedFormats.some((format) => selectedFormats.has(format))) continue;
    if (!colorMatches(record.mask, criteria.colors || [], criteria.colorMatch || 'exact')) continue;
    if (criteria.type && record.type !== criteria.type) continue;
    if (criteria.cmc !== '' && criteria.cmc !== null && criteria.cmc !== undefined) {
      const cmc = Number(criteria.cmc);
      if (criteria.cmc === '6' ? record.cmc < 6 : record.cmc !== cmc) continue;
    }
    if (criteria.rarity) {
      if (criteria.rarity === 'special') {
        if (['common', 'uncommon', 'rare', 'mythic'].includes(record.rarity)) continue;
      } else if (record.rarity !== criteria.rarity) continue;
    }
    if (criteria.set && record.set !== criteria.set) continue;
    if (!criteria.showBanned && record.bannedFormats.length) continue;
    const price = effectivePrice(record);
    if (price === null || price > criteria.maxPrice) continue;
    result.push(record);
  }
  if (criteria.sort === 'name-desc') result.reverse();
  else if (criteria.sort !== 'name-asc') result.sort(compareRecords(criteria.sort));
  return result.map((record) => record.index);
}

self.onmessage = ({ data }) => {
  if (data.type === 'init') {
    priceEntries = data.prices || {};
    usdBrlRate = Number(data.usdBrlRate) || 0;
    buildRecords(data.tuples || [], data.sets || {});
    self.postMessage({ type: 'ready', count: records.length });
    return;
  }
  if (data.type === 'prices') {
    priceEntries = data.prices || {};
    usdBrlRate = Number(data.usdBrlRate) || usdBrlRate;
    return;
  }
  if (data.type === 'filter') {
    const startedAt = performance.now();
    const indexes = filterCatalog(data.criteria || {});
    self.postMessage({ type: 'result', requestId: data.requestId, indexes, duration: performance.now() - startedAt });
  }
};
