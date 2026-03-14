# CLAUDE.md

## Overview

This directory contains black-box suites that spawn the published CLI against checked-in fixtures.

## Index

| File | Contents (WHAT) | Read When (WHEN) |
| --- | --- | --- |
| `CLAUDE.md` | Directory index and suite routing | Orienting in `tests/e2e/` |
| `README.md` | Harness scope and suite roles | Understanding what each end-to-end suite proves |
| `cache-mode.test.mjs` | Cache-hit, fallback, refresh-marker, and no-detach regressions | Changing fast, fresh, fallback, or background-refresh behavior |
| `fixture-report.test.mjs` | Daily, monthly, breakdown, and provider-filter golden regressions | Changing rendered report output or selector behavior |
