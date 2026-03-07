#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
const CACHE_VERSION = 4;
const INTERNAL_BACKGROUND_FLAG = '--background-refresh';
const SERVICE_TIER_SUPPORTED_FROM = '2026-03-06';

// ANSI colors
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';
const YELLOW = '\x1b[33m';
const WHITE = '\x1b[37m';
const GRAY = '\x1b[90m';

// ─── OpenAI pricing (per million tokens) ─────────────────
// OpenAI has no cache write cost. Cache read = 10% of input price.
const OPENAI_PRICING = {
  // Nano tier
  'gpt-5-nano':          { input: 0.05,   cached: 0.005,   output: 0.40 },
  // Mini tier
  'gpt-5-mini':          { input: 0.25,   cached: 0.025,   output: 2.0 },
  'gpt-5.1-codex-mini':  { input: 0.25,   cached: 0.025,   output: 2.0 },
  // Standard tier (gpt-5 / gpt-5.1)
  'gpt-5':               { input: 1.25,   cached: 0.125,   output: 10.0 },
  'gpt-5-chat':          { input: 1.25,   cached: 0.125,   output: 10.0 },
  'gpt-5-codex':         { input: 1.25,   cached: 0.125,   output: 10.0 },
  'gpt-5.1':             { input: 1.25,   cached: 0.125,   output: 10.0 },
  'gpt-5.1-chat':        { input: 1.25,   cached: 0.125,   output: 10.0 },
  'gpt-5.1-codex':       { input: 1.25,   cached: 0.125,   output: 10.0 },
  'gpt-5.1-codex-max':   { input: 1.25,   cached: 0.125,   output: 10.0 },
  // Enhanced tier (gpt-5.2 / gpt-5.3)
  'gpt-5.2':             { input: 1.75,   cached: 0.175,   output: 14.0 },
  'gpt-5.2-chat':        { input: 1.75,   cached: 0.175,   output: 14.0 },
  'gpt-5.2-codex':       { input: 1.75,   cached: 0.175,   output: 14.0 },
  'gpt-5.3-codex':       { input: 1.75,   cached: 0.175,   output: 14.0 },
  // GPT-5.4 tier
  'gpt-5.4':             { input: 2.50,   cached: 0.25,    output: 15.0 },
  'gpt-5.4-chat':        { input: 2.50,   cached: 0.25,    output: 15.0 },
  'gpt-5.4-codex':       { input: 2.50,   cached: 0.25,    output: 15.0 },
  // Pro tier (no cache discount)
  'gpt-5-pro':           { input: 15.0,   cached: 15.0,    output: 120.0 },
  'gpt-5.2-pro':         { input: 21.0,   cached: 21.0,    output: 168.0 },
  // Image tier
  'gpt-5-image':         { input: 10.0,   cached: 1.25,    output: 10.0 },
  'gpt-5-image-mini':    { input: 2.50,   cached: 0.25,    output: 2.0 },
};

// Claude pricing estimated from model family (breakdown view only)
const CLAUDE_PRICING = {
  opus:   { input: 15.0,  cached: 1.50,  output: 75.0,  cacheWrite: 18.75 },
  sonnet: { input: 3.0,   cached: 0.30,  output: 15.0,  cacheWrite: 3.75 },
  haiku:  { input: 0.80,  cached: 0.08,  output: 4.0,   cacheWrite: 1.0 },
};

const OPENAI_SERVICE_TIER_MULTIPLIERS = {
  standard: 1,
  priority: 2,
  flex: 0.5,
};

const M = 1_000_000;

function normalizeServiceTier(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'fast') return 'priority';
  if (normalized === 'standard' || normalized === 'priority' || normalized === 'flex') return normalized;
  return null;
}

function parseServiceTierSelection(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'auto') return 'auto';
  return normalizeServiceTier(normalized);
}

function getBaseOpenAIPricing(modelName) {
  const p = OPENAI_PRICING[modelName];
  if (p) return p;

  // Pattern fallback for unknown gpt-5 variants
  const n = modelName.toLowerCase();
  if (n.includes('nano')) return OPENAI_PRICING['gpt-5-nano'];
  if (n.includes('mini')) return OPENAI_PRICING['gpt-5-mini'];
  if (n.includes('pro') && n.includes('5.2')) return OPENAI_PRICING['gpt-5.2-pro'];
  if (n.includes('pro')) return OPENAI_PRICING['gpt-5-pro'];
  if (n.includes('5.4')) return OPENAI_PRICING['gpt-5.4'];
  if (n.includes('5.2') || n.includes('5.3')) return OPENAI_PRICING['gpt-5.2'];
  return OPENAI_PRICING['gpt-5'];
}

function getModelPricing(provider, modelName, serviceTier = 'standard') {
  if (provider === 'codex') {
    const p = getBaseOpenAIPricing(modelName);
    const tier = normalizeServiceTier(serviceTier) || 'standard';
    const multiplier = OPENAI_SERVICE_TIER_MULTIPLIERS[tier] ?? 1;
    return {
      input: p.input * multiplier,
      cached: p.cached * multiplier,
      output: p.output * multiplier,
      cacheWrite: 0,
    };
  }
  const n = modelName.toLowerCase();
  if (n.includes('opus'))   return CLAUDE_PRICING.opus;
  if (n.includes('sonnet')) return CLAUDE_PRICING.sonnet;
  if (n.includes('haiku'))  return CLAUDE_PRICING.haiku;
  return CLAUDE_PRICING.sonnet;
}

