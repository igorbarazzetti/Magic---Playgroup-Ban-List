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
