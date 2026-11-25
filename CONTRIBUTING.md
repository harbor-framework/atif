# Contributing to ATIF

Thank you for contributing to the **Agent Trajectory Interchange Format (ATIF)**! We welcome contributions to the specification, machine-readable schemas, conformance suite, documentation site, and official SDKs.

All contributors are expected to follow our [Code of Conduct](./CODE_OF_CONDUCT.md) and review [Governance](./GOVERNANCE.md) to understand how decisions are made.

## Types of Contributions

### 1. Specification Changes (`spec/` & `rfcs/`)

Finalized specification versions (`status: "final"` under `spec/vX.Y/`) are **immutable**.

- **Normative changes** (new fields, record types, canonical actions, behavioral rules, or breaking changes) MUST start with an RFC in [`rfcs/`](./rfcs/README.md) using [`rfcs/TEMPLATE.md`](./rfcs/TEMPLATE.md).
- Once an RFC is accepted, changes target a new `status: "draft"` version directory (e.g., `spec/v2.1/` or `spec/v3.0/`) and MUST update all synchronized artifacts before finalization:
  - `SPEC.md`, `CHANGELOG.md`, and affected `references/*.md`
  - `schema/atif.proto`, `schema/warehouse.sql`, and `schema/*.schema.json`
  - `examples/` fixtures
  - Language-agnostic test vectors in `conformance/` (valid, invalid, and consolidation cases where applicable)
- **Editorial errata** on finalized specs are limited to unambiguous broken links or formatting fixes that do not alter normative meaning, and require maintainer review.

### 2. Conformance Fixtures & Schemas (`conformance/`, `scripts/`)

Contributions that strengthen test coverage are always welcome:

- Add valid and invalid edge-case fixtures under `conformance/v1/` or `conformance/v2/` and register them in `conformance/manifest.json`.
- Ensure every new invalid fixture fails for the exact schema or invariant violation described in `manifest.json`.

### 3. Documentation Site (`docsite/`)

- The Astro + Starlight site reads directly from `spec/` at build time — do not duplicate specification files into `docsite/`.
- Authored guides live under `docsite/src/content/docs/guides/`.
- Keep the site maximally accessible to both humans and coding agents: every doc page must produce a clean `.md` mirror, pass link checks, and preserve valid `/.well-known/skills/` DVS skill metadata.

### 4. SDKs & Tooling (`sdks/`)

- See [`sdks/README.md`](./sdks/README.md) and [`sdks/python/README.md`](./sdks/python/README.md) for current SDK scope and conventions.
- SDK PRs must pass language-specific linters, type checks, unit tests, and (once implemented) the shared [`conformance/manifest.json`](./conformance/manifest.json) suite.

## Local Verification Before Opening a PR

Run the checks corresponding to the directories you modified:

```bash
# Spec, Protobuf, JSON Schema, Conformance, and SQL DDL
(cd spec/v2.0/schema && buf lint && buf build)
(cd scripts && npm ci && node validate-spec.mjs)
uv run --with sqlglot python3 scripts/validate-sql.py spec/v2.0/schema/warehouse.sql

# Documentation site build & agent-endpoint verification
(cd docsite && npm ci && npm run build && node tests/verify-build.mjs)

# Python SDK checks
(cd sdks/python && uv sync --dev && uv run ruff check . && uv run ruff format --check . && uv run ty check && uv run pytest)
```

## Pull Request Hygiene

- Keep PRs focused: separate normative spec/RFC PRs from docsite or SDK implementation PRs whenever possible.
- Write clear PR descriptions explaining **why** the change is needed and referencing relevant RFCs or issues.
- Ensure all CI checks (`spec-ci`, `docsite-ci`, `python-sdk-ci`) pass before requesting final review.
- Do not commit generated artifacts (`docsite/dist/`, `node_modules/`, `.venv/`, `.firebase/`).

## Licensing

By contributing to ATIF, you agree that your contributions will be licensed under the [Apache License, Version 2.0](./LICENSE).
