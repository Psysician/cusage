#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

// ANSI colors
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';
const YELLOW = '\x1b[33m';
const WHITE = '\x1b[37m';
const GRAY = '\x1b[90m';

// ─── Pricing (per million tokens) ────────────────────────
// OpenAI has no cache write cost. Cache read = 10% of input price.
const CODEX_PRICING = {
  'gpt-5-codex':   { input: 1.25,  cached: 0.125,  output: 10.0 },
  'gpt-5.1-codex': { input: 1.25,  cached: 0.125,  output: 10.0 },
  'gpt-5.2-codex': { input: 1.75,  cached: 0.175,  output: 14.0 },
  'gpt-5.3-codex': { input: 1.75,  cached: 0.175,  output: 14.0 },
};
const CODEX_FALLBACK = { input: 1.75, cached: 0.175, output: 14.0 };

// Claude pricing estimated from model family (breakdown view only)
const CLAUDE_PRICING = {
  opus:   { input: 15.0,  cached: 1.50,  output: 75.0,  cacheWrite: 18.75 },
  sonnet: { input: 3.0,   cached: 0.30,  output: 15.0,  cacheWrite: 3.75 },
  haiku:  { input: 0.80,  cached: 0.08,  output: 4.0,   cacheWrite: 1.0 },
};

const M = 1_000_000;

function getModelPricing(provider, modelName) {
  if (provider === 'codex') {
    const p = CODEX_PRICING[modelName] || CODEX_FALLBACK;
    return { input: p.input, cached: p.cached, output: p.output, cacheWrite: 0 };
  }
  const n = modelName.toLowerCase();
  if (n.includes('opus'))   return CLAUDE_PRICING.opus;
  if (n.includes('sonnet')) return CLAUDE_PRICING.sonnet;
  if (n.includes('haiku'))  return CLAUDE_PRICING.haiku;
  return CLAUDE_PRICING.sonnet;
}

function computeCost(provider, modelName, input, cached, output, cacheWrite) {
  const p = getModelPricing(provider, modelName);
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
  return '$' + n.toFixed(Math.max(2, decimals));
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

function loadCodexDirect(sinceDate, untilDate, groupMode) {
  const codexHome = process.env.CODEX_HOME?.trim() || join(homedir(), '.codex');
  const sessionsDir = join(codexHome, 'sessions');
  const files = findJsonlFiles(sessionsDir);
  const byGroup = new Map();

  for (const file of files) {
    let content;
    try { content = readFileSync(file, 'utf-8'); } catch { continue; }

    const lines = content.split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) continue;

    let sessionTimestamp = null;
    let model = null;
    let lastTotal = null;

    for (const line of lines) {
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }

      if (obj.type === 'session_meta' && obj.payload?.timestamp) sessionTimestamp = obj.payload.timestamp;
      if (obj.type === 'turn_context' && obj.payload?.model) model = obj.payload.model;

      if (obj.type === 'event_msg' && obj.payload?.type === 'token_count') {
        const info = obj.payload?.info;
        if (info?.model) model = info.model;
        if (info?.metadata?.model) model = info.metadata.model;
        if (info?.total_token_usage) lastTotal = info.total_token_usage;
      }

      if (!sessionTimestamp && obj.timestamp) sessionTimestamp = obj.timestamp;
    }

    if (!lastTotal || !sessionTimestamp) continue;
    if (!model) model = 'codex-unknown';

    const dateKey = groupMode === 'monthly' ? toMonthKey(sessionTimestamp) : toISODate(sessionTimestamp);
    if (!dateKey) continue;
    if (sinceDate && dateKey < sinceDate) continue;
    if (untilDate && dateKey > untilDate) continue;

    if (!byGroup.has(dateKey)) byGroup.set(dateKey, new Map());
    const models = byGroup.get(dateKey);

    const inputTotal = lastTotal.input_tokens || 0;
    const cached = lastTotal.cached_input_tokens || lastTotal.cache_read_input_tokens || 0;
    const nonCachedInput = Math.max(inputTotal - cached, 0);
    const output = lastTotal.output_tokens || 0;
    const reasoning = lastTotal.reasoning_output_tokens || 0;
    const total = lastTotal.total_tokens || (inputTotal + output);

    if (!models.has(model)) {
      models.set(model, { input: 0, cacheWrite: 0, cacheRead: 0, output: 0, reasoning: 0, total: 0 });
    }
    const m = models.get(model);
    m.input += nonCachedInput;
    m.cacheRead += cached;
    m.output += output;
    m.reasoning += reasoning;
    m.total += total;
  }

  return byGroup;
}

