import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

// Cache-mode coverage observes stdout, stderr, cache JSON, and marker files so
// regressions stay visible without adding runtime-only seams.
import { readFixtureText, runFixtureCli } from '../support/run-cli.mjs';
import { normalizeCliOutput } from '../support/normalize-output.mjs';

// Marker files live in tmp space so refresh assertions stay isolated from user
// state while still proving fixture-local PATH execution.
function makeMarkerPath() {
  return path.join(
    tmpdir(),
    `cusage-background-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.marker`,
  );
}

test('fast mode serves the warm cache snapshot before live refresh work', async () => {
  const { stdout, stderr, cacheJson, exitCode, cleanup } = await runFixtureCli(['--fast'], { scenario: 'cache-hit' });
  try {
    assert.equal(exitCode, 0);
    assert.equal(normalizeCliOutput(stderr), 'Loading data from cache-first mode...\nUsing stale Claude cache (--fast).');
    assert.match(normalizeCliOutput(stdout), /2026-03-08/);
    assert.equal(cacheJson?.claude?.commands?.['daily::--offline']?.data?.daily?.[0]?.date, '2026-03-08');
    assert.equal(cacheJson?.codex?.files && Object.keys(cacheJson.codex.files).length, 1);
  } finally {
    cleanup();
  }
});

test('fresh mode rebuilds the cache-hit fixture from source data', async () => {
  const { stdout, cacheJson, exitCode, cleanup } = await runFixtureCli(['--fresh'], { scenario: 'cache-hit' });
  try {
    assert.equal(exitCode, 0);
    assert.equal(normalizeCliOutput(stdout), normalizeCliOutput(readFixtureText('cache-hit', 'expected', 'fresh.txt')));
    assert.equal(cacheJson?.claude?.commands?.['daily::--offline']?.data?.daily?.[0]?.date, '2026-03-09');
    const [codexPath] = Object.keys(cacheJson?.codex?.files ?? {});
    assert.match(codexPath, /cache-hit[\\/].*root-session\.jsonl$/);
    assert.equal(cacheJson?.codex?.files?.[codexPath]?.summary?.output, 120);
  } finally {
    cleanup();
  }
});

test('non-interactive fast mode never detaches the background refresh helper', async () => {
  const markerPath = makeMarkerPath();
  rmSync(markerPath, { force: true });

  const { exitCode, cleanup } = await runFixtureCli(['--fast'], {
    scenario: 'cache-hit',
    env: { CUSAGE_BACKGROUND_MARKER: markerPath },
  });

  try {
    assert.equal(exitCode, 0);
    assert.equal(existsSync(markerPath), false);
  } finally {
    cleanup();
    rmSync(markerPath, { force: true });
  }
});

// The internal flag provides an observable refresh side effect without a
// TTY-specific harness.
test('explicit background refresh runs leave a marker through the ccusage stub', async () => {
  const markerPath = makeMarkerPath();
  rmSync(markerPath, { force: true });

  const { exitCode, cleanup } = await runFixtureCli(['--fresh', '--background-refresh'], {
    scenario: 'cache-hit',
    env: { CUSAGE_BACKGROUND_MARKER: markerPath },
  });

  try {
    assert.equal(exitCode, 0);
    assert.equal(readFileSync(markerPath, 'utf8'), 'ccusage-called\n');
  } finally {
    cleanup();
    rmSync(markerPath, { force: true });
  }
});

test('Claude cache fallback keeps stderr deterministic when refresh fails', async () => {
  const { stderr, exitCode, cleanup } = await runFixtureCli([], { scenario: 'cache-fallback' });
  try {
    assert.equal(exitCode, 0);
    assert.equal(normalizeCliOutput(stderr), normalizeCliOutput(readFixtureText('cache-fallback', 'expected', 'stderr.txt')));
  } finally {
    cleanup();
  }
});
