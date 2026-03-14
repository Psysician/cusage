# Plan

## Overview

Plan the fixture-backed end-to-end regression harness for cusage packaged CLI, covering deterministic Claude and Codex fixtures, PATH-stubbed ccusage, cache-state assertions, cache-first fast mode, fresh mode, fallback behavior, and non-interactive no-detach semantics before architectural changes.

### Fixture Harness Overview

[Diagram pending Technical Writer rendering: DIAG-001]

## Planning Context

### Decision Log

| ID | Decision | Reasoning Chain |
|---|---|---|
| DL-001 | Exercise the packaged CLI as a black-box from node:test | bin/cusage.mjs is the shipped user contract -> source-extraction tests do not protect refactors or packaging drift -> the regression harness should spawn the real entrypoint with fixture-scoped environment overrides |
| DL-002 | Represent regressions as checked-in fixture scenarios with stubbed ccusage, Claude fingerprint inputs, Codex session JSONL, and expected outputs | The milestone forbids global tool dependencies and flaky live homes -> deterministic scenario trees keep PATH, cache, and parser inputs reproducible -> each behavior branch should replay from versioned fixture assets |
| DL-003 | Assert fast, fresh, fallback, and no-detach semantics through external side effects instead of runtime-only test hooks | This milestone exists before architecture changes -> adding dedicated test seams into runtime behavior would contaminate the baseline -> cache JSON, stderr notices, stub invocation markers, and exit codes provide end-user-visible evidence without changing semantics |
| DL-004 | Keep the existing source-extraction tests and add fixture suites under tests/e2e with a shared helper under tests/support | Current unit-style tests already pin small invariants like refresh gating and pricing helpers -> replacing them now would collapse signal while the CLI stays monolithic -> end-to-end suites should complement those checks until later module extraction |
| DL-005 | Isolate each fixture run with HOME CLAUDE_HOME CODEX_HOME CUSAGE_CACHE_PATH and PATH overrides so the packaged CLI never touches user state or a globally installed ccusage. | The harness must execute the shipped CLI without adding runtime seams -> host PATH or home leakage would make failures nondeterministic and violate the packaged-CLI scope -> every scenario should inject scratch homes cache paths and a fixture-local ccusage stub. |
| DL-006 | Keep output normalization inside test assertions by comparing ANSI-stripped and newline-normalized goldens while leaving shipped CLI formatting and selectors unchanged. | The CLI already emits color and box-drawing output across environments -> raw snapshots would create ANSI and CRLF noise that hides real regressions -> the harness should normalize only in test helpers and preserve runtime presentation semantics. |
| DL-007 | Treat current base selectors and Codex parsing behavior as regression invariants while the harness lands before any refactor. | Milestone 1 exists to protect the current CLI before architecture work -> changing daily monthly breakdown selection or Codex direct JSONL parsing head-tail fallback and family de-overlap during harness work would move the baseline -> fixtures must assert those behaviors first. |

### Rejected Alternatives

| Alternative | Why Rejected |
|---|---|
| Rely on a globally installed ccusage binary during fixture runs. | Milestone scope requires packaged-CLI execution on any machine without global tool assumptions so the harness must stub ccusage through PATH inside fixtures. (ref: DL-005) |
| Start the module split before the regression harness is in place. | The roadmap is regression-first and needs the current CLI frozen before architectural changes so refactor work must wait for fixture coverage. (ref: DL-007) |
| Treat the existing source-extraction tests as sufficient behavior coverage. | Those tests do not execute the packaged CLI or assert stdout stderr and cache artifacts so they cannot replace end-to-end goldens. (ref: DL-004) |

### Constraints

- MUST: run the packaged CLI against fixture data without relying on globally installed tools
- MUST: stub ccusage through PATH with deterministic fixture JSON
- MUST: capture stdout stderr and cache state for golden assertions
- MUST: cover cache-first fast mode fresh mode fallback behavior and non-interactive no-detach behavior
- MUST: keep the package a zero-dependency Node 20 ESM CLI
- MUST: preserve current base selectors and existing fast-mode semantics while adding regression coverage first

### Known Risks

- **Fixture env or PATH overrides can leak host state or accidentally resolve a real ccusage binary instead of the deterministic stub.**: Run every scenario with HOME CLAUDE_HOME CODEX_HOME CUSAGE_CACHE_PATH and PATH rooted in fixture scratch directories and assert stub side effects that prove the local stub was invoked.
- **ANSI color box-drawing output and CRLF differences can make checked-in goldens noisy across local and CI environments.**: Normalize ANSI escapes and line endings in a test-only helper before comparing report and stderr goldens while leaving shipped CLI formatting unchanged.
- **Cache-mode regressions can slip through if fast fresh fallback and non-interactive no-detach branches are not all asserted through external side effects.**: Keep a dedicated cache-mode suite that checks stdout stderr cache JSON and refresh-marker artifacts for warm-cache fast mode fresh rebuilds fallback and no-detach runs.
- **Fixture coverage can miss Codex direct JSONL parsing head-tail fallback or lineage-aware family de-overlap and let later refactors drift totals.**: Keep deterministic Codex session fixtures in the mixed-provider goldens so report totals prove parser and de-overlap behavior before module extraction.

## Invisible Knowledge

### System

cusage remains a zero-dependency Node 20 ESM packaged CLI and this milestone exists to freeze current behavior before any architectural split.

### Invariants

- Milestone 1 is regression-first: land the fixture harness before any src/ module split or feature expansion changes the baseline.
- Fast mode means cache-first reads plus TTY-gated detached refresh and fresh or non-interactive runs must never detach.
- Base selectors stay as they are today: default daily monthly refresh and breakdown remain the baseline report surface while coverage is added.
- Codex behavior stays local and parser-driven: direct JSONL parsing must preserve fast head-tail parsing full-file fallback and lineage-aware family de-overlap.

### Tradeoffs

- Prefer deterministic PATH and home isolation plus normalized goldens over live-provider realism because this milestone optimizes regression signal before refactor speed.
- Keep the existing source-extraction tests beside the new end-to-end suites until later modularization can replace them without losing narrow helper coverage.

## Milestones

### Milestone 1: Fixture Scenarios And CLI Runner

**Files**: tests/fixtures/manifest.json, tests/fixtures/baseline/bin/ccusage, tests/fixtures/baseline/claude/report.json, tests/fixtures/baseline/claude-home/projects/project-a/session.jsonl, tests/fixtures/baseline/codex-home/sessions/2026/03/root-session.jsonl, tests/fixtures/baseline/codex-home/sessions/2026/03/forked-session.jsonl, tests/fixtures/baseline/expected/daily.txt, tests/fixtures/baseline/expected/monthly.txt, tests/fixtures/baseline/expected/breakdown.txt, tests/fixtures/cache-hit/bin/ccusage, tests/fixtures/cache-hit/cache/cache-v4.json, tests/fixtures/cache-hit/claude/report.json, tests/fixtures/cache-hit/claude-home/projects/project-a/session.jsonl, tests/fixtures/cache-hit/codex-home/sessions/2026/03/root-session.jsonl, tests/fixtures/cache-hit/expected/fresh.txt, tests/fixtures/cache-fallback/bin/ccusage, tests/fixtures/cache-fallback/cache/cache-v4.json, tests/fixtures/cache-fallback/claude-home/projects/project-a/session.jsonl, tests/fixtures/cache-fallback/codex-home/sessions/2026/03/root-session.jsonl, tests/fixtures/cache-fallback/expected/stderr.txt, tests/support/run-cli.mjs

**Requirements**:

- Package deterministic scenario trees for mixed-provider and cache branches without globally installed tools
- Provide a shared runner that executes bin/cusage.mjs with fixture-scoped CLAUDE_HOME CODEX_HOME CUSAGE_CACHE_PATH and PATH overrides
- Keep detached refresh observability external through stub side effects and scratch cache artifacts instead of runtime-only test hooks

**Acceptance Criteria**:

