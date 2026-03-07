# cusage

Unified AI coding agent usage report — **Claude Code** + **OpenAI Codex** in one table.

Zero dependencies. Single Node.js script. Reads local JSONL session files directly.

## Why?

[ccusage](https://github.com/ryoppippi/ccusage) and `@ccusage/codex` are separate tools with separate outputs. `cusage` merges both into a single table sorted by date, with correct token accounting:

- Fixes the **double-counting bug** in `@ccusage/codex` (every `token_count` event is written twice to JSONL files, inflating totals by 2x)
- Shows **non-cached input** separately from **cache read** so columns actually sum to total
- Adds **Cache Write** column (relevant for Claude, where cache creation costs 25% more than regular input)
- Color-coded providers: Claude (cyan) / Codex (magenta)
- Per-day subtotals and grand total

## Install

Requires `ccusage` for Claude Code data:

```bash
npm install -g ccusage
npm install -g cusage
```

Or run directly:

```bash
npx cusage
```

## Usage

```bash
cusage                      # daily report (default)
cusage monthly              # monthly report
cusage refresh              # force cache rebuild + render daily report
cusage --since 20260220     # filter from date
cusage --until 20260228     # filter until date
cusage --breakdown          # cost breakdown with per-token rates
cusage --fast               # cached snapshot first (spawns background refresh)
cusage --fresh              # force full refresh from source logs
cusage --service-tier fast  # Codex priority pricing (fast alias)
cusage --service-tier flex  # force Codex flex pricing
cusage --providers codex    # codex only
cusage --providers openai   # alias for codex
cusage --openai             # codex only (GPT models)
cusage --claude             # claude only
cusage --anthropic          # alias for claude only
cusage --help               # show help
```

## Performance Modes

- `--fresh`: bypasses cache and rebuilds from source logs
- `--fast`: uses cached data immediately; if run interactively, starts a detached `--fresh` refresh in the background
- default mode: validates cache and refreshes only when inputs changed

Cache path defaults to:

```bash
~/.cache/cusage/cache-v3.json
```

Override with:

```bash
CUSAGE_CACHE_PATH=/some/path/cache.json cusage
```

## Columns

| Column | Description |
|--------|-------------|
| Input | Non-cached input tokens (billed at full input rate) |
| Output | Output tokens (includes reasoning tokens for Codex) |
| Cache Wr | Cache creation/write tokens (Claude only — OpenAI caching is free to write) |
| Cache Rd | Cache read tokens (billed at ~10% of input rate) |
| Total | Sum of all token types |
| Cost | Estimated cost in USD |

## Data Sources

- **Claude Code**: Delegates to `ccusage --json` (reads `~/.claude/projects/**/*.jsonl`)
- **OpenAI Codex**: Reads `~/.codex/sessions/**/*.jsonl` directly, taking only the final cumulative `total_token_usage` per file
  - Uses per-file index cache and a fast head/tail parser with full-parse fallback

## Pricing

Hardcoded pricing (updated Mar 2026):

| Model | Input | Cached Input | Output |
|-------|-------|-------------|--------|
| gpt-5-nano | $0.05/MTok | $0.005/MTok | $0.40/MTok |
| gpt-5-mini | $0.25/MTok | $0.025/MTok | $2.00/MTok |
| gpt-5 / gpt-5.1 / codex | $1.25/MTok | $0.125/MTok | $10.00/MTok |
| gpt-5.2 / gpt-5.3 / codex | $1.75/MTok | $0.175/MTok | $14.00/MTok |
| gpt-5.4 | $2.50/MTok | $0.25/MTok | $15.00/MTok |
| gpt-5-pro | $15.00/MTok | — | $120.00/MTok |
| gpt-5.2-pro | $21.00/MTok | — | $168.00/MTok |

Codex service-tier multipliers:

| Tier | Multiplier |
|------|------------|
| standard | 1x |
| priority | 2x |
| flex | 0.5x |
| fast | alias for `priority` |

`--service-tier auto` is the default for Codex pricing. `cusage` uses exact session tier metadata when available, otherwise falls back to `~/.codex/config.toml` (`service_tier = "fast"` maps to priority pricing). Fallback tier pricing is only applied for sessions dated `2026-03-06` or later; older sessions stay on standard pricing unless exact metadata is present.

Claude pricing: standard view uses `ccusage` (LiteLLM), `--breakdown` uses estimated rates.

## License

MIT
