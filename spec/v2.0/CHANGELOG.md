---
title: "ATIF v2.0 Changelog"
description: "Summary of architectural changes, new features, and breaking changes from ATIF v1.8 to ATIF v2.0."
atif_version: "2.0"
schema_version: "ATIF-v2.0"
status: "final"
release_date: "2026-11-25"
doc_type: "changelog"
order: 90
source_ref: "harbor-framework/harbor#4134"
supersedes: "1.8"
---

# ATIF v2.0 Changelog

- **Release Date**: 2026-11-25
- **Schema Version**: `ATIF-v2.0`
- **Supersedes**: [ATIF v1.8](../v1.8/SPEC.md)
- **Provenance**: [Harbor RFC 0004 (PR #4134)](https://github.com/harbor-framework/harbor/pull/4134)

ATIF v2.0 is a major architectural upgrade addressing streaming runtime capture, non-linear execution and branching, unified tool/observation actions with canonical semantic overlays, bounded inline payloads with content-addressed blobs, multi-environment configuration, and 1:1 Protobuf / SQL warehouse projections.

> [!IMPORTANT]
> **Breaking Changes from ATIF v1.x**: ATIF v2.0 replaces the monolithic single-JSON v1.x format (`trajectory.json`) with a unified NDJSON envelope (`AtifRecord`) and restructures `Step`, `Action`, `AgentMetadata`, `StepMetrics`, and `extensions`. Lossless automated `v1.0–v1.8 <-> v2.0` round-trip rules are specified in [ATIF v1.x Migration, Token Normalization, & Official Extensions](./references/migration-and-extensions.md).

---

## Major Additions & Architectural Changes

### 1. Unified Dual-Mode NDJSON (`events` & `trajectories`)
- Introduced the universal **`AtifRecord`** line envelope (`meta`, `event`, `session`, `trajectory`, `step`, `extension`) with line 1 `type: "meta"` declaring `schema_version: "ATIF-v2.0"` and `document_type: "events" | "trajectories"`.
- Added append-only **`events` documents (`.atif-e.jsonl`)** for stateless 1:1 streaming capture from live harnesses (Claude Code, Codex CLI, Cursor, OpenCode, Pi, OpenHands) without in-memory turn buffering.
- Added consolidated **`trajectories` documents (`.atif.jsonl` and `.atif.tar.zst`)** with an optional line-1 `meta.manifest` directory preview for fast metadata inspection and $O(1)$-memory sequential reading.
- Defined the deterministic **Three-Phase Stream Consolidation Algorithm** (`events` → `trajectories`) including `EventBranch` cursor tracking, a 3-state turn folding machine (`IDLE`, `GENERATING`, `OBSERVED`), and derived field computation.

### 2. Sessions, Non-Linear Lineage, & Branching (`EventBranch`)
- Promoted `Session` (`type: "session"`) and flat sibling `Trajectory` (`type: "trajectory"`) rows, replacing v1.7's recursive nested `subagent_trajectories` and v1.0's multi-file `continued_trajectory_ref`.
- Added explicit lineage metadata (`parent_trajectory_id`, `parent_reason`, `parent_event_id`, `parent_action_id`, `parent_step_id`, `parent_steps_excluded`, `ancestor_trajectory_ids`, `child_trajectory_ids`, `trajectory_depth`) supporting subagents, forks, rewinds, retries, Best-of-$N$ candidates, compactions, and continuations.
- Added **Delta Mode** (`parent_steps_excluded: true`, omitting unchanged shared prefix steps while preserving `step_id` invariance via `first_step_id`) and **Self-Contained Mode** (`original_trajectory_id` / `original_trajectory_reason` per copied step).

### 3. Unified `Step.content[]`, `CompactionInfo`, Attribution, & Citations
- Replaced v1.x's separate `Step.message` (`str | ContentPart[]`) and `Step.reasoning_content` with unified interleaved `Step.content: ContentPart[]` supporting `text`, `reasoning` (with `summarized` and cryptographic `signature`), `data`, `image`, `audio`, `video`, `document`, and `action` (`action_id`) markers.
- Promoted in-trajectory context compaction from `step.extra.context_management` to first-class **`Step.compaction: CompactionInfo`** (`trigger`, `boundary`, `event_id_start/end`, `step_id_start/end`, `summary`, `tokens_before/after`, `compaction_trajectory_id`).
- Replaced single `Step.timestamp` with explicit `Step.start_time` and `Step.end_time`.
- Added **`Step.agent_name`** (single-thread multi-agent attribution), **`Step.citations`** (`Citation[]` for grounding references), `Step.event_ids`, `Step.stop_reason`, and `Step.error`.

### 4. Colocated `Action`, Execution Planes (`Action.executor`), & Canonical Actions Catalog
- Merged v1.x's split `Step.tool_calls[]` and `Step.observation.results[]` into colocated **`Step.actions: Action[]`** with `arguments`, `output: ContentPart[]`, `errored`, `start_time`/`end_time`, `approval: ApprovalInfo`, `task_id`/`task_detached`, `model`/`metrics` (for tool-internal LLM calls), and `parent_action_id`.
- Added closed 4-value **`Action.executor`** (`"client" | "environment" | "provider" | "external"`) and **`Action.environment_name`** targeting named environments in `Trajectory.environments[]`.
- Introduced strongly typed **`Action.canonical` (`CanonicalAction`)** with 28 canonical action types across command execution, filesystem operations (including `file_read.digest`, `file_write` `operation`/`before_digest`/`after_digest`, and `file_delete`), multi-agent coordination (`subagent`, `message_send`, `message_read`, `elicitation`, `timer`, `synthetic_context`), task management, web/search, skills, media generation, resource discovery, orthogonal **`canonical.mcp`** provenance, and `canonical.extension` ([Canonical Actions Catalog](./references/canonical-actions.md)).

### 5. Harness & Multi-Environment Configuration (`AgentMetadata` & `EnvironmentDefinition[]`)
- Expanded `Agent` into **`AgentMetadata`** with `role`, `identifier` (`ArdUrn`), structured `ModelMetadata` (`provider`, `reasoning_effort` vs numeric `reasoning_budget`, `context_window_tokens`, `parameters`), `system_instructions`, `skills`, `mcp_servers`, `subagents`, and MCP-aligned **`tools: ToolDefinition[]`** (replacing OpenAI-wrapped `tool_definitions`).
- Added **`Trajectory.environments: EnvironmentDefinition[]`** capturing `name`, `os`, `os_version`, `arch`, `cwd`, `shell`, `sandbox`, and `vcs` state for single- and multi-environment agent runs.

### 6. Uniform Inline Truncation (`truncated_fields`) & Content-Addressed Blobs
- Added local **`truncated_fields`** (`original_bytes`, `strategy`, optional `blob: BlobReference`) across `AgentMetadata`, `SubagentDefinition`, `ContentPart`, `Action`, `Step`, and `Trajectory` so inline previews stay bounded (16 KiB default) while full payloads offload cleanly to content-addressed `urn:sha256:<64-hex>` blobs or `.atif.tar.zst` archives.
- Unified `ImageSource` and `AudioSource` into **`MediaSource`** (`BlobReference` + optional `duration_sec`), renaming `path` to RFC 3986 `uri` and accepting any IANA `media_type`.

### 7. Expanded Inclusive Metrics & Namespaced Extensions
- Renamed `prompt_tokens`/`completion_tokens`/`cached_tokens` to inclusive **`input_tokens`**, **`output_tokens`**, and **`cache_read_tokens`**, and added **`cache_write_tokens`**, **`reasoning_tokens`**, **`cost_source`**, **`retry_count`**, **`time_to_first_token_ms`**, **`duration_ms`**, **`response_id`**, **`total_llm_calls`**, **`total_duration_ms`**, and **`granular: GranularTokenUsage[]`** while preserving RL `prompt_token_ids`, `completion_token_ids`, and `logprobs`.
- Replaced untyped `extra` dicts with reverse-DNS / URI-namespaced **`extensions`**, appendable top-level **`ExtensionRecord`** lines, and official **`com.harborframework.{evaluation,rl,v1}`** extension schemas.

### 8. Machine-Readable Wire, Validation, & Warehouse Projections
- Added normative **Protocol Buffer v3** schema ([`schema/atif.proto`](./schema/atif.proto) + [`schema/buf.yaml`](./schema/buf.yaml)).
- Added **JSON Schema Draft 2020-12** validation schemas ([`schema/atif-record.schema.json`](./schema/atif-record.schema.json), [`schema/canonical-actions.schema.json`](./schema/canonical-actions.schema.json), [`schema/common-defs.schema.json`](./schema/common-defs.schema.json)).
- Added **BigQuery / DuckDB / Parquet warehouse SQL DDL** ([`schema/warehouse.sql`](./schema/warehouse.sql)) for `sessions`, `trajectories`, `steps`, `actions`, `extension_records`, and `blobs`.
