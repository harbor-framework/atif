# AGENTS.md

Operational guide for AI coding agents working in `harbor-framework/atif`.

> **Important**: This repository uses `AGENTS.md` as its sole agent-instruction file. Do **not** create `CLAUDE.md` or duplicate agent instruction files.

## Repository Map

| Directory / File | Responsibility |
| :--- | :--- |
| `spec/v1.0/` .. `spec/v1.8/` | Faithful archival snapshots of ATIF v1.x specifications (`SPEC.md`, `CHANGELOG.md`, and `v1.8/examples/`). **Immutable.** |
| `spec/v2.0/` | ATIF v2.0 specification (`SPEC.md`, `CHANGELOG.md`), companion `references/*.md`, machine-readable `schema/` (`atif.proto`, `warehouse.sql`, `*.schema.json`, `buf.yaml`), and `examples/*.jsonl`. **Immutable once finalized.** |
| `spec/CHANGELOG.md` | Master version timeline across all ATIF releases. |
| `conformance/` | Language-agnostic test suite (`manifest.json`, `v1/`, `v2/events/`, `v2/trajectories/`, `v2/consolidation/`). |
| `scripts/` | Spec & schema verification scripts (`validate-spec.mjs`, `validate-sql.py`). |
| `docsite/` | Static Astro + Starlight site reading `spec/` directly via Content Collections, plus interactive Ajv validator, `.md` mirrors, `/llms.txt`, and `/.well-known/skills/` DVS endpoints. |
| `sdks/` | Official SDK packages (`sdks/python/` minimal skeleton) and multi-language roadmap (`sdks/README.md`). |
| `rfcs/` | Specification proposal workflow (`README.md`) and `TEMPLATE.md`. |
| `firebase.json` | Firebase Hosting static deployment configuration (`public: "docsite/dist"`, redirects, MIME headers). |
| `.github/workflows/` | CI pipelines: `spec-ci.yml`, `docsite-ci.yml`, `python-sdk-ci.yml`. |

## Critical Invariants

### 1. Spec Immutability (`status: "final"`)

- Any `spec/vX.Y/` directory whose `SPEC.md` frontmatter has `status: "final"` is **immutable**. Do **not** alter normative prose, schemas, or frontmatter of finalized versions when authoring a new spec version.
- Frontmatter in `spec/**/*.md` MUST only store intrinsic facts known at release time:
  - `status`: strictly `"draft"` or `"final"` (never `"latest"`, `"legacy"`, or `"archived"`).
  - `supersedes`: optional backward-only pointer (omit on `v1.0` and `spec/CHANGELOG.md`).
  - **NEVER** add a `superseded_by` field.
- `docsite/` derives **Latest**, **Legacy**, **Archived**, and **Draft** roles, badges, redirects, and banners purely in code by sorting discovered versions.

### 2. Single Source of Truth

- `docsite/` reads `spec/**/*.md`, `spec/v2.0/schema/*`, and `spec/*/examples/*` directly from disk at build time. Never copy or vendor `spec/` files into `docsite/src/`.
- When modifying a `"draft"` spec version, keep normative prose (`SPEC.md`, `references/*.md`), machine-readable schemas (`atif.proto`, `warehouse.sql`, `*.schema.json`), examples, and `conformance/` fixtures strictly synchronized.

### 3. Build & Hygiene Rules

- Never commit generated build outputs or local environment files (`docsite/dist/`, `docsite/.astro/`, `node_modules/`, `.venv/`, `__pycache__/`, `.firebase/`, `.firebaserc`).
- Do **not** create `CLAUDE.md`.
- Keep changes minimal and scoped to the relevant area (`spec/`, `conformance/`, `docsite/`, `sdks/`, or `rfcs/`).

## Verification Commands

Run the commands matching the areas you touched before finishing a task:

### Specs, Schemas, & Conformance

```bash
# Protobuf lint & compile
(cd spec/v2.0/schema && buf lint && buf build)

# Frontmatter, JSON Schema 2020-12, examples, and conformance vectors
(cd scripts && npm ci && node validate-spec.mjs)

# BigQuery/DuckDB warehouse SQL DDL parse check
uv run --with sqlglot python3 scripts/validate-sql.py spec/v2.0/schema/warehouse.sql
```

### Documentation Site

```bash
(cd docsite && npm ci && npm run build && node tests/verify-build.mjs)
```

### Python SDK (`sdks/python/`)

```bash
(cd sdks/python && uv sync --dev && uv run ruff check . && uv run ruff format --check . && uv run ty check && uv run pytest)
```
