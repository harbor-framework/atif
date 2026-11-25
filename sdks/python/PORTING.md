# Porting Inventory: Harbor ATIF Python Code → `atif`

This document tracks the existing ATIF v1.x Python implementation in [`harbor-framework/harbor`](https://github.com/harbor-framework/harbor) (verified at `main` commit `fc76b3a07959b41e33f36655be02cf1bcc457ef8`) slated for extraction into this standalone package, along with the planned v2.0 capabilities to be added afterward.

The internal module layout of `src/atif/` is intentionally left undecided until extraction begins so v1.x compatibility and v2.0 ergonomics can be designed together cleanly.

## 1. Upstream Harbor Source Files (`src/harbor/models/trajectories/`)

All 11 files in `harbor-framework/harbor/src/harbor/models/trajectories/`:

| Upstream Path | Primary Exports / Responsibility |
| :--- | :--- |
| `src/harbor/models/trajectories/__init__.py` | Public re-exports (`Agent`, `AudioSource`, `ContentPart`, `FinalMetrics`, `ImageSource`, `Metrics`, `Observation`, `ObservationResult`, `Step`, `SubagentTrajectoryRef`, `ToolCall`, `Trajectory`) |
| `src/harbor/models/trajectories/agent.py` | `Agent` model (`name`, `version`, `model_name`, `tool_definitions`, `extra`) |
| `src/harbor/models/trajectories/content.py` | Multimodal content models (`ContentPart`, `ImageSource`, `AudioSource`) introduced in v1.6 / v1.8 |
| `src/harbor/models/trajectories/final_metrics.py` | `FinalMetrics` trajectory-level aggregate token/cost/step/LLM-call metrics |
| `src/harbor/models/trajectories/metrics.py` | `Metrics` per-step token counts, cached tokens, cost, token IDs, and logprobs |
| `src/harbor/models/trajectories/observation.py` | `Observation` container holding `ObservationResult` lists |
| `src/harbor/models/trajectories/observation_result.py` | `ObservationResult` mapping tool call IDs to text/multimodal content, subagent refs, and `extra` |
| `src/harbor/models/trajectories/step.py` | `Step` model (`step_id`, `timestamp`, `source`, `model_name`, `message`, `reasoning_content`, `tool_calls`, `observation`, `metrics`, `is_copied_context`, `extra`) |
| `src/harbor/models/trajectories/subagent_trajectory_ref.py` | `SubagentTrajectoryRef` (`session_id`, `trajectory_id`, `trajectory_path`, `extra`) |
| `src/harbor/models/trajectories/tool_call.py` | `ToolCall` model (`tool_call_id`, `function_name`, `arguments`, `extra`) |
| `src/harbor/models/trajectories/trajectory.py` | Root `Trajectory` model (`schema_version`, `session_id`, `agent`, `steps`, `final_metrics`, `notes`, `continued_trajectory_ref`, `subagent_trajectories`, `extra`) |

## 2. Upstream Harbor Utilities (`src/harbor/utils/`)

| Upstream Path | Primary Exports / Responsibility | Porting Notes |
| :--- | :--- | :--- |
| `src/harbor/utils/trajectory_validator.py` | `TrajectoryValidator`, `validate_trajectory()`, `main()` CLI entrypoint | Validates ATIF v1.x JSON via Pydantic models plus structural checks (sequential `step_id`, subagent/media path references). Generalize to support v1.x and v2.0 validation. |
| `src/harbor/utils/trajectory_utils.py` | `compute_model_usage()`, `load_model_usage_from_trajectory()`, `format_trajectory_json()` | Currently imports `ModelUsage` from `harbor.models.agent.context`; decouple from Harbor-internal types during extraction. |

## 3. Upstream Harbor Unit Tests (`tests/unit/`)

| Upstream Path | Coverage |
| :--- | :--- |
| `tests/unit/models/test_trajectory.py` | Root `Trajectory` model validation, schema versions, embedded `subagent_trajectories` |
| `tests/unit/models/test_step.py` | `Step` validation, sources, reasoning, copied context |
| `tests/unit/models/test_content.py` | Multimodal `ContentPart` and `ImageSource` validation (v1.6) |
| `tests/unit/models/test_content_audio.py` | `AudioSource` validation (v1.8) |
| `tests/unit/models/test_tool_call.py` | `ToolCall` validation and `extra` fields |
| `tests/unit/models/test_observation_result.py` | `ObservationResult` validation and subagent references |
| `tests/unit/test_trajectory_validator.py` | `TrajectoryValidator` error reporting and CLI behavior |
| `tests/unit/utils/test_model_usage.py` | `compute_model_usage()` / `load_model_usage_from_trajectory()` aggregation tests |

## 4. Planned ATIF v2.0 Capabilities

Beyond extracting and maintaining v1.x compatibility for Harbor, the `atif` v2.0 SDK will add:

- **v2.0 Record & Domain Models**: Complete Pydantic v2 models matching [`spec/v2.0/SPEC.md`](../../spec/v2.0/SPEC.md) and [`spec/v2.0/references/canonical-actions.md`](../../spec/v2.0/references/canonical-actions.md) (`AtifRecord` union: `meta`, `event`, `session`, `trajectory`, `step`, `extension`; `Action` + `ActionExecutor` + canonical actions; `EnvironmentDefinition`; `EventBranch`; `BlobReference` & `TruncationInfo`; `Citation`; `StepMetrics` & `FinalMetrics`).
- **Format & Version Auto-Detection**: Inspect JSON vs NDJSON inputs to distinguish ATIF v1.0–v1.8 JSON files from ATIF v2.0 `.atif-e.jsonl` event streams and `.atif.jsonl` consolidated trajectory files.
- **Event Consolidation**: Deterministic `.atif-e.jsonl` → `.atif.jsonl` consolidation handling branching/rewinds (`EventBranch`), parallel out-of-order tool results, compaction, and metric aggregation.
- **v1.x ↔ v2.0 Migration**: Lossless up-conversion from ATIF v1.x trajectories into ATIF v2.0 `.atif.jsonl` per [`spec/v2.0/references/v1-migration.md`](../../spec/v2.0/references/v1-migration.md).
- **Conformance Suite Integration**: Automated pytest runner executing every fixture in [`conformance/manifest.json`](../../conformance/manifest.json) (valid/invalid v1, valid/invalid v2 events & trajectories, and v2 consolidation golden pairs).
- **Harbor Re-Integration**: Update `harbor-framework/harbor` to depend on `atif` and re-export legacy symbols where needed for backwards compatibility.