- Each fixture scenario replays its targeted CLI branch from deterministic Claude Codex and stub inputs
- The shared runner returns exit code stdout stderr cache JSON and scratch paths from the packaged entrypoint
- No scenario depends on user home state or a globally installed ccusage binary

**Tests**:

- integration deterministic fixture replay
- integration packaged entrypoint harness

#### Code Intent

- **CI-M-001-001** `tests/fixtures/manifest.json::fixture scenario catalog`: Describe baseline cache-hit and cache-fallback scenarios in one manifest so node:test suites can address deterministic fixture trees for mixed-provider merges warm caches fallback stderr and refresh side effects. (refs: DL-002, DL-003)
- **CI-M-001-002** `tests/fixtures/baseline/bin/ccusage::fixture ccusage stub`: Emulate ccusage through PATH by replaying scenario JSON or controlled failure responses and optionally writing marker files that expose background refresh attempts without requiring runtime instrumentation. (refs: DL-002, DL-003)
- **CI-M-001-003** `tests/support/run-cli.mjs::runFixtureCli`: Spawn the packaged CLI with scenario-scoped homes PATH overrides scratch cache paths and optional marker environment so end-to-end tests observe stdout stderr exit status and persisted cache state through the real entrypoint. (refs: DL-001, DL-003, DL-004)

#### Code Changes

**CC-M-001-001** (tests/fixtures/manifest.json) - implements CI-M-001-001

**Code:**

```diff
--- /dev/null
+++ b/tests/fixtures/manifest.json
@@ -0,0 +1,26 @@
+{
+  "baseline": {
+    "description": "Mixed Claude and Codex fixture with forked-family Codex overlap for daily, monthly, and breakdown goldens.",
+    "claudeReport": "claude/report.json",
+    "expected": {
+      "daily": "expected/daily.txt",
+      "monthly": "expected/monthly.txt",
+      "breakdown": "expected/breakdown.txt"
+    }
+  },
+  "cache-hit": {
+    "description": "Warm-cache fixture where --fast stays on seeded cache data and --fresh rebuilds from fixture source files.",
+    "claudeReport": "claude/report.json",
+    "cacheTemplate": "cache/cache-v4.json",
+    "expected": {
+      "fresh": "expected/fresh.txt"
+    }
+  },
+  "cache-fallback": {
+    "description": "Claude refresh failure with cached fallback data and deterministic stderr expectations.",
+    "cacheTemplate": "cache/cache-v4.json",
+    "expected": {
+      "stderr": "expected/stderr.txt"
+    }
+  }
+}

```

**Documentation:**

```diff
--- /dev/null
+++ b/tests/fixtures/manifest.json.md
@@ -0,0 +1,4 @@
+# tests/fixtures/manifest.json
+
+Scenario keys map the regression branches that the packaged CLI replays under node:test.
+Keeping this catalog checked in makes baseline, cache-hit, and cache-fallback behavior deterministic across machines. (ref: DL-002)

```


**CC-M-001-002** (tests/fixtures/baseline/bin/ccusage) - implements CI-M-001-002

**Code:**

```diff
--- /dev/null
+++ b/tests/fixtures/baseline/bin/ccusage
@@ -0,0 +1,7 @@
+#!/usr/bin/env node
+import { readFileSync, writeFileSync } from 'node:fs';
+
+if (process.env.CUSAGE_BACKGROUND_MARKER) {
+  writeFileSync(process.env.CUSAGE_BACKGROUND_MARKER, 'ccusage-called\n', 'utf8');
+}
+process.stdout.write(readFileSync(process.env.CCUSAGE_FIXTURE_PATH, 'utf8'));

```

**Documentation:**

```diff
--- a/tests/fixtures/baseline/bin/ccusage
+++ b/tests/fixtures/baseline/bin/ccusage
@@ -1,6 +1,10 @@
 #!/usr/bin/env node
+// This stub serves checked-in Claude JSON through PATH so the regression harness
+// exercises the packaged CLI without any global ccusage dependency. (ref: DL-002)
 import { readFileSync, writeFileSync } from 'node:fs';
 
+// The marker file is the observable proof that refresh work crosses the
+// external ccusage boundary instead of hidden test hooks. (ref: DL-003)
 if (process.env.CUSAGE_BACKGROUND_MARKER) {
   writeFileSync(process.env.CUSAGE_BACKGROUND_MARKER, 'ccusage-called\n', 'utf8');
 }

```


**CC-M-001-003** (tests/fixtures/baseline/claude/report.json) - implements CI-M-001-001

**Code:**

```diff
--- /dev/null
+++ b/tests/fixtures/baseline/claude/report.json
@@ -0,0 +1,1 @@
+{"daily": [{"date": "2026-03-06", "totalCost": 0.00795, "modelBreakdowns": [{"modelName": "claude-3-7-sonnet-20250219", "inputTokens": 1000, "outputTokens": 200, "cacheCreationTokens": 500, "cacheReadTokens": 250, "cost": 0.00795}]}, {"date": "2026-03-07", "totalCost": 0.00615, "modelBreakdowns": [{"modelName": "claude-3-7-sonnet-20250219", "inputTokens": 1500, "outputTokens": 100, "cacheCreationTokens": 0, "cacheReadTokens": 500, "cost": 0.00615}]}], "monthly": [{"month": "2026-03", "totalCost": 0.0141, "modelBreakdowns": [{"modelName": "claude-3-7-sonnet-20250219", "inputTokens": 2500, "outputTokens": 300, "cacheCreationTokens": 500, "cacheReadTokens": 750, "cost": 0.0141}]}]}

```

**Documentation:**

```diff
--- /dev/null
+++ b/tests/fixtures/baseline/claude/report.json.md
@@ -0,0 +1,4 @@
+# tests/fixtures/baseline/claude/report.json
+
+This payload mirrors the ccusage --json contract that the fixture stub returns through PATH.
+Stable totals keep merged-report assertions independent from live Claude state. (ref: DL-002)

```


**CC-M-001-004** (tests/fixtures/baseline/claude-home/projects/project-a/session.jsonl) - implements CI-M-001-001

**Code:**

```diff
--- /dev/null
+++ b/tests/fixtures/baseline/claude-home/projects/project-a/session.jsonl
@@ -0,0 +1,1 @@
+{"session":"claude-baseline"}

```

**Documentation:**

```diff
--- /dev/null
+++ b/tests/fixtures/baseline/claude-home/projects/project-a/session.jsonl.md
@@ -0,0 +1,4 @@
+# tests/fixtures/baseline/claude-home/projects/project-a/session.jsonl
+
+This placeholder JSONL tree exists for Claude fingerprinting rather than semantic parsing.
+Scratch copies isolate HOME-backed file stats so cache invalidation never leaks into user state. (ref: DL-005)

```


**CC-M-001-005** (tests/fixtures/baseline/codex-home/sessions/2026/03/root-session.jsonl) - implements CI-M-001-001

**Code:**

```diff
--- /dev/null
+++ b/tests/fixtures/baseline/codex-home/sessions/2026/03/root-session.jsonl
@@ -0,0 +1,3 @@
+{"type": "session_meta", "payload": {"timestamp": "2026-03-07T12:00:00.000Z", "id": "root-session"}}
+{"type": "turn_context", "payload": {"model": "gpt-5.4"}}
+{"type": "event_msg", "payload": {"type": "token_count", "info": {"metadata": {"service_tier": "priority"}, "total_token_usage": {"input_tokens": 950, "cached_input_tokens": 800, "output_tokens": 40, "reasoning_output_tokens": 10, "total_tokens": 990}}}}

```

**Documentation:**

```diff
--- /dev/null
+++ b/tests/fixtures/baseline/codex-home/sessions/2026/03/root-session.jsonl.md
@@ -0,0 +1,4 @@
+# tests/fixtures/baseline/codex-home/sessions/2026/03/root-session.jsonl
+
+This root Codex session establishes the baseline family summary for direct JSONL parsing.
+The service-tier metadata and token totals keep family-summary parsing drift visible in report output. (ref: DL-007)

```


