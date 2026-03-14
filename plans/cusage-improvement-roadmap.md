# cusage Improvement Roadmap

Date: 2026-03-14
Status: Planned
Source artifact: `/tmp/planner-wtnh9kcw/plan.json`

## Goal

Deliver four coordinated improvements to `cusage`:

1. Fixture-backed end-to-end CLI tests.
2. Stable `--json` output.
3. Grouping and drilldown views.
4. A modular internal refactor that keeps the current zero-dependency local CLI behavior.

## Approach

Build safety first, then shared data seams, then new views, then the internal split.

1. Add deterministic fixture-backed CLI coverage.
2. Normalize report data once and expose it through both table and JSON outputs.
3. Layer grouped and drilldown views onto the same selected report.
4. Move provider, cache, pricing, and formatting logic into internal modules without changing runtime semantics.

## Non-Negotiables

- Keep the package a zero-dependency Node 20 ESM CLI.
- Keep the tool local-filesystem based; do not turn it into a library or network service.
- Preserve current base report selectors: default daily, `monthly`, `refresh`, and `--breakdown`.
- Add `--json` as a view flag over the selected report, not as a separate command family.
- Limit `--group-by` to existing report axes: `period`, `provider`, `model`, and `service_tier`.
- Require `--group-by` whenever `--drilldown` is used.
- Preserve fast mode as cache-first with detached background refresh only for interactive TTY sessions.
- Preserve the direct Codex JSONL parser, head/tail fast path, full-file fallback, and lineage-aware family de-overlap behavior.

## Key Decisions

- `DL-001`: Use fixture-backed CLI integration tests as the primary safety net.
- `DL-002`: Build one normalized report model before adding new views.
- `DL-003`: Keep existing report selectors and layer `--json`, `--group-by`, and `--drilldown` on top.
- `DL-004`: Limit grouping to existing axes and let drilldown expand grouped totals back into member rows.
- `DL-005`: Refactor into internal `src/` modules while keeping the shipped package a local CLI.
- `DL-006`: Preserve cache-first fast mode and TTY-gated background refresh behavior.
- `DL-007`: Treat `--json` as one stable selected-view contract across daily, monthly, breakdown, grouped, and drilldown output.
- `DL-008`: Reject `--drilldown` unless `--group-by` is present.
- `DL-009`: Preserve direct Codex parsing and family de-overlap semantics during the module split.

## Milestone 1: Fixture Harness And Behavioral Baseline

Purpose: establish end-to-end regression coverage before touching architecture.

Scope:

- Run the packaged CLI against fixture data without global tools.
- Stub `ccusage` through `PATH` and deterministic fixture JSON.
- Capture `stdout`, `stderr`, and cache state for golden assertions.
- Cover cache-first fast mode, fresh mode, fallback behavior, and non-interactive no-detach behavior.

Planned files:

- `tests/fixtures/bin/ccusage`
- `tests/fixtures/claude/daily-report.json`
- `tests/fixtures/codex/root-session.jsonl`
- `tests/fixtures/codex/forked-session.jsonl`
- `tests/support/run-cli.mjs`
- `tests/e2e/fixture-report.test.mjs`
- `tests/e2e/cache-mode.test.mjs`

Acceptance criteria:

- `node --test` passes with the fixture suites included.
- A mixed Claude and Codex fixture reproduces the expected table output.
- Fast and fresh behaviors are asserted through fixture cache scenarios, including non-interactive no-detach behavior.

Test focus:

- Integration fixture CLI goldens.
- Integration cache-mode fixtures.

## Milestone 2: Shared Report Model And JSON Output

Purpose: create a single data contract that both human-readable and machine-readable views consume.

Scope:

- Construct one normalized report object before rendering.
- Serialize the selected daily, monthly, refresh, or `--breakdown` view through `--json`.
- Publish internal `src/` modules in the package so installed runtime imports remain valid.

Planned files:

