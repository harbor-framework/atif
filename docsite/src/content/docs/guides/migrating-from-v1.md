---
title: Migrating from ATIF v1.x to v2.0
description: Practical migration guide from ATIF v1.0–v1.8 monolithic JSON documents to ATIF v2.0 dual-mode NDJSON, unified Actions, branching lineage, and inclusive token accounting.
sidebar:
  order: 2
---

ATIF v2.0 is a major revision designed for streaming harnesses, non-linear execution (rewinds, retries, subagents, compaction), cross-harness canonical actions, content-addressed blobs, and direct SQL/Protobuf projections.

:::tip[Interactive Visual Walkthrough & Normative Mapping]
For a visual, side-by-side tour of how ATIF evolved from v1.x to v2.0, open the **[ATIF 2.0 Interactive Explainer](https://mbleigh.github.io/harbor/)**. For the complete field-by-field normative upgrade contract and round-trip rules, see **[ATIF v1.x to v2.0 Migration](/spec/v2.0/references/v1-migration/)** and **[Official Extension Namespaces](/spec/v2.0/references/extensions/)**.
:::

## Transition Strategy: Lossless Round-Tripping & Dual-Write

Every valid ATIF v1.0–v1.8 document upgrades losslessly to ATIF v2.0, and downgrading back to v1.x recovers full semantic equivalence when the `extensions["com.harborframework.v1"]` compatibility namespace is preserved (with `Step.timestamp` normalized to UTC RFC 3339 `Z`).

During ecosystem migration, producers are encouraged to **dual-write** legacy `trajectory.json` (`ATIF-v1.8`) alongside `.atif.jsonl` (`ATIF-v2.0`) until downstream viewers, evaluators, and training pipelines adopt v2.0. Consumers should implement the 4-step [format detector](/guides/quickstart/#consumer-path-detect-format--stream-records) so they read both v1.x JSON and v2.0 NDJSON transparently.

---

## Key Breaking Changes at a Glance

| Area | ATIF v1.x (`v1.0`–`v1.8`) | ATIF v2.0 (`ATIF-v2.0`) |
| :--- | :--- | :--- |
| **Wire Format** | Single monolithic JSON file (`trajectory.json`) | Dual-mode NDJSON sharing `AtifRecord`: `.atif-e.jsonl` (`events`) and `.atif.jsonl` / `.atif.tar.zst` (`trajectories`), declared on line 1 `type: "meta"` |
| **Identity** | `session_id` (optional in v1.7+); `trajectory_id` (optional) | Envelope `trajectory_id` **required** and unique per file; `session_id` remains optional |
| **Step Content** | Separate `message: str \| ContentPart[]` and `reasoning_content: str` | Unified interleaved `Step.content: ContentPart[]` (`text`, `reasoning`, `data`, `image`, `audio`, `video`, `document`, `action`) |
| **Tool Calls & Outputs** | Split `Step.tool_calls[]` + `Step.observation.results[]` joined via `source_call_id` | Colocated `Step.actions: Action[]` with `arguments`, `output: ContentPart[]`, `errored`, `executor`, `environment_name`, `approval`, and `canonical` |
| **Subagents & Branching** | Nested `subagent_trajectories[]`; no rewind/retry model | Flat sibling `"trajectory"` + `"step"` rows with `parent_*` lineage, `EventBranch` jumps, and Delta vs. Self-Contained prefix modes |
| **Context Compaction** | Multi-file `continued_trajectory_ref` or `step.extra.context_management` | In-trajectory `Step.compaction: CompactionInfo`; v1 continuation chains merge into a single trajectory |
| **Agent & Environment** | `Agent.{name, version, model_name, tool_definitions}` (OpenAI wrapper); ad-hoc `extra.{cwd, git}` | `AgentMetadata` (`model`, `system_instructions`, `skills`, `mcp_servers`, `subagents`, MCP-aligned `tools`) + `Trajectory.environments: EnvironmentDefinition[]` |
| **Metrics & Tokens** | `prompt_tokens`, `completion_tokens`, `cached_tokens` | `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`, `reasoning_tokens`, `time_to_first_token_ms`, `duration_ms`, `cost_source` |
| **Custom Metadata** | Untyped `extra: dict[str, Any]` | Reverse-DNS / URL-namespaced `extensions`, top-level `"extension"` rows, and official `com.harborframework.{evaluation,rl,v1}` namespaces |

---

## Before & After: Monolithic v1.8 JSON to v2.0 `.atif.jsonl`

### Before (ATIF v1.8 `trajectory.json`)

```json
{
  "schema_version": "ATIF-v1.8",
  "session_id": "sess-1",
  "agent": {
    "name": "claude-code",
    "version": "2.0.15",
    "model_name": "claude-sonnet-4-5",
    "extra": {
      "cwd": "/workspace"
    }
  },
  "steps": [
    {
      "step_id": 1,
      "timestamp": "2026-10-30T18:00:01Z",
      "source": "user",
      "message": "Run pytest on auth."
    },
    {
      "step_id": 2,
      "timestamp": "2026-10-30T18:00:02Z",
      "source": "agent",
      "reasoning_content": "I'll run pytest on test_auth.py.",
      "message": "Running pytest now.",
      "tool_calls": [
        {
          "tool_call_id": "toolu_01",
          "function_name": "Bash",
          "arguments": { "command": "pytest test_auth.py" }
        }
      ],
      "observation": {
        "results": [
          {
            "source_call_id": "toolu_01",
            "content": "1 passed in 0.12s"
          }
        ]
      },
      "metrics": {
        "prompt_tokens": 1200,
        "completion_tokens": 45,
        "cached_tokens": 1000,
        "cost_usd": 0.0015
      }
    }
  ]
}
```

### After (ATIF v2.0 `session.atif.jsonl`)

```jsonl
{"type":"meta","meta":{"schema_version":"ATIF-v2.0","document_type":"trajectories","create_time":"2026-10-30T18:00:07Z"}}
{"type":"session","session_id":"sess-1","session":{"start_time":"2026-10-30T18:00:01Z","end_time":"2026-10-30T18:00:04Z"}}
{"type":"trajectory","session_id":"sess-1","trajectory_id":"sess-1","trajectory":{"status":"completed","start_time":"2026-10-30T18:00:01Z","end_time":"2026-10-30T18:00:04Z","step_count":2,"first_step_id":1,"agent":{"name":"claude-code","version":"2.0.15","model":{"name":"claude-sonnet-4-5","provider":"anthropic"}},"environments":[{"os":"linux","cwd":"/workspace"}],"extensions":{"com.harborframework.v1":{"schema_version":"ATIF-v1.8","omitted_trajectory_id":true}}}}
{"type":"step","session_id":"sess-1","trajectory_id":"sess-1","step":{"step_id":1,"source":"user","start_time":"2026-10-30T18:00:01Z","end_time":"2026-10-30T18:00:01Z","content":[{"type":"text","text":"Run pytest on auth."}]}}
{"type":"step","session_id":"sess-1","trajectory_id":"sess-1","step":{"step_id":2,"source":"agent","start_time":"2026-10-30T18:00:02Z","end_time":"2026-10-30T18:00:04Z","content":[{"type":"reasoning","reasoning":{"text":"I'll run pytest on test_auth.py."}},{"type":"text","text":"Running pytest now."},{"type":"action","action_id":"toolu_01"}],"actions":[{"action_id":"toolu_01","type":"tool","executor":"environment","name":"Bash","arguments":{"command":"pytest test_auth.py"},"output":[{"type":"text","text":"1 passed in 0.12s"}],"canonical":{"type":"shell_command","shell_command":{"cwd":"/workspace","command":"pytest test_auth.py","exit_code":0}}}],"stop_reason":"tools","metrics":{"input_tokens":1200,"output_tokens":45,"cache_read_tokens":1000,"cost_usd":0.0015,"cost_source":"reported"}}}
```

---

## Deep Dive on Major Architectural Changes

### 1. Unified `Action` (Replacing `tool_calls` + `observation`)

In v1.x, inspecting a tool execution required joining `step.tool_calls[]` against `step.observation.results[]` via `tool_call_id == source_call_id`. In v2.0:

- Each invocation and its result live on one `Action` inside `Step.actions[]`, referenced in generation order by `{ "type": "action", "action_id": "..." }` inside `Step.content[]`.
- `ToolCall.tool_call_id` becomes `Action.action_id` (unique across the trajectory; scope-prefix as `"<step_id>:<tool_call_id>"` if a v1 producer reused IDs across steps).
- `ToolCall.function_name` becomes `Action.name`, and `ObservationResult.content` becomes `Action.output: ContentPart[]`.
- **1:N observations** per `tool_call_id` append their content parts into `Action.output` in order (mapping multiple subagent refs via `canonical.multi`).
- **Unlinked observations (`source_call_id: null`)** map to `Step.compaction` on compaction steps, or to synthetic internal actions (`{ "action_id": "<step_id>-obs-<index>", "type": "internal", "name": "observation", "output": [...] }`).
- **Semantic normalization**: Populate `Action.canonical` (such as `shell_command`, `file_read`, `file_write`, `file_delete`, `subagent`, `message_send`, `message_read`, or orthogonal `mcp` provenance) so queries never depend on raw harness tool names.

### 2. Multi-Environment `environments[]` & `Action.executor`

Instead of hiding workspace paths and Git metadata in `Agent.extra`, v2.0 models one or more runtime environments directly on `Trajectory.environments: EnvironmentDefinition[]`:

```json
{
  "environments": [
    {
      "name": "sandbox",
      "os": "linux",
      "arch": "x86_64",
      "cwd": "/workspace",
      "sandbox": { "type": "docker", "image": "python:3.12-slim", "network_restricted": true },
      "vcs": { "system": "git", "branch": "main", "commit": "a1b2c3d", "dirty": false }
    }
  ]
}
```

Every `Action` (and `ToolDefinition` default) can also declare **where** execution ran via the closed 4-value `Action.executor` plane:
- `"client"` — Agent orchestrator/controller (subagent dispatch, local credential proxy)
- `"environment"` — Runtime workspace/container listed in `Trajectory.environments[]` (targeted by `Action.environment_name`, defaulting to `environments[0]`)
- `"provider"` — Server-side inside the LLM API/router (Anthropic `server_tool_use`, built-in web search)
- `"external"` — External service such as an MCP server or remote API

### 3. Merging `continued_trajectory_ref` into In-Trajectory `Step.compaction`

ATIF v1.4 introduced `Trajectory.continued_trajectory_ref` because v1.x originally lacked an in-trajectory context compaction construct — harnesses like `terminus_2` wrote post-summary steps into separate files (`trajectory.cont-1.json`).

In v2.0, context compaction is a first-class field on `Step`:

```json
{
  "step_id": 14,
  "source": "system",
  "compaction": {
    "trigger": "subagent_handoff",
    "boundary": "replace",
    "step_id_start": 1,
    "step_id_end": 13,
    "summary": "Summary of prior investigation and failing auth tests...",
    "tokens_before": 142000,
    "tokens_after": 6400,
    "compaction_trajectory_id": "traj-1#compaction-1"
  }
}
```

When upgrading a chain of v1.x files linked by `continued_trajectory_ref`, **concatenate the chain into a single ATIF v2.0 trajectory**, insert a `Step.compaction` boundary step at each handoff, and renumber `step_id` contiguously `1..N`. Only use `parent_reason: "continuation"` if upgrading a single isolated continuation file whose predecessor is unavailable.

### 4. Flat Lineage, `EventBranch`, & Delta Mode

- **Embedded `subagent_trajectories` (v1.7)** are flattened into sibling `"trajectory"` and `"step"` rows in chronological spawn order, linked via `parent_trajectory_id`, `parent_reason: "subagent"`, `parent_action_id`, derived `parent_step_id`, and `ancestor_trajectory_ids`.
- **Rewinds & retries** in `.atif-e.jsonl` use `TrajectoryEvent.branch: { after_event_id, reason? }`. During consolidation, the final winning path stays on the main trajectory while displaced tips become sibling trajectories (`<parent_id>#retry-1`, `<parent_id>#rewind-1`).
- **Delta Mode (`parent_steps_excluded: true`)** avoids duplicating shared prefix steps when the parent trajectory appears earlier in the same file, starting the child at `first_step_id = parent_step_id + 1`. Self-contained exports omit `parent_steps_excluded` and copy prefix steps stamped with `original_trajectory_id` so `Session.final_metrics` and RL/SFT pipelines never double-count copied turns (`original_trajectory_id == null`).
- **v1.7 `Step.is_copied_context: true`** upgrades to `original_trajectory_id` (set to `parent_trajectory_id` or `"(unknown)"`) plus `original_trajectory_reason` (`"continuation"` or `"fork"`).

### 5. Inclusive Token Accounting

ATIF v2.0 renames `prompt_tokens` → `input_tokens`, `completion_tokens` → `output_tokens`, and `cached_tokens` → `cache_read_tokens`, and promotes `cache_write_tokens` and `reasoning_tokens` into core `StepMetrics`.

All producers **must** enforce the **Inclusive Token Invariant**:

- `input_tokens >= (cache_read_tokens ?? 0) + (cache_write_tokens ?? 0)`
- `output_tokens >= (reasoning_tokens ?? 0)`

| Provider / Harness | Required Normalization to ATIF v2.0 `StepMetrics` |
| :--- | :--- |
| **Anthropic API** (Claude Code, Pi, Cursor CLI, Cline) | `input_tokens = raw.input_tokens + cache_read + cache_creation`; `cache_read_tokens = cache_read`; `cache_write_tokens = cache_creation`; `output_tokens = raw.output_tokens` |
| **OpenAI Responses / Chat API** (Codex CLI, Mini-SWE-Agent) | `input_tokens = raw.input_tokens` (already inclusive); `cache_read_tokens = cached_input_tokens`; `output_tokens = raw.output_tokens`; `reasoning_tokens = reasoning_output_tokens` |
| **Google Gemini API** (Antigravity, ADK) | `input_tokens = promptTokenCount + (toolUsePromptTokenCount ?? 0)`; `cache_read_tokens = cachedContentTokenCount`; `output_tokens = candidatesTokenCount + (thoughtsTokenCount ?? 0)`; `reasoning_tokens = thoughtsTokenCount` |
| **OpenCode** | `input_tokens = tokens.input + cache.read + cache.write`; `output_tokens = tokens.output + reasoning` |
| **OpenHands** | Subtract prior step's cumulative `accumulated_token_usage` watermark (`delta = current - prev`) |

### 6. Media Sources, Tools, & `com.harborframework.v1`

- **Media (`ContentPart.source`)**: Rename `source.path` → `source.uri` (RFC 3986 URI reference); retain `media_type` (any IANA MIME type) and optional `duration_sec`; optionally attach content-addressed `digest` (`urn:sha256:...`) and `size_bytes`.
- **Tool definitions**: Flatten OpenAI `{ type: "function", function: { name, description, parameters } }` into MCP-aligned `AgentMetadata.tools[]` (`{ name, description, input_schema }`).
- **Preserving v1.x-only details**: Store `schema_version`, explicit v1.7 `Step.llm_call_count`, `message_was_string`, `omitted_session_id` / `omitted_trajectory_id`, and unpromoted `extra` keys under `extensions["com.harborframework.v1"]` (separating `tool_call_extra` and `observation_extra` on `Action` so keys never collide).

---

## Migration Checklist

1. **Producers**: Switch output format to line-1 `meta` + NDJSON (`.atif-e.jsonl` during live runs or `.atif.jsonl` at export); verify inclusive token math for every provider; populate `environments[]`, `Action.executor`, and `Action.canonical` where known; validate output against `/schema/v2.0/atif-record.schema.json`.
2. **Consumers**: Implement 4-step format detection (`v1.x` JSON vs `v2.0` NDJSON); read `Step.content[]` and `Step.actions[]` instead of `message` / `tool_calls` / `observation`; filter copied steps with `original_trajectory_id == null` when aggregating metrics or training data.
3. **Verification**: Test both your legacy and upgraded files in the **[Interactive Validator](/validator/)** and against the shared [conformance suite](/guides/sdks-and-tooling/#language-agnostic-conformance-suite).
