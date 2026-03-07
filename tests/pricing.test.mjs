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

function extractConstObject(name) {
  const signature = `const ${name} = {`;
  const start = SOURCE.indexOf(signature);
  assert.notEqual(start, -1, `Expected const ${name} in ${SOURCE_PATH}`);

  const objectStart = SOURCE.indexOf('{', start);
  let depth = 0;
  let objectEnd = objectStart;

  for (let i = objectStart; i < SOURCE.length; i++) {
    const ch = SOURCE[i];
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        objectEnd = i + 1;
        break;
      }
    }
  }

  const semicolon = SOURCE.indexOf(';', objectEnd);
  assert.notEqual(semicolon, -1, `Could not find terminator for const ${name}`);
  return SOURCE.slice(start, semicolon + 1);
}

const extracted = `
${extractConstLine('SERVICE_TIER_SUPPORTED_FROM')}
${extractConstObject('OPENAI_PRICING')}
${extractConstObject('CLAUDE_PRICING')}
${extractConstObject('OPENAI_SERVICE_TIER_MULTIPLIERS')}
${extractConstLine('M')}
${extractFunction('normalizeServiceTier')}
${extractFunction('parseServiceTierSelection')}
${extractFunction('getBaseOpenAIPricing')}
${extractFunction('getModelPricing')}
${extractFunction('computeCost')}
${extractFunction('toISODate')}
${extractFunction('isFallbackServiceTierAvailable')}
${extractFunction('resolveCodexServiceTier')}
module.exports = {
  normalizeServiceTier,
  parseServiceTierSelection,
  getModelPricing,
  computeCost,
  isFallbackServiceTierAvailable,
  resolveCodexServiceTier,
};
`;

const context = { module: { exports: {} } };
vm.runInNewContext(extracted, context, { filename: SOURCE_PATH });

const {
  normalizeServiceTier,
  parseServiceTierSelection,
  getModelPricing,
  computeCost,
  isFallbackServiceTierAvailable,
  resolveCodexServiceTier,
} = context.module.exports;

test('normalizeServiceTier maps fast alias to priority', () => {
  assert.equal(normalizeServiceTier('fast'), 'priority');
  assert.equal(normalizeServiceTier(' priority '), 'priority');
  assert.equal(normalizeServiceTier('flex'), 'flex');
  assert.equal(normalizeServiceTier('standard'), 'standard');
  assert.equal(normalizeServiceTier('invalid'), null);
});

test('parseServiceTierSelection supports auto and explicit tiers', () => {
  assert.equal(parseServiceTierSelection('auto'), 'auto');
  assert.equal(parseServiceTierSelection('fast'), 'priority');
  assert.equal(parseServiceTierSelection('priority'), 'priority');
  assert.equal(parseServiceTierSelection('flex'), 'flex');
  assert.equal(parseServiceTierSelection('bogus'), null);
});

test('getModelPricing returns GPT-5.4 standard rates and variant fallback', () => {
  const exact = getModelPricing('codex', 'gpt-5.4');
  assert.equal(exact.input, 2.5);
  assert.equal(exact.cached, 0.25);
  assert.equal(exact.output, 15);

  const variant = getModelPricing('codex', 'gpt-5.4-codex-latest');
  assert.equal(variant.input, 2.5);
  assert.equal(variant.cached, 0.25);
  assert.equal(variant.output, 15);
});

test('getModelPricing applies Codex service-tier multipliers', () => {
  const priority = getModelPricing('codex', 'gpt-5.4', 'priority');
  assert.equal(priority.input, 5);
  assert.equal(priority.cached, 0.5);
  assert.equal(priority.output, 30);

  const flex = getModelPricing('codex', 'gpt-5.4', 'flex');
  assert.equal(flex.input, 1.25);
  assert.equal(flex.cached, 0.125);
  assert.equal(flex.output, 7.5);
});

test('computeCost uses tier-adjusted Codex pricing', () => {
  const standard = computeCost('codex', 'gpt-5.4', 1_000_000, 1_000_000, 1_000_000, 0);
  const priority = computeCost('codex', 'gpt-5.4', 1_000_000, 1_000_000, 1_000_000, 0, 'priority');
  const flex = computeCost('codex', 'gpt-5.4', 1_000_000, 1_000_000, 1_000_000, 0, 'flex');

  assert.equal(standard, 17.75);
  assert.equal(priority, 35.5);
  assert.equal(flex, 8.875);
});

test('fallback service-tier date gate starts on 2026-03-06', () => {
  assert.equal(isFallbackServiceTierAvailable('2026-03-05T12:00:00.000Z'), false);
  assert.equal(isFallbackServiceTierAvailable('2026-03-06T12:00:00.000Z'), true);
});

test('resolveCodexServiceTier prefers exact tier, then explicit override, then config fallback', () => {
  assert.equal(
    resolveCodexServiceTier(
      { sessionTimestamp: '2026-03-05T12:00:00.000Z', serviceTier: 'fast' },
      { defaultServiceTier: 'flex', serviceTierOverride: 'auto' },
    ),
    'priority',
  );

  assert.equal(
    resolveCodexServiceTier(
      { sessionTimestamp: '2026-03-05T12:00:00.000Z', serviceTier: null },
      { defaultServiceTier: 'fast', serviceTierOverride: 'auto' },
    ),
    'standard',
  );

  assert.equal(
    resolveCodexServiceTier(
      { sessionTimestamp: '2026-03-07T12:00:00.000Z', serviceTier: null },
      { defaultServiceTier: 'fast', serviceTierOverride: 'auto' },
    ),
    'priority',
  );

  assert.equal(
    resolveCodexServiceTier(
      { sessionTimestamp: '2026-03-05T12:00:00.000Z', serviceTier: null },
      { defaultServiceTier: 'fast', serviceTierOverride: 'flex' },
    ),
    'flex',
  );
});
