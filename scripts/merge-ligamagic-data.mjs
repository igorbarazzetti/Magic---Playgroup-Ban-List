#!/usr/bin/env node

import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const targetDataRoot = resolve(projectRoot, 'data');

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value)}\n`, 'utf8');
  await rename(temporaryPath, path);
}

function timeValue(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function newestIso(...values) {
  return values.filter(Boolean).sort((left, right) => timeValue(right) - timeValue(left))[0] || null;
}

function entryTime(entry) {
  return timeValue(entry?.checked_at || entry?.attempted_at);
}

export function mergeRecordMaps(current = {}, incoming = {}) {
  const merged = { ...current };
  for (const [id, entry] of Object.entries(incoming || {})) {
    const existing = merged[id];
    if (!existing || entryTime(entry) >= entryTime(existing)) merged[id] = entry;
  }
  return merged;
}

function mergeFailures(current = {}, incoming = {}, prices = {}) {
  const merged = mergeRecordMaps(current, incoming);
  for (const id of Object.keys(prices)) delete merged[id];
  return merged;
}

function mergePriceTuples(current = {}, incoming = {}) {
  const merged = { ...current };
  for (const [id, tuple] of Object.entries(incoming || {})) {
    const existing = merged[id];
    const incomingTimestamp = Number(tuple?.[2]) || 0;
    const existingTimestamp = Number(existing?.[2]) || 0;
    if (!existing || incomingTimestamp >= existingTimestamp) merged[id] = tuple;
  }
  return merged;
}

function coverageFor(prices, targetCount, previousCoverage = {}) {
  const values = Object.values(prices || {});
  const attemptedCount = values.length;
  const confirmedCount = values.filter((entry) => entry?.[1] === 'a').length;
  const unavailableCount = values.filter((entry) => entry?.[1] === 'u').length;
  const staleCount = values.filter((entry) => entry?.[1] === 's').length;
  return {
    ...previousCoverage,
    target_count: targetCount,
    attempted_count: attemptedCount,
    confirmed_count: confirmedCount,
    unavailable_count: unavailableCount,
    stale_count: staleCount,
    percent: targetCount ? Number(((attemptedCount / targetCount) * 100).toFixed(2)) : 0,
  };
}

export function mergePriceIndexes(current = {}, incoming = {}) {
  const newest = timeValue(incoming.generated_at) >= timeValue(current.generated_at) ? incoming : current;
  const prices = mergePriceTuples(current.prices, incoming.prices);
  const targetCount = Math.max(Number(current.coverage?.target_count) || 0, Number(incoming.coverage?.target_count) || 0);
  const coverage = coverageFor(prices, targetCount, newest.coverage);
  return {
    ...current,
    ...incoming,
    ...newest,
    generated_at: newestIso(current.generated_at, incoming.generated_at),
    last_batch_at: newestIso(current.last_batch_at, incoming.last_batch_at),
    mode: coverage.attempted_count < coverage.target_count ? 'bootstrap' : 'maintenance',
    coverage,
    prices,
    failures: mergeFailures(current.failures, incoming.failures, prices),
  };
}

export function mergeLegacyBooks(current = {}, incoming = {}) {
  const newest = timeValue(incoming.generated_at) >= timeValue(current.generated_at) ? incoming : current;
  const cards = mergeRecordMaps(current.cards, incoming.cards);
  const entries = Object.values(cards);
  return {
    ...current,
    ...incoming,
    ...newest,
    generated_at: newestIso(current.generated_at, incoming.generated_at),
    cards,
    summary: {
      available: entries.filter((entry) => entry?.status === 'available').length,
      unavailable: entries.filter((entry) => entry?.status === 'unavailable').length,
      stale: entries.filter((entry) => entry?.status === 'stale').length,
    },
  };
}

async function mergeDetails(snapshotRoot) {
  const sourceRoot = resolve(snapshotRoot, 'ligamagic-details');
  const targetRoot = resolve(targetDataRoot, 'ligamagic-details');
  const sourceFiles = await readdir(sourceRoot).catch((error) => error?.code === 'ENOENT' ? [] : Promise.reject(error));
  const targetFiles = await readdir(targetRoot).catch((error) => error?.code === 'ENOENT' ? [] : Promise.reject(error));
  const files = new Set([...sourceFiles, ...targetFiles].filter((name) => name.endsWith('.json')));
  for (const name of files) {
    const current = await readJson(resolve(targetRoot, name), {});
    const incoming = await readJson(resolve(sourceRoot, name), {});
    await writeJson(resolve(targetRoot, name), mergeRecordMaps(current, incoming));
  }
}

async function mergeCatalog(snapshotRoot) {
  const relativePath = ['catalog', 'scryfall-index.json'];
  const targetPath = resolve(targetDataRoot, ...relativePath);
  const incoming = await readJson(resolve(snapshotRoot, ...relativePath), null);
  if (!incoming) return;
  const current = await readJson(targetPath, null);
  if (!current || timeValue(incoming.generated_at) > timeValue(current.generated_at)) await writeJson(targetPath, incoming);
}

function snapshotArgument(argv) {
  const value = argv.find((argument) => argument.startsWith('--snapshot='))?.slice('--snapshot='.length).trim();
  if (!value) throw new Error('Informe --snapshot=<diretorio-data>.');
  return resolve(value);
}

async function main() {
  const snapshotRoot = snapshotArgument(process.argv.slice(2));
  const currentIndex = await readJson(resolve(targetDataRoot, 'ligamagic-catalog-prices.json'), {});
  const incomingIndex = await readJson(resolve(snapshotRoot, 'ligamagic-catalog-prices.json'), {});
  const currentLegacy = await readJson(resolve(targetDataRoot, 'ligamagic-prices.json'), {});
  const incomingLegacy = await readJson(resolve(snapshotRoot, 'ligamagic-prices.json'), {});
  await Promise.all([
    writeJson(resolve(targetDataRoot, 'ligamagic-catalog-prices.json'), mergePriceIndexes(currentIndex, incomingIndex)),
    writeJson(resolve(targetDataRoot, 'ligamagic-prices.json'), mergeLegacyBooks(currentLegacy, incomingLegacy)),
    mergeDetails(snapshotRoot),
    mergeCatalog(snapshotRoot),
  ]);
  console.log('Snapshot LigaMagic mesclado por carta, preservando o registro mais recente.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
