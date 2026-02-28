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

const extracted = `
${extractFunction('normalizeProviderName')}
${extractFunction('parseProviderSelection')}
module.exports = { normalizeProviderName, parseProviderSelection };
`;

const context = { module: { exports: {} } };
vm.runInNewContext(extracted, context, { filename: SOURCE_PATH });
const { normalizeProviderName, parseProviderSelection } = context.module.exports;

test('normalizeProviderName handles provider aliases', () => {
  assert.equal(normalizeProviderName('openai'), 'codex');
  assert.equal(normalizeProviderName(' OpenAI '), 'codex');
  assert.equal(normalizeProviderName('anthropic'), 'claude');
  assert.equal(normalizeProviderName(' claude '), 'claude');
  assert.equal(normalizeProviderName('codex'), 'codex');
});

test('parseProviderSelection supports aliases in --providers values', () => {
  assert.equal(parseProviderSelection('openai').enableClaude, false);
  assert.equal(parseProviderSelection('openai').enableCodex, true);
  assert.equal(parseProviderSelection('anthropic').enableClaude, true);
  assert.equal(parseProviderSelection('anthropic').enableCodex, false);
  assert.equal(parseProviderSelection('claude,openai').enableClaude, true);
  assert.equal(parseProviderSelection('claude,openai').enableCodex, true);
  assert.equal(parseProviderSelection('invalid').enableClaude, false);
  assert.equal(parseProviderSelection('invalid').enableCodex, false);
});
