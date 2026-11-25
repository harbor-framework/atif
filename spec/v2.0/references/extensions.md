---
title: "ATIF v2.0 Official Extension Namespaces"
description: "Normative schemas for standardized com.harborframework.* extension namespaces covering evaluation grading, RL rollouts, and v1.x round-trip compatibility."
atif_version: "2.0"
schema_version: "ATIF-v2.0"
status: "draft"
release_date: "2026-11-25"
doc_type: "reference"
order: 20
source_ref: "harbor-framework/harbor#4134"
---

# ATIF v2.0 Official Extension Namespaces

*Normative companion to [ATIF v2.0 Specification](../SPEC.md#extensions-model) · Status: Working Draft.*

---

## Overview

Any tool or organization MAY attach custom metadata under its own reverse-DNS domain or RFC 3986 URI key in `extensions` or in standalone `ExtensionRecord` lines. ATIF v2.0 defines three standardized `com.harborframework.*` extension namespaces:

| Namespace Key | Placement | Purpose |
| :--- | :--- | :--- |
| `"com.harborframework.evaluation"` | `Trajectory.extensions`, `Session.extensions` | Verifier grading, scalar rewards, pass/fail verdicts, and rubric breakdowns. |
| `"com.harborframework.rl"` | `Trajectory.extensions`, `Step.extensions` | RL training rollout metadata (group/prompt IDs, token loss masks, rewards, policy versions, and MoE router replay). |
| `"com.harborframework.v1"` | Any container with `extensions` (commonly `Trajectory`, `AgentMetadata`, `ToolDefinition`, `Step`, `CompactionInfo`, `ContentPart`, `Action`) | Lossless ATIF v1.0–v1.8 round-trip metadata preserved during automated `v1 <-> v2` conversion (see [ATIF v1.x to v2.0 Migration](./v1-migration.md)). |

---

## `com.harborframework.evaluation`

Placed on `Trajectory.extensions` or `Session.extensions` (or emitted out-of-band as an `ExtensionRecord`):

```ts
export interface HarborEvaluationExtension {
  reward?: number;
  correct?: boolean;
  verdict?: "pass" | "fail" | "error" | "unknown";
  benchmark?: string;
  task_id?: string;
  trial_id?: string;
  verifier_version?: string;
  rollout_rank?: number;
  breakdown?: Record<string, unknown>;
}
```

| Field | Type | Description |
| :--- | :--- | :--- |
| `reward` | `number` | Scalar verifier reward score (typically `0.0` to `1.0`). |
| `correct` | `boolean` | `true` if the benchmark task passed verification. |
| `verdict` | `"pass"` \| `"fail"` \| `"error"` \| `"unknown"` | Closed vocabulary for categorical evaluation outcome. |
| `benchmark` | `string` | Benchmark suite identifier (e.g., `"terminal-bench-2.0"`, `"swe-bench-verified"`). |
| `task_id` | `string` | Benchmark task or instance identifier. |
| `trial_id` | `string` | Trial or rollout execution identifier. |
| `verifier_version` | `string` | Verifier harness or test-suite version. |
| `rollout_rank` | `number` | 1-based rank among Best-of-N candidate rollouts. |
| `breakdown` | `Record<string, unknown>` | Detailed per-criterion or per-test grading breakdown. |

---

## `com.harborframework.rl`

### Trajectory Level (`HarborTrajectoryRlExtension`)

Placed on `Trajectory.extensions["com.harborframework.rl"]`:

```ts
export interface HarborTrajectoryRlExtension {
  prompt_id?: string;
  group_index?: number;
  total_reward?: number;
  gamma?: number;
  masked_out?: boolean;
  target_policy_versions?: (string | number)[];
}
```

| Field | Type | Description |
| :--- | :--- | :--- |
| `prompt_id` | `string` | Training prompt identifier grouping rollouts in GRPO/RLOO. |
| `group_index` | `number` | Rollout index within the GRPO/RLOO group. |
| `total_reward` | `number` | Cumulative discounted or undiscounted trajectory return. |
| `gamma` | `number` | Discount factor applied during return computation. |
| `masked_out` | `boolean` | `true` if the entire trajectory is masked out from gradient updates (e.g., environment failure). |
| `target_policy_versions` | `(string \| number)[]` | Policy checkpoint versions evaluated against this rollout. |

### Step Level (`HarborStepRlExtension`)

Placed on `Step.extensions["com.harborframework.rl"]`:

```ts
export interface HarborStepRlExtension {
  reward?: number;
  done?: boolean;
  policy_version?: string | number;
  assistant_masks?: number[];
  env_tokens?: number[];
  env_masks?: number[];
  prefill_routed_experts?: unknown;
}
```

| Field | Type | Description |
| :--- | :--- | :--- |
| `reward` | `number` | Step-level reward assigned to this turn. |
| `done` | `boolean` | `true` if this step terminated the RL episode. |
| `policy_version` | `string \| number` | Policy checkpoint version that generated this step's completion tokens. |
| `assistant_masks` | `number[]` | Per-token loss mask (`0` or `1`) parallel to `StepMetrics.completion_token_ids`. |
| `env_tokens` | `number[]` | Environment observation token IDs appended after this step. |
| `env_masks` | `number[]` | Per-token loss mask (`0` or `1`) parallel to `env_tokens`. |
| `prefill_routed_experts` | `unknown` | MoE router expert assignments recorded during prefill/generation for deterministic replay. |

---

## `com.harborframework.v1`

Placed on any container with `extensions` to enable lossless `v1.0–v1.8 <-> v2.0` round-tripping:

```ts
export interface HarborV1CompatExtension {
  schema_version?: string;
  omitted_session_id?: boolean;
  omitted_trajectory_id?: boolean;
  llm_call_count?: number;
  message_was_string?: boolean;
  continued_trajectory_ref?: string;
  subagent_trajectory_ref?: Record<string, unknown>[];
  extra?: Record<string, unknown>;
  tool_call_extra?: Record<string, unknown>;
  observation_extra?: Record<string, unknown>;
}
```

| Field | Type | Description |
| :--- | :--- | :--- |
| `schema_version` | `string` | Original ATIF v1.x schema version string (e.g., `"ATIF-v1.6"`). |
| `omitted_session_id` | `boolean` | `true` if `Trajectory.session_id` was omitted in the source v1.7+ document. |
| `omitted_trajectory_id` | `boolean` | `true` if `Trajectory.trajectory_id` was omitted in the source v1.x document. |
| `llm_call_count` | `number` | Explicit ATIF v1.7 `Step.llm_call_count` (`0`, `1`, or `> 1`) preserved for round-tripping. |
| `message_was_string` | `boolean` | `true` if v1.x `Step.message` was serialized as a bare string rather than `ContentPart[]`. |
| `continued_trajectory_ref` | `string` | Original `Trajectory.continued_trajectory_ref` path when upgrading an isolated continuation file. |
| `subagent_trajectory_ref` | `Record<string, unknown>[]` | Original v1.x `SubagentTrajectoryRef` entries (`session_id`, `extra`, or multi-ref compaction metadata). |
| `extra` | `Record<string, unknown>` | Unpromoted keys preserved from v1.x `extra`. |
| `tool_call_extra` | `Record<string, unknown>` | Unpromoted keys preserved from v1.x `ToolCall.extra` on `Action`. |
| `observation_extra` | `Record<string, unknown>` | Unpromoted keys preserved from v1.x `Observation.extra` / `ObservationResult.extra` on `Action`. |
