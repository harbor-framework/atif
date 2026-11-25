---
title: SDKs & Tooling
description: Current status of the standalone atif Python SDK skeleton, planned Go and TypeScript SDKs, Buf Protobuf codegen, and the language-agnostic conformance suite.
sidebar:
  order: 3
---

ATIF is designed as a language-agnostic specification backed by machine-readable schemas and a shared conformance suite. This page documents what is shipping today in `harbor-framework/atif` and what is on the SDK and CLI roadmap.

## Component Status Matrix

| Component | Location | Status | Highlights |
| :--- | :--- | :--- | :--- |
| **JSON Schema 2020-12** | `spec/v2.0/schema/*.schema.json` | **Available** | Validates every `AtifRecord` line, all `CanonicalAction` variants, `Action.executor`, `EventBranch`, blobs, and extensions. |
| **Protocol Buffers (`proto3`)** | `spec/v2.0/schema/atif.proto` | **Available** | 1:1 wire schema with `buf.yaml`; passes `buf lint` and `buf build` cleanly for multi-language codegen. |
| **Warehouse SQL DDL** | `spec/v2.0/schema/warehouse.sql` | **Available** | Normalized 6-table BigQuery / DuckDB DDL validated via `sqlglot`. |
| **Conformance Suite** | `conformance/` | **Available** | Language-agnostic valid/invalid fixtures for v1.x and v2.0 plus deterministic consolidation golden pairs. |
| **Web Validator & Explorer** | [`/validator/`](/validator/) | **Available** | Zero-backend client-side Ajv Draft 2020-12 validator and interactive visual trajectory explorer. |
| **Python SDK (`atif`)** | `sdks/python/` | **Package Skeleton (`2.0.0.dev0`)** | Installable `uv_build` package ready for Harbor ATIF extraction and v2.0 model/consolidator implementation. |
| **Go SDK** | `sdks/go/` *(planned)* | **Planned** | Streaming NDJSON ingest, consolidation, and `atif.proto` bindings for high-throughput backends. |
| **TypeScript SDK** | `sdks/typescript/` *(planned)* | **Planned** | Browser/Node types, Ajv schema validation, and viewer utilities. |
| **Standalone `atif` CLI** | `tools/cli/` *(planned)* | **Planned** | `validate`, `consolidate`, `upgrade`, `downgrade`, and `inspect` commands. |

---

## Python SDK (`sdks/python/`)