**CC-M-001-006** (tests/fixtures/baseline/codex-home/sessions/2026/03/forked-session.jsonl) - implements CI-M-001-001

**Code:**

```diff
--- /dev/null
+++ b/tests/fixtures/baseline/codex-home/sessions/2026/03/forked-session.jsonl
@@ -0,0 +1,3 @@
+{"type": "session_meta", "payload": {"timestamp": "2026-03-07T12:05:00.000Z", "id": "forked-session", "forked_from_id": "root-session"}}
+{"type": "turn_context", "payload": {"model": "gpt-5.4"}}
+{"type": "event_msg", "payload": {"type": "token_count", "info": {"metadata": {"service_tier": "priority"}, "total_token_usage": {"input_tokens": 1200, "cached_input_tokens": 1000, "output_tokens": 50, "reasoning_output_tokens": 12, "total_tokens": 1250}}}}

```

**Documentation:**

```diff
--- /dev/null
+++ b/tests/fixtures/baseline/codex-home/sessions/2026/03/forked-session.jsonl.md
@@ -0,0 +1,4 @@
+# tests/fixtures/baseline/codex-home/sessions/2026/03/forked-session.jsonl
+
+This forked Codex session exercises lineage-aware family de-overlap in the merged report.
+The larger child summary makes double-counting regressions obvious in daily and monthly totals. (ref: DL-007)

```


**CC-M-001-007** (tests/fixtures/baseline/expected/daily.txt) - implements CI-M-001-001

**Code:**

```diff
--- /dev/null
+++ b/tests/fixtures/baseline/expected/daily.txt
@@ -0,0 +1,21 @@
+
+ ╭────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
+ │                                                  Unified Token Usage Report - Daily                                                    │
+ ╰────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
+
+┌──────────────┬──────────────────────┬────────────────┬──────────────┬──────────────┬──────────────────┬──────────────────┬──────────────┐
+│ Date         │ Model                │          Input │       Output │     Cache Wr │         Cache Rd │            Total │         Cost │
+├──────────────┼──────────────────────┼────────────────┼──────────────┼──────────────┼──────────────────┼──────────────────┼──────────────┤
+│ 2026-03-06   │ ● 3-7-sonnet         │          1,000 │          200 │          500 │              250 │            1,950 │      $0.0080 │
+│              │ Day Total            │          1,000 │          200 │          500 │              250 │            1,950 │      $0.0080 │
+├──────────────┼──────────────────────┼────────────────┼──────────────┼──────────────┼──────────────────┼──────────────────┼──────────────┤
+│ 2026-03-07   │ ● 3-7-sonnet         │          1,500 │          100 │            - │              500 │            2,100 │      $0.0062 │
+│              │ ● gpt-5.4 (priority) │            200 │           50 │            - │            1,000 │            1,250 │      $0.0030 │
+│              │ Day Total            │          1,700 │          150 │            - │            1,500 │            3,350 │      $0.0092 │
+├──────────────┼──────────────────────┼────────────────┼──────────────┼──────────────┼──────────────────┼──────────────────┼──────────────┤
+│ Total        │                      │          2,700 │          350 │          500 │            1,750 │            5,300 │        $0.02 │
+└──────────────┴──────────────────────┴────────────────┴──────────────┴──────────────┴──────────────────┴──────────────────┴──────────────┘
+
+  ● Claude   ● OpenAI Codex
+  Input = non-cached only | Cache Wr = Claude only (no cost for OpenAI)
+

```

**Documentation:**

```diff
--- /dev/null
+++ b/tests/fixtures/baseline/expected/daily.txt.md
@@ -0,0 +1,4 @@
+# tests/fixtures/baseline/expected/daily.txt
+
+This file is the literal daily CLI golden for the baseline scenario.
+Documentation lives beside the snapshot because assertion-side normalization preserves a byte-stable rendered table. (ref: DL-001) (ref: DL-006)

```


**CC-M-001-008** (tests/fixtures/baseline/expected/monthly.txt) - implements CI-M-001-001

**Code:**

```diff
--- /dev/null
+++ b/tests/fixtures/baseline/expected/monthly.txt
@@ -0,0 +1,18 @@
+
+ ╭────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
+ │                                                 Unified Token Usage Report - Monthly                                                   │
+ ╰────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
+
+┌──────────────┬──────────────────────┬────────────────┬──────────────┬──────────────┬──────────────────┬──────────────────┬──────────────┐
+│ Date         │ Model                │          Input │       Output │     Cache Wr │         Cache Rd │            Total │         Cost │
+├──────────────┼──────────────────────┼────────────────┼──────────────┼──────────────┼──────────────────┼──────────────────┼──────────────┤
+│ 2026-03      │ ● 3-7-sonnet         │          2,500 │          300 │          500 │              750 │            4,050 │        $0.01 │
+│              │ ● gpt-5.4 (priority) │            200 │           50 │            - │            1,000 │            1,250 │      $0.0030 │
+│              │ Day Total            │          2,700 │          350 │          500 │            1,750 │            5,300 │        $0.02 │
+├──────────────┼──────────────────────┼────────────────┼──────────────┼──────────────┼──────────────────┼──────────────────┼──────────────┤
+│ Total        │                      │          2,700 │          350 │          500 │            1,750 │            5,300 │        $0.02 │
+└──────────────┴──────────────────────┴────────────────┴──────────────┴──────────────┴──────────────────┴──────────────────┴──────────────┘
+
+  ● Claude   ● OpenAI Codex
+  Input = non-cached only | Cache Wr = Claude only (no cost for OpenAI)
+

```

**Documentation:**

```diff
--- /dev/null
+++ b/tests/fixtures/baseline/expected/monthly.txt.md
@@ -0,0 +1,4 @@
+# tests/fixtures/baseline/expected/monthly.txt
+
+This file freezes the monthly aggregate that the packaged CLI prints for the mixed-provider baseline.
+The snapshot protects the shipped grouping contract for the packaged CLI monthly report. (ref: DL-001) (ref: DL-007)

```


**CC-M-001-009** (tests/fixtures/baseline/expected/breakdown.txt) - implements CI-M-001-001

**Code:**

```diff
--- /dev/null
+++ b/tests/fixtures/baseline/expected/breakdown.txt
@@ -0,0 +1,31 @@
+
+ ╭───────────────────────────────────────────────────────────────────────────────────────────────────╮
+ │                                     Cost Breakdown - Daily                                        │
+ ╰───────────────────────────────────────────────────────────────────────────────────────────────────╯
+
+┌──────────────┬──────────────────────┬───────────────┬──────────────────┬────────────┬──────────────┐
+│ Date         │ Model                │ Category      │           Tokens │     $/MTok │         Cost │
+├──────────────┼──────────────────────┼───────────────┼──────────────────┼────────────┼──────────────┤
+│ 2026-03-06   │ ● 3-7-sonnet         │ Input         │            1,000 │      $3.00 │      $0.0030 │
+│              │                      │ Output        │              200 │     $15.00 │      $0.0030 │
+│              │                      │ Cache Write   │              500 │      $3.75 │      $0.0019 │
+│              │                      │ Cache Read    │              250 │      $0.30 │      $0.0001 │
+│              │                      │ Subtotal      │                  │            │      $0.0080 │
+│              │ Day Total            │               │                  │            │      $0.0080 │
+├──────────────┼──────────────────────┼───────────────┼──────────────────┼────────────┼──────────────┤
+│ 2026-03-07   │ ● 3-7-sonnet         │ Input         │            1,500 │      $3.00 │      $0.0045 │
+│              │                      │ Output        │              100 │     $15.00 │      $0.0015 │
+│              │                      │ Cache Read    │              500 │      $0.30 │      $0.0001 │
+│              │                      │ Subtotal      │                  │            │      $0.0062 │
+│              │ ● gpt-5.4 (priority) │ Input         │              200 │      $5.00 │      $0.0010 │
+│              │                      │ Output        │               50 │     $30.00 │      $0.0015 │
+│              │                      │ Cache Read    │            1,000 │      $0.50 │      $0.0005 │
+│              │                      │ Subtotal      │                  │            │      $0.0030 │
+│              │ Day Total            │               │                  │            │      $0.0092 │
+├──────────────┼──────────────────────┼───────────────┼──────────────────┼────────────┼──────────────┤
+│ Total        │                      │               │                  │            │        $0.02 │
+└──────────────┴──────────────────────┴───────────────┴──────────────────┴────────────┴──────────────┘
+
+  ● Claude   ● OpenAI Codex
+  Rates: Claude effective (scaled to ccusage model totals) | Codex per openai.com
+

```

