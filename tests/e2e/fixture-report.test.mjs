import assert from 'node:assert/strict';
import test from 'node:test';

// These black-box goldens pin the shipped CLI contract at the published
// entrypoint alongside the source-extraction tests.
import { readFixtureText, runFixtureCli } from '../support/run-cli.mjs';
import { normalizeCliOutput } from '../support/normalize-output.mjs';

// Assertion-side normalization removes transport noise without redefining the
// rendered report contract that users see in the terminal.
async function collectNormalizedRun(args = [], options = {}) {
  const run = await runFixtureCli(args, options);
  return {
    run,
    stdout: normalizeCliOutput(run.stdout),
    stderr: normalizeCliOutput(run.stderr),
  };
}

test('daily fixture report matches the checked-in golden', async () => {
  const { run, stdout } = await collectNormalizedRun();
  try {
    assert.equal(run.exitCode, 0);
    assert.equal(stdout, normalizeCliOutput(readFixtureText('baseline', 'expected', 'daily.txt')));
  } finally {
    run.cleanup();
  }
});

test('monthly fixture report matches the checked-in golden', async () => {
  const { run, stdout } = await collectNormalizedRun(['monthly']);
  try {
    assert.equal(run.exitCode, 0);
    assert.equal(stdout, normalizeCliOutput(readFixtureText('baseline', 'expected', 'monthly.txt')));
  } finally {
    run.cleanup();
  }
});

test('breakdown fixture report matches the checked-in golden', async () => {
  const { run, stdout } = await collectNormalizedRun(['--breakdown']);
  try {
    assert.equal(run.exitCode, 0);
    assert.equal(stdout, normalizeCliOutput(readFixtureText('baseline', 'expected', 'breakdown.txt')));
  } finally {
    run.cleanup();
  }
});

// This selector check pins the Codex-only provider path and merged-model
// labels encoded in the baseline output.
test('provider filter keeps the Codex-only selector stable', async () => {
  const { run, stdout, stderr } = await collectNormalizedRun(['--providers', 'codex']);
  try {
    assert.equal(run.exitCode, 0);
    assert.equal(stderr, 'Loading data...');
    assert.match(stdout, /2026-03-07/);
    assert.match(stdout, /gpt-5\.4 \(priority\)/);
    assert.match(stdout, /\$0\.0030/);
    assert.doesNotMatch(stdout, /3-7-sonnet/);
  } finally {
    run.cleanup();
  }
});
