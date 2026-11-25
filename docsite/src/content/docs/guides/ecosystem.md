---
title: Ecosystem & Integrations
description: Agent harnesses, OpenTelemetry observability bridges, analytical data warehouses, and evaluation / RL training pipelines using ATIF.
sidebar:
  order: 4
---

Without a shared trajectory standard, every trace viewer, benchmark evaluator, observability platform, and post-training pipeline has to maintain dozens of brittle, harness-specific parsers. ATIF provides a single interchange layer connecting **agent harnesses**, **observability tooling**, **data warehouses**, and **evaluation / RL pipelines**.

## Agent Harnesses

ATIF originated inside **Harbor** (supporting 30+ agent harnesses across benchmarks like Terminal-Bench) and v2.0 was engineered directly from the native event streams of modern coding and general-purpose agents:

| Harness | Native Capture Pattern | Key ATIF v2.0 Mappings |
| :--- | :--- | :--- |
| **Claude Code** | Append-only JSONL with `parentUuid` chains, multi-slice `message.id`, `compact_boundary` | Maps `Bash`, `Read`/`Edit`/`Write`/`Grep`/`Glob`, `Task`, `SendMessage`, `AskUserQuestion`, and `mcp__*` to `Action.canonical`; maps `parentUuid` rewinds to `EventBranch` and `compact_boundary` to `Step.compaction`. |
| **OpenAI Codex CLI** | Event JSONL with `response_id`, `thread_rolled_back`, `forked_from_id` | Maps `exec_command` / `shell` / `local_shell_call`, `apply_patch` (`canonical.multi` of `file_write`/`file_move`/`file_delete`), `spawn_agent`, and `web_search_call`; maps `forked_from_id` to `parent_reason: "fork"`. |
| **Cursor** | Streaming tool calls and workspace edits | Maps `run_terminal_cmd`, `readToolCall`, `editToolCall`, and `delete_file` to typed `shell_command` and filesystem canonical actions with unified diffs. |
| **Gemini CLI** | Multimodal tool turns with `promptTokenCount`, `candidatesTokenCount`, and `thoughtsTokenCount` | Normalizes Gemini token counts into inclusive `input_tokens` / `output_tokens` + `reasoning_tokens`; preserves citations (`Step.citations`) and multimodal `ContentPart`s. |
| **OpenHands** | Action/observation event stream with cumulative session token watermarks | Converts cumulative `accumulated_token_usage` into per-step deltas; maps `execute_bash`, `execute_ipython_cell`, and `str_replace_editor` to `shell_command`, `script_exec`, and `file_write`. |
| **Harbor (Terminus 2, Mini-SWE-Agent, OpenCode, Pi, & 30+ Agents)** | Live trial logs and post-hoc trajectory exports | Dual-mode `.atif-e.jsonl` / `.atif.jsonl` capture with `com.harborframework.evaluation` verifier verdicts and lossless v1.x compatibility. |

See **[Translating Native Harness Formats](/spec/v2.0/references/harness-examples/)** for concrete event-by-event translation walkthroughs and **[Canonical Actions Catalog](/spec/v2.0/references/canonical-actions/)** for the full cross-harness mapping matrix.

---

## Observability & OpenTelemetry

ATIF complements runtime telemetry standards like **OpenTelemetry (OTel)** rather than competing with them:

- **OpenTelemetry Bridge (`harbor-atif2otel`)**: Converts consolidated ATIF trajectories into structured OTel traces and spans (trajectory → root trace, steps → LLM spans, actions → tool execution spans) so agent runs appear natively inside existing APM and tracing backends.
- **Native Trace Correlation**: Streaming harnesses can attach OTel `trace_id`, `span_id`, and raw log offsets inside `TrajectoryEvent.extensions` without polluting consolidated `Step` or `Action` payloads.
- **Observability Platforms**: External tracing and evaluation tools — including **Arize Phoenix**, **NVIDIA NeMo Relay**, **Langfuse**, and **Letta (`@letta-ai/trajectory`)** — integrate ATIF trajectories for debugging, prompt inspection, and cross-agent comparison.

---

## Analytical Data Warehouses (BigQuery, DuckDB, & Parquet)

ATIF v2.0 is architected so consolidated `.atif.jsonl` documents load cleanly into columnar warehouses without fragile nested JSON parsing.

The canonical DDL in [`/schema/v2.0/warehouse.sql`](/schema/v2.0/warehouse.sql) defines **six normalized tables** (detailed in [Wire & Warehouse Projections](/spec/v2.0/references/projections/)):

