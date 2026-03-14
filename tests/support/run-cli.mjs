import { spawn } from 'node:child_process';
import {
  closeSync,
  chmodSync,
  cpSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// These helpers execute bin/cusage.mjs through fixture-scoped homes so the
// packaged CLI contract stays pinned at the published entrypoint.
const SUPPORT_DIR = path.dirname(fileURLToPath(import.meta.url));
const TESTS_DIR = path.resolve(SUPPORT_DIR, '..');
const REPO_ROOT = path.resolve(TESTS_DIR, '..');
const FIXTURE_ROOT = path.join(TESTS_DIR, 'fixtures');

// The manifest is a checked-in scenario index, which keeps every behavior branch
// reproducible from fixture assets alone.
export function readFixtureManifest() {
  return JSON.parse(readFileSync(path.join(FIXTURE_ROOT, 'manifest.json'), 'utf8'));
}

export function readFixtureText(scenario, ...parts) {
  return readFileSync(resolveFixturePath(scenario, ...parts), 'utf8');
}

function resolveFixturePath(scenario, ...parts) {
  return path.join(FIXTURE_ROOT, scenario, ...parts);
}

function copyScenarioTree(scenario) {
  const scratchRoot = mkdtempSync(path.join(tmpdir(), 'cusage-fixture-'));
  const runtimeRoot = path.join(scratchRoot, scenario);
  cpSync(resolveFixturePath(scenario), runtimeRoot, { recursive: true });

  const ccusagePath = path.join(runtimeRoot, 'bin', 'ccusage');
  if (existsSync(ccusagePath)) chmodSync(ccusagePath, 0o755);

  return { scratchRoot, runtimeRoot };
}

// Cached Codex summaries key off copied file paths and stats, so placeholder keys
// hydrate against the scratch tree instead of the source fixture root.
function rewriteCodexCacheFiles(files, runtimeRoot) {
  const rewritten = {};

  for (const [sourcePath, entry] of Object.entries(files || {})) {
    const actualPath = sourcePath.includes('__SCENARIO_ROOT__')
      ? sourcePath.replaceAll('__SCENARIO_ROOT__', runtimeRoot)
      : path.join(runtimeRoot, sourcePath);
    const stats = statSync(actualPath);

    rewritten[actualPath] = {
      ...entry,
      mtimeMs: Math.trunc(stats.mtimeMs),
      size: stats.size,
    };
  }

  return rewritten;
}

// Scenario cache templates seed fast and fallback branches without touching the
// caller cache directory or runtime semantics.
function seedCacheFile(scenarioMeta, runtimeRoot, cachePath) {
  if (!scenarioMeta.cacheTemplate) return;

  const template = JSON.parse(readFileSync(path.join(runtimeRoot, scenarioMeta.cacheTemplate), 'utf8'));
  if (template.codex?.files) {
    template.codex.files = rewriteCodexCacheFiles(template.codex.files, runtimeRoot);
  }

  writeFileSync(cachePath, JSON.stringify(template), 'utf8');
}

function resolveClaudeReportPath(runtimeRoot, scenarioMeta) {
  if (scenarioMeta.claudeReport) {
    return path.join(runtimeRoot, scenarioMeta.claudeReport);
  }
  return path.join(runtimeRoot, 'claude', 'report.json');
}

// runFixtureCli spawns the published CLI with scratch HOME, PATH, and provider
// roots so node:test observes the same contract that users install.
export async function runFixtureCli(args = [], options = {}) {
  const scenario = options.scenario ?? 'baseline';
  const manifest = readFixtureManifest();
  const scenarioMeta = manifest[scenario];
  if (!scenarioMeta) throw new Error(`Unknown fixture scenario: ${scenario}`);

  const { scratchRoot, runtimeRoot } = copyScenarioTree(scenario);
  const cachePath = options.cachePath ?? path.join(scratchRoot, 'cache-v4.json');
  seedCacheFile(scenarioMeta, runtimeRoot, cachePath);

  const fixtureBinDir = path.join(runtimeRoot, 'bin');
  // PATH starts with the fixture-local ccusage stub and the active Node binary,
  // so the harness never resolves a globally installed ccusage.
  const isolatedPath = `${fixtureBinDir}${path.delimiter}${path.dirname(process.execPath)}`;
  const env = {
    ...process.env,
    ...options.env,
    HOME: scratchRoot,
    CLAUDE_HOME: path.join(runtimeRoot, 'claude-home'),
    CODEX_HOME: path.join(runtimeRoot, 'codex-home'),
    CUSAGE_CACHE_PATH: cachePath,
    CCUSAGE_FIXTURE_PATH: resolveClaudeReportPath(runtimeRoot, scenarioMeta),
    PATH: isolatedPath,
  };

  const stdoutPath = path.join(scratchRoot, 'stdout.txt');
  const stderrPath = path.join(scratchRoot, 'stderr.txt');
  const stdoutFd = openSync(stdoutPath, 'w');
  const stderrFd = openSync(stderrPath, 'w');

  // Spawning the entrypoint by path keeps the published CLI boundary under test
  // instead of bypassing bin/cusage.mjs.
  const child = spawn(process.execPath, [path.join(REPO_ROOT, 'bin', 'cusage.mjs'), ...args], {
    cwd: REPO_ROOT,
    env,
    stdio: ['ignore', stdoutFd, stderrFd],
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });

  closeSync(stdoutFd);
  closeSync(stderrFd);

  const stdout = readTextIfPresent(stdoutPath);
  const stderr = readTextIfPresent(stderrPath);

  return {
    scenario,
    runtimeRoot,
    cachePath,
    exitCode,
    stdout,
    stderr,
    cacheJson: readJsonIfPresent(cachePath),
    cleanup() {
      rmSync(scratchRoot, { recursive: true, force: true });
    },
  };
}

function readJsonIfPresent(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readTextIfPresent(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}