**Documentation:**

```diff
--- /dev/null
+++ b/tests/fixtures/baseline/expected/breakdown.txt.md
@@ -0,0 +1,4 @@
+# tests/fixtures/baseline/expected/breakdown.txt
+
+This golden records the per-category cost breakdown and rate labels for the baseline scenario.
+Keeping the text literal preserves the provider selector labels and pricing presentation semantics. (ref: DL-007)

```


**CC-M-001-010** (tests/fixtures/cache-hit/bin/ccusage) - implements CI-M-001-002

**Code:**

```diff
--- /dev/null
+++ b/tests/fixtures/cache-hit/bin/ccusage
@@ -0,0 +1,7 @@
+#!/usr/bin/env node
+import { readFileSync, writeFileSync } from 'node:fs';
+
+if (process.env.CUSAGE_BACKGROUND_MARKER) {
+  writeFileSync(process.env.CUSAGE_BACKGROUND_MARKER, 'ccusage-called\n', 'utf8');
+}
+process.stdout.write(readFileSync(process.env.CCUSAGE_FIXTURE_PATH, 'utf8'));

```

**Documentation:**

```diff
--- a/tests/fixtures/cache-hit/bin/ccusage
+++ b/tests/fixtures/cache-hit/bin/ccusage
@@ -1,6 +1,10 @@
 #!/usr/bin/env node
+// This stub replays fixture JSON so cache-hit coverage exercises the published
+// CLI with deterministic provider output instead of a host-installed tool. (ref: DL-002)
 import { readFileSync, writeFileSync } from 'node:fs';
 
+// The background marker keeps refresh assertions observable from the
+// spawned process boundary. (ref: DL-003)
 if (process.env.CUSAGE_BACKGROUND_MARKER) {
   writeFileSync(process.env.CUSAGE_BACKGROUND_MARKER, 'ccusage-called\n', 'utf8');
 }

```


**CC-M-001-011** (tests/fixtures/cache-hit/cache/cache-v4.json) - implements CI-M-001-001

**Code:**

```diff
--- /dev/null
+++ b/tests/fixtures/cache-hit/cache/cache-v4.json
@@ -0,0 +1,65 @@
+{
+  "version": 4,
+  "claude": {
+    "commands": {
+      "daily::--offline": {
+        "fingerprint": "fixture-cache-hit",
+        "updatedAt": "2026-03-09T09:30:00.000Z",
+        "data": {
+          "daily": [
+            {
+              "date": "2026-03-08",
+              "totalCost": 0.0024,
+              "modelBreakdowns": [
+                {
+                  "modelName": "claude-3-7-sonnet-20250219",
+                  "inputTokens": 400,
+                  "outputTokens": 76,
+                  "cacheCreationTokens": 0,
+                  "cacheReadTokens": 200,
+                  "cost": 0.0024
+                }
+              ]
+            }
+          ],
+          "monthly": [
+            {
+              "month": "2026-03",
+              "totalCost": 0.0024,
+              "modelBreakdowns": [
+                {
+                  "modelName": "claude-3-7-sonnet-20250219",
+                  "inputTokens": 400,
+                  "outputTokens": 76,
+                  "cacheCreationTokens": 0,
+                  "cacheReadTokens": 200,
+                  "cost": 0.0024
+                }
+              ]
+            }
+          ]
+        }
+      }
+    }
+  },
+  "codex": {
+    "files": {
+      "__SCENARIO_ROOT__/codex-home/sessions/2026/03/root-session.jsonl": {
+        "mtimeMs": 0,
+        "size": 0,
+        "summary": {
+          "sessionTimestamp": "2026-03-08T08:00:00.000Z",
+          "sessionId": "cache-hit-root",
+          "familyId": "cache-hit-root",
+          "model": "gpt-5.4",
+          "serviceTier": "standard",
+          "input": 50,
+          "cacheRead": 100,
+          "output": 10,
+          "reasoning": 1,
+          "total": 160
+        }
+      }
+    }
+  }
+}

```

**Documentation:**

```diff
--- /dev/null
+++ b/tests/fixtures/cache-hit/cache/cache-v4.json.md
@@ -0,0 +1,4 @@
+# tests/fixtures/cache-hit/cache/cache-v4.json
+
+This seeded cache snapshot drives warm-cache behavior before any live refresh work runs.
+Placeholder Codex keys are rewritten against scratch copies so fast-mode hits remain deterministic and host-independent. (ref: DL-003) (ref: DL-005)

```


**CC-M-001-012** (tests/fixtures/cache-hit/claude/report.json) - implements CI-M-001-001

**Code:**

```diff
--- /dev/null
+++ b/tests/fixtures/cache-hit/claude/report.json
@@ -0,0 +1,1 @@
+{"daily": [{"date": "2026-03-09", "totalCost": 0.00843, "modelBreakdowns": [{"modelName": "claude-3-7-sonnet-20250219", "inputTokens": 1800, "outputTokens": 150, "cacheCreationTokens": 200, "cacheReadTokens": 100, "cost": 0.00843}]}], "monthly": [{"month": "2026-03", "totalCost": 0.00843, "modelBreakdowns": [{"modelName": "claude-3-7-sonnet-20250219", "inputTokens": 1800, "outputTokens": 150, "cacheCreationTokens": 200, "cacheReadTokens": 100, "cost": 0.00843}]}]}

```

**Documentation:**

```diff
--- /dev/null
+++ b/tests/fixtures/cache-hit/claude/report.json.md
@@ -0,0 +1,4 @@
+# tests/fixtures/cache-hit/claude/report.json
+
+This report is the fresh-mode Claude source of truth for the cache-hit scenario.
+Its totals differ from the seeded cache snapshot so stale-cache regressions surface immediately. (ref: DL-003)

```


**CC-M-001-013** (tests/fixtures/cache-hit/claude-home/projects/project-a/session.jsonl) - implements CI-M-001-001

**Code:**

```diff
--- /dev/null
+++ b/tests/fixtures/cache-hit/claude-home/projects/project-a/session.jsonl
@@ -0,0 +1,1 @@
+{"session":"claude-hit"}

```

**Documentation:**

```diff
--- /dev/null
+++ b/tests/fixtures/cache-hit/claude-home/projects/project-a/session.jsonl.md
@@ -0,0 +1,4 @@
+# tests/fixtures/cache-hit/claude-home/projects/project-a/session.jsonl
+
+This placeholder Claude session keeps fingerprint inputs present during cache-hit runs.
+Per-run scratch copies keep the fingerprint scoped to fixture state instead of the caller home directory. (ref: DL-005)

```


**CC-M-001-014** (tests/fixtures/cache-hit/codex-home/sessions/2026/03/root-session.jsonl) - implements CI-M-001-001

**Code:**

```diff
--- /dev/null
+++ b/tests/fixtures/cache-hit/codex-home/sessions/2026/03/root-session.jsonl
@@ -0,0 +1,3 @@
+{"type": "session_meta", "payload": {"timestamp": "2026-03-09T09:00:00.000Z", "id": "cache-hit-root"}}
+{"type": "turn_context", "payload": {"model": "gpt-5.4"}}
+{"type": "event_msg", "payload": {"type": "token_count", "info": {"metadata": {"service_tier": "standard"}, "total_token_usage": {"input_tokens": 2400, "cached_input_tokens": 2000, "output_tokens": 120, "reasoning_output_tokens": 20, "total_tokens": 2520}}}}

```