function computeCost(provider, modelName, input, cached, output, cacheWrite, serviceTier = 'standard') {
  const p = getModelPricing(provider, modelName, serviceTier);
  return (input * p.input + cached * p.cached + output * p.output + (cacheWrite || 0) * p.cacheWrite) / M;
}

// ─── Formatting helpers ───────────────────────────────────

function fmt(n) {
  if (n == null || n === 0) return GRAY + '-' + RESET;
  return n.toLocaleString('en-US');
}

function fmtCost(n) {
  if (n == null || n === 0) return GRAY + '-' + RESET;
  if (n < 0.01) return '$' + n.toFixed(4);
  return '$' + n.toFixed(2);
}

function fmtRate(n) {
  if (n == null || n === 0) return GRAY + '-' + RESET;
  const decimals = (n.toString().split('.')[1] || '').length;
  return '$' + n.toFixed(Math.min(4, Math.max(2, decimals)));
}

function shortModel(name) {
  return name.replace(/^claude-/, '').replace(/-20\d{6,}$/, '');
}

function padR(str, len) {
  const vis = stripAnsi(str);
  return str + ' '.repeat(Math.max(0, len - vis.length));
}

function padL(str, len) {
  const vis = stripAnsi(str);
  return ' '.repeat(Math.max(0, len - vis.length)) + str;
}

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

// ─── Box-drawing and table helpers ───────────────────────

const TL = '\u250c', TR = '\u2510', BL = '\u2514', BR = '\u2518';
const HZ = '\u2500', VT = '\u2502', TT = '\u252c', TB = '\u2534', CR_ = '\u253c', LT = '\u251c', RT = '\u2524';
const titleMap = { daily: 'Daily', monthly: 'Monthly' };

function makeHLine(widths) {
  return (left, mid, right) =>
    GRAY + left + widths.map(w => HZ.repeat(w + 2)).join(mid) + right + RESET;
}

function makeRow(widths, leftAligned) {
  return (...cells) =>
    cells.map((c, i) => {
      const pad = leftAligned.has(i) ? padR : padL;
      return GRAY + VT + RESET + ' ' + pad(c, widths[i]) + ' ';
    }).join('') + GRAY + VT + RESET;
}

function renderTitleBox(title, widths) {
  const tableW = widths.reduce((s, w) => s + w + 3, 0) - 2;
  const boxW = Math.max(tableW, title.length + 4);
  const pad = Math.floor((boxW - title.length - 2) / 2);
  console.log('');
  console.log(CYAN + ' \u256d' + '\u2500'.repeat(boxW) + '\u256e' + RESET);
  console.log(CYAN + ' \u2502' + ' '.repeat(pad) + BOLD + title + RESET + CYAN + ' '.repeat(boxW - pad - title.length) + '\u2502' + RESET);
  console.log(CYAN + ' \u2570' + '\u2500'.repeat(boxW) + '\u256f' + RESET);
  console.log('');
}

function renderLegend(extra) {
  console.log('');
  console.log('  ' + CYAN + '\u25cf' + RESET + ' Claude   ' + MAGENTA + '\u25cf' + RESET + ' OpenAI Codex');
  if (extra) console.log('  ' + extra);
  console.log('');
}

// ─── Date helpers ─────────────────────────────────────────

function toISODate(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toMonthKey(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function parseFilterDate(s) {
  if (!s) return null;
  const clean = s.replace(/-/g, '');
  if (clean.length !== 8) return null;
  return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
}

function normalizeProviderName(name) {
  const normalized = String(name || '').trim().toLowerCase();
  if (normalized === 'openai') return 'codex';
  if (normalized === 'anthropic') return 'claude';
  return normalized;
}

function parseProviderSelection(value) {
  const requested = new Set(
    String(value || '')
      .split(',')
      .map((s) => normalizeProviderName(s))
      .filter(Boolean),
  );
  return {
    enableClaude: requested.has('claude'),
    enableCodex: requested.has('codex'),
  };
}

function isFallbackServiceTierAvailable(sessionTimestamp) {
  const dateKey = toISODate(sessionTimestamp);
  return Boolean(dateKey && dateKey >= SERVICE_TIER_SUPPORTED_FROM);
}

function readCodexConfigServiceTier() {
  const codexHome = process.env.CODEX_HOME?.trim() || join(homedir(), '.codex');
  const configPath = join(codexHome, 'config.toml');

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const match = raw.match(/^\s*service_tier\s*=\s*"([^"]+)"/m);
    return normalizeServiceTier(match?.[1]);
  } catch {
    return null;
  }
}

