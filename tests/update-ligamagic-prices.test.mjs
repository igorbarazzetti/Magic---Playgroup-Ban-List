import test from 'node:test';
import assert from 'node:assert/strict';

import {
  challengeCooldownDurationMs,
  extractCheapestNormalPrinting,
  extractLigaMagicResultUrl,
  fetchPublishedDeckPriorities,
  isDeterministicFailure,
  ligaMagicLookupName,
  ligaMagicUrl,
  prependPublishedDeckPriorities,
  priceTuple,
  publishedDeckPriorityCards,
  requestDelayMs,
  selectPriorityCard,
  scryfallPriceCents,
  selectBatch,
  upgradeLegacyChallengeCooldown,
  usdCents,
} from '../scripts/update-ligamagic-prices.mjs';
import { mergeLegacyBooks, mergePriceIndexes, mergeRecordMaps } from '../scripts/merge-ligamagic-data.mjs';

test('consulta cartas de duas faces pelo nome da face principal', () => {
  const url = new URL(ligaMagicUrl('Adventurous Eater // Have a Bite'));
  assert.equal(url.searchParams.get('card'), 'Adventurous Eater');
  assert.equal(ligaMagicLookupName('Delver of Secrets // Insectile Aberration'), 'Delver of Secrets');
});

test('remove apenas aspas tipográficas que envolvem todo o nome', () => {
  const url = new URL(ligaMagicUrl('"Ach! Hans, Run!"'));
  assert.equal(url.searchParams.get('card'), 'Ach! Hans, Run!');
});

test('resolve o link canônico retornado pela LigaMagic para nomes especiais', () => {
  const html = '<a href="/?view=cards/card&amp;card=%26ldquo%3BAch%21+Hans%2C+Run%21%26rdquo%3B">&ldquo;Ach! Hans, Run!&rdquo;</a>';
  const url = extractLigaMagicResultUrl(html, '"Ach! Hans, Run!"');
  assert.equal(new URL(url).searchParams.get('card'), '&ldquo;Ach! Hans, Run!&rdquo;');
});

test('resolve pelo nome canônico do link quando o resultado não tem texto visível', () => {
  const html = '<a href="/?view=cards/card&amp;card=Giant+Growth&amp;aux=Crescimento+Desenfreado"><img alt=""></a>';
  const url = extractLigaMagicResultUrl(html, 'Giant Growth');
  assert.equal(new URL(url).searchParams.get('card'), 'Giant Growth');
  assert.equal(new URL(url).searchParams.get('aux'), 'Crescimento Desenfreado');
});

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

test('varia o intervalo de recuperação somente entre 25 e 35 segundos', () => {
  assert.equal(requestDelayMs(() => 0), 25_000);
  assert.equal(requestDelayMs(() => 0.5), 30_000);
  assert.equal(requestDelayMs(() => 1), 35_000);
});

test('aumenta o cooldown do desafio sem ultrapassar 72 horas', () => {
  assert.equal(challengeCooldownDurationMs(1), 24 * 60 * 60 * 1000);
  assert.equal(challengeCooldownDurationMs(2), 48 * 60 * 60 * 1000);
  assert.equal(challengeCooldownDurationMs(3), 72 * 60 * 60 * 1000);
  assert.equal(challengeCooldownDurationMs(10), 72 * 60 * 60 * 1000);
});

test('converte o cooldown legado em uma janela silenciosa de 24 horas apenas uma vez', () => {
  const now = Date.parse('2026-08-18T20:00:00.000Z');
  const priceIndex = {
    last_batch_at: '2026-08-18T17:41:48.186Z',
    cooldown_until: '2026-08-18T23:41:48.159Z',
  };
  assert.equal(upgradeLegacyChallengeCooldown(priceIndex, now), true);
  assert.equal(priceIndex.cooldown_reason, 'cloudflare_challenge');
  assert.equal(priceIndex.challenge_block_count, 1);
  assert.equal(priceIndex.cooldown_until, '2026-08-19T20:00:00.000Z');
  assert.equal(upgradeLegacyChallengeCooldown(priceIndex, now + 60_000), false);
});

test('separa falhas determinísticas de bloqueios e falhas temporárias', () => {
  assert.equal(isDeterministicFailure(null, 'A lista de impressões não foi encontrada na página.'), true);
  assert.equal(isDeterministicFailure(429, 'HTTP 429'), false);
  assert.equal(isDeterministicFailure(null, 'fetch failed'), false);
});

test('permite priorizar uma carta pelo nome exato ou pela face principal', () => {
  const targets = [
    { oracleId: 'hammer', name: 'Colossus Hammer' },
    { oracleId: 'delver', name: 'Delver of Secrets // Insectile Aberration' },
  ];
  assert.equal(selectPriorityCard(targets, 'colossus hammer')?.oracleId, 'hammer');
  assert.equal(selectPriorityCard(targets, 'Delver of Secrets')?.oracleId, 'delver');
  assert.equal(selectPriorityCard(targets, 'Carta inventada'), null);
});