**Documentation:**

```diff
--- /dev/null
+++ b/tests/fixtures/cache-hit/codex-home/sessions/2026/03/root-session.jsonl.md
@@ -0,0 +1,4 @@
+# tests/fixtures/cache-hit/codex-home/sessions/2026/03/root-session.jsonl
+
+This Codex session forces fresh parsing to replace the stale summary seeded in cache-v4.json.
+The mismatched totals prove --fresh rebuilds from source files and preserves direct JSONL semantics. (ref: DL-003) (ref: DL-007)

```


**CC-M-001-015** (tests/fixtures/cache-hit/expected/fresh.txt) - implements CI-M-001-001

**Code:**

```diff
--- /dev/null
+++ b/tests/fixtures/cache-hit/expected/fresh.txt
@@ -0,0 +1,18 @@
+
+ ╭────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
+ │                                                  Unified Token Usage Report - Daily                                                    │
+ ╰────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
+
+┌──────────────┬──────────────────────┬────────────────┬──────────────┬──────────────┬──────────────────┬──────────────────┬──────────────┐
+│ Date         │ Model                │          Input │       Output │     Cache Wr │         Cache Rd │            Total │         Cost │
+├──────────────┼──────────────────────┼────────────────┼──────────────┼──────────────┼──────────────────┼──────────────────┼──────────────┤
+│ 2026-03-09   │ ● 3-7-sonnet         │          1,800 │          150 │          200 │              100 │            2,250 │      $0.0084 │
+│              │ ● gpt-5.4            │            400 │          120 │            - │            2,000 │            2,520 │      $0.0033 │
+│              │ Day Total            │          2,200 │          270 │          200 │            2,100 │            4,770 │        $0.01 │
+├──────────────┼──────────────────────┼────────────────┼──────────────┼──────────────┼──────────────────┼──────────────────┼──────────────┤
+│ Total        │                      │          2,200 │          270 │          200 │            2,100 │            4,770 │        $0.01 │
+└──────────────┴──────────────────────┴────────────────┴──────────────┴──────────────┴──────────────────┴──────────────────┴──────────────┘
+
+  ● Claude   ● OpenAI Codex
+  Input = non-cached only | Cache Wr = Claude only (no cost for OpenAI)
+

```

**Documentation:**

```diff
--- /dev/null
+++ b/tests/fixtures/cache-hit/expected/fresh.txt.md
@@ -0,0 +1,4 @@
+# tests/fixtures/cache-hit/expected/fresh.txt
+
+This golden captures the post-refresh report for the cache-hit scenario.
+It demonstrates that --fresh rebuilds from fixture sources instead of reusing the warm-cache snapshot. (ref: DL-003)

```


**CC-M-001-016** (tests/fixtures/cache-fallback/bin/ccusage) - implements CI-M-001-002

**Code:**

```diff
--- /dev/null
+++ b/tests/fixtures/cache-fallback/bin/ccusage
@@ -0,0 +1,8 @@
+#!/usr/bin/env node
+import { writeFileSync } from 'node:fs';
+
+if (process.env.CUSAGE_BACKGROUND_MARKER) {
+  writeFileSync(process.env.CUSAGE_BACKGROUND_MARKER, 'ccusage-called\n', 'utf8');
+}
+process.stderr.write('fixture failure\n');
+process.exit(1);

```

**Documentation:**

```diff
--- a/tests/fixtures/cache-fallback/bin/ccusage
+++ b/tests/fixtures/cache-fallback/bin/ccusage
@@ -1,6 +1,10 @@
 #!/usr/bin/env node
+// This stub fails deterministically so fallback coverage observes the same
+// refresh-error path on every machine. (ref: DL-003)
 import { writeFileSync } from 'node:fs';
 
+// The marker proves PATH isolation resolves the fixture-local binary
+// during background refresh work. (ref: DL-005)
 if (process.env.CUSAGE_BACKGROUND_MARKER) {
   writeFileSync(process.env.CUSAGE_BACKGROUND_MARKER, 'ccusage-called\n', 'utf8');
 }

```


**CC-M-001-017** (tests/fixtures/cache-fallback/cache/cache-v4.json) - implements CI-M-001-001

**Code:**

```diff
--- /dev/null
+++ b/tests/fixtures/cache-fallback/cache/cache-v4.json
@@ -0,0 +1,48 @@
+{
+  "version": 4,
+  "claude": {
+    "commands": {
+      "daily::--offline": {
+        "fingerprint": "stale-fingerprint",
+        "updatedAt": "2026-03-10T10:15:00.000Z",
+        "data": {
+          "daily": [
+            {
+              "date": "2026-03-10",
+              "totalCost": 0.0042,
+              "modelBreakdowns": [
+                {
+                  "modelName": "claude-3-7-sonnet-20250219",
+                  "inputTokens": 900,
+                  "outputTokens": 94,
+                  "cacheCreationTokens": 0,
+                  "cacheReadTokens": 300,
+                  "cost": 0.0042
+                }
+              ]
+            }
+          ],
+          "monthly": [
+            {
+              "month": "2026-03",
+              "totalCost": 0.0042,
+              "modelBreakdowns": [
+                {
+                  "modelName": "claude-3-7-sonnet-20250219",
+                  "inputTokens": 900,
+                  "outputTokens": 94,
+                  "cacheCreationTokens": 0,
+                  "cacheReadTokens": 300,
+                  "cost": 0.0042
+                }
+              ]
+            }
+          ]
+        }
+      }
+    }
+  },
+  "codex": {
+    "files": {}
+  }
+}

```

**Documentation:**

```diff
--- /dev/null
+++ b/tests/fixtures/cache-fallback/cache/cache-v4.json.md
@@ -0,0 +1,4 @@
+# tests/fixtures/cache-fallback/cache/cache-v4.json
+
+This cache snapshot is the fallback source when the stubbed Claude refresh fails.
+Keeping the cached daily and monthly totals explicit makes fallback behavior testable without live provider state. (ref: DL-003)

```


**CC-M-001-018** (tests/fixtures/cache-fallback/claude-home/projects/project-a/session.jsonl) - implements CI-M-001-001

**Code:**

```diff
--- /dev/null
+++ b/tests/fixtures/cache-fallback/claude-home/projects/project-a/session.jsonl
@@ -0,0 +1,1 @@
+{"session":"claude-fallback"}

```

**Documentation:**

```diff
--- /dev/null
+++ b/tests/fixtures/cache-fallback/claude-home/projects/project-a/session.jsonl.md
@@ -0,0 +1,4 @@
+# tests/fixtures/cache-fallback/claude-home/projects/project-a/session.jsonl
+
+This placeholder Claude session keeps the fallback scenario fingerprintable without extra live data.
+The content stays minimal because isolation depends on file presence and stats, not semantic session replay. (ref: DL-005)

```


**CC-M-001-019** (tests/fixtures/cache-fallback/codex-home/sessions/2026/03/root-session.jsonl) - implements CI-M-001-001

**Code:**

```diff
--- /dev/null
+++ b/tests/fixtures/cache-fallback/codex-home/sessions/2026/03/root-session.jsonl
@@ -0,0 +1,3 @@
+{"type": "session_meta", "payload": {"timestamp": "2026-03-10T10:00:00.000Z", "id": "fallback-root"}}
+{"type": "turn_context", "payload": {"model": "gpt-5.1"}}
+{"type": "event_msg", "payload": {"type": "token_count", "info": {"metadata": {"service_tier": "flex"}, "total_token_usage": {"input_tokens": 600, "cached_input_tokens": 200, "output_tokens": 60, "reasoning_output_tokens": 5, "total_tokens": 660}}}}

```

**Documentation:**

