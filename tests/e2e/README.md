# tests/e2e

These suites complement the existing source-extraction tests instead of replacing them.

- `fixture-report.test.mjs` locks rendered daily, monthly, breakdown, and provider-filter output through the published CLI.
- `cache-mode.test.mjs` covers fast, fresh, fallback, and no-detach semantics through external side effects.
- Output normalization lives in assertions only so runtime formatting stays unchanged.
