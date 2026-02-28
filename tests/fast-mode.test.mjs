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
${extractFunction('isInteractiveSession')}
${extractFunction('shouldSpawnBackgroundRefresh')}
module.exports = { isInteractiveSession, shouldSpawnBackgroundRefresh };
`;

const context = { module: { exports: {} } };
vm.runInNewContext(extracted, context, { filename: SOURCE_PATH });
const { isInteractiveSession, shouldSpawnBackgroundRefresh } = context.module.exports;

test('spawn gate in source is wired through shouldSpawnBackgroundRefresh()', () => {
  assert.match(
    SOURCE,
    /if\s*\(\s*shouldSpawnBackgroundRefresh\s*\(\s*\{\s*fastMode,\s*freshMode,\s*backgroundRefresh,\s*interactiveSession\s*\}\s*\)\s*\)/m,
  );
});

test('isInteractiveSession only treats stdin+stdout TTY as interactive', () => {
  assert.equal(isInteractiveSession({ stdin: { isTTY: true }, stdout: { isTTY: true } }), true);
  assert.equal(isInteractiveSession({ stdin: { isTTY: true }, stdout: { isTTY: false } }), false);
  assert.equal(isInteractiveSession({ stdin: { isTTY: false }, stdout: { isTTY: true } }), false);
  assert.equal(isInteractiveSession({ stdin: {}, stdout: {} }), false);
});

test('fast background refresh spawn gate matrix', () => {
  const cases = [
    { fastMode: true, freshMode: false, backgroundRefresh: false, interactiveSession: true, expected: true },
    { fastMode: true, freshMode: false, backgroundRefresh: false, interactiveSession: false, expected: false },
    { fastMode: true, freshMode: true, backgroundRefresh: false, interactiveSession: true, expected: false },
    { fastMode: true, freshMode: false, backgroundRefresh: true, interactiveSession: true, expected: false },
    { fastMode: false, freshMode: false, backgroundRefresh: false, interactiveSession: true, expected: false },
  ];

  for (const c of cases) {
    assert.equal(
      shouldSpawnBackgroundRefresh(c),
      c.expected,
      `Unexpected gate result for ${JSON.stringify(c)}`,
    );
  }
});
