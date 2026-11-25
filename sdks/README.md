# ATIF SDKs & Tooling

This directory hosts official, Apache-2.0-licensed SDKs and tooling for reading, writing, validating, and consolidating **Agent Trajectory Interchange Format (ATIF)** documents.

All official SDKs are validated against the language-agnostic conformance suite in [`conformance/`](../conformance/README.md) and the canonical machine-readable schemas in [`spec/v2.0/schema/`](../spec/v2.0/schema/).

## Roadmap

| Package | Path | Status | Target Scope |
| :--- | :--- | :--- | :--- |
| **Python SDK (`atif`)** | [`sdks/python/`](./python/) | Skeleton (`2.0.0.dev0`) | Extract Harbor's existing ATIF v1.x Pydantic models & validator, then implement full ATIF v2.0 models, format auto-detection, `.atif-e.jsonl` → `.atif.jsonl` consolidation, and v1.x ↔ v2.0 migration. |
| **Go SDK** | `sdks/go/` *(planned)* | Planned | Idiomatic Go types and streaming NDJSON readers/writers generated from and aligned with [`spec/v2.0/schema/atif.proto`](../spec/v2.0/schema/atif.proto). |
| **TypeScript SDK** | `sdks/typescript/` *(planned)* | Planned | Zero-dependency TypeScript types, JSON Schema validation bindings, and browser/Node NDJSON utilities for web harnesses and viewers. |
| **ATIF CLI** | `tools/cli/` *(planned)* | Planned | Standalone CLI for validating, inspecting, consolidating (`.atif-e.jsonl` → `.atif.jsonl`), diffing, and migrating ATIF trajectories. |
| **Harness Adapters** | *(ecosystem / planned)* | Planned | Reference translators converting native harness logs (Claude Code, Codex, Cursor, Gemini CLI, OpenHands, etc.) into canonical ATIF v2.0 streams — see [`spec/v2.0/references/harness-examples.md`](../spec/v2.0/references/harness-examples.md). |

## Conformance Requirement

Every SDK implementation added to this directory MUST run and pass the shared test vectors defined in [`conformance/manifest.json`](../conformance/manifest.json) in CI:

- **v1.x archival compatibility** (`conformance/v1/`) — for SDKs supporting legacy v1.x trajectories
- **v2.0 streaming events validation** (`conformance/v2/events/`)
- **v2.0 consolidated trajectories validation** (`conformance/v2/trajectories/`)
- **v2.0 event-to-trajectory consolidation golden pairs** (`conformance/v2/consolidation/`)

## Contributing a New SDK

If you are interested in starting an official SDK (Go, TypeScript, Rust, etc.) or contributing to the Python SDK extraction, please read [`CONTRIBUTING.md`](../CONTRIBUTING.md) and open an issue to coordinate API conventions and conformance coverage.