test('prioriza preços ausentes ou anteriores à publicação sem inventar correspondências', () => {
  const targets = [
    { oracleId: 'delver', name: 'Delver of Secrets // Insectile Aberration' },
    { oracleId: 'hammer', name: 'Colossus Hammer' },
    { oracleId: 'forest', name: 'Forest' },
  ];
  const prices = {
    hammer: [400, 'a', Math.floor(Date.parse('2026-08-10T13:00:00.000Z') / 1000)],
  };
  const cards = [
    ['Delver of Secrets', '2026-08-10T12:00:00.000Z'],
    ['Colossus Hammer', '2026-08-10T12:00:00.000Z'],
    ['Forest', '2026-08-10T12:00:00.000Z'],
    ['Delver of Secret', '2026-08-10T14:00:00.000Z'],
  ];

  assert.deepEqual(publishedDeckPriorityCards(targets, prices, cards), [
    { oracleId: 'delver', name: 'Delver of Secrets // Insectile Aberration' },
  ]);
});

test('cartas de decks publicados entram na frente sem aumentar nem duplicar o lote', () => {
  const regular = {
    mode: 'bootstrap', missing: 3,
    cards: [
      { oracleId: 'a', name: 'Alpha' },
      { oracleId: 'b', name: 'Beta' },
      { oracleId: 'c', name: 'Gamma' },
    ],
  };
  const priority = [
    { oracleId: 'c', name: 'Gamma' },
    { oracleId: 'p', name: 'Priority' },
  ];
  const selection = prependPublishedDeckPriorities(regular, priority, 3);
  assert.equal(selection.priorityCount, 2);
  assert.deepEqual(selection.cards.map((card) => card.oracleId), ['c', 'p', 'a']);
});

test('a prioridade publicada reserva parte do lote para a cobertura normal', () => {
  const regular = {
    mode: 'bootstrap', missing: 2,
    cards: [{ oracleId: 'a', name: 'Alpha' }, { oracleId: 'b', name: 'Beta' }],
  };
  const priority = Array.from({ length: 10 }, (_, index) => ({ oracleId: `p${index}`, name: `Priority ${index}` }));
  const selection = prependPublishedDeckPriorities(regular, priority, 5);
  assert.equal(selection.priorityCount, 4);
  assert.deepEqual(selection.cards.map((card) => card.oracleId), ['p0', 'p1', 'p2', 'p3', 'a']);
});

test('falha ao consultar decks publicados preserva a fila normal', async () => {
  const priorities = await fetchPublishedDeckPriorities('https://formatinho.test/api/decks/price-priority', async () => {
    throw new Error('offline');
  });
  assert.deepEqual(priorities, []);
  assert.equal(selectBatch([{ oracleId: 'a', name: 'Alpha' }], {}, 1).cards[0].oracleId, 'a');
});

test('mescla lotes concorrentes sem apagar um preço prioritário', () => {
  const hammerId = '8ec03b88-8d3a-4a32-8b7c-7da59b0c03d0';
  const current = {
    generated_at: '2026-08-09T23:56:00.378Z',
    coverage: { target_count: 32046 },
    prices: { [hammerId]: [400, 'a', 1786319760] },
    failures: {},
  };
  const incoming = {
    generated_at: '2026-08-10T00:35:18.763Z',
    coverage: { target_count: 32046 },
    prices: { 'outra-carta': [250, 'a', 1786322118] },
    failures: {},
  };

  const merged = mergePriceIndexes(current, incoming);
  assert.deepEqual(merged.prices[hammerId], [400, 'a', 1786319760]);
  assert.deepEqual(merged.prices['outra-carta'], [250, 'a', 1786322118]);
  assert.equal(merged.coverage.attempted_count, 2);
  assert.equal(merged.coverage.confirmed_count, 2);
});

test('mantém o detalhe mais recente de cada carta durante a mesclagem', () => {
  const older = { status: 'available', price_brl: 3, checked_at: '2026-08-09T22:00:00.000Z' };
  const newer = { status: 'available', price_brl: 4, checked_at: '2026-08-09T23:56:00.000Z' };
  assert.deepEqual(mergeRecordMaps({ hammer: newer }, { hammer: older }), { hammer: newer });
  assert.deepEqual(mergeLegacyBooks({ cards: { hammer: newer } }, { cards: { outra: older } }).cards, {
    hammer: newer,
    outra: older,
  });
});

test('aceita o formato cardsjson atual da LigaMagic e ignora outras cartas', () => {
  const html = `<script>var cardsjson = ${JSON.stringify([
    { nEN: 'Outra Carta', sSigla: 'OTR', sN: '1', p1a: '0.10' },
    { nEN: 'Giant Growth', sSigla: 'W24', sN: '162', p1a: '0.25' },
    { nEN: 'Giant Growth', sSigla: '30A', sN: '193', p1a: '7.99' },
  ])};</script>`;

  assert.deepEqual(extractCheapestNormalPrinting(html, 'Giant Growth'), {
    price: 0.25,
    printingName: 'Giant Growth',
    printingCode: 'W24',
    collectorNumber: '162',
  });
});