| Table | Primary Key | Partition / Cluster Clauses | Purpose |
| :--- | :--- | :--- | :--- |
| **`sessions`** | `session_id` | `PARTITION BY DATE(end_time)`<br>`CLUSTER BY end_time, session_id` | Cross-trajectory session summaries and native-step token/cost rollups. |
| **`trajectories`** | `trajectory_id` | `PARTITION BY DATE(end_time)`<br>`CLUSTER BY end_time, trajectory_id` | Agent/model configuration, `environments[]`, transitive lineage (`ancestor_trajectory_ids`), status, and `final_metrics`. |
| **`steps`** | `(trajectory_id, step_id)` | `CLUSTER BY trajectory_id, step_id` | Interleaved `content[]`, `compaction`, `citations`, `stop_reason`, and `StepMetrics` (including `time_to_first_token_ms`, `duration_ms`). |
| **`actions`** | `(trajectory_id, action_id)` | `CLUSTER BY trajectory_id, step_id` | Colocated tool inputs, outputs, `errored`, `approval`, `executor`, `environment_name`, and typed `canonical` structs. |
| **`extension_records`** | `(namespace, trajectory_id)` | `CLUSTER BY namespace, trajectory_id` | Appendable out-of-band annotations, human labels, and benchmark grading records. |
| **`blobs`** | `digest` (`urn:sha256:...`) | `CLUSTER BY digest` | Deduplicated registry of offloaded large payloads and binary media assets. |

### Querying `.atif.jsonl` Locally with DuckDB

Because `.atif.jsonl` is plain NDJSON with derived `canonical.type` discriminators, you can run cross-harness analytics directly on local files or Parquet exports in DuckDB without ETL:

```sql
-- Compare shell command failure rates across agent harnesses directly from .atif.jsonl files
WITH records AS (
  SELECT * FROM read_json_auto('runs/**/*.atif.jsonl', union_by_name = true)
),
trajs AS (
  SELECT trajectory_id, trajectory.agent.name AS agent_name
  FROM records
  WHERE type = 'trajectory'
),
shell_actions AS (
  SELECT
    r.trajectory_id,
    a.errored,
    a.canonical.shell_command.exit_code AS exit_code
  FROM records r, UNNEST(r.step.actions) AS t(a)
  WHERE r.type = 'step'
    AND a.canonical.type = 'shell_command'
)
SELECT
  t.agent_name,
  COUNT(*) AS total_shell_cmds,
  COUNT(*) FILTER (WHERE s.errored OR s.exit_code != 0) AS failed_cmds,
  ROUND(100.0 * COUNT(*) FILTER (WHERE s.errored OR s.exit_code != 0) / COUNT(*), 1) AS fail_pct
FROM shell_actions s
JOIN trajs t USING (trajectory_id)
GROUP BY t.agent_name
ORDER BY total_shell_cmds DESC;
```

---

## Evaluation, SFT, & Reinforcement Learning Pipelines

ATIF v2.0 promotes first-class fields and official `com.harborframework.*` extension namespaces specifically for benchmark grading, Supervised Fine-Tuning (SFT), and online/offline Reinforcement Learning (RL):

- **Benchmark Evaluation (`com.harborframework.evaluation`)**: Attach standardized `reward`, `correct`, `verdict` (`pass` | `fail` | `error` | `unknown`), `benchmark`, `task_id`, `trial_id`, `verifier_version`, `rollout_rank`, and rubric `breakdown` on `Trajectory` or `Session` rows — or append them after grading as standalone `"extension"` rows without rewriting the trajectory file.
- **RL Training Rollouts (`StepMetrics` + `com.harborframework.rl`)**: Preserve exact `prompt_token_ids`, `completion_token_ids`, and `logprobs` on `StepMetrics` (compatible with pipelines like **SkyRL** and GRPO/PPO/RLOO trainers), paired with `prompt_id`, `group_index`, `assistant_masks`, `env_tokens`, `env_masks`, `policy_version`, and `prefill_routed_experts`.
- **Clean SFT & Deduplicated Training Data**: Every trajectory presents a strictly linear `1..N` path while discarded rewinds and retries live on separate sibling trajectories. Filter `Step.original_trajectory_id IS NULL` to guarantee forked or candidate-merged prefix steps are never double-counted in token rollups or training batches.
- **Canonical Resource Identifiers (`ArdUrn`)**: Catalog entities (`AgentMetadata`, `ModelMetadata`, `ToolDefinition`, `SkillDefinition`, `McpServerDefinition`, `EnvironmentDefinition`) accept optional `urn:air:<publisher>:<namespace>:<name>` identifiers aligned with [AI Catalog / Agentic Resource Discovery](https://ai-catalog.io/spec/) so datasets join cleanly across vendors.

---

## Agent-Accessible Specification Discovery

AI coding agents building ATIF adapters or queries can discover this specification automatically via:

- **HTTP-Discoverable Skill (`draft-zzn-dvs-00`)**: [`/.well-known/skills/index.json`](/.well-known/skills/index.json) and [`/.well-known/skills/atif/SKILL.md`](/.well-known/skills/atif/SKILL.md)
- **Per-Page Markdown Mirrors**: Append `.md` to any specification or guide URL (or follow `<link rel="alternate" type="text/markdown">`)
- **Single-Fetch Full Spec & Index**: [`/spec/v2.0/full.md`](/spec/v2.0/full.md) and [`/llms.txt`](/llms.txt)
