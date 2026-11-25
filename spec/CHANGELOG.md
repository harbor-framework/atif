---
title: "ATIF Specification Changelog (v1.0 – v2.0)"
description: "Complete version timeline and release history for the Agent Trajectory Interchange Format from v1.0 through v2.0."
atif_version: "all"
status: "final"
release_date: "2026-11-25"
doc_type: "changelog"
order: 99
source_ref: "harbor-framework/atif"
---

# ATIF Specification Changelog (v1.0 – v2.0)

This changelog summarizes every finalized release of the **Agent Trajectory Interchange Format (ATIF)** from `ATIF-v1.0` through `ATIF-v2.0`. Finalized specifications under `spec/v*/` are immutable once released.

## Version Timeline

| Version | Schema Version | Release Date | Breaking? | Provenance | Highlights |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **[v2.0](./v2.0/SPEC.md)** ([Changelog](./v2.0/CHANGELOG.md)) | `ATIF-v2.0` | 2026-11-25 | **Major** | [harbor-framework/harbor#4134](https://github.com/harbor-framework/harbor/pull/4134) | Dual-mode NDJSON (`events` `.atif-e.jsonl` + `trajectories` `.atif.jsonl`/`.atif.tar.zst`), `EventBranch` + 3-phase stream consolidation, Delta/Self-Contained lineage, interleaved `Step.content[]`, `Step.compaction`, colocated `Step.actions[]` + `Action.executor` + `CanonicalAction` catalog, `EnvironmentDefinition[]`, uniform truncation/blobs, expanded inclusive metrics, reverse-DNS `extensions`, Protobuf + SQL + JSON Schema 2020-12. |
| **[v1.8](./v1.8/SPEC.md)** ([Changelog](./v1.8/CHANGELOG.md)) | `ATIF-v1.8` | 2026-08-26 | No | [harbor@74cc6312](https://github.com/harbor-framework/harbor/commit/74cc6312) (PR #2605) | Audio content parts (`AudioSourceSchema` with `media_type`, `path`, optional `duration_sec`) and strict `ContentPart` source validation. Highest final release of the v1.x line. |
| **[v1.7](./v1.7/SPEC.md)** ([Changelog](./v1.7/CHANGELOG.md)) | `ATIF-v1.7` | 2026-04-27 | **Yes** (vs v1.6) | [harbor@0533a59c](https://github.com/harbor-framework/harbor/commit/0533a59c) (PR #1486) | Embedded `subagent_trajectories`, `trajectory_id` resolution, optional `session_id`, `extra` on `ToolCall`/`ObservationResult`, `llm_call_count`, `is_copied_context`, and `context_management` convention. |
| **[v1.6](./v1.6/SPEC.md)** ([Changelog](./v1.6/CHANGELOG.md)) | `ATIF-v1.6` | 2026-02-03 | No | [harbor@3e68bc8b](https://github.com/harbor-framework/harbor/commit/3e68bc8b) (PR #549) | Multimodal image support (`ContentPartSchema`, `ImageSourceSchema`) on `StepObject.message` and `ObservationResultSchema.content`. |
| **[v1.5](./v1.5/SPEC.md)** ([Changelog](./v1.5/CHANGELOG.md)) | `ATIF-v1.5` | 2025-12-22 | No | [harbor@c573843e](https://github.com/harbor-framework/harbor/commit/c573843e) (PR #225) | Optional `tool_definitions` on `AgentSchema` for SFT datasets. |
| **[v1.4](./v1.4/SPEC.md)** ([Changelog](./v1.4/CHANGELOG.md)) | `ATIF-v1.4` | 2025-12-11 | No | [harbor@b6c9ef26](https://github.com/harbor-framework/harbor/commit/b6c9ef26) (PR #183) | Optional `prompt_token_ids` on `MetricsSchema` and root `continued_trajectory_ref`. |
| **[v1.3](./v1.3/SPEC.md)** ([Changelog](./v1.3/CHANGELOG.md)) | `ATIF-v1.3` | 2025-11-11 | No | [harbor@54cbc0f8](https://github.com/harbor-framework/harbor/commit/54cbc0f8) (PR #84) | Optional `completion_token_ids` on `MetricsSchema` for RL training. |
| **[v1.2](./v1.2/SPEC.md)** ([Changelog](./v1.2/CHANGELOG.md)) | `ATIF-v1.2` | 2025-10-31 | No | [harbor@72ec923e](https://github.com/harbor-framework/harbor/commit/72ec923e) (PR #76) | `observation` extended to `system` steps; inclusive `prompt_tokens` (`cached_tokens` subset); `subagent_trajectory_ref` object→array. |
| **[v1.1](./v1.1/SPEC.md)** ([Changelog](./v1.1/CHANGELOG.md)) | `ATIF-v1.1` | 2025-10-25 | No | [harbor@f5308f11](https://github.com/harbor-framework/harbor/commit/f5308f11) (PR #65) | Optional root-level `extra` custom metadata dictionary on `Trajectory`. |
| **[v1.0](./v1.0/SPEC.md)** ([Changelog](./v1.0/CHANGELOG.md)) | `ATIF-v1.0` | 2025-10-25 | — | [harbor@130f3cfa](https://github.com/harbor-framework/harbor/commit/130f3cfa) (PR #56) | Initial ATIF JSON specification (`schema_version`, `session_id`, `agent`, `steps`, `tool_calls`, `observation`, `metrics`, `final_metrics`). |

---

## Release Notes Summary

### ATIF v2.0 (`2026-11-25`)
See the full [ATIF v2.0 Changelog](./v2.0/CHANGELOG.md) and [v1.x Migration Guide](./v2.0/references/migration-and-extensions.md). Key milestones:
- Unified NDJSON wire format with two document modes (`events` `.atif-e.jsonl` and `trajectories` `.atif.jsonl` / `.atif.tar.zst`) sharing one `AtifRecord` envelope.
- Explicit DAG branching via `EventBranch` and a deterministic Three-Phase Stream Consolidation Algorithm producing linear `1..N` steps per trajectory.
- Colocated `Action` model with closed `Action.executor` (`client`, `environment`, `provider`, `external`), multi-environment targeting (`EnvironmentDefinition[]`), and 28 strongly typed `CanonicalAction` overlays.
- First-class `Step.compaction`, `Step.agent_name`, `Step.citations`, `StepMetrics.duration_ms`, content-addressed blobs & local `truncated_fields`, reverse-DNS `extensions`, and co-maintained Protobuf, BigQuery/DuckDB SQL, and JSON Schema 2020-12 definitions.

### ATIF v1.8 (`2026-08-26`)
Added `AudioSourceSchema` (`media_type`, `path`, optional `duration_sec`) to `ContentPartSchema` for multimodal audio inputs and tool observations, along with strict `ContentPart` source validation. See [v1.8 Changelog](./v1.8/CHANGELOG.md).

### ATIF v1.7 (`2026-04-27`) — Breaking Change vs. v1.6
Added embedded `subagent_trajectories` and `trajectory_id`-based subagent resolution (replacing path-only v1.6 `SubagentTrajectoryRef` assumptions), made `session_id` optional, added `extra` on `ToolCall` and `ObservationResult`, added `Step.llm_call_count` and `is_copied_context`, and standardized `step.extra.context_management`. See [v1.7 Changelog](./v1.7/CHANGELOG.md).

### ATIF v1.6 (`2026-02-03`)
Added multimodal image support via `ContentPartSchema` (`text`, `image`) and `ImageSourceSchema` on `StepObject.message` and `ObservationResultSchema.content`. See [v1.6 Changelog](./v1.6/CHANGELOG.md).

### ATIF v1.5 (`2025-12-22`)
Added optional `tool_definitions` on `AgentSchema` (OpenAI function-tool format for SFT datasets). See [v1.5 Changelog](./v1.5/CHANGELOG.md).

### ATIF v1.4 (`2025-12-11`)
Added optional `prompt_token_ids` on `MetricsSchema` to capture input token IDs for RL training pipelines and root-level `continued_trajectory_ref`. See [v1.4 Changelog](./v1.4/CHANGELOG.md).

### ATIF v1.3 (`2025-11-11`)
Added optional `completion_token_ids` on `MetricsSchema` for token-level RL training alongside `logprobs`. See [v1.3 Changelog](./v1.3/CHANGELOG.md).

### ATIF v1.2 (`2025-10-31`)
Extended `observation` support to `system` steps, clarified the inclusive `prompt_tokens` invariant (`cached_tokens` is a subset of `prompt_tokens`), and changed `subagent_trajectory_ref` from a single object to an array. See [v1.2 Changelog](./v1.2/CHANGELOG.md).

### ATIF v1.1 (`2025-10-25`)
Added optional root-level `extra` metadata dictionary to the top-level `Trajectory` object. See [v1.1 Changelog](./v1.1/CHANGELOG.md).

### ATIF v1.0 (`2025-10-25`)
Initial public release of the Agent Trajectory Interchange Format (Harbor RFC 0001), establishing single-document JSON trajectory capture for evaluation, debugging, SFT, and RL. See [v1.0 Changelog](./v1.0/CHANGELOG.md).
