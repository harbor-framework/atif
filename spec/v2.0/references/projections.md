---
title: "ATIF v2.0 Wire (Protobuf) & Warehouse (SQL) Projections"
description: "Normative JSON Schema 2020-12 mapping, Protocol Buffer wire serialization rules, and BigQuery/DuckDB/Parquet warehouse table projections."
atif_version: "2.0"
schema_version: "ATIF-v2.0"
status: "draft"
release_date: "2026-11-25"
doc_type: "reference"
order: 30
source_ref: "harbor-framework/harbor#4134"
---

# ATIF v2.0 Wire (Protobuf) & Warehouse (SQL) Projections

*Normative companion to [ATIF v2.0 Specification](../SPEC.md) · Status: Working Draft.*

- **JSON Schema 2020-12**: [`atif-record.schema.json`](../schema/atif-record.schema.json), [`canonical-actions.schema.json`](../schema/canonical-actions.schema.json), [`common-defs.schema.json`](../schema/common-defs.schema.json)
- **Protocol Buffers (`proto3`)**: [`atif.proto`](../schema/atif.proto) (Buf config: [`buf.yaml`](../schema/buf.yaml))
- **Warehouse SQL DDL**: [`warehouse.sql`](../schema/warehouse.sql)

*(For document types, file extensions, and archive packaging, see [Document Types](../SPEC.md#document-types) and [Portable Archive Layout](../SPEC.md#portable-archive-layout).)*

---

## JSON Schema 2020-12 Validation Schemas

Three [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12/schema) files validate individual `AtifRecord` NDJSON lines in both `"events"` and `"trajectories"` documents:

- **[`../schema/atif-record.schema.json`](../schema/atif-record.schema.json)**: Top-level `AtifRecord` envelope discriminating on `type` (`"meta"`, `"event"`, `"session"`, `"trajectory"`, `"step"`, `"extension"`).
- **[`../schema/canonical-actions.schema.json`](../schema/canonical-actions.schema.json)**: `CanonicalAction` union covering all 28 `CanonicalActionType` values, orthogonal `mcp` provenance, and `extensions`.
- **[`../schema/common-defs.schema.json`](../schema/common-defs.schema.json)**: Shared definitions (`Sha256Urn`, `ArdUrn`, `Timestamp`, `ContentPart`, `BlobReference`, `TruncationInfo`, `StepMetrics`, `FinalMetrics`, `AgentMetadata`, `EnvironmentDefinition`, `ToolDefinition`, `EventBranch`, `Citation`, `ApprovalInfo`, `CompactionInfo`).

These schemas strictly validate canonical JSON emission (integer fields encoded as JSON numbers). For ingesting `protojson`-encoded JSON with quoted `int64` strings, see [Universal Reader Requirements](../SPEC.md#universal-reader-requirements).

---

## Protocol Buffer Projection (`atif.proto`)

[`../schema/atif.proto`](../schema/atif.proto) maps 1:1 onto the interfaces in [ATIF v2.0 Specification](../SPEC.md) and [Canonical Actions Catalog](./canonical-actions.md).

> [!IMPORTANT]
> **Proto3 JSON Serialization Rules**:
> 1. When serializing or parsing `atif.proto` messages as JSON/JSONL, implementations MUST enable `preserving_proto_field_names = true` so wire keys remain `snake_case`.
> 2. Open string vocabularies (`document_type`, `type`, `source`, `stop_reason`, `status`, `modality`, `scope`, `boundary`, `strategy`) are typed as `string` in `atif.proto` so Proto3 JSON emits lowercase strings identical to the JSON and SQL representations.
> 3. Standard `protojson` serializers quote `int64` values as decimal strings (e.g., `"1200"`); readers SHOULD leniently accept decimal-string integers per [Universal Reader Requirements](../SPEC.md#universal-reader-requirements).

---

## Warehouse Table Projections (BigQuery / DuckDB / Parquet)

The warehouse projection in [`../schema/warehouse.sql`](../schema/warehouse.sql) defines six nested-column tables (`sessions`, `trajectories`, `steps`, `actions`, `extension_records`, `blobs`) in GoogleSQL (BigQuery) syntax.

### DuckDB Type Equivalents

| GoogleSQL (BigQuery) | DuckDB |
| :--- | :--- |
| `STRING` | `VARCHAR` |
| `INT64` | `BIGINT` |
| `FLOAT64` | `DOUBLE` |
| `BOOL` | `BOOLEAN` |
| `STRUCT<...>` / `ARRAY<T>` | `STRUCT(...)` / `T[]` |

### Partitioning, Clustering, and Keys

- **`sessions`**: Optional session-level table (1 row per `session_id`), partitioned by `DATE(end_time)` and clustered by `(end_time, session_id)`.
- **`trajectories`**: Partitioned by `DATE(end_time)` and clustered by `(end_time, trajectory_id)`. `session_id` is nullable for standalone single-trajectory runs.
- **`steps`** and **`actions`**: Clustered by `(trajectory_id, step_id)` (and optionally partitioned by trajectory date in high-volume BigQuery deployments). Because every branch (subagent, fork, Best-of-N candidate, rewind, or retry) is its own row in `trajectories`, `(trajectory_id, step_id)` and `(trajectory_id, action_id)` are unique 2-column keys across the warehouse.
- **`extension_records`**: Optional table for top-level `"extension"` records, clustered by `(namespace, trajectory_id)`.
- **`blobs`**: Clustered by `digest` (`urn:sha256:<hex>`) for content-addressed deduplication.

### Example Cross-Harness Analytical Query *(Non-normative)*

```sql
-- Compare native shell command failure rates and per-root-trajectory cost across harnesses
WITH native_shell_stats AS (
  SELECT
    trajectory_id,
    COUNT(action_id) AS shell_commands,
    COUNTIF(COALESCE(errored, FALSE) OR canonical.shell_command.exit_code != 0) AS failed_shell_commands
  FROM actions
  WHERE canonical.type = 'shell_command'
    AND original_trajectory_id IS NULL
  GROUP BY trajectory_id
)
SELECT
  t.agent.name AS agent_name,
  t.agent.model.name AS model_name,
  SUM(COALESCE(s.shell_commands, 0)) AS total_shell_commands,
  SAFE_DIVIDE(SUM(COALESCE(s.failed_shell_commands, 0)), SUM(COALESCE(s.shell_commands, 0))) AS shell_failure_rate,
  AVG(IF(t.parent_trajectory_id IS NULL, t.final_metrics.total_cost_usd, NULL)) AS avg_root_trajectory_cost_usd
FROM trajectories AS t
LEFT JOIN native_shell_stats AS s USING (trajectory_id)
WHERE COALESCE(t.parent_reason, '') NOT IN ('rewind', 'retry')
GROUP BY agent_name, model_name
ORDER BY total_shell_commands DESC;
```
