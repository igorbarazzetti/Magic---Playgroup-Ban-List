import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../virtual-grid.js', import.meta.url), 'utf8');
const { calculateVirtualRange } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('mantém apenas a janela próxima da tela', () => {
  const range = calculateVirtualRange({ totalItems: 31_970, columns: 4, rowHeight: 400, scrollOffset: 40_000, viewportHeight: 800, overscanRows: 3 });
  assert.deepEqual({ start: range.startIndex, end: range.endIndex }, { start: 388, end: 420 });
  assert.equal(range.before, 38_800);
  assert.ok(range.after > 3_000_000);
});

test('não cria espaço anterior no começo da listagem', () => {
  const range = calculateVirtualRange({ totalItems: 266, columns: 2, rowHeight: 320, scrollOffset: 0, viewportHeight: 780, overscanRows: 4 });
  assert.equal(range.startIndex, 0);
  assert.equal(range.before, 0);
  assert.equal(range.endIndex, 14);
});

test('limita a última janela ao total real de cartas', () => {
  const range = calculateVirtualRange({ totalItems: 163, columns: 3, rowHeight: 360, scrollOffset: 99_999, viewportHeight: 900, overscanRows: 3 });
  assert.equal(range.endIndex, 163);
  assert.equal(range.after, 0);
});