- `bin/cusage.mjs`
- `package.json`
- `src/cli/app.mjs`
- `src/report/model.mjs`
- `src/report/merge.mjs`
- `src/output/table.mjs`
- `src/output/json.mjs`
- `tests/cli-contract.test.mjs`
- `tests/fast-mode.test.mjs`
- `tests/json-output.test.mjs`
- `tests/e2e/json-output.test.mjs`

Acceptance criteria:

- `--json` emits a stable schema for daily, monthly, refresh, and breakdown modes.
- JSON totals match table totals for the same fixture inputs.
- The published files list covers every runtime import under `bin/` and `src/`.

Test focus:

- Integration JSON schema parity.
- Integration table-versus-JSON fixture parity.

## Milestone 3: Grouping And Drilldown Views

Purpose: make the report navigable without inventing new product semantics.

Scope:

- Support `--group-by` across `period`, `provider`, `model`, and `service_tier`.
- Expand grouped totals into deterministic drilldown rows for mixed-provider and filtered single-provider reports.
- Reuse the same selected base view for both grouped table output and grouped JSON output.

Planned files:

- `src/report/grouping.mjs`
- `src/output/drilldown-table.mjs`
- `src/cli/view-options.mjs`
- `src/cli/app.mjs`
- `tests/grouping-drilldown.test.mjs`
- `tests/e2e/grouping-drilldown.test.mjs`
- `README.md`

Acceptance criteria:

- Grouped and drilldown views compose with daily, monthly, and breakdown selectors without changing ungrouped totals.
- Drilldown ordering is deterministic across fixture runs.
- README examples cover the new grouping and drilldown flags.

Test focus:

- Integration grouping invariants.
- Integration drilldown fixture goldens.

## Milestone 4: Provider Cache And Pricing Module Split

Purpose: finish the internal refactor after the behavior seams are protected.

Scope:

- Move provider loading, cache access, pricing, argument parsing, and ANSI formatting into focused modules.
- Replace VM source-extraction tests with direct module-import tests where seams exist.
- Keep the existing CLI behavior, local-filesystem runtime model, and Codex aggregation semantics unchanged.

Planned files:

- `src/cli/app.mjs`
- `src/cli/parse-args.mjs`
- `src/cache/store.mjs`
- `src/providers/claude.mjs`
- `src/providers/codex.mjs`
- `src/providers/index.mjs`
- `src/pricing/index.mjs`
- `src/format/ansi.mjs`
- `tests/providers.test.mjs`
- `tests/pricing.test.mjs`
- `tests/provider-flags.test.mjs`
- `tests/codex-family-aggregation.test.mjs`
- `tests/fast-mode.test.mjs`

Acceptance criteria:

- The remaining app layer orchestrates modules instead of owning provider logic.
- Direct module tests cover pricing, flags, and Codex family aggregation.
- Fixture baselines remain unchanged apart from the documented JSON and grouping features.

Test focus:

- Imported module regressions.
- Fixture baseline parity.

## Risks And Mitigations

- `R-001`: Refactoring away from `bin/cusage.mjs` can let source-layout tests pass while user-visible behavior drifts.
  Mitigation: promote fixture-driven CLI runs before extracting modules.

- `R-002`: Table, JSON, grouped, and drilldown outputs can diverge on totals.
  Mitigation: compute everything from one normalized report model and assert parity in fixture suites.

- `R-003`: Shipping `src/` modules without updating package metadata can break installed CLI usage.
  Mitigation: update `package.json` publish boundaries in the same milestone that introduces `src/` runtime imports.

- `R-004`: `--json`, `--group-by`, and `--drilldown` can create ambiguous combinations with the existing report selectors.
  Mitigation: define one selected-view contract and cover the combinations with fixture goldens and parser tests.

## Delivery Order

1. `M-001` must land first.
2. `M-002` depends on `M-001`.
3. `M-003` depends on the normalized model from `M-002`.
4. `M-004` should land last, after fixtures and new views already protect behavior.

## Definition Of Done

- The roadmap is complete only when all four milestones land in order.
- Existing CLI behavior remains stable except for the explicitly added `--json`, `--group-by`, and `--drilldown` capabilities.
- End-to-end fixture coverage becomes the primary behavioral safety net for future work.
