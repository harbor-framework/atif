# `atif` — Python SDK for ATIF

> [!NOTE]
> **Status (`2.0.0.dev0` Skeleton)**: This directory is currently a minimal package skeleton establishing packaging, linting, type checking, and CI conventions. The full Python SDK implementation will be designed and built as Harbor's existing ATIF v1.x code is extracted and upgraded for ATIF v2.0.

## Planned Scope

1. **Extract Harbor's existing ATIF v1.x implementation** (`src/harbor/models/trajectories/*`, `trajectory_validator.py`, and `trajectory_utils.py`) into this standalone package so Harbor and external tools can depend on `atif` directly. See [`PORTING.md`](./PORTING.md) for the complete source inventory.
2. **Full ATIF v2.0 support** aligned with [`spec/v2.0/SPEC.md`](../../spec/v2.0/SPEC.md):
   - Pydantic v2 models for dual-mode NDJSON (`events` / `.atif-e.jsonl` and `trajectories` / `.atif.jsonl`), sessions, lineage, branches, unified `Action` records, canonical action schemas, compaction, citations, blobs, and extensions.
   - Streaming NDJSON readers and writers.
   - Event-to-trajectory consolidation (`.atif-e.jsonl` → `.atif.jsonl`).
   - Automatic format/version detection and v1.x → v2.0 migration helpers.
   - Full conformance verification against [`conformance/manifest.json`](../../conformance/manifest.json).

## Pre-Publish Note (PyPI Package Ownership)

Before publishing the first release of `atif` to PyPI from this repository, maintainers must confirm PyPI publisher access for the `atif` distribution name with the Harbor maintainers (a community package `atif==1.8.0` currently exists on PyPI under `bolu61/python-atif`).

## Local Development

Requires Python `>=3.12` and [`uv`](https://docs.astral.sh/uv/).

```bash
cd sdks/python

# Install package and dev dependencies
uv sync --dev

# Lint and format check
uv run ruff check .
uv run ruff format --check .

# Static type check
uv run ty check

# Run tests
uv run pytest
```
