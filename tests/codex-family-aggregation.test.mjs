import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..');
const SOURCE_PATH = path.join(REPO_ROOT, 'bin', 'cusage.mjs');
const SOURCE = readFileSync(SOURCE_PATH, 'utf8');

function extractFunction(name) {
  const signature = `function ${name}`;
  const start = SOURCE.indexOf(signature);
  assert.notEqual(start, -1, `Expected ${name}() in ${SOURCE_PATH}`);

  const paramsEnd = SOURCE.indexOf(')', start);
  const bodyStart = SOURCE.indexOf('{', paramsEnd);
  assert.notEqual(paramsEnd, -1, `Could not find parameter list for ${name}()`);
  assert.notEqual(bodyStart, -1, `Could not find function body for ${name}()`);

  let depth = 0;
  let end = bodyStart;

  for (let i = bodyStart; i < SOURCE.length; i++) {
    const ch = SOURCE[i];
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  assert.ok(end > start, `Could not extract ${name}()`);
  return SOURCE.slice(start, end);
}

function extractConstLine(name) {
  const match = SOURCE.match(new RegExp(`const ${name} = .*;`));
  assert.ok(match, `Expected const ${name} in ${SOURCE_PATH}`);
  return match[0];
}

const extracted = `
${extractConstLine('SERVICE_TIER_SUPPORTED_FROM')}
${extractFunction('toISODate')}
${extractFunction('toMonthKey')}
${extractFunction('inDateRange')}
${extractFunction('normalizeServiceTier')}
${extractFunction('isFallbackServiceTierAvailable')}
${extractFunction('extractCodexServiceTier')}
${extractFunction('resolveCodexServiceTier')}
${extractFunction('createCodexState')}
${extractFunction('applyCodexObjectToState')}
${extractFunction('summarizeCodexState')}
${extractFunction('getCodexFamilyId')}
${extractFunction('updateCodexFamilyBucket')}
${extractFunction('collapseCodexFamilyBuckets')}
${extractFunction('pushCodexSummary')}
module.exports = {
  createCodexState,
  applyCodexObjectToState,
  summarizeCodexState,
  getCodexFamilyId,
  updateCodexFamilyBucket,
  collapseCodexFamilyBuckets,
  pushCodexSummary,
};
`;

const context = { module: { exports: {} }, Map };
vm.runInNewContext(extracted, context, { filename: SOURCE_PATH });

const {
  createCodexState,
  applyCodexObjectToState,
  summarizeCodexState,
  getCodexFamilyId,
  updateCodexFamilyBucket,
  collapseCodexFamilyBuckets,
  pushCodexSummary,
} = context.module.exports;

test('summarizeCodexState carries session and family lineage', () => {
  const state = createCodexState();

  applyCodexObjectToState({
    type: 'session_meta',
    payload: {
      timestamp: '2026-03-07T12:00:00.000Z',
      id: 'child-session',
      forked_from_id: 'root-session',
    },
  }, state);
  applyCodexObjectToState({
    type: 'turn_context',
    payload: { model: 'gpt-5.4' },
  }, state);
  applyCodexObjectToState({
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: 1200,
          cached_input_tokens: 900,
          output_tokens: 80,
          reasoning_output_tokens: 20,
          total_tokens: 1280,
        },
      },
    },
  }, state);

  const summary = summarizeCodexState(state);
  assert.equal(summary.sessionId, 'child-session');
  assert.equal(summary.familyId, 'root-session');
  assert.equal(summary.input, 300);
  assert.equal(summary.cacheRead, 900);
  assert.equal(summary.output, 80);
});

test('getCodexFamilyId falls back to session id then explicit fallback', () => {
  assert.equal(getCodexFamilyId({ familyId: 'root-a', sessionId: 'child-a' }, 'file-a'), 'root-a');
  assert.equal(getCodexFamilyId({ familyId: null, sessionId: 'child-a' }, 'file-a'), 'child-a');
  assert.equal(getCodexFamilyId({ familyId: null, sessionId: null }, 'file-a'), 'file-a');
});

test('updateCodexFamilyBucket keeps per-metric maxima and consistent total', () => {
  const bucket = {
    input: 100,
    cacheRead: 400,
    output: 30,
    reasoning: 10,
    total: 530,
  };

  updateCodexFamilyBucket(bucket, {
    input: 90,
    cacheRead: 450,
    output: 25,
    reasoning: 12,
  });

  assert.equal(bucket.input, 100);
  assert.equal(bucket.cacheRead, 450);
  assert.equal(bucket.output, 30);
  assert.equal(bucket.reasoning, 12);
  assert.equal(bucket.total, 580);
});

