# Agent Trajectory Interchange Format (ATIF)

**ATIF** is an open, vendor-neutral standard for recording, streaming, exchanging, evaluating, and analyzing AI agent trajectories.

Born out of the [Harbor](https://github.com/harbor-framework/harbor) benchmarking ecosystem and developed with the broader agent tooling community, ATIF v2.0 defines a single unified, dual-mode NDJSON format that serves both **real-time harness event streaming** (`.atif-e.jsonl`) and **consolidated analytical trajectories** (`.atif.jsonl`), backed by canonical Protobuf, BigQuery/DuckDB SQL, and JSON Schema 2020-12 definitions.

## Why ATIF v2.0?

- **Dual-Mode Unified NDJSON**: Append-only streaming event logs (`.atif-e.jsonl`) and consolidated multi-trajectory documents (`.atif.jsonl`) share one universal `AtifRecord` envelope and deterministic consolidation semantics.
- **Lineage, Sessions, & Branching**: First-class session graphs, subagent spawning, retries, rollbacks, and context compaction via `EventBranch` and parent trajectory references.
- **Unified `Action` Model & Canonical Catalog**: Separates raw harness tool calls from normalized [`canonical` action semantics](./spec/v2.0/references/canonical-actions.md) (`shell`, `file_read`, `file_write`, `file_delete`, `search`, `web_fetch`, `web_search`, `subagent`, `task`, `elicitation`, `message_send`, `message_read`) and explicit `Action.executor` execution planes.
- **Multi-Environment & Multimodal**: Native support for multiple execution environments (`EnvironmentDefinition[]`), multimodal content parts, content-addressed blob offloading, truncation metadata, citations, and reverse-DNS `extensions`.
- **Machine-Readable & Cross-Language**: Co-maintained [JSON Schema 2020-12](./spec/v2.0/schema/atif-record.schema.json), [Protobuf v3](./spec/v2.0/schema/atif.proto), [Warehouse SQL DDL](./spec/v2.0/schema/warehouse.sql), and a language-agnostic [conformance test suite](./conformance/README.md).

## Quick Links

| Resource | Path | Description |
| :--- | :--- | :--- |
| **ATIF v2.0 Specification** | [`spec/v2.0/SPEC.md`](./spec/v2.0/SPEC.md) | Core normative v2.0 specification (Working Draft) |
| **Canonical Actions Catalog** | [`spec/v2.0/references/canonical-actions.md`](./spec/v2.0/references/canonical-actions.md) | Normalized action kinds, file digests, and MCP provenance |
| **Official Extension Namespaces** | [`spec/v2.0/references/extensions.md`](./spec/v2.0/references/extensions.md) | Standardized `com.harborframework.{evaluation,rl,v1}` extension schemas |
| **Wire & Warehouse Projections** | [`spec/v2.0/references/projections.md`](./spec/v2.0/references/projections.md) | Protobuf (`atif.proto`) and BigQuery/DuckDB (`warehouse.sql`) projection guide |
| **Harness Translation Examples** | [`spec/v2.0/references/harness-examples.md`](./spec/v2.0/references/harness-examples.md) | Non-normative Claude Code, Codex CLI, and Cursor CLI translation walkthroughs |
| **ATIF v1.x to v2.0 Migration** | [`spec/v2.0/references/v1-migration.md`](./spec/v2.0/references/v1-migration.md) | Format detection and lossless v1.0–v1.8 → v2.0 upgrade rules |
| **Machine-Readable Schemas** | [`spec/v2.0/schema/`](./spec/v2.0/schema/) | JSON Schema 2020-12 (`*.schema.json`), `atif.proto`, and `warehouse.sql` |
| **Reference Examples** | [`spec/v2.0/examples/`](./spec/v2.0/examples/) | Streaming (`session.atif-e.jsonl`) and consolidated (`session.atif.jsonl`) fixtures |
| **Latest Final v1.8 & History** | [`spec/v1.8/SPEC.md`](./spec/v1.8/SPEC.md) · [`spec/CHANGELOG.md`](./spec/CHANGELOG.md) | Faithful archival snapshots of ATIF v1.0–v1.8 and master version timeline |
| **Conformance Suite** | [`conformance/README.md`](./conformance/README.md) | Language-agnostic valid/invalid and consolidation golden test vectors |
| **Documentation Site** | [`docsite/`](./docsite/) | Static Astro + Starlight site with interactive validator and agent `.md`/skill endpoints |
| **SDKs & Tooling** | [`sdks/README.md`](./sdks/README.md) · [`sdks/python/`](./sdks/python/) | Python SDK (`atif`) skeleton and multi-language SDK roadmap |
| **RFC Process** | [`rfcs/README.md`](./rfcs/README.md) | Proposal lifecycle, RFC template, and archival RFC index |

## Repository Structure

```text
atif/
├── spec/                  # Immutable finalized specs (v1.0–v1.8, v2.0), schemas, examples, changelogs
├── conformance/           # Language-agnostic test fixtures & manifest.json (v1, v2 events/trajectories/consolidation)
├── scripts/               # Spec frontmatter, JSON Schema 2020-12, conformance, and SQL DDL validators
├── docsite/               # Astro + Starlight documentation site, interactive validator, & agent skill endpoints
├── sdks/                  # Official SDKs (Python skeleton in sdks/python/; Go/TS/CLI roadmap in sdks/README.md)
├── rfcs/                  # Specification proposal lifecycle and RFC template
└── .github/workflows/     # CI workflows for specs/schemas, docs site, and Python SDK
```

## Quickstart: Validate & Build Locally

### Validate Specifications, Schemas, & Conformance Suite

```bash
# 1. Lint and compile Protobuf schema
(cd spec/v2.0/schema && buf lint && buf build)

# 2. Validate YAML frontmatter, JSON Schema 2020-12, examples, and conformance suite
(cd scripts && npm ci && node validate-spec.mjs)

# 3. Validate BigQuery/DuckDB warehouse SQL DDL syntax
uv run --with sqlglot python3 scripts/validate-sql.py spec/v2.0/schema/warehouse.sql
```

### Build & Verify the Documentation Site

```bash
cd docsite
npm ci
npm run build
node tests/verify-build.mjs
```

### Run Python SDK Checks

```bash
cd sdks/python
uv sync --dev
uv run ruff check .
uv run ruff format --check .
uv run ty check
uv run pytest
```

## Contributing & Governance

ATIF is maintained as an open, community-driven specification designed for vendor-neutral stewardship.

- Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) before opening a pull request.
- Propose specification changes through the [`rfcs/`](./rfcs/README.md) workflow.
- Review [`GOVERNANCE.md`](./GOVERNANCE.md) for maintainer roles, decision-making, and versioning guarantees.
- All participants are expected to uphold our [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

## License

Licensed under the [Apache License, Version 2.0](./LICENSE).
