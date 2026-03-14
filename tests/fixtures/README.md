# tests/fixtures

These scenarios treat the packaged CLI as a black-box regression boundary at the published entrypoint.

## Scenario roles

- baseline: merged daily, monthly, breakdown, and provider-filter goldens.
- cache-hit: warm-cache, fresh rebuild, and refresh-marker behavior.
- cache-fallback: refresh failure with cached Claude data and deterministic stderr.

## Invariants

- Scenario assets stay checked in so every branch replays deterministically.
- PATH, HOME, CLAUDE_HOME, CODEX_HOME, and CUSAGE_CACHE_PATH stay fixture-scoped.
- Baseline selectors, Codex parsing, and family de-overlap stay fixed across fixture scenarios.