function extractCodexServiceTier(obj) {
  const payload = obj?.payload;
  const candidates = [
    obj?.service_tier,
    obj?.serviceTier,
    payload?.service_tier,
    payload?.serviceTier,
    payload?.info?.service_tier,
    payload?.info?.serviceTier,
    payload?.info?.metadata?.service_tier,
    payload?.info?.metadata?.serviceTier,
    payload?.metadata?.service_tier,
    payload?.metadata?.serviceTier,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeServiceTier(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function resolveCodexServiceTier(summary, options = {}) {
  const exact = normalizeServiceTier(summary?.serviceTier);
  if (exact) return exact;

  const override = options.serviceTierOverride && options.serviceTierOverride !== 'auto'
    ? normalizeServiceTier(options.serviceTierOverride)
    : null;
  if (override) return override;

  if (!isFallbackServiceTierAvailable(summary?.sessionTimestamp)) return 'standard';

  return normalizeServiceTier(options.defaultServiceTier) || 'standard';
}

function formatCodexModelLabel(modelName, serviceTier) {
  return serviceTier && serviceTier !== 'standard'
    ? `${modelName} (${serviceTier})`
    : modelName;
}

function isInteractiveSession(io = process) {
  return Boolean(io?.stdin?.isTTY && io?.stdout?.isTTY);
}

function shouldSpawnBackgroundRefresh({
  fastMode,
  freshMode,
  backgroundRefresh,
  interactiveSession,
}) {
  return fastMode && !freshMode && !backgroundRefresh && interactiveSession;
}

function resolveCachePath() {
  const custom = process.env.CUSAGE_CACHE_PATH?.trim();
  if (custom) return custom;
  return join(homedir(), '.cache', 'cusage', `cache-v${CACHE_VERSION}.json`);
}

function createEmptyCache() {
  return {
    version: CACHE_VERSION,
    claude: { commands: {} },
    codex: { files: {} },
  };
}

function normalizeCache(raw) {
  if (!raw || typeof raw !== 'object') return createEmptyCache();
  const cache = raw;
  if (cache.version !== CACHE_VERSION) return createEmptyCache();
  if (!cache.claude || typeof cache.claude !== 'object') cache.claude = { commands: {} };
  if (!cache.codex || typeof cache.codex !== 'object') cache.codex = { files: {} };
  if (!cache.claude.commands || typeof cache.claude.commands !== 'object') cache.claude.commands = {};
  if (!cache.codex.files || typeof cache.codex.files !== 'object') cache.codex.files = {};
  return cache;
}

function loadCache(cachePath) {
  try {
    const raw = JSON.parse(readFileSync(cachePath, 'utf-8'));
    return normalizeCache(raw);
  } catch {
    return createEmptyCache();
  }
}

function saveCache(cachePath, cache) {
  try {
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, JSON.stringify(cache), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

const MASK64 = 0xffffffffffffffffn;
const FNV_PRIME = 1099511628211n;
function fnvMix(hash, value) {
  return ((hash ^ (BigInt(value) & MASK64)) * FNV_PRIME) & MASK64;
}

function computeJsonlFingerprint(dir) {
  const files = findJsonlFiles(dir).sort();
  let hash = 1469598103934665603n;
  let totalSize = 0n;
  let newestMtime = 0;
  let seen = 0;

  for (const file of files) {
    let st;
    try { st = statSync(file); } catch { continue; }
    seen++;
    const size = BigInt(st.size);
    const mtime = Math.trunc(st.mtimeMs);
    totalSize += size;
    if (mtime > newestMtime) newestMtime = mtime;

    for (let i = 0; i < file.length; i++) hash = fnvMix(hash, file.charCodeAt(i));
    hash = fnvMix(hash, size);
    hash = fnvMix(hash, mtime);
  }

  return `${seen}:${totalSize.toString()}:${newestMtime}:${hash.toString(16)}`;
}

// ─── Direct Codex JSONL reader (fixes upstream double-counting) ─

function findJsonlFiles(dir) {
  const results = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) results.push(...findJsonlFiles(full));
      else if (e.name.endsWith('.jsonl')) results.push(full);
    }
  } catch { /* dir doesn't exist */ }
  return results;
}

function createCodexState() {
  return {
    sessionTimestamp: null,
    sessionId: null,
    familyId: null,
    model: null,
    serviceTier: null,
    lastTotal: null,
  };
}

function applyCodexObjectToState(obj, state) {
  if (!obj || typeof obj !== 'object') return;

  if (obj.type === 'session_meta') {
    if (obj.payload?.timestamp) state.sessionTimestamp = obj.payload.timestamp;
    if (obj.payload?.id) state.sessionId = obj.payload.id;
    if (obj.payload?.forked_from_id) state.familyId = obj.payload.forked_from_id;
  }
  if (obj.type === 'turn_context' && obj.payload?.model) state.model = obj.payload.model;

  if (obj.type === 'event_msg' && obj.payload?.type === 'token_count') {
    const info = obj.payload?.info;
    if (info?.model) state.model = info.model;
    if (info?.metadata?.model) state.model = info.metadata.model;
    if (info?.total_token_usage) state.lastTotal = info.total_token_usage;
  }

  const serviceTier = extractCodexServiceTier(obj);
  if (serviceTier) state.serviceTier = serviceTier;

  if (!state.sessionTimestamp && obj.timestamp) state.sessionTimestamp = obj.timestamp;
}

function applyJsonlTextToState(text, state, dropFirstLine = false) {
  const lines = text.split(/\r?\n/);
  const start = dropFirstLine ? 1 : 0;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    applyCodexObjectToState(obj, state);
  }
}

function summarizeCodexState(state) {
  const lastTotal = state.lastTotal;
  if (!lastTotal || !state.sessionTimestamp) return null;

  const model = state.model || 'codex-unknown';
  const inputTotal = lastTotal.input_tokens || 0;
  const cached = lastTotal.cached_input_tokens || lastTotal.cache_read_input_tokens || 0;
  const nonCachedInput = Math.max(inputTotal - cached, 0);
  const output = lastTotal.output_tokens || 0;
  const reasoning = lastTotal.reasoning_output_tokens || 0;
  const total = lastTotal.total_tokens || (inputTotal + output);

  return {
    sessionTimestamp: state.sessionTimestamp,
    sessionId: state.sessionId,
    familyId: state.familyId || state.sessionId,
    model,
    serviceTier: state.serviceTier,
    input: nonCachedInput,
    cacheRead: cached,
    output,
    reasoning,
    total,
  };
}

function parseCodexSummaryFull(file) {
  let content;
  try { content = readFileSync(file, 'utf-8'); } catch { return null; }
  const state = createCodexState();
  applyJsonlTextToState(content, state, false);
  return summarizeCodexState(state);
}

function readTextRange(file, start, length) {
  let fd;
  try {
    fd = openSync(file, 'r');
    const buf = Buffer.alloc(length);
    const bytes = readSync(fd, buf, 0, length, start);
    return buf.subarray(0, bytes).toString('utf-8');
  } catch {
    return '';
  } finally {
    if (fd != null) {
      try { closeSync(fd); } catch { /* noop */ }
    }
  }
}

function parseCodexSummaryFast(file, size) {
  if (size <= 0) return null;
  const headLen = Math.min(size, 128 * 1024);
  const tailLen = Math.min(size, 256 * 1024);
  const tailStart = Math.max(0, size - tailLen);

  const state = createCodexState();
  const headText = readTextRange(file, 0, headLen);
  if (headText) applyJsonlTextToState(headText, state, false);

  const tailText = readTextRange(file, tailStart, tailLen);
  if (tailText) applyJsonlTextToState(tailText, state, tailStart > 0);

  return summarizeCodexState(state);
}

function inDateRange(groupMode, dateKey, sinceDate, untilDate) {
  if (groupMode === 'monthly') {
    const sinceMonth = sinceDate ? sinceDate.slice(0, 7) : null;
    const untilMonth = untilDate ? untilDate.slice(0, 7) : null;
    if (sinceMonth && dateKey < sinceMonth) return false;
    if (untilMonth && dateKey > untilMonth) return false;
    return true;
  }
  if (sinceDate && dateKey < sinceDate) return false;
  if (untilDate && dateKey > untilDate) return false;
  return true;
}

function getCodexFamilyId(summary, fallbackId = 'codex-unknown-family') {
  return summary.familyId || summary.sessionId || fallbackId;
}

function updateCodexFamilyBucket(bucket, summary) {
  bucket.input = Math.max(bucket.input, summary.input);
  bucket.cacheRead = Math.max(bucket.cacheRead, summary.cacheRead);
  bucket.output = Math.max(bucket.output, summary.output);
  bucket.reasoning = Math.max(bucket.reasoning, summary.reasoning);
  bucket.total = bucket.input + bucket.cacheRead + bucket.output;
}

function collapseCodexFamilyBuckets(byGroupFamilies) {
  const byGroup = new Map();

  for (const [dateKey, families] of byGroupFamilies) {
    const models = new Map();

    for (const family of families.values()) {
      const modelKey = `${family.model}\x1f${family.serviceTier}`;
      if (!models.has(modelKey)) {
        models.set(modelKey, {
          model: family.model,
          serviceTier: family.serviceTier,
          input: 0,
          cacheWrite: 0,
          cacheRead: 0,
          output: 0,
          reasoning: 0,
          total: 0,
        });
      }

      const modelBucket = models.get(modelKey);
      modelBucket.input += family.input;
      modelBucket.cacheRead += family.cacheRead;
      modelBucket.output += family.output;
      modelBucket.reasoning += family.reasoning;
      modelBucket.total += family.total;
    }

    byGroup.set(dateKey, models);
  }

  return byGroup;
}

function pushCodexSummary(byGroup, summary, groupMode, sinceDate, untilDate, options = {}) {
  const dateKey = groupMode === 'monthly' ? toMonthKey(summary.sessionTimestamp) : toISODate(summary.sessionTimestamp);
  if (!dateKey) return;
  if (!inDateRange(groupMode, dateKey, sinceDate, untilDate)) return;

  const serviceTier = resolveCodexServiceTier(summary, options);
  const familyId = getCodexFamilyId(summary, options.familyFallbackId);
  const familyKey = `${familyId}\x1f${summary.model}\x1f${serviceTier}`;

  if (!byGroup.has(dateKey)) byGroup.set(dateKey, new Map());
  const families = byGroup.get(dateKey);
  if (!families.has(familyKey)) {
    families.set(familyKey, {
      familyId,
      model: summary.model,
      serviceTier,
      input: summary.input,
      cacheWrite: 0,
      cacheRead: summary.cacheRead,
      output: summary.output,
      reasoning: summary.reasoning,
      total: summary.input + summary.cacheRead + summary.output,
    });
    return;
  }

  updateCodexFamilyBucket(families.get(familyKey), summary);
}

function loadCodexDirect(sinceDate, untilDate, groupMode, options = {}) {
  const codexHome = process.env.CODEX_HOME?.trim() || join(homedir(), '.codex');
  const sessionsDir = join(codexHome, 'sessions');
  const files = findJsonlFiles(sessionsDir);
  const byGroupFamilies = new Map();

  const cacheFiles = options.cache?.codex?.files ?? {};
  const fresh = options.fresh === true;
  const fast = options.fast === true;
  const seen = new Set();

  for (const file of files) {
    seen.add(file);
    let st;
    try { st = statSync(file); } catch { continue; }

    const mtimeMs = Math.trunc(st.mtimeMs);
    const size = st.size;
    const cached = cacheFiles[file];

    let summary = null;
    if (!fresh && cached && cached.mtimeMs === mtimeMs && cached.size === size) {
      summary = cached.summary ?? null;
    } else {
      summary = parseCodexSummaryFast(file, size);
      if (!summary) summary = parseCodexSummaryFull(file);
      if (!summary && fast && !fresh && cached?.summary) summary = cached.summary;
      if (summary) {
        cacheFiles[file] = { mtimeMs, size, summary };
        options.cacheDirty = true;
      }
    }

    if (!summary) continue;
    pushCodexSummary(byGroupFamilies, summary, groupMode, sinceDate, untilDate, {
      ...options,
      familyFallbackId: file,
    });
  }

  for (const file of Object.keys(cacheFiles)) {
    if (!seen.has(file)) {
      delete cacheFiles[file];
      options.cacheDirty = true;
    }
  }

  return collapseCodexFamilyBuckets(byGroupFamilies);
}

// ─── Claude data via ccusage --json ───────────────────────

async function runToolAsync(command, args) {
  return await new Promise((resolve) => {
    let finished = false;
    const tmpFile = join(
      process.env.TMPDIR || '/tmp',
      `cusage-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
    );
    let outFd;
    try {
      outFd = openSync(tmpFile, 'w');
    } catch {
      resolve(null);
      return;
    }

    const child = spawn(command, args, {
      stdio: ['ignore', outFd, 'ignore'],
    });

    const done = (value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      try { closeSync(outFd); } catch { /* noop */ }
      try { unlinkSync(tmpFile); } catch { /* noop */ }
      resolve(value);
    };

    const timeout = setTimeout(() => {
      if (finished) return;
      child.kill('SIGTERM');
    }, 60000);

    child.on('error', () => {
      done(null);
    });

    child.on('close', (code) => {
      if (code !== 0) return done(null);
      try {
        const raw = readFileSync(tmpFile, 'utf-8');
        done(JSON.parse(raw));
      } catch {
        done(null);
      }
    });
  });
}

function buildClaudeCacheKey(subcommand, claudeArgs) {
  return `${subcommand}::${claudeArgs.join('\x1f')}`;
}

async function loadClaudeData(subcommand, claudeArgs, options) {
  const claudeHome = process.env.CLAUDE_HOME?.trim() || join(homedir(), '.claude');
  const projectsDir = join(claudeHome, 'projects');
  const key = buildClaudeCacheKey(subcommand, claudeArgs);
  const commands = options.cache.claude.commands;
  const cached = commands[key];

  if (options.fast && !options.fresh && cached?.data) {
    return { data: cached.data, source: 'cache-stale' };
  }
  if (options.fast && !options.fresh && !cached?.data) {
    return { data: null, source: 'cache-miss' };
  }

  const fingerprint = computeJsonlFingerprint(projectsDir);

  if (!options.fresh && cached?.data && cached.fingerprint === fingerprint) {
    return { data: cached.data, source: 'cache' };
  }

  const live = await runToolAsync('ccusage', [subcommand, '--json', ...claudeArgs]);

  if (live) {
    commands[key] = {
      fingerprint,
      updatedAt: new Date().toISOString(),
      data: live,
    };
    options.cacheDirty = true;
    return { data: live, source: 'live' };
  }

  if (cached?.data) return { data: cached.data, source: 'cache-fallback' };
  return { data: null, source: 'none' };
}

// ─── Main ─────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
${BOLD}cusage${RESET} — Unified AI usage report: Claude Code + OpenAI Codex in one table

${BOLD}USAGE:${RESET}
  cusage [daily|monthly|refresh] [OPTIONS]

${BOLD}COMMANDS:${RESET}
  daily     Show merged report grouped by date (default)
  monthly   Show merged report grouped by month
  refresh   Rebuild caches, then print daily report

${BOLD}OPTIONS:${RESET}
  -s, --since <YYYYMMDD>   Filter from date
  -u, --until <YYYYMMDD>   Filter until date
  -b, --breakdown          Show per-category cost breakdown with rates
  --fast                   Prefer cached data for instant startup
  --fresh                  Force refresh from source logs
  --service-tier <mode>    Codex pricing tier: auto, standard, priority, flex, fast
  --providers <list>       Comma list: claude,codex (aliases: anthropic,openai)
  --claude                 Claude only
  --anthropic              Alias for --claude
  --openai                 OpenAI Codex only
  --codex                  Alias for --openai
  --no-claude              Disable Claude provider
  --no-codex               Disable Codex provider
  -h, --help               Show this help

${BOLD}COLUMNS:${RESET}
  Input       Non-cached input tokens (billable at full input rate)
  Output      Output tokens (includes reasoning for Codex)
  Cache Wr    Cache creation/write tokens (Claude only, billed 25% above input)
  Cache Rd    Cache read tokens (billed at ~10% of input rate)
  Total       Sum of all token types
  Cost        Estimated cost in USD
`);
  process.exit(0);
}

// Parse args
let subcommand = 'daily';
let refreshCommand = false;
const subcommands = ['daily', 'monthly', 'refresh'];
const passArgs = [...args];
if (subcommands.includes(passArgs[0])) subcommand = passArgs.shift();
if (subcommand === 'refresh') {
  refreshCommand = true;
  subcommand = 'daily';
}

let sinceDate = null, untilDate = null, showBreakdown = false;
let fastMode = false, freshMode = false, backgroundRefresh = false;
let enableClaude = true, enableCodex = true;
let serviceTierMode = 'auto';
const claudePassArgs = [];
for (let i = 0; i < passArgs.length; i++) {
  const a = passArgs[i];
  if ((a === '-s' || a === '--since') && passArgs[i + 1]) {
    sinceDate = parseFilterDate(passArgs[i + 1]);
    claudePassArgs.push(a, passArgs[i + 1]);
    i++;
  } else if ((a === '-u' || a === '--until') && passArgs[i + 1]) {
    untilDate = parseFilterDate(passArgs[i + 1]);
    claudePassArgs.push(a, passArgs[i + 1]);
    i++;
  } else if (a === '-b' || a === '--breakdown') {
    showBreakdown = true;
  } else if (a === '--fast') {
    fastMode = true;
  } else if (a === '--fresh') {
    freshMode = true;
  } else if (a === '--service-tier' && passArgs[i + 1]) {
    const selection = parseServiceTierSelection(passArgs[i + 1]);
    if (!selection) {
      console.error(`Invalid service tier: ${passArgs[i + 1]}. Use auto, standard, priority, flex, or fast.`);
      process.exit(1);
    }
    serviceTierMode = selection;
    i++;
  } else if (a === '--service-tier') {
    console.error('Missing value for --service-tier. Use auto, standard, priority, flex, or fast.');
    process.exit(1);
  } else if (a === INTERNAL_BACKGROUND_FLAG) {
    backgroundRefresh = true;
  } else if (a === '--providers' && passArgs[i + 1]) {
    ({ enableClaude, enableCodex } = parseProviderSelection(passArgs[i + 1]));
    i++;
  } else if (a === '--claude' || a === '--anthropic') {
    enableClaude = true;
    enableCodex = false;
  } else if (a === '--openai' || a === '--codex') {
    enableClaude = false;
    enableCodex = true;
  } else if (a === '--no-claude') {
    enableClaude = false;
  } else if (a === '--no-codex') {
    enableCodex = false;
  } else {
    claudePassArgs.push(a);
  }
}

if (refreshCommand) freshMode = true;
if (freshMode) fastMode = false;
if (!enableClaude && !enableCodex) {
  console.error('No providers enabled. Use --providers claude,codex (or aliases anthropic,openai) or adjust provider flags.');
  process.exit(1);
}

const hasOfflineOverride = claudePassArgs.includes('-O')
  || claudePassArgs.includes('--offline')
  || claudePassArgs.includes('--no-offline');
if (enableClaude && !hasOfflineOverride) claudePassArgs.push('--offline');
const groupKey = subcommand === 'monthly' ? 'monthly' : 'daily';

if (fastMode && !backgroundRefresh) process.stderr.write(`${DIM}Loading data from cache-first mode...${RESET}\n`);
else process.stderr.write(`${DIM}Loading data...${RESET}\n`);

const interactiveSession = isInteractiveSession();

if (shouldSpawnBackgroundRefresh({ fastMode, freshMode, backgroundRefresh, interactiveSession })) {
  const bgArgs = args.filter((a) => a !== '--fast' && a !== INTERNAL_BACKGROUND_FLAG);
  if (!bgArgs.includes('--fresh')) bgArgs.push('--fresh');
  bgArgs.push(INTERNAL_BACKGROUND_FLAG);
  try {
    const child = spawn(process.argv[0], [process.argv[1], ...bgArgs], { detached: true, stdio: 'ignore' });
    child.unref();
  } catch {
    // Background refresh is best-effort only.
  }
}

const cachePath = resolveCachePath();
const cache = loadCache(cachePath);
const loaderState = {
  cache,
  cacheDirty: false,
  fresh: freshMode,
  fast: fastMode,
  serviceTierOverride: serviceTierMode,
  defaultServiceTier: enableCodex && serviceTierMode === 'auto' ? readCodexConfigServiceTier() : null,
};

const claudePromise = enableClaude
  ? loadClaudeData(subcommand, claudePassArgs, loaderState)
  : Promise.resolve({ data: null, source: 'disabled' });

const codexByGroup = enableCodex
  ? loadCodexDirect(sinceDate, untilDate, subcommand === 'monthly' ? 'monthly' : 'daily', loaderState)
  : new Map();

const { data: claudeData, source: claudeSource } = await claudePromise;

if (loaderState.cacheDirty) saveCache(cachePath, cache);
if (claudeSource === 'cache-stale') process.stderr.write(`${DIM}Using stale Claude cache (--fast).${RESET}\n`);
if (claudeSource === 'cache-fallback') process.stderr.write(`${DIM}Claude refresh failed; using cached data.${RESET}\n`);
if (claudeSource === 'cache-miss') process.stderr.write(`${DIM}No Claude cache yet (run with --fresh once).${RESET}\n`);

if (!claudeData && codexByGroup.size === 0) {
  console.error('No data from either source.');
  process.exit(1);
}

// ─── Merge by date ────────────────────────────────────────

const merged = new Map();

if (claudeData?.[groupKey]) {
  for (const entry of claudeData[groupKey]) {
    const date = entry.date || entry.month;
    if (!date) continue;
    if (!merged.has(date)) merged.set(date, { models: [], dayTotal: 0 });
    const bucket = merged.get(date);
    bucket.dayTotal += entry.totalCost || 0;

    if (entry.modelBreakdowns) {
      for (const m of entry.modelBreakdowns) {
        const input = m.inputTokens || 0;
        const output = m.outputTokens || 0;
        const cacheWrite = m.cacheCreationTokens || 0;
        const cacheRead = m.cacheReadTokens || 0;
        bucket.models.push({
          provider: 'claude',
          model: shortModel(m.modelName),
          input, output, cacheWrite, cacheRead,
          total: input + output + cacheWrite + cacheRead,
          cost: m.cost || 0,
        });
      }
    } else {
      bucket.models.push({
        provider: 'claude',
        model: entry.modelsUsed?.map(shortModel).join(', ') || 'claude',
        input: entry.inputTokens || 0,
        output: entry.outputTokens || 0,
        cacheWrite: entry.cacheCreationTokens || 0,
        cacheRead: entry.cacheReadTokens || 0,
        total: entry.totalTokens || 0,
        cost: entry.totalCost || 0,
      });
    }
  }
}

for (const [dateKey, models] of codexByGroup) {
  if (!merged.has(dateKey)) merged.set(dateKey, { models: [], dayTotal: 0 });
  const bucket = merged.get(dateKey);

  for (const [, m] of models) {
    const cost = computeCost('codex', m.model, m.input, m.cacheRead, m.output, 0, m.serviceTier);
    bucket.dayTotal += cost;
    bucket.models.push({
      provider: 'codex',
      model: formatCodexModelLabel(m.model, m.serviceTier),
      baseModel: m.model,
      serviceTier: m.serviceTier,
      input: m.input,
      output: m.output,
      cacheWrite: 0,
      cacheRead: m.cacheRead,
      total: m.total,
      cost,
    });
  }
}

const sortedDates = [...merged.keys()].sort();
if (sortedDates.length === 0) {
  console.log('No usage data found.');
  process.exit(0);
}

// ─── Render cost breakdown ────────────────────────────────

if (showBreakdown) {
  const cbW = [12, 20, 13, 16, 10, 12];
  const hLineB = makeHLine(cbW);
  const rowB = makeRow(cbW, new Set([0, 1, 2]));

  renderTitleBox(`Cost Breakdown - ${titleMap[subcommand]}`, cbW);

  console.log(hLineB(TL, TT, TR));
  console.log(rowB(
    CYAN + BOLD + 'Date' + RESET,
    CYAN + BOLD + 'Model' + RESET,
    CYAN + BOLD + 'Category' + RESET,
    CYAN + BOLD + 'Tokens' + RESET,
    CYAN + BOLD + '$/MTok' + RESET,
    CYAN + BOLD + 'Cost' + RESET
  ));
  console.log(hLineB(LT, CR_, RT));

  let gCostB = 0;

  for (let di = 0; di < sortedDates.length; di++) {
    const date = sortedDates[di];
    const bucket = merged.get(date);
    let dCostB = 0;
    let firstModel = true;

    for (let mi = 0; mi < bucket.models.length; mi++) {
      const m = bucket.models[mi];
      const pricing = getModelPricing(m.provider, m.baseModel || m.model, m.serviceTier);
      const marker = m.provider === 'claude' ? CYAN + '\u25cf' + RESET : MAGENTA + '\u25cf' + RESET;

      const cats = [];
      if (m.input > 0)      cats.push({ name: 'Input',      tokens: m.input,      rate: pricing.input,      cost: m.input * pricing.input / M });
      if (m.output > 0)     cats.push({ name: 'Output',     tokens: m.output,     rate: pricing.output,     cost: m.output * pricing.output / M });
      if (m.cacheWrite > 0) cats.push({ name: 'Cache Write', tokens: m.cacheWrite, rate: pricing.cacheWrite, cost: m.cacheWrite * pricing.cacheWrite / M });
      if (m.cacheRead > 0)  cats.push({ name: 'Cache Read',  tokens: m.cacheRead,  rate: pricing.cached,     cost: m.cacheRead * pricing.cached / M });

      if (cats.length === 0) continue;

      let modelTotal = cats.reduce((s, c) => s + c.cost, 0);

      // Claude category pricing varies in practice; align category totals to ccusage's model cost
      // so breakdown subtotals remain consistent with the standard report.
      if (m.provider === 'claude' && Number.isFinite(m.cost) && m.cost > 0 && modelTotal > 0) {
        const scale = m.cost / modelTotal;
        for (const c of cats) {
          c.cost *= scale;
          c.rate = c.tokens > 0 ? (c.cost * M) / c.tokens : c.rate;
        }
        modelTotal = m.cost;
      }

      dCostB += modelTotal;

      for (let ci = 0; ci < cats.length; ci++) {
        const c = cats[ci];
        const dateStr = (firstModel && ci === 0) ? (BOLD + date + RESET) : '';
        const modelStr = ci === 0 ? (marker + ' ' + m.model) : '';
        console.log(rowB(dateStr, modelStr, c.name, fmt(c.tokens), fmtRate(c.rate), fmtCost(c.cost)));
      }

      console.log(rowB('', '', DIM + 'Subtotal' + RESET, '', '', BOLD + fmtCost(modelTotal) + RESET));
      firstModel = false;
    }

    gCostB += dCostB;
    console.log(rowB('', DIM + 'Day Total' + RESET, '', '', '', BOLD + YELLOW + fmtCost(dCostB) + RESET));

    if (di < sortedDates.length - 1) console.log(hLineB(LT, CR_, RT));
  }

  console.log(hLineB(LT, CR_, RT));
  console.log(rowB(BOLD + WHITE + 'Total' + RESET, '', '', '', '', BOLD + YELLOW + fmtCost(gCostB) + RESET));
  console.log(hLineB(BL, TB, BR));

  renderLegend('Rates: Claude effective (scaled to ccusage model totals) | Codex per openai.com');
  process.exit(0);
}

// ─── Render standard table ───────────────────────────────

const colW = [12, 20, 14, 12, 12, 16, 16, 12];
const hLine = makeHLine(colW);
const row = makeRow(colW, new Set([0, 1]));

renderTitleBox(`Unified Token Usage Report - ${titleMap[subcommand]}`, colW);

console.log(hLine(TL, TT, TR));
console.log(row(
  CYAN + BOLD + 'Date' + RESET,
  CYAN + BOLD + 'Model' + RESET,
  CYAN + BOLD + 'Input' + RESET,
  CYAN + BOLD + 'Output' + RESET,
  CYAN + BOLD + 'Cache Wr' + RESET,
  CYAN + BOLD + 'Cache Rd' + RESET,
  CYAN + BOLD + 'Total' + RESET,
  CYAN + BOLD + 'Cost' + RESET
));
console.log(hLine(LT, CR_, RT));

let gInput = 0, gOutput = 0, gCW = 0, gCR = 0, gTotal = 0, gCost = 0;

for (let di = 0; di < sortedDates.length; di++) {
  const date = sortedDates[di];
  const bucket = merged.get(date);
  let dInput = 0, dOutput = 0, dCW = 0, dCR = 0, dTotal = 0;

  for (let mi = 0; mi < bucket.models.length; mi++) {
    const m = bucket.models[mi];
    const marker = m.provider === 'claude' ? CYAN + '\u25cf' + RESET : MAGENTA + '\u25cf' + RESET;
    const modelStr = marker + ' ' + m.model;
    const dateStr = mi === 0 ? (BOLD + date + RESET) : '';

    dInput += m.input;
    dOutput += m.output;
    dCW += m.cacheWrite;
    dCR += m.cacheRead;
    dTotal += m.total;

    console.log(row(
      dateStr, modelStr,
      fmt(m.input), fmt(m.output), fmt(m.cacheWrite), fmt(m.cacheRead),
      fmt(m.total), fmtCost(m.cost)
    ));
  }

  gInput += dInput; gOutput += dOutput; gCW += dCW; gCR += dCR; gTotal += dTotal;
  gCost += bucket.dayTotal;

  console.log(row(
    '', DIM + 'Day Total' + RESET,
    DIM + fmt(dInput) + RESET, DIM + fmt(dOutput) + RESET,
    DIM + fmt(dCW) + RESET, DIM + fmt(dCR) + RESET,
    DIM + fmt(dTotal) + RESET,
    BOLD + YELLOW + fmtCost(bucket.dayTotal) + RESET
  ));

  if (di < sortedDates.length - 1) console.log(hLine(LT, CR_, RT));
}

console.log(hLine(LT, CR_, RT));
console.log(row(
  BOLD + WHITE + 'Total' + RESET, '',
  BOLD + fmt(gInput) + RESET, BOLD + fmt(gOutput) + RESET,
  BOLD + fmt(gCW) + RESET, BOLD + fmt(gCR) + RESET,
  BOLD + fmt(gTotal) + RESET,
  BOLD + YELLOW + fmtCost(gCost) + RESET
));
console.log(hLine(BL, TB, BR));

renderLegend('Input = non-cached only | Cache Wr = Claude only (no cost for OpenAI)');
