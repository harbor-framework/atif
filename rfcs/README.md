# ATIF Requests for Comments (RFCs)

Substantive changes to the **Agent Trajectory Interchange Format (ATIF)** — including new record fields, canonical action kinds, wire/warehouse projection changes, and major or minor specification releases — go through this lightweight RFC process.

## RFC Lifecycle

```text
Draft ──► Review ──► Accepted ──► Released
             │
             └──► Deferred / Withdrawn
```

1. **Draft**: An author opens a pull request adding `rfcs/NNNN-short-title.md` copied from [`TEMPLATE.md`](./TEMPLATE.md) (assign the next sequential number once a PR is opened). Discussion and iteration happen directly on the PR.
2. **Review**: Once the design is complete, maintainers announce a formal review period (minimum **7 days** for backward-compatible minor changes; **14 days** for breaking major changes) and invite feedback from harness authors, SDK maintainers, and consumers.
3. **Accepted**: Maintainers record consensus and merge the RFC with `Status: Accepted`. Implementation work proceeds on a new `status: "draft"` directory under `spec/vX.Y/`, along with synchronized Protobuf, JSON Schema, SQL DDL, examples, and `conformance/` fixtures.
4. **Released**: The target specification version is finalized (`status: "final"`), and the RFC status is updated to `Released` linking the finalized `spec/vX.Y/SPEC.md`.
5. **Deferred / Withdrawn**: Proposals that are not moving forward are archived with rationale so future contributors have context.

## How to Submit an RFC

1. Open an issue first (optional but encouraged) to gather early signal on whether a change needs an RFC or can be addressed as a reverse-DNS extension (`extensions`).
2. Copy [`TEMPLATE.md`](./TEMPLATE.md) to `rfcs/NNNN-descriptive-slug.md`.
3. Fill out every section, including schema/projection impact, backward compatibility, and conformance test plan.
4. Open a pull request titled `RFC NNNN: <Short Title>`.

## Archival RFC Index

ATIF originated as RFCs inside [`harbor-framework/harbor`](https://github.com/harbor-framework/harbor) before moving to this standalone repository. Future RFCs authored in `harbor-framework/atif` continue sequentially starting from `0005` (or `0001` scoped to this repository — check open PRs before assigning a number).

| Origin / ID | Title | Status | Historical Source | Finalized Specification |
| :--- | :--- | :--- | :--- | :--- |
| **Harbor RFC 0001** | Agent Trajectory Interchange Format (ATIF v1.0–v1.8) | Released | [`harbor-framework/harbor` `rfcs/0001-trajectory-format.md`](https://github.com/harbor-framework/harbor/blob/74cc6312/rfcs/0001-trajectory-format.md) | [`spec/v1.0/SPEC.md`](../spec/v1.0/SPEC.md) – [`spec/v1.8/SPEC.md`](../spec/v1.8/SPEC.md) |
| **Harbor RFC 0004** | Agent Trajectory Interchange Format (ATIF) v2.0 | Released | [`harbor-framework/harbor` PR #4134](https://github.com/harbor-framework/harbor/pull/4134) | [`spec/v2.0/SPEC.md`](../spec/v2.0/SPEC.md) |
