import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../banlist.js', import.meta.url), 'utf8');

function functionSource(name, nextName) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `função ${name} não encontrada`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  assert.notEqual(end, -1, `limite da função ${name} não encontrado`);
  return source.slice(start, end);
}

test('a importação preserva Main Deck, Sideboard e linhas SB', () => {
  const parser = functionSource('parseDeckBuilderImport', 'normalizeDeckName');
  assert.match(parser, /sideHeadings/);
  assert.match(parser, /lineSection = \/\^SB:/);
  assert.match(parser, /section: lineSection/);
  assert.match(parser, /parseDeckList\(trimmed\)/);
});

test('cartas não reconhecidas permanecem no builder para salvar como inválido', () => {
  const unresolved = functionSource('deckBuilderUnresolvedEntry', 'openDeckBuilderImport');
  const importer = functionSource('importDeckBuilderList', 'deckBuilderReturnUrl');
  assert.match(unresolved, /id: `name:\$\{key\}`/);
  assert.match(importer, /deckBuilderUnresolvedEntry\(entry\)/);
  assert.match(importer, /scheduleDeckBuilderValidation\(\)/);
  assert.doesNotMatch(importer, /throw new Error.*não reconhecid/i);
});

test('a importação soma a lista ao deck existente em vez de apagá-lo', () => {
  const importer = functionSource('importDeckBuilderList', 'deckBuilderReturnUrl');
  assert.match(importer, /existing\.quantity = Math\.min\(999/);
  assert.doesNotMatch(importer, /deckBuilder = emptyDeckBuilder\(\)/);
});
