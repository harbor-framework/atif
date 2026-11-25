# ATIF Governance

The **Agent Trajectory Interchange Format (ATIF)** is an open, vendor-neutral specification licensed under the [Apache License, Version 2.0](./LICENSE).

ATIF originated within the [Harbor](https://github.com/harbor-framework/harbor) agent benchmarking framework (RFC 0001 and RFC 0004) and is maintained as a standalone repository to support broad, multi-vendor adoption across agent harnesses, evaluation platforms, training pipelines, and observability warehouses.

## Governance Principles

1. **Open & Vendor-Neutral**: ATIF evolves in public via GitHub issues, pull requests, and RFCs. No single agent harness, model provider, or storage vendor holds exclusive control over the format's evolution.
2. **Spec Stability & Immutability**: Finalized specification versions (`status: "final"`) are immutable archival references so producers, consumers, and datasets can rely on stable contracts indefinitely.
3. **Conformance-Driven**: Specification features are backed by machine-readable schemas (`*.schema.json`, `atif.proto`, `warehouse.sql`) and language-agnostic fixtures in `conformance/`.
4. **Lightweight & Pragmatic**: Processes remain minimal enough to move quickly while preserving high rigor on wire compatibility and normative clarity.

## Roles

### Contributors

Anyone who participates in discussions, reports issues, submits pull requests, authors RFCs, or adds conformance test vectors is a Contributor.

### Maintainers

Maintainers are trusted stewards responsible for:

- Reviewing and merging pull requests across specifications, schemas, conformance tests, documentation, and official SDKs.
- Guiding RFCs through community review and recording consensus decisions.
- Cutting specification releases (`vMAJOR.MINOR`) and publishing official SDK packages.
- Upholding the [Code of Conduct](./CODE_OF_CONDUCT.md) and neutral technical stewardship.

Initial Maintainers come from the Harbor core team and founding ATIF v2.0 working group contributors. New Maintainers are nominated by existing Maintainers based on sustained, high-quality contributions and approved by lazy consensus among active Maintainers.

### Working Groups (Ad-Hoc)

For major specification efforts (such as canonical action extensions, wire projections, or multi-language SDKs), Maintainers and Contributors may organize focused working groups. Working groups produce RFCs and reference artifacts; binding decisions are always ratified publicly through the RFC process in this repository.

## Decision Making

| Change Category | Approval Process |
| :--- | :--- |
| **Documentation, typos, build tooling, non-breaking test additions** | Approval from 1 Maintainer + green CI. |
| **SDK implementations & non-normative helpers** | Approval from 1 Maintainer (preferably an SDK owner) + green CI & conformance checks. |
| **Minor specification versions (`vX.Y`, backward-compatible)** | Accepted [RFC](./rfcs/README.md) with public review period (minimum 7 calendar days), consensus among Maintainers (at least 2 Maintainer approvals, no unresolved blocking objections), and complete schema + conformance coverage. |
| **Major specification versions (`vX.0`, breaking changes)** | Accepted [RFC](./rfcs/README.md) with extended public review period (minimum 14 calendar days), migration guide from the prior major line, consensus among Maintainers, and complete schema + conformance coverage. |
| **Governance or licensing changes** | Public proposal with at least 14 calendar days for comment and supermajority (≥2/3) approval of active Maintainers. |

If consensus cannot be reached through discussion, Maintainers hold a public vote documented on the relevant issue or PR; simple majority decides standard technical matters and a 2/3 supermajority is required for governance changes.

## Specification Versioning Policy

ATIF uses `vMAJOR.MINOR` version identifiers (e.g., `ATIF-v1.8`, `ATIF-v2.0`):

- **Minor releases (`v2.1`, `v2.2`, …)**: Strictly backward-compatible additions (new optional fields, new canonical action kinds, new optional record properties). Consumers compliant with `v2.0` can safely parse `v2.x` streams by ignoring unknown optional fields.
- **Major releases (`v3.0`, …)**: Reserved for structural or breaking schema changes. Every major release must publish an explicit migration specification from the preceding major version.
- **Immutability**: Once a version directory under `spec/vX.Y/` is published with `status: "final"`, its normative content is frozen. Subsequent releases create new version directories with backward-only `supersedes` pointers.

## Path to Foundation Stewardship (AAIF / Linux Foundation)

This repository is structured from day one to be ready for neutral foundation stewardship — such as the **Agentic AI Foundation (AAIF)** under the **Linux Foundation** or a comparable open-standards home:

- Permissive **Apache-2.0** licensing with no contributor lock-in.
- Clean separation between the vendor-neutral specification (`spec/`, `conformance/`), governance (`rfcs/`, `GOVERNANCE.md`), and language SDKs (`sdks/`).
- Transparent, public RFC and maintainer processes.

Maintainers may propose transferring trademark, domain, or repository stewardship to a neutral foundation through a Governance change proposal as multi-vendor adoption matures.