```diff
--- /dev/null
+++ b/tests/fixtures/cache-fallback/codex-home/sessions/2026/03/root-session.jsonl.md
@@ -0,0 +1,4 @@
+# tests/fixtures/cache-fallback/codex-home/sessions/2026/03/root-session.jsonl
+
+This Codex session keeps mixed-provider output present while Claude data falls back to cache.
+The fixture proves fallback handling does not bypass direct Codex parsing or the baseline model labels. (ref: DL-003) (ref: DL-007)

```


**CC-M-001-020** (tests/fixtures/cache-fallback/expected/stderr.txt) - implements CI-M-001-001

**Code:**

```diff
--- /dev/null
+++ b/tests/fixtures/cache-fallback/expected/stderr.txt
@@ -0,0 +1,2 @@
+Loading data...
+Claude refresh failed; using cached data.

```

**Documentation:**

```diff
--- /dev/null
+++ b/tests/fixtures/cache-fallback/expected/stderr.txt.md
@@ -0,0 +1,4 @@
+# tests/fixtures/cache-fallback/expected/stderr.txt
+
+This golden freezes the user-visible stderr path for refresh failure with cached fallback.
+The note lives beside the snapshot because assertion normalization strips transport noise, not message content. (ref: DL-003) (ref: DL-006)

```


**CC-M-001-021** (tests/support/run-cli.mjs) - implements CI-M-001-003

**Code:**

```diff
--- /dev/null
+++ b/tests/support/run-cli.mjs
@@ -0,0 +1,132 @@
+import { spawn } from 'node:child_process';
+import { chmodSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import process from 'node:process';
+import { fileURLToPath } from 'node:url';
+
+const SUPPORT_DIR = path.dirname(fileURLToPath(import.meta.url));
+const TESTS_DIR = path.resolve(SUPPORT_DIR, '..');
+const REPO_ROOT = path.resolve(TESTS_DIR, '..');
+const FIXTURE_ROOT = path.join(TESTS_DIR, 'fixtures');
+
+export function readFixtureManifest() {
+  return JSON.parse(readFileSync(path.join(FIXTURE_ROOT, 'manifest.json'), 'utf8'));
+}
+
+export function readFixtureText(scenario, ...parts) {
+  return readFileSync(resolveFixturePath(scenario, ...parts), 'utf8');
+}
+
+function resolveFixturePath(scenario, ...parts) {
+  return path.join(FIXTURE_ROOT, scenario, ...parts);
+}
+
+function copyScenarioTree(scenario) {
+  const scratchRoot = mkdtempSync(path.join(tmpdir(), 'cusage-fixture-'));
+  const runtimeRoot = path.join(scratchRoot, scenario);
+  cpSync(resolveFixturePath(scenario), runtimeRoot, { recursive: true });
+
+  const ccusagePath = path.join(runtimeRoot, 'bin', 'ccusage');
+  if (existsSync(ccusagePath)) chmodSync(ccusagePath, 0o755);
+
+  return { scratchRoot, runtimeRoot };
+}
+
+function rewriteCodexCacheFiles(files, runtimeRoot) {
+  const rewritten = {};
+
+  for (const [sourcePath, entry] of Object.entries(files || {})) {
+    const actualPath = sourcePath.includes('__SCENARIO_ROOT__')
+      ? sourcePath.replaceAll('__SCENARIO_ROOT__', runtimeRoot)
+      : path.join(runtimeRoot, sourcePath);
+    const stats = statSync(actualPath);
+
+    rewritten[actualPath] = {
+      ...entry,
+      mtimeMs: Math.trunc(stats.mtimeMs),
+      size: stats.size,
+    };
+  }
+
+  return rewritten;
+}
+
+function seedCacheFile(scenarioMeta, runtimeRoot, cachePath) {
+  if (!scenarioMeta.cacheTemplate) return;
+
+  const template = JSON.parse(readFileSync(path.join(runtimeRoot, scenarioMeta.cacheTemplate), 'utf8'));
+  if (template.codex?.files) {
+    // Hydrate placeholder cache keys against the copied scenario tree so cache hits stay deterministic.
+    template.codex.files = rewriteCodexCacheFiles(template.codex.files, runtimeRoot);
+  }
+
+  writeFileSync(cachePath, JSON.stringify(template), 'utf8');
+}
+
+export async function runFixtureCli(args = [], options = {}) {
+  const scenario = options.scenario ?? 'baseline';
+  const manifest = readFixtureManifest();
+  const scenarioMeta = manifest[scenario];
+  if (!scenarioMeta) throw new Error(`Unknown fixture scenario: ${scenario}`);
+
+  const { scratchRoot, runtimeRoot } = copyScenarioTree(scenario);
+  const cachePath = options.cachePath ?? path.join(scratchRoot, 'cache-v4.json');
+  seedCacheFile(scenarioMeta, runtimeRoot, cachePath);
+
+  const fixtureBinDir = path.join(runtimeRoot, 'bin');
+  // Keep PATH fixture-scoped while still resolving /usr/bin/env node in the local ccusage stub.
+  const isolatedPath = `${fixtureBinDir}${path.delimiter}${path.dirname(process.execPath)}`;
+  const env = {
+    ...process.env,
+    ...options.env,
+    HOME: scratchRoot,
+    CLAUDE_HOME: path.join(runtimeRoot, 'claude-home'),
+    CODEX_HOME: path.join(runtimeRoot, 'codex-home'),
+    CUSAGE_CACHE_PATH: cachePath,
+    CCUSAGE_FIXTURE_PATH: path.join(runtimeRoot, scenarioMeta.claudeReport ?? 'claude', 'report.json'),
+    PATH: isolatedPath,
+  };
+
+  // Always invoke the published CLI entrypoint so fixtures protect packaged behavior first.
+  const child = spawn(process.execPath, [path.join(REPO_ROOT, 'bin', 'cusage.mjs'), ...args], {
+    cwd: REPO_ROOT,
+    env,
+    stdio: ['ignore', 'pipe', 'pipe'],
+  });
+
+  let stdout = '';
+  let stderr = '';
+  child.stdout.on('data', (chunk) => {
+    stdout += chunk;
+  });
+  child.stderr.on('data', (chunk) => {
+    stderr += chunk;
+  });
+
+  const exitCode = await new Promise((resolve, reject) => {
+    child.on('error', reject);
+    child.on('close', resolve);
+  });
+
+  return {
+    scenario,
+    runtimeRoot,
+    cachePath,
+    exitCode,
+    stdout,
+    stderr,
+    cacheJson: readJsonIfPresent(cachePath),
+    cleanup() {
+      rmSync(scratchRoot, { recursive: true, force: true });
+    },
+  };
+}
+
+function readJsonIfPresent(file) {
+  try {
+    return JSON.parse(readFileSync(file, 'utf8'));
+  } catch {
+    return null;
+  }
+}

```

**Documentation:**

