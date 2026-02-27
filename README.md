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
cusage --since 20260220     # filter from date
cusage --until 20260228     # filter until date
cusage --breakdown          # cost breakdown with per-token rates
cusage --help               # show help
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

## Pricing

Hardcoded pricing (updated Feb 2026):

| Model | Input | Cached Input | Output |
|-------|-------|-------------|--------|
| gpt-5-codex | $1.25/MTok | $0.125/MTok | $10.00/MTok |
| gpt-5.2-codex | $1.75/MTok | $0.175/MTok | $14.00/MTok |
| gpt-5.3-codex | $1.75/MTok | $0.175/MTok | $14.00/MTok |

Claude pricing is calculated by `ccusage` using LiteLLM data.

## License

MIT
