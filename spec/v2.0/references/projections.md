---
title: "ATIF v2.0 Wire (Protobuf) & Warehouse (SQL) Projections"
description: "Protocol Buffer wire serialization rules, JSON Schema 2020-12 mapping, and BigQuery/DuckDB/Parquet warehouse table projections."
atif_version: "2.0"
schema_version: "ATIF-v2.0"
status: "final"
release_date: "2026-11-25"
doc_type: "reference"
order: 40
source_ref: "harbor-framework/harbor#4134"
---

# ATIF v2.0 Wire (Protobuf) & Warehouse (SQL) Projections

- **Status**: Final
- **Core Specification**: [ATIF v2.0 Specification](../SPEC.md)
- **Companion References**:
  - [Canonical Actions Catalog](./canonical-actions.md)
  - [Translating Native Harness Formats to ATIF v2.0](./harness-examples.md)
  - [ATIF v1.x Migration, Token Normalization, & Official Extensions](./migration-and-extensions.md)
- **Machine-Readable Schemas**:
  - [`atif.proto`](../schema/atif.proto) (Protocol Buffer v3 wire schema; validated with [`buf.yaml`](../schema/buf.yaml))
  - [`warehouse.sql`](../schema/warehouse.sql) (BigQuery / GoogleSQL warehouse DDL)
  - [`atif-record.schema.json`](../schema/atif-record.schema.json), [`canonical-actions.schema.json`](../schema/canonical-actions.schema.json), [`common-defs.schema.json`](../schema/common-defs.schema.json) (JSON Schema Draft 2020-12)

---

## File Extensions & Document Types

ATIF v2.0 uses explicit file extensions alongside the line-1 `meta.document_type` header (readers MUST dispatch on line 1 `meta.document_type`, not filename alone):

| `document_type` | File Extension | Allowed Body Row `type`s | Description |
| :--- | :--- | :--- | :--- |
| **`"events"`** | **`.atif-e.jsonl`** | `"event"`, `"extension"` | Append-only runtime NDJSON log emitted 1:1 from live agent harnesses (`MetaRecord` line 1 + `EventRecord` / `ExtensionRecord` lines). |
| **`"trajectories"`** | **`.atif.jsonl`**<br>**`.atif.tar.zst`** | `"session"`, `"trajectory"`, `"step"`, `"extension"` | Consolidated NDJSON document holding one or more trajectories (`MetaRecord` line 1 with optional `manifest` + `SessionRecord` / `TrajectoryRecord` / `StepRecord` / `ExtensionRecord` lines), or a `.atif.tar.zst` archive with `atif.jsonl` as the required first entry alongside optional `atif-e.jsonl` and `blobs/sha256/<prefix>/<hash>`. |

---

## JSON Schema 2020-12 Validation Schemas

ATIF v2.0 provides canonical [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12/schema) files for validating individual NDJSON lines (`AtifRecord`) in both `"events"` and `"trajectories"` documents:

- **[`../schema/atif-record.schema.json`](../schema/atif-record.schema.json)**: Universal `AtifRecord` line envelope discriminating on `type` (`"meta"`, `"event"`, `"session"`, `"trajectory"`, `"step"`, `"extension"`).
- **[`../schema/canonical-actions.schema.json`](../schema/canonical-actions.schema.json)**: Strongly typed `CanonicalAction` union covering all 28 `CanonicalActionType` values, orthogonal `mcp` provenance, and `extensions`.
- **[`../schema/common-defs.schema.json`](../schema/common-defs.schema.json)**: Shared definitions (`Sha256Urn`, `ArdUrn`, `Timestamp`, `ContentPart`, `BlobReference`, `TruncationInfo`, `StepMetrics`, `FinalMetrics`, `AgentMetadata`, `EnvironmentDefinition`, `ToolDefinition`, `EventBranch`, `Citation`, `ApprovalInfo`, `CompactionInfo`, etc.).

> [!NOTE]
> **Canonical Integer JSON vs. Proto3 `protojson` `int64` Strings**: The JSON Schema 2020-12 files strictly validate canonical ATIF JSON emission, where integer fields (`step_id`, `input_tokens`, `size_bytes`, `original_bytes`, `seq`, etc.) are serialized as JSON integers. When ingesting JSON produced directly by standard `protojson` encoders (which quote `int64` values as decimal strings such as `"1200"`), ATIF parsers SHOULD leniently accept decimal-string representations for integer fields before schema validation.