// ─── Claude data via ccusage --json ───────────────────────

function runTool(cmd) {
  try {
    const out = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 });
    return JSON.parse(out);
  } catch {
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
${BOLD}cusage${RESET} — Unified AI usage report: Claude Code + OpenAI Codex in one table

${BOLD}USAGE:${RESET}
  cusage [daily|monthly] [OPTIONS]

${BOLD}COMMANDS:${RESET}
  daily     Show merged report grouped by date (default)
  monthly   Show merged report grouped by month

${BOLD}OPTIONS:${RESET}
  -s, --since <YYYYMMDD>   Filter from date
  -u, --until <YYYYMMDD>   Filter until date
  -b, --breakdown          Show per-category cost breakdown with rates
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
const subcommands = ['daily', 'monthly'];
const passArgs = [...args];
if (subcommands.includes(passArgs[0])) subcommand = passArgs.shift();

let sinceDate = null, untilDate = null, showBreakdown = false;
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
  } else {
    claudePassArgs.push(a);
  }
}

const claudeArgStr = claudePassArgs.map(a => `'${a}'`).join(' ');
const groupKey = subcommand === 'monthly' ? 'monthly' : 'daily';

process.stderr.write(`${DIM}Loading data...${RESET}\n`);

const claudeCmd = `ccusage ${subcommand} --json ${claudeArgStr}`.trim();
const claudeData = runTool(claudeCmd);
const codexByGroup = loadCodexDirect(sinceDate, untilDate, subcommand === 'monthly' ? 'monthly' : 'daily');

if (!claudeData && codexByGroup.size === 0) {
  console.error('No data from either source.');
  process.exit(1);
}

// ─── Merge by date ────────────────────────────────────────

const merged = new Map();

if (claudeData?.[groupKey]) {
  for (const entry of claudeData[groupKey]) {
    const date = entry.date;
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

  for (const [modelName, m] of models) {
    const cost = computeCost('codex', modelName, m.input, m.cacheRead, m.output, 0);
    bucket.dayTotal += cost;
    bucket.models.push({
      provider: 'codex',
      model: modelName,
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
      const pricing = getModelPricing(m.provider, m.model);
      const marker = m.provider === 'claude' ? CYAN + '\u25cf' + RESET : MAGENTA + '\u25cf' + RESET;

      const cats = [];
      if (m.input > 0)      cats.push({ name: 'Input',      tokens: m.input,      rate: pricing.input,      cost: m.input * pricing.input / M });
      if (m.output > 0)     cats.push({ name: 'Output',     tokens: m.output,     rate: pricing.output,     cost: m.output * pricing.output / M });
      if (m.cacheWrite > 0) cats.push({ name: 'Cache Write', tokens: m.cacheWrite, rate: pricing.cacheWrite, cost: m.cacheWrite * pricing.cacheWrite / M });
      if (m.cacheRead > 0)  cats.push({ name: 'Cache Read',  tokens: m.cacheRead,  rate: pricing.cached,     cost: m.cacheRead * pricing.cached / M });

      if (cats.length === 0) continue;

      const modelTotal = cats.reduce((s, c) => s + c.cost, 0);
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

  renderLegend('Rates: Claude estimated | Codex per openai.com');
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