The standalone Python distribution **`atif`** lives in [`sdks/python/`](https://github.com/harbor-framework/atif/tree/main/sdks/python). Right now it is intentionally a **minimal package skeleton** (`version = "2.0.0.dev0"`, Python `>= 3.12`, `uv_build`, `pydantic >= 2.14.0`, PEP 561 `py.typed`) with CI linting (`ruff`), type checking (`ty`), and smoke tests (`pytest`).

### Planned Extraction & v2.0 Roadmap

Rather than inventing throwaway model stubs, the Python SDK will be populated in two focused milestones (tracked in [`sdks/python/PORTING.md`](https://github.com/harbor-framework/atif/blob/main/sdks/python/PORTING.md)):

1. **Extract Harbor's Existing ATIF v1.x Code**: Port Harbor's battle-tested models (`src/harbor/models/trajectories/*`), validator (`trajectory_validator.py`), utilities (`trajectory_utils.py`), and unit tests into `atif` so Harbor and third-party Python projects share one standalone dependency.
2. **Add Full ATIF v2.0 Support**:
   - Strongly typed Pydantic v2 models for `AtifRecord`, `AtifEventsDocument`, `AtifTrajectoriesDocument`, `Action`, and all `CanonicalAction` variants.
   - Automatic format detection (`v1.x` JSON vs `v2.0` `events` / `trajectories`).
   - Reference implementation of the 3-phase Stream Consolidation Algorithm (`.atif-e.jsonl` → `.atif.jsonl` / `.atif.tar.zst`).
   - Lossless `upgrade_v1_to_v2` and `downgrade_v2_to_v1` converters.
   - Automated conformance runner executing every fixture in `conformance/manifest.json`.

### Local Development Commands

```bash
cd sdks/python
uv sync --dev
uv run ruff check .
uv run ruff format --check .
uv run ty check
uv run pytest
```

---

## Protobuf Code Generation with Buf

If you are building in **Go, Rust, Java, C++, Python, or TypeScript** today, you can generate wire-compatible types immediately from [`spec/v2.0/schema/atif.proto`](/schema/v2.0/atif.proto) using [Buf](https://buf.build/):

```bash
cd spec/v2.0/schema
npx @bufbuild/buf lint
npx @bufbuild/buf build
```

Because `atif.proto` ships with a `buf.yaml` configuration and maps 1:1 to the ATIF v2.0 JSON wire format, any language supported by `buf generate` gets strongly typed messages for `AtifRecord`, `DocumentMeta`, `Session`, `Trajectory`, `Step`, `Action`, `CanonicalAction`, and `TrajectoryEvent`.

:::caution[Proto3 JSON Serialization Rules]
When reading or writing NDJSON via Proto3 JSON (`protojson`), always configure **`preserving_proto_field_names = true`** so fields serialize in `snake_case`. Because standard `protojson` encoders quote `int64` values as decimal strings (e.g. `"1200"`), ATIF JSON consumers should leniently accept string-encoded integers alongside JSON numbers. See [Wire & Warehouse Projections](/spec/v2.0/references/projections/).
:::

---

## Planned Go, TypeScript, & CLI Tooling

The multi-language roadmap in [`sdks/README.md`](https://github.com/harbor-framework/atif/blob/main/sdks/README.md) prioritizes three additional deliverables once the Python SDK extraction lands:

- **Go SDK (`sdks/go/`)**: Backed by generated `atif.proto` packages (`github.com/harbor-framework/atif/proto/atif/v2`), focused on high-throughput stream ingestion, crash-tolerant `.atif-e.jsonl` reading, consolidation, and `.atif.tar.zst` archive packing.
- **TypeScript SDK (`sdks/typescript/`)**: Shared TypeScript interfaces matching `spec/v2.0/SPEC.md`, Ajv Draft 2020-12 validation helpers, and browser-ready trajectory tree builders for trace UIs.
- **Standalone CLI (`atif`)**: Single binary / CLI supporting `atif validate`, `atif consolidate`, `atif upgrade`, `atif downgrade`, and `atif inspect` (head-of-file `meta.manifest` summaries).

---

## Language-Agnostic Conformance Suite

Every SDK, validator, and converter — regardless of implementation language — should test against the shared suite in [`conformance/`](https://github.com/harbor-framework/atif/tree/main/conformance), indexed by `conformance/manifest.json`.

Each manifest entry declares `id`, `version` (`"1.x"` | `"2.0"`), `kind`, `path`, `expect_valid`, optional `expected_path`, and `description`:

| Conformance Kind | Coverage |
| :--- | :--- |
| **`v1_trajectory`** | Valid and invalid archival ATIF v1.0–v1.8 JSON trajectories (multimodal images, v1.7 embedded subagents, v1.8 audio, missing required fields, non-sequential `step_id`s). |
| **`v2_events`** | Valid and invalid `.atif-e.jsonl` streams: minimal sessions, `EventBranch` rewinds/root branches, parallel out-of-order tool results, multi-environment + `Action.executor`, canonical `file_write` / `file_delete` digests, `message_send` / `message_read`, blobs/truncation, compaction, plus negative cases (missing line-1 `meta`, invalid `executor`, malformed `Sha256Urn`). |
| **`v2_trajectories`** | Valid and invalid `.atif.jsonl` documents: single-trajectory standalone runs, multi-trajectory files with `meta.manifest`, `Step.agent_name`, `Step.citations`, `StepMetrics.duration_ms`, top-level `extension` rows, and invalid row/discriminator violations. |
| **`v2_consolidation`** | Deterministic golden `input.atif-e.jsonl` → `expected.atif.jsonl` pairs (`basic-session`, `branching-rewind`, and `parallel-tools-out-of-order`) verifying Phase 1 DAG linearization, Phase 2 turn folding, and Phase 3 derived fields. |

### Running the Reference Validation Scripts

The repository includes lightweight CI validation scripts under `scripts/` that check all spec frontmatter, JSON Schemas, examples, conformance fixtures, and BigQuery SQL DDL:

```bash
# 1. Validate YAML frontmatter, JSON Schema 2020-12, examples, and conformance suite
(cd scripts && npm ci && node validate-spec.mjs)

# 2. Validate BigQuery SQL DDL syntax via sqlglot
uv run --with sqlglot python3 scripts/validate-sql.py spec/v2.0/schema/warehouse.sql

# 3. Lint and build Protobuf schema
(cd spec/v2.0/schema && npx @bufbuild/buf lint && npx @bufbuild/buf build)
```