---

## Normative Protocol Buffer Schema (`spec/v2.0/schema/atif.proto`)

The canonical Protocol Buffer (`proto3`) schema is maintained at **[`../schema/atif.proto`](../schema/atif.proto)** (with Buf configuration at [`../schema/buf.yaml`](../schema/buf.yaml)) and is structurally aligned 1:1 with the interfaces in [ATIF v2.0 Specification](../SPEC.md) and [Canonical Actions Catalog](./canonical-actions.md).

> [!IMPORTANT]
> **Proto3 JSON Serialization & Lenient Integer Parsing**: When serializing or parsing `atif.proto` messages as JSON/JSONL, implementations MUST enable `preserving_proto_field_names = true` (snake_case field names). Open string vocabularies (`document_type`, `type`, `source`, `stop_reason`, `status`, `modality`, `scope`, `boundary`, `strategy`) are typed as `string` in `atif.proto` so that Proto3 JSON emits lowercase strings (`"trajectories"`, `"image"`, `"workspace"`) identical to the interface and SQL representations. Canonical ATIF JSON emitters serialize integer fields as JSON numbers; because standard `protojson` serializers quote `int64` values as decimal strings (e.g. `"1200"`), **ATIF JSON parsers SHOULD leniently accept decimal-string representations for integer fields**.

See the full schema source in **[`../schema/atif.proto`](../schema/atif.proto)** (embedded directly from disk on the documentation site and verified in CI via `buf lint` and `buf build`).

---

## Warehouse Table Projections (BigQuery / DuckDB / Parquet)

Because modern analytical engines (BigQuery, DuckDB, ClickHouse, Snowflake, Parquet) natively support nested `STRUCT` and `ARRAY<STRUCT>` columns with columnar subfield pruning, ATIF v2.0's warehouse projection preserves the nested structure of `Session`, `Trajectory`, `Step`, `Action`, top-level `ExtensionRecord`s, and offloaded `blobs` across six tables (`sessions`, `trajectories`, `steps`, `actions`, `extension_records`, `blobs`). (The canonical DDL uses GoogleSQL / BigQuery syntax; in DuckDB, substitute `VARCHAR` for `STRING`, `BIGINT` for `INT64`, `DOUBLE` for `FLOAT64`, `BOOLEAN` for `BOOL`, and `STRUCT(...)` / `[]` for `STRUCT<...>` / `ARRAY<...>`.)

### Partitioning & Clustering Strategy
- **`sessions`**: Optional session-level table (1 row per `session_id`), partitioned by `DATE(end_time)` and clustered by `(end_time, session_id)`.
- **`trajectories`**: Partitioned by `DATE(end_time)` and clustered by `(end_time, trajectory_id)` so incremental cursor polling and time-windowed corpus queries prune partitions automatically. `session_id` is nullable for standalone single-trajectory runs.
- **`steps`** and **`actions`**: Clustered by `(trajectory_id, step_id)` (and optionally partitioned by trajectory date in high-volume BigQuery deployments). Because every branch (subagent, session fork, Best-of-$N$ candidate, or discarded rewind/retry) is its own `Trajectory` row in `trajectories`, `(trajectory_id, step_id)` and `(trajectory_id, action_id)` are universally unique 2-column keys across the entire warehouse.
- **`extension_records`**: Optional table for top-level `"extension"` NDJSON rows, clustered by `(namespace, trajectory_id)`.
- **`blobs`**: Clustered by `digest` (`urn:sha256:<hex>`) for content-addressed deduplication across the entire trajectory corpus.

### Canonical SQL DDL (`sessions`, `trajectories`, `steps`, `actions`, `extension_records`, `blobs`)

The complete BigQuery / GoogleSQL DDL for all six warehouse tables is maintained as a single source of truth in **[`../schema/warehouse.sql`](../schema/warehouse.sql)** (embedded directly from disk on the documentation site and syntax-validated in CI via `sqlglot` in BigQuery dialect).

### Example Cross-Harness Analytical SQL Query

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