```diff
--- a/tests/support/run-cli.mjs
+++ b/tests/support/run-cli.mjs
@@ -5,11 +5,15 @@
 import process from 'node:process';
 import { fileURLToPath } from 'node:url';
 
+// These helpers execute bin/cusage.mjs through fixture-scoped homes so the
+// packaged CLI contract stays pinned at the published entrypoint. (ref: DL-001)
 const SUPPORT_DIR = path.dirname(fileURLToPath(import.meta.url));
 const TESTS_DIR = path.resolve(SUPPORT_DIR, '..');
 const REPO_ROOT = path.resolve(TESTS_DIR, '..');
 const FIXTURE_ROOT = path.join(TESTS_DIR, 'fixtures');
 
+// The manifest is a checked-in scenario index, which keeps every behavior branch
+// reproducible from fixture assets alone. (ref: DL-002)
 export function readFixtureManifest() {
   return JSON.parse(readFileSync(path.join(FIXTURE_ROOT, 'manifest.json'), 'utf8'));
 }
@@ -33,6 +37,8 @@
   return { scratchRoot, runtimeRoot };
 }
 
+// Cached Codex summaries key off copied file paths and stats, so placeholder keys
+// hydrate against the scratch tree instead of the source fixture root. (ref: DL-005)
 function rewriteCodexCacheFiles(files, runtimeRoot) {
   const rewritten = {};
 
@@ -52,6 +58,8 @@
   return rewritten;
 }
 
+// Scenario cache templates seed fast and fallback branches without touching the
+// caller cache directory or runtime semantics. (ref: DL-003) (ref: DL-005)
 function seedCacheFile(scenarioMeta, runtimeRoot, cachePath) {
   if (!scenarioMeta.cacheTemplate) return;
 
@@ -64,6 +72,8 @@
   writeFileSync(cachePath, JSON.stringify(template), 'utf8');
 }
 
+// runFixtureCli spawns the published CLI with scratch HOME, PATH, and provider
+// roots so node:test observes the same contract that users install. (ref: DL-001)
 export async function runFixtureCli(args = [], options = {}) {
   const scenario = options.scenario ?? 'baseline';
   const manifest = readFixtureManifest();
@@ -75,6 +85,8 @@
   seedCacheFile(scenarioMeta, runtimeRoot, cachePath);
 
   const fixtureBinDir = path.join(runtimeRoot, 'bin');
+  // PATH starts with the fixture-local ccusage stub and the active Node binary,
+  // so the harness never resolves a globally installed ccusage. (ref: DL-002) (ref: DL-005)
   // Keep PATH fixture-scoped while still resolving /usr/bin/env node in the local ccusage stub.
   const isolatedPath = `${fixtureBinDir}${path.delimiter}${path.dirname(process.execPath)}`;
   const env = {
@@ -88,6 +100,8 @@
     PATH: isolatedPath,
   };
 
+  // Spawning the entrypoint by path keeps the published CLI boundary under test
+  // instead of bypassing bin/cusage.mjs. (ref: DL-001)
   // Always invoke the published CLI entrypoint so fixtures protect packaged behavior first.
   const child = spawn(process.execPath, [path.join(REPO_ROOT, 'bin', 'cusage.mjs'), ...args], {
     cwd: REPO_ROOT,

```


**CC-M-001-022** (tests/fixtures/README.md)

**Documentation:**

```diff
--- /dev/null
+++ b/tests/fixtures/README.md
@@ -0,0 +1,15 @@
+# tests/fixtures
+
+These scenarios treat the packaged CLI as a black-box regression boundary at the published entrypoint. (ref: DL-001)
+
+## Scenario roles
+
+- baseline: merged daily, monthly, breakdown, and provider-filter goldens.
+- cache-hit: warm-cache, fresh rebuild, and refresh-marker behavior.
+- cache-fallback: refresh failure with cached Claude data and deterministic stderr.
+
+## Invariants
+
+- Scenario assets stay checked in so every branch replays deterministically. (ref: DL-002)
+- PATH, HOME, CLAUDE_HOME, CODEX_HOME, and CUSAGE_CACHE_PATH stay fixture-scoped. (ref: DL-005)
+- Baseline selectors, Codex parsing, and family de-overlap stay fixed across fixture scenarios. (ref: DL-007)

```


### Milestone 2: Fixture-Backed Regression Suites

**Files**: tests/e2e/fixture-report.test.mjs, tests/e2e/cache-mode.test.mjs, tests/support/normalize-output.mjs, tests/fixtures/baseline/expected/daily.txt, tests/fixtures/baseline/expected/monthly.txt, tests/fixtures/baseline/expected/breakdown.txt, tests/fixtures/cache-hit/expected/fresh.txt, tests/fixtures/cache-fallback/expected/stderr.txt

**Requirements**:

