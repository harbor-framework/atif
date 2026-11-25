# RFC NNNN: <Short Descriptive Title>

| Field | Value |
| :--- | :--- |
| **RFC Number** | `NNNN` |
| **Status** | `Draft` *(Draft \| Review \| Accepted \| Released \| Deferred \| Withdrawn)* |
| **Target ATIF Version** | `vX.Y` *(e.g., `v2.1` or `v3.0`)* |
| **Authors** | `@github-handle` |
| **Created** | `YYYY-MM-DD` |
| **Tracking Issue / PR** | `#...` |

## 1. Summary

One-paragraph summary of what this RFC proposes and the concrete problem it solves.

## 2. Motivation

- Why is the current specification insufficient?
- Who needs this capability (harnesses, evaluators, training pipelines, warehouses, viewers)?
- Why can this not be solved cleanly using a reverse-DNS `extensions` entry alone?

## 3. Detailed Design

Provide the precise normative specification changes:

- Record types, field names, types, required vs. optional semantics, and defaults.
- Concrete JSONL examples (`.atif-e.jsonl` and/or `.atif.jsonl`).
- Consolidation rules (if events are affected).
- Edge cases and invariants.

## 4. Machine-Readable Schema & Projection Impact

Describe exact updates required across all synchronized artifacts:

- **JSON Schema 2020-12** (`spec/vX.Y/schema/*.schema.json`)
- **Protobuf** (`spec/vX.Y/schema/atif.proto`) — wire field numbers and Proto3 JSON mapping
- **Warehouse SQL DDL** (`spec/vX.Y/schema/warehouse.sql`) — column additions or schema evolution impact

## 5. Backwards Compatibility & Migration

- Is this change strictly backward-compatible (minor release) or breaking (major release)?
- How should older consumers handle new fields or values?
- If breaking, provide a concrete migration mapping from the prior version.

## 6. Conformance Test Plan

List the valid, invalid, and (if applicable) consolidation golden fixtures to be added to `conformance/` and registered in `conformance/manifest.json`.

## 7. Security, Privacy, & Operational Considerations

Address any implications for secret redaction, PII, content-addressed blob references, untrusted inputs, or payload size limits.

## 8. Alternatives Considered

Summarize alternative designs that were evaluated and explain why they were not chosen.

## 9. Unresolved Questions

Track open design questions to resolve before moving from `Draft` to `Accepted`. (This section must be empty before finalization.)
