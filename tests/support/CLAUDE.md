# CLAUDE.md

## Overview

This directory contains shared helpers for running the packaged CLI under fixtures and normalizing outputs.

## Index

| File | Contents (WHAT) | Read When (WHEN) |
| --- | --- | --- |
| `CLAUDE.md` | Directory index and helper routing | Orienting in `tests/support/` |
| `normalize-output.mjs` | ANSI and line-ending normalization helper | Changing golden comparison rules without altering shipped output |
| `run-cli.mjs` | Fixture runner, scratch isolation, cache seeding, and CLI process capture | Changing how end-to-end tests launch `bin/cusage.mjs` or isolate host state |
