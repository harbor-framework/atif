---
title: "ATIF v1.x to v2.0 Migration"
description: "Normative format detection and lossless ATIF v1.0–v1.8 to v2.0 field mapping and round-trip rules."
atif_version: "2.0"
schema_version: "ATIF-v2.0"
status: "draft"
release_date: "2026-11-25"
doc_type: "reference"
order: 50
source_ref: "harbor-framework/harbor#4134"
---

# ATIF v1.x to v2.0 Migration

*Normative companion to [ATIF v2.0 Specification](../SPEC.md) · Status: Working Draft · Legacy spec: [ATIF v1.8 Specification](../../v1.8/SPEC.md) · Round-trip extension schema: [`com.harborframework.v1`](./extensions.md#comharborframeworkv1).*

---

## Round-Trip Invariant

Every valid ATIF v1.0–v1.8 document upgrades losslessly to ATIF v2.0. When `extensions["com.harborframework.v1"]` is retained, downgrading back to v1.x preserves full semantic equivalence (with `Step.timestamp` normalized to UTC RFC 3339 `Z`).

*(For token normalization formulas across Anthropic, OpenAI, Gemini, OpenCode, and OpenHands, see [Cross-Provider Token Normalization](../SPEC.md#cross-provider-token-normalization).)*

---

## Format Detection

Readers loading an arbitrary ATIF file without relying on file extensions MUST detect the format in the following order:

1. Line 1 parses as JSON with `type == "meta"` → **ATIF v2.0 NDJSON** (dispatch on `meta.document_type`: `"events"` or `"trajectories"`).
2. Line 1 parses as JSON with `schema_version` starting with `"ATIF-v1"` → minified **ATIF v1.x JSON**.
3. Line 1 parses as JSON with `type == "event"` → headerless **ATIF v2.0 `"events"` stream**.
4. Otherwise, parse the full file as a single JSON document → pretty-printed **ATIF v1.x JSON** (`trajectory.json`).

---

## Field Mapping (`v1.0–v1.8` → `v2.0`)

| ATIF v1.0–v1.8 Construct | ATIF v2.0 Equivalent | Upgrade Rule (`v1 -> v2`) |
| :--- | :--- | :--- |
| `Trajectory.schema_version` (`"ATIF-v1.0"`..`"ATIF-v1.8"`) | Line 1 `DocumentMeta` (`schema_version: "ATIF-v2.0"`, `document_type: "trajectories"`) | Emit line 1 `MetaRecord`; record the original v1 minor version in `Trajectory.extensions["com.harborframework.v1"].schema_version`. |
| `Trajectory.session_id` & `Trajectory.trajectory_id` | Envelope `trajectory_id` & `session_id?` | See [Session and Trajectory Identifiers](#session-and-trajectory-identifiers). |
| `Trajectory.continued_trajectory_ref` (v1.0) | Single trajectory with `Step.compaction` | See [Continuation Chains (`continued_trajectory_ref`)](#continuation-chains-continued_trajectory_ref). |
| `Trajectory.subagent_trajectories` (v1.7) | Flattened sibling `trajectory` + `step` records | See [Embedded Subagents (`subagent_trajectories`)](#embedded-subagents-subagent_trajectories). |
| `Trajectory.notes` | `Trajectory.notes` | Copy verbatim. |
| `Agent.{name, version, model_name}` | `AgentMetadata.{name, version, model: { name }}` | Copy `name` and `version`; wrap `model_name` into `agent.model = { name: model_name }`. Extract `Agent.extra.instructions` / `system_instructions` to `agent.system_instructions`, and `Agent.extra.{cwd, git}` to `Trajectory.environments` (`[{ cwd, vcs }]`). |
| `Agent.tool_definitions` (v1.5 OpenAI function list) | `AgentMetadata.tools: ToolDefinition[]` | Map each `{ type: "function", function: { name, description, parameters } }` to `{ name, description, input_schema: parameters }`; preserve non-standard fields (`strict`, custom tool types) in `ToolDefinition.extensions["com.harborframework.v1"]`. |
| `Step.{step_id, source, timestamp}` | `Step.{step_id, source, start_time, end_time}` | Copy `step_id` and `source`; normalize `timestamp` to UTC RFC 3339 (`Z`) and set both `start_time` and `end_time` to that timestamp (unless a distinct `end_time` was recorded in `extra`). On `v2 -> v1` downgrade, emit `Step.timestamp` in UTC RFC 3339 (`Z`) from `Step.start_time`. |
| `Step.model_name` & `Step.reasoning_effort: str \| float` | `Step.model: ModelMetadata` | Set `step.model.name = model_name` (if set). Map string `reasoning_effort` to `step.model.reasoning_effort` and numeric `reasoning_effort` to `step.model.reasoning_budget`. |
| `Step.message: str \| ContentPart[]` & `Step.reasoning_content` | `Step.content: ContentPart[]` | If `reasoning_content` is present, emit `{ type: "reasoning", reasoning: { text: reasoning_content } }` first. Convert string `message` to `{ type: "text", text: message }` (recording `message_was_string: true` in `com.harborframework.v1`), or preserve array `ContentPart` items in order, followed by `{ type: "action", action_id }` markers for each `tool_calls` entry. |
| `ImageSource` (v1.6) & `AudioSource` (v1.8) | `ContentPart { type: "image" \| "audio", source: MediaSource }` | Preserve `type`, `source.media_type`, and `source.duration_sec`; rename `source.path` → `source.uri`. If the file is accessible at upgrade time, compute `source.digest: "urn:sha256:..."` and `source.size_bytes`; otherwise leave `digest` omitted and retain `source.uri`. |
| `Step.is_copied_context` (v1.5) | `Step.original_trajectory_id` + `original_trajectory_reason` | When `true`, set `original_trajectory_id` to `trajectory.parent_trajectory_id` (or `"(unknown)"` if unavailable) and `original_trajectory_reason` to `trajectory.parent_reason` (defaulting to `"continuation"` for continuation files or `"fork"` for forks). Omit both when `false`/absent. On downgrade, any non-null `original_trajectory_id` maps back to `is_copied_context: true`. |
| `Step.llm_call_count` (v1.7) | `Step.extensions["com.harborframework.v1"].llm_call_count` | Preserve explicit v1.7 `llm_call_count` (`0`, `1`, or `> 1`) for lossless round-tripping; in native v2.0 each `agent` `Step` with model content/metrics represents one LLM call. |
| `Step.extra.context_management` (v1.7) | `Step.compaction: CompactionInfo` | Map `context_management.{type, boundary}` to `compaction.{trigger: type, boundary}`, compaction observation/message text to `compaction.summary`, and `tokens_before` / `tokens_after`. |
| `Step.tool_calls` + `Step.observation.results` | `Step.actions: Action[]` + `Action.canonical` | See [Tool Calls, Observations, and Subagent Refs](#tool-calls-observations-and-subagent-refs). |
| `Step.metrics` (`prompt_tokens`, `completion_tokens`, `cached_tokens`, `cost_usd`, RL arrays, `extra`) | `Step.metrics: StepMetrics` | Map `prompt_tokens` → `input_tokens`, `completion_tokens` → `output_tokens`, `cached_tokens` → `cache_read_tokens`; copy `cost_usd`, `prompt_token_ids`, `completion_token_ids`, `logprobs`. Extract `metrics.extra` aliases: `cache_write_tokens` / `cache_write_input_tokens` / `cache_creation_input_tokens` / `cache_creation_tokens` → `cache_write_tokens`; `reasoning_tokens` / `reasoning_output_tokens` / `thoughts_tokens` / `thoughts` → `reasoning_tokens`; `cost_source` → `cost_source` (preserving the inclusive invariant). |
| `Trajectory.final_metrics` | `Trajectory.final_metrics: FinalMetrics` | Map `total_prompt_tokens` → `total_input_tokens`, `total_completion_tokens` → `total_output_tokens`, `total_cached_tokens` → `total_cache_read_tokens`; copy `total_cost_usd` and `total_steps`; extract `total_cache_write_tokens`, `total_reasoning_tokens`, `total_duration_ms`, and `cost_source` from `final_metrics.extra`. |
| Unpromoted `extra` keys | `extensions["com.harborframework.v1"]` | Store unpromoted `extra` keys under `extensions["com.harborframework.v1"].extra`, and separate `tool_call_extra` / `observation_extra` on `Action` so shared keys never collide. |

---

## Detailed Structural Upgrade Rules

### Session and Trajectory Identifiers

- **Root trajectory with `session_id` only (v1.0–v1.6)**: Set `trajectory_id = session_id`, preserve `session_id`, and record `omitted_trajectory_id: true` in `Trajectory.extensions["com.harborframework.v1"]`.
- **Root trajectory with `trajectory_id` only (v1.7+)**: Keep `trajectory_id` and leave `session_id` omitted (do not fabricate a `session_id`).
- **Root trajectory omitting both**: Require the caller to supply an explicit `trajectory_id` (raise a validation error if none is provided) and record `omitted_trajectory_id: true`.
- **Embedded `subagent_trajectories`**: Keep `trajectory_id` (or synthesize `"<parent_id>#sub-<index>"` if omitted) and inherit the parent's `session_id` only when the parent has one (recording `omitted_session_id: true` if originally omitted).

### Continuation Chains (`continued_trajectory_ref`)

In ATIF v2.0, context compaction lives inside the trajectory via `Step.compaction: CompactionInfo`:

1. When upgrading a chain of v1.x files linked by `continued_trajectory_ref`, concatenate the continuation segments into a **single trajectory** and renumber `step_id` contiguously `1..N`.
2. Convert each handoff boundary step (`observation.results[].subagent_trajectory_ref`) into a `Step.compaction` step (`trigger: "subagent_handoff"`, `boundary: "replace"`, `step_id_start`, `step_id_end`, `compaction_trajectory_id`), preserving any multi-ref handoff metadata in `compaction.extensions["com.harborframework.v1"].subagent_trajectory_ref`.
3. When upgrading a single v1 continuation file in isolation whose predecessor is unavailable, set `parent_trajectory_id` and `parent_reason: "continuation"`, and record `continued_trajectory_ref` in `extensions["com.harborframework.v1"].continued_trajectory_ref`.

### Embedded Subagents (`subagent_trajectories`)

Recursively flatten `Trajectory.subagent_trajectories` into sibling `TrajectoryRecord` + `StepRecord` lines in chronological spawn order (emitting a `SessionRecord` when `session_id` is present). Populate `parent_trajectory_id`, `ancestor_trajectory_ids`, `parent_reason: "subagent"` (or `"compaction"` when referenced by a compaction step), `parent_action_id` (from the referencing `source_call_id`), and derived `parent_step_id`.

### Tool Calls, Observations, and Subagent Refs

1. **1:1 join**: Join each `ToolCall` (`tool_call_id`, `function_name`, `arguments`) with its matching `ObservationResult` (`source_call_id == tool_call_id`) into `Action { action_id, name: function_name, arguments, output: [...] }`. If a v1 producer reused `tool_call_id` across distinct steps, scope-prefix on collision (`"<step_id>:<tool_call_id>"`) and record the original ID in `extensions["com.harborframework.v1"]`.
2. **1:N results per `tool_call_id`**: Append each result's content part(s) in order into `Action.output`, map 1 subagent reference to `Action.canonical.subagent` (or `> 1` to `Action.canonical.multi.actions[]`), and preserve raw result boundaries in `Action.extensions["com.harborframework.v1"]`.
3. **Null `source_call_id` observations** (on `agent`, `user`, or `system` steps):
   - On a compaction `system` step with `subagent_trajectory_ref`: set `Step.compaction.compaction_trajectory_id` to the primary compaction trajectory ID, set `Step.compaction.summary`, and preserve the raw `subagent_trajectory_ref` list in `Step.compaction.extensions["com.harborframework.v1"]`.
   - Otherwise: emit a synthetic `Action { action_id: "<step_id>-obs-<index>", type: "internal", name: "observation", output, canonical }`.
4. **Multimodal `ObservationResult.content`**: Map each v1 `ContentPart` directly into `Action.output` (`{ type: "text", text }`, or `{ type: "image" | "audio", source: { media_type, uri: path, duration_sec? } }`) preserving exact part order.
5. **`SubagentTrajectoryRef`**: Map `trajectory_id` → `CanonicalSubagent.trajectory_id`, `trajectory_path` → `CanonicalSubagent.uri`, and `extra.agent_name` / `subagent_type` → `CanonicalSubagent.agent_name` (using `canonical.multi` for `> 1` subagent or `CompactionInfo.compaction_trajectory_id` on compaction steps). Preserve `session_id` and remaining `extra` in `extensions["com.harborframework.v1"].subagent_trajectory_ref`.
