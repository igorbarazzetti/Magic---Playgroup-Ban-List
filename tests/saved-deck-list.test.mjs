import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../banlist.js', import.meta.url), 'utf8');

test('saved deck detail separates sideboard only when it exists', () => {
  const start = source.indexOf('function renderSavedDeckList');
  const end = source.indexOf('async function hydrateSavedDeckPreviews', start);
  const render = source.slice(start, end);
  assert.match(render, /entry\.section === 'sideboard'/);
  assert.match(render, /section\('Main Deck', main/);
  assert.match(render, /sideboard\.length \? section\('Sideboard', sideboard/);
});

test('deck cards show their combined color identity beside the title', () => {
  assert.match(source, /function deckColorSymbols/);
  assert.match(source, /validated-deck-card__title-row/);
  assert.match(source, /hydrateValidatedDeckColors\(filtered\)/);
});

test('deck cards display a live total directly below the pilot', () => {
  const renderStart = source.indexOf('function renderValidatedDecks');
  const renderEnd = source.indexOf('function switchValidatedDeckScope', renderStart);
  const render = source.slice(renderStart, renderEnd);
  assert.match(source, /function validatedDeckPricing/);
  assert.match(render, /validatedDeckPriceMarkup\(deck\)/);
  assert.match(render, /hydrateValidatedDeckMarketPrices\(filtered\)/);
});

test('saved deck prices wait for the current catalog index and never use legacy card values', () => {
  const resolvedStart = source.indexOf('function resolvedCardPrice');
  const resolvedEnd = source.indexOf('function effectiveCatalogPrice', resolvedStart);
  const resolved = source.slice(resolvedStart, resolvedEnd);
  const hydrateStart = source.indexOf('async function hydrateSavedDeckPreviews');
  const hydrateEnd = source.indexOf('function closeSavedDeck', hydrateStart);
  const hydrate = source.slice(hydrateStart, hydrateEnd);

  assert.doesNotMatch(resolved, /savedDeckPriceBook\?\.cards/);
  assert.match(hydrate, /getCurrentCatalogPriceIndex\(\{ forceNetwork: true \}\)/);
  assert.match(hydrate, /Promise\.allSettled/);
});

test('card modal always refreshes from the current catalog price index', () => {
  const start = source.indexOf('async function hydrateLigaMagicPrice');
  const end = source.indexOf('function legalitiesMarkup', start);
  const hydrate = source.slice(start, end);
  const catalogStart = source.indexOf('async function hydrateCatalogMarketPrice');
  const catalogEnd = source.indexOf('async function hydrateLigaMagicPrice', catalogStart);
  const catalog = source.slice(catalogStart, catalogEnd);
  assert.match(hydrate, /return hydrateCatalogMarketPrice\(card\)/);
  assert.doesNotMatch(hydrate, /getLigaMagicPriceBook/);
  assert.match(catalog, /getCurrentCatalogPriceIndex\(\{ forceNetwork: true \}\)/);
});
