import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function createWorkerHarness() {
  const messages = [];
  const self = { postMessage: (message) => messages.push(message), onmessage: null };
  const context = vm.createContext({ self, Intl, performance });
  const source = await readFile(new URL('../catalog-worker.js', import.meta.url), 'utf8');
  vm.runInContext(source, context);
  const send = (data) => {
    messages.length = 0;
    self.onmessage({ data });
    return messages.at(-1);
  };
  return { send };
}

const tuples = [
  ['white', 'oracle-white', 'Alpha White', 1, 'creature', 1, 'common', 'tst', 100, ''],
  ['blue', 'oracle-blue', 'Beta Draw', 2, 'instant', 1, 'uncommon', 'tst', 200, ''],
  ['azorius', 'oracle-azorius', 'Gamma Pair', 3, 'creature', 2, 'rare', 'tst', 300, ''],
  ['colorless', 'oracle-colorless', 'Delta Stone', 0, 'artifact', 2, 'common', 'tst', 400, ''],
  ['banned', 'oracle-banned', 'Epsilon Seal', 2, 'instant', 1, 'common', 'tst', 100, 'pauper'],
];

function criteria(overrides = {}) {
  return {
    freeText: '', oracleMatches: null, selectedFormats: [], colors: [], colorMatch: 'exact', type: '', cmc: '', rarity: '', set: '',
    showBanned: false, maxPrice: 99, sort: 'name-asc', ...overrides,
  };
}

test('catalog worker filters colors, text and hidden banned cards', async () => {
  const worker = await createWorkerHarness();
  worker.send({ type: 'init', tuples, sets: { tst: 'Test Set' }, prices: {}, usdBrlRate: 5 });
  const result = worker.send({ type: 'filter', requestId: 1, criteria: criteria({ freeText: 'draw', colors: ['U'] }) });
  assert.deepEqual([...result.indexes], [1]);
});

test('catalog worker applies LigaMagic price before converted Scryfall price', async () => {
  const worker = await createWorkerHarness();
  worker.send({ type: 'init', tuples, sets: {}, prices: { 'oracle-azorius': [2500, 'a', 0] }, usdBrlRate: 5 });
  const result = worker.send({ type: 'filter', requestId: 2, criteria: criteria({ maxPrice: 30, showBanned: true, sort: 'price-desc' }) });
  assert.deepEqual([...result.indexes], [2, 3, 1, 0, 4]);
});

test('catalog worker supports exact and minimum color matching', async () => {
  const worker = await createWorkerHarness();
  worker.send({ type: 'init', tuples, sets: {}, prices: {}, usdBrlRate: 5 });
  const exact = worker.send({ type: 'filter', requestId: 3, criteria: criteria({ colors: ['W', 'U'], colorMatch: 'exact' }) });
  const minimum = worker.send({ type: 'filter', requestId: 4, criteria: criteria({ colors: ['U'], colorMatch: 'minimum', showBanned: true }) });
  assert.deepEqual([...exact.indexes], [2]);
  assert.deepEqual([...minimum.indexes], [1, 2, 4]);
});
