import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractCheapestNormalPrinting,
  priceTuple,
  scryfallPriceCents,
  selectBatch,
  usdCents,
} from '../scripts/update-ligamagic-prices.mjs';

test('não converte preço USD ausente em zero', () => {
  assert.equal(usdCents({ prices: { usd: null } }), null);
  assert.equal(usdCents({ prices: { usd: '' } }), null);
  assert.equal(usdCents({ prices: { usd: '0.35' } }), 35);
});

test('usa outro acabamento do Scryfall quando a impressão não possui preço normal', () => {
  assert.equal(scryfallPriceCents({ prices: { usd: null, usd_foil: '0.42', usd_etched: null } }), 42);
  assert.equal(scryfallPriceCents({ prices: { usd: '1.05', usd_foil: '0.39', usd_etched: null } }), 39);
});

test('seleciona o menor preço normal entre todas as impressões', () => {
  const html = `<script>var cards_editions = ${JSON.stringify([
    { name: 'Secret Lair', code: 'SLD', num: '900', price: { 0: { p: '18,90' } } },
    { name: 'Foundations', code: 'FDN', num: '242', price: { 0: { p: '5,75' } } },
    { name: 'Commander Legends', code: 'CMR', num: '10', price: { 0: { p: '11,45' } } },
  ])};</script>`;

  assert.deepEqual(extractCheapestNormalPrinting(html), {
    price: 5.75,
    printingName: 'Foundations',
    printingCode: 'FDN',
    collectorNumber: '242',
  });
});

test('prioriza cartas nunca consultadas durante a cobertura inicial', () => {
  const targets = [
    { oracleId: 'a', name: 'Alpha' },
    { oracleId: 'b', name: 'Beta' },
    { oracleId: 'c', name: 'Gamma' },
  ];
  const prices = { a: [100, 'a', 1000] };

  assert.deepEqual(selectBatch(targets, prices, 1), {
    mode: 'bootstrap',
    cards: [{ oracleId: 'b', name: 'Beta' }],
    missing: 2,
  });
});

test('após a cobertura atualiza primeiro os registros mais antigos', () => {
  const targets = [
    { oracleId: 'a', name: 'Alpha' },
    { oracleId: 'b', name: 'Beta' },
    { oracleId: 'c', name: 'Gamma' },
  ];
  const prices = {
    a: [100, 'a', 3000],
    b: [null, 'u', 1000],
    c: [200, 's', 2000],
  };

  const selection = selectBatch(targets, prices, 2);
  assert.equal(selection.mode, 'maintenance');
  assert.deepEqual(selection.cards.map((card) => card.oracleId), ['b', 'c']);
  assert.equal(prices.c[priceTuple.status], 's');
});
