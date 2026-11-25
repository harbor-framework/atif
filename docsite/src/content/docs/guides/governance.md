---
title: Governance & Versioning
description: How ATIF specifications are versioned, preserved immutably once finalized, evolved through RFCs, and stewarded as a vendor-neutral open standard.
sidebar:
  order: 5
---

ATIF is maintained as an **open, Apache-2.0 licensed technical specification** designed to serve the entire autonomous-agent ecosystem — harness authors, benchmark maintainers, observability platforms, and ML training teams alike.

## Open-Standard Stewardship

ATIF originated inside the **[Harbor](https://github.com/harbor-framework/harbor)** community through RFC 0001 (v1.0–v1.8) and RFC 0004 (v2.0). Moving ATIF into its own dedicated repository (`harbor-framework/atif`) decouples the interchange standard from any single evaluation harness or SDK implementation.

The repository, specification structure, and governance process are intentionally lightweight and vendor-neutral, positioning ATIF cleanly for multi-organization stewardship and potential contribution to a neutral open-standards body such as the **Agentic AI Foundation (AAIF)** / Linux Foundation.

---

## Immutable Versioned Specifications

Specifications are contracts that long-lived datasets and parsers rely on for years. ATIF enforces a strict **Specification Immutability Invariant**:

- **Finalized versions never mutate**: Once a specification under `spec/vX.Y/` is published with `status: "final"`, its normative prose, schemas, and frontmatter are frozen. Historical versions (`v1.0` through `v1.8`) are preserved as faithful archival snapshots so older datasets always have an exact normative reference.
- **Intrinsic frontmatter only**: Every spec file declares only facts known at release time (`atif_version`, `schema_version`, `status: "draft" | "final"`, `release_date`, and an optional backward pointer `supersedes`). Finalized files **never** carry forward pointers like `superseded_by` that would require retroactively editing frozen versions.
- **Code-derived lifecycle badges**: This documentation site derives each version's role dynamically by sorting discovered versions:

| Derived Role | Rule | Current Versions | Behavior |
| :--- | :--- | :--- | :--- |
| **Latest** | Highest `(major, minor)` with `status: "final"` | `v2.0` | Default target of `/spec/`; recommended for all new implementations. |
| **Legacy** | Highest `(major, minor)` with `status: "final"` in a prior major line | `v1.8` | Supported for existing v1.x producers/consumers; displays a calm banner pointing to Latest. |
| **Archived** | All earlier `status: "final"` versions | `v1.0`–`v1.7` | Preserved verbatim for historical reference; displays a banner pointing to Latest and the end-of-line major release (`v1.8`). |
| **Draft** | Any version with `status: "draft"` | *(none active)* | Work-in-progress specification under RFC review; never selected as the default `/spec/` target. |

### Semantic Versioning Policy

- **Minor revisions (`v2.1`, `v2.2`, ...)**: Strictly additive and backwards-compatible. Existing valid `ATIF-v2.0` files remain valid, and conformant `ATIF-v2.0` readers safely ignore unknown optional fields and unknown top-level record `type`s.
- **Major revisions (`v3.0`, ...)**: Reserved for breaking wire-envelope or semantic changes, accompanied by a documented migration guide and round-trip compatibility strategy.

---

## RFC Proposal Workflow

All normative changes to the specification — new core fields, canonical action variants, envelope record types, or changes to the Stream Consolidation Algorithm — go through the lightweight RFC process in [`rfcs/`](https://github.com/harbor-framework/atif/tree/main/rfcs):

1. **Draft**: Copy [`rfcs/TEMPLATE.md`](https://github.com/harbor-framework/atif/blob/main/rfcs/TEMPLATE.md) and open a pull request describing the motivation, exact schema/wire changes, backwards-compatibility impact, and real-world harness examples.
2. **Community Review**: Maintainers, harness authors, and ecosystem stakeholders review the proposal on GitHub, testing edge cases across streaming capture, consolidation, Protobuf, and SQL projections.
3. **Accepted**: Once consensus is reached, the RFC is merged and implemented against a `status: "draft"` target specification directory (e.g. `spec/v2.1/`), complete with updated JSON Schema 2020-12 files, `atif.proto`, `warehouse.sql`, and **both valid and invalid fixtures in `conformance/`**.
4. **Released**: When reference tooling and conformance checks pass in CI, the version's frontmatter transitions to `status: "final"` and becomes immutable.

### Historical RFC Index

| RFC | Title | Resulting Spec Versions |
| :--- | :--- | :--- |
| **Harbor RFC 0001** | Agent Trajectory Interchange Format (ATIF) | [`v1.0`](/spec/v1.0/) – [`v1.8`](/spec/v1.8/) |
| **Harbor RFC 0004** | Agent Trajectory Interchange Format v2.0 (`ATIF-v2.0`) | [`v2.0`](/spec/v2.0/) |

---

## Extending ATIF Without Waiting for an RFC

You do **not** need an RFC to record harness-specific, experimental, or proprietary metadata. ATIF v2.0 provides three sanctioned extension points keyed by reverse-DNS domain (e.g. `com.example.tool`) or RFC 3986 URI:

1. **Inline `extensions` maps** on records and domain entities (`DocumentMeta`, `Session`, `Trajectory`, `Step`, `ContentPart`, `Action`, `StepMetrics`, `EnvironmentDefinition`, etc.).
2. **Top-level `"extension"` rows** (`ExtensionRecord`) appended anywhere after line 1 — ideal for post-hoc annotations, verifier scores, or human reviews without rewriting the file.
3. **`CanonicalAction.extension`** (`{ type: "extension", extension: { namespace, data } }`) for domain-specific semantic actions not yet in the core catalog.

Patterns that gain broad cross-harness adoption in custom namespaces are ideal candidates to graduate into official `com.harborframework.*` namespaces or core fields in a future minor RFC.

---

## Participating & Contributing

- **Repository**: [github.com/harbor-framework/atif](https://github.com/harbor-framework/atif)
- **Contribution Guide**: [`CONTRIBUTING.md`](https://github.com/harbor-framework/atif/blob/main/CONTRIBUTING.md) (clear paths for spec RFCs, conformance fixtures, documentation, and SDKs)
- **Governance Charter**: [`GOVERNANCE.md`](https://github.com/harbor-framework/atif/blob/main/GOVERNANCE.md)
- **Code of Conduct**: [`CODE_OF_CONDUCT.md`](https://github.com/harbor-framework/atif/blob/main/CODE_OF_CONDUCT.md)
- **License**: Apache License 2.0