- Pin daily monthly breakdown and provider-filter table output against checked-in report goldens loaded from tests/fixtures/*/expected/*.txt
- Assert cache-first fast mode fresh rebuild Claude cache fallback and non-interactive no-detach behavior through stdout stderr cache JSON and background marker side effects
- Centralize ANSI escape and line-ending normalization in a test-only helper so fixture goldens stay stable without changing shipped CLI output

**Acceptance Criteria**:

- node --test passes with fixture-report and cache-mode suites plus shared normalization support
- Checked-in report and cache stderr goldens cover mixed Claude plus Codex output for daily monthly breakdown fresh and fallback runs through the packaged CLI
- Non-interactive --fast leaves no detached refresh side effect while fresh and fallback scenarios remain observable through deterministic cache and stderr artifacts

**Tests**:

- integration normalized report goldens
- integration cache-state and no-detach regressions

#### Code Intent

- **CI-M-002-001** `tests/e2e/fixture-report.test.mjs::fixture report suite`: Load checked-in report goldens from tests/fixtures/*/expected/*.txt then compare ANSI-stripped newline-normalized daily monthly breakdown and provider-filter CLI output so selector behavior formatting and totals stay stable while the CLI is later refactored. (refs: DL-001, DL-002, DL-006, DL-007)
- **CI-M-002-002** `tests/e2e/cache-mode.test.mjs::cache mode suite`: Exercise warm-cache fast mode fresh rebuild Claude fallback and non-interactive no-detach paths by asserting stdout stderr cache JSON and refresh marker side effects from the packaged CLI so cache semantics remain externally observable before architecture changes. (refs: DL-001, DL-003, DL-005, DL-007)
- **CI-M-002-003** `tests/support/normalize-output.mjs::normalizeCliOutput`: Provide test-only helpers that strip ANSI escapes and normalize line endings before golden comparisons so checked-in report and cache stderr artifacts stay portable without changing shipped CLI formatting. (refs: DL-002, DL-006)

#### Code Changes

**CC-M-002-001** (tests/e2e/fixture-report.test.mjs) - implements CI-M-002-001

**Code:**

```diff
--- /dev/null
+++ b/tests/e2e/fixture-report.test.mjs
@@ -0,0 +1,58 @@
+import assert from 'node:assert/strict';
+import test from 'node:test';
+
+import { readFixtureText, runFixtureCli } from '../support/run-cli.mjs';
+import { normalizeCliOutput } from '../support/normalize-output.mjs';
+
+async function collectNormalizedRun(args = [], options = {}) {
+  const run = await runFixtureCli(args, options);
+  return {
+    run,
+    stdout: normalizeCliOutput(run.stdout),
+    stderr: normalizeCliOutput(run.stderr),
+  };
+}
+
+test('daily fixture report matches the checked-in golden', async () => {
+  const { run, stdout } = await collectNormalizedRun();
+  try {
+    assert.equal(run.exitCode, 0);
+    assert.equal(stdout, normalizeCliOutput(readFixtureText('baseline', 'expected', 'daily.txt')));
+  } finally {
+    run.cleanup();
+  }
+});
+
+test('monthly fixture report matches the checked-in golden', async () => {
+  const { run, stdout } = await collectNormalizedRun(['monthly']);
+  try {
+    assert.equal(run.exitCode, 0);
+    assert.equal(stdout, normalizeCliOutput(readFixtureText('baseline', 'expected', 'monthly.txt')));
+  } finally {
+    run.cleanup();
+  }
+});
+
+test('breakdown fixture report matches the checked-in golden', async () => {
+  const { run, stdout } = await collectNormalizedRun(['--breakdown']);
+  try {
+    assert.equal(run.exitCode, 0);
+    assert.equal(stdout, normalizeCliOutput(readFixtureText('baseline', 'expected', 'breakdown.txt')));
+  } finally {
+    run.cleanup();
+  }
+});
+
+test('provider filter keeps the Codex-only selector stable', async () => {
+  const { run, stdout, stderr } = await collectNormalizedRun(['--providers', 'codex']);
+  try {
+    assert.equal(run.exitCode, 0);
+    assert.equal(stderr, 'Loading data...');
+    assert.match(stdout, /2026-03-07/);
+    assert.match(stdout, /gpt-5\.4 \(priority\)/);
+    assert.match(stdout, /\$0\.0030/);
+    assert.doesNotMatch(stdout, /3-7-sonnet/);
+  } finally {
+    run.cleanup();
+  }
+});

```

**Documentation:**

```diff
--- a/tests/e2e/fixture-report.test.mjs
+++ b/tests/e2e/fixture-report.test.mjs
@@ -1,9 +1,13 @@
 import assert from 'node:assert/strict';
 import test from 'node:test';
 
+// These black-box goldens pin the shipped CLI contract at the published
+// entrypoint alongside the source-extraction tests. (ref: DL-001) (ref: DL-004)
 import { readFixtureText, runFixtureCli } from '../support/run-cli.mjs';
 import { normalizeCliOutput } from '../support/normalize-output.mjs';
 
+// Assertion-side normalization removes transport noise without redefining the
+// rendered report contract that users see in the terminal. (ref: DL-006)
 async function collectNormalizedRun(args = [], options = {}) {
   const run = await runFixtureCli(args, options);
   return {
@@ -43,6 +47,8 @@
   }
 });
 
+// This selector check pins the Codex-only provider path and merged-model
+// labels encoded in the baseline output. (ref: DL-007)
 test('provider filter keeps the Codex-only selector stable', async () => {
   const { run, stdout, stderr } = await collectNormalizedRun(['--providers', 'codex']);
   try {

```


**CC-M-002-002** (tests/e2e/cache-mode.test.mjs) - implements CI-M-002-002

**Code:**

```diff
--- /dev/null
+++ b/tests/e2e/cache-mode.test.mjs
@@ -0,0 +1,89 @@
+import assert from 'node:assert/strict';
+import { existsSync, readFileSync, rmSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import test from 'node:test';
+
+import { readFixtureText, runFixtureCli } from '../support/run-cli.mjs';
+import { normalizeCliOutput } from '../support/normalize-output.mjs';
+
+function makeMarkerPath() {
+  return path.join(
+    tmpdir(),
+    `cusage-background-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.marker`,
+  );
+}
+
+test('fast mode serves the warm cache snapshot before live refresh work', async () => {
+  const { stdout, stderr, cacheJson, exitCode, cleanup } = await runFixtureCli(['--fast'], { scenario: 'cache-hit' });
+  try {
+    assert.equal(exitCode, 0);
+    assert.equal(normalizeCliOutput(stderr), 'Loading data from cache-first mode...\nUsing stale Claude cache (--fast).');
+    assert.match(normalizeCliOutput(stdout), /2026-03-08/);
+    assert.equal(cacheJson?.claude?.commands?.['daily::--offline']?.data?.daily?.[0]?.date, '2026-03-08');
+    assert.equal(cacheJson?.codex?.files && Object.keys(cacheJson.codex.files).length, 1);
+  } finally {
+    cleanup();
+  }
+});
+
+test('fresh mode rebuilds the cache-hit fixture from source data', async () => {
+  const { stdout, cacheJson, exitCode, cleanup } = await runFixtureCli(['--fresh'], { scenario: 'cache-hit' });
+  try {
+    assert.equal(exitCode, 0);
+    assert.equal(normalizeCliOutput(stdout), normalizeCliOutput(readFixtureText('cache-hit', 'expected', 'fresh.txt')));
+    assert.equal(cacheJson?.claude?.commands?.['daily::--offline']?.data?.daily?.[0]?.date, '2026-03-09');
+    const [codexPath] = Object.keys(cacheJson?.codex?.files ?? {});
+    assert.match(codexPath, /cache-hit[\/].*root-session\.jsonl$/);
+    assert.equal(cacheJson?.codex?.files?.[codexPath]?.summary?.output, 120);
+  } finally {
+    cleanup();
+  }
+});
+
+test('non-interactive fast mode never detaches the background refresh helper', async () => {
+  const markerPath = makeMarkerPath();
+  rmSync(markerPath, { force: true });
+
+  const { exitCode, cleanup } = await runFixtureCli(['--fast'], {
+    scenario: 'cache-hit',
+    env: { CUSAGE_BACKGROUND_MARKER: markerPath },
+  });
+
+  try {
+    assert.equal(exitCode, 0);
+    assert.equal(existsSync(markerPath), false);
+  } finally {
+    cleanup();
+    rmSync(markerPath, { force: true });
+  }
+});
+
+test('explicit background refresh runs leave a marker through the ccusage stub', async () => {
+  const markerPath = makeMarkerPath();
+  rmSync(markerPath, { force: true });
+
+  // Use the internal flag directly so the suite can prove refresh side effects without a TTY harness.
+  const { exitCode, cleanup } = await runFixtureCli(['--fresh', '--background-refresh'], {
+    scenario: 'cache-hit',
+    env: { CUSAGE_BACKGROUND_MARKER: markerPath },
+  });
+
+  try {
+    assert.equal(exitCode, 0);
+    assert.equal(readFileSync(markerPath, 'utf8'), 'ccusage-called\n');
+  } finally {
+    cleanup();
+    rmSync(markerPath, { force: true });
+  }
+});
+
+test('Claude cache fallback keeps stderr deterministic when refresh fails', async () => {
+  const { stderr, exitCode, cleanup } = await runFixtureCli([], { scenario: 'cache-fallback' });
+  try {
+    assert.equal(exitCode, 0);
+    assert.equal(normalizeCliOutput(stderr), normalizeCliOutput(readFixtureText('cache-fallback', 'expected', 'stderr.txt')));
+  } finally {
+    cleanup();
+  }
+});

```

**Documentation:**

```diff
--- a/tests/e2e/cache-mode.test.mjs
+++ b/tests/e2e/cache-mode.test.mjs
@@ -4,9 +4,13 @@
 import path from 'node:path';
 import test from 'node:test';
 
+// Cache-mode coverage observes stdout, stderr, cache JSON, and marker files so
+// regressions stay visible without adding runtime-only seams. (ref: DL-003)
 import { readFixtureText, runFixtureCli } from '../support/run-cli.mjs';
 import { normalizeCliOutput } from '../support/normalize-output.mjs';
 
+// Marker files live in tmp space so refresh assertions stay isolated from user
+// state while still proving fixture-local PATH execution. (ref: DL-005)
 function makeMarkerPath() {
   return path.join(
     tmpdir(),
@@ -59,6 +63,8 @@
   }
 });
 
+// The internal flag provides an observable refresh side effect without a
+// TTY-specific harness. (ref: DL-003)
 test('explicit background refresh runs leave a marker through the ccusage stub', async () => {
   const markerPath = makeMarkerPath();
   rmSync(markerPath, { force: true });

```


**CC-M-002-003** (tests/support/normalize-output.mjs) - implements CI-M-002-003

**Code:**

```diff
--- /dev/null
+++ b/tests/support/normalize-output.mjs
@@ -0,0 +1,8 @@
+const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;
+
+export function normalizeCliOutput(text) {
+  return String(text ?? '')
+    .replace(/\r\n/g, '\n')
+    .replace(ANSI_PATTERN, '')
+    .trimEnd();
+}

```

**Documentation:**

```diff
--- a/tests/support/normalize-output.mjs
+++ b/tests/support/normalize-output.mjs
@@ -1,5 +1,7 @@
 const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;
 
+// Output normalization lives in test helpers only, which keeps shipped ANSI styling
+// and box drawing intact while goldens stay stable across terminals. (ref: DL-006)
 export function normalizeCliOutput(text) {
   return String(text ?? '')
     .replace(/\r\n/g, '\n')

```


**CC-M-002-004** (tests/e2e/README.md)

**Documentation:**

```diff
--- /dev/null
+++ b/tests/e2e/README.md
@@ -0,0 +1,7 @@
+# tests/e2e
+
+These suites complement the existing source-extraction tests instead of replacing them. (ref: DL-004)
+
+- fixture-report.test.mjs locks rendered reports and provider filters through the published CLI. (ref: DL-001)
+- cache-mode.test.mjs covers fast, fresh, fallback, and no-detach semantics through external side effects. (ref: DL-003)
+- Output normalization lives in assertions only so runtime formatting stays unchanged. (ref: DL-006)

```