test('pushCodexSummary de-overlaps same family by max before collapse', () => {
  const byGroupFamilies = new Map();
  const options = { serviceTierOverride: 'auto', defaultServiceTier: 'fast' };

  pushCodexSummary(byGroupFamilies, {
    sessionTimestamp: '2026-03-07T12:00:00.000Z',
    sessionId: 'child-1',
    familyId: 'root-1',
    model: 'gpt-5.4',
    serviceTier: null,
    input: 500,
    cacheRead: 10_000,
    output: 100,
    reasoning: 40,
  }, 'daily', null, null, options);

  pushCodexSummary(byGroupFamilies, {
    sessionTimestamp: '2026-03-07T12:01:00.000Z',
    sessionId: 'child-2',
    familyId: 'root-1',
    model: 'gpt-5.4',
    serviceTier: null,
    input: 450,
    cacheRead: 9_000,
    output: 120,
    reasoning: 50,
  }, 'daily', null, null, options);

  const collapsed = collapseCodexFamilyBuckets(byGroupFamilies);
  const buckets = [...collapsed.get('2026-03-07').values()];
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].serviceTier, 'priority');
  assert.equal(buckets[0].input, 500);
  assert.equal(buckets[0].cacheRead, 10_000);
  assert.equal(buckets[0].output, 120);
  assert.equal(buckets[0].total, 10_620);
});

test('collapseCodexFamilyBuckets still sums separate families of the same model', () => {
  const byGroupFamilies = new Map();

  byGroupFamilies.set('2026-03-07', new Map([
    ['root-a\x1fgpt-5.4\x1fpriority', {
      familyId: 'root-a',
      model: 'gpt-5.4',
      serviceTier: 'priority',
      input: 100,
      cacheWrite: 0,
      cacheRead: 1_000,
      output: 20,
      reasoning: 5,
      total: 1_120,
    }],
    ['root-b\x1fgpt-5.4\x1fpriority', {
      familyId: 'root-b',
      model: 'gpt-5.4',
      serviceTier: 'priority',
      input: 300,
      cacheWrite: 0,
      cacheRead: 2_000,
      output: 40,
      reasoning: 9,
      total: 2_340,
    }],
  ]));

  const collapsed = collapseCodexFamilyBuckets(byGroupFamilies);
  const buckets = [...collapsed.get('2026-03-07').values()];
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].input, 400);
  assert.equal(buckets[0].cacheRead, 3_000);
  assert.equal(buckets[0].output, 60);
  assert.equal(buckets[0].reasoning, 14);
  assert.equal(buckets[0].total, 3_460);
});

test('pushCodexSummary keeps same family separate across service tiers', () => {
  const byGroupFamilies = new Map();

  pushCodexSummary(byGroupFamilies, {
    sessionTimestamp: '2026-03-07T12:00:00.000Z',
    sessionId: 'child-1',
    familyId: 'root-1',
    model: 'gpt-5.4',
    serviceTier: 'fast',
    input: 100,
    cacheRead: 1_000,
    output: 10,
    reasoning: 2,
  }, 'daily', null, null, { serviceTierOverride: 'auto', defaultServiceTier: null });

  pushCodexSummary(byGroupFamilies, {
    sessionTimestamp: '2026-03-07T12:00:00.000Z',
    sessionId: 'child-2',
    familyId: 'root-1',
    model: 'gpt-5.4',
    serviceTier: 'flex',
    input: 80,
    cacheRead: 800,
    output: 8,
    reasoning: 1,
  }, 'daily', null, null, { serviceTierOverride: 'auto', defaultServiceTier: null });

  const collapsed = collapseCodexFamilyBuckets(byGroupFamilies);
  const buckets = [...collapsed.get('2026-03-07').values()].sort((a, b) => a.serviceTier.localeCompare(b.serviceTier));
  assert.equal(buckets.length, 2);
  assert.equal(buckets[0].serviceTier, 'flex');
  assert.equal(buckets[0].total, 888);
  assert.equal(buckets[1].serviceTier, 'priority');
  assert.equal(buckets[1].total, 1_110);
});
