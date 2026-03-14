# CLAUDE.md

## Overview

This directory contains deterministic scenario assets and golden outputs for the packaged CLI regression harness.

## Index

| File | Contents (WHAT) | Read When (WHEN) |
| --- | --- | --- |
| `CLAUDE.md` | Directory index and scenario routing | Orienting in `tests/fixtures/` |
| `README.md` | Fixture roles and harness invariants | Understanding why scenarios stay checked in and isolated |
| `baseline/` | Mixed Claude and Codex source fixtures plus rendered report goldens | Updating default report, breakdown, or provider-filter baselines |
| `cache-fallback/` | Failing refresh inputs, seeded cache, and deterministic stderr golden | Changing fallback behavior or cache-error messaging |
| `cache-hit/` | Warm-cache source fixtures, seeded cache, and fresh-mode golden | Changing `--fast`, `--fresh`, or background refresh expectations |
| `manifest.json` | Scenario catalog for fixture selection and per-scenario metadata | Adding, renaming, or rewiring fixture scenarios |
