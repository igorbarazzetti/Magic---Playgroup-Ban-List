import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../banlist.js', import.meta.url), 'utf8');

function functionSource(name, nextName) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `função ${name} não encontrada`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
  assert.notEqual(end, -1, `limite da função ${name} não encontrado`);
  return source.slice(start, end);
}

test('deck builder and catalog share the protected catalog loader', () => {
  const loader = functionSource('getCatalogData', 'renderPriceCoverage');
  assert.match(loader, /return getPersistentCatalogData\(\)/);
  assert.doesNotMatch(loader, /fetch\(/);
});

test('catalog worker filter has a deadline and local recovery path', () => {
  const request = functionSource('requestCatalogWorkerFilter', 'canFilterCatalogInWorker');
  const apply = functionSource('applyCatalogFiltersInWorker', 'applyFilters');
  assert.match(request, /setTimeout\(/);
  assert.match(request, /catalogWorkerFilterTimeoutMs/);
  assert.match(request, /resetCatalogWorker\(/);
  assert.match(apply, /applyFiltersSync\(\)/);
});

test('first catalog render happens before optional remote refinements', () => {
  const load = functionSource('loadCatalog', 'loadCards');
  const renderIndex = load.indexOf('applyFiltersSync({ allowPendingOracle: true })');
  const loadedIndex = load.indexOf('view.loaded = true');
  assert.ok(renderIndex >= 0 && loadedIndex > renderIndex, 'loaded só pode ser marcado depois do primeiro render');
  assert.doesNotMatch(load, /await ensureScryfallSyntaxSearch/);
  assert.doesNotMatch(load, /await ensureCatalogOracleMatches/);
  assert.match(load, /void refreshActiveRemoteFilters\(view\)/);
});

test('Scryfall page requests cannot wait forever', () => {
  const fetchPages = functionSource('fetchScryfallPages', 'clearScryfallSyntaxSearch');
  assert.match(fetchPages, /fetchWithTimeout\(/);
});
