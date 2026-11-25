# ATIF Conformance Test Suite

This directory contains the language-agnostic conformance test suite for the **Agent Trajectory Interchange Format (ATIF)**. Any SDK, validator, harness exporter, or stream consolidator implementing ATIF v1.x or ATIF v2.0 can run against `manifest.json` to verify spec compliance.

## Structure

- **`manifest.json`**: Machine-readable index of every conformance test case with:
  - `id`: Stable unique test identifier
  - `version`: `"1.x"` or `"2.0"`
  - `kind`: One of `"v1_trajectory"`, `"v2_events"`, `"v2_trajectories"`, or `"v2_consolidation"`
  - `path`: Fixture path relative to `conformance/`
  - `expect_valid`: Boolean (`true` for positive vectors, `false` for negative vectors)
  - `expected_path`: For `"v2_consolidation"` cases, the golden consolidated `.atif.jsonl` path relative to `conformance/`
  - `description`: Short summary of the invariant exercised
- **`v1/valid/` & `v1/invalid/`**: ATIF v1.0, v1.6 multimodal images, v1.7 embedded subagents & optional `session_id`, v1.8 audio content parts, and negative structural vectors.
- **`v2/events/valid/` & `v2/events/invalid/`**: ATIF v2.0 append-only `events` streams (`.atif-e.jsonl`), exercising line-1 `meta`, `EventBranch` rollbacks and root branches, out-of-order parallel tool calls, multi-environment `EnvironmentDefinition[]`, closed `Action.executor` planes, canonical actions (`file_read`/`file_write`/`file_delete` SHA-256 digests, `message_send`/`message_read`, orthogonal `mcp`), blobs/truncation, and compaction.
- **`v2/trajectories/valid/` & `v2/trajectories/invalid/`**: ATIF v2.0 consolidated `trajectories` documents (`.atif.jsonl`), exercising `meta.manifest`, standalone single-trajectory runs, multi-trajectory lineage, Delta Mode `parent_steps_excluded`, `Step.agent_name`, `Step.citations`, `StepMetrics.duration_ms`, `Step.compaction`, and official `com.harborframework.*` extensions.
- **`v2/consolidation/`**: Golden `input.atif-e.jsonl` → `expected.atif.jsonl` pairs testing the normative Three-Phase Stream Consolidation Algorithm:
  1. `basic-session`: Reference end-to-end session with a cancelled retry (`traj-1#retry-1`)
  2. `branching-rewind`: Explicit standalone `EventBranch` rollback (`reason: "rewind"`) producing Delta child lineage (`traj-rw#rewind-1`)
  3. `parallel-tools-out-of-order`: Parallel tool calls completing out of order with zero phantom branches

## Running the Reference Validator

From the repository root:

```bash
(cd scripts && npm ci && node validate-spec.mjs)
```

Implementations of the Three-Phase Stream Consolidation Algorithm should additionally load every `kind == "v2_consolidation"` entry from `manifest.json`, consolidate `path`, and assert deep equality against `expected_path` (ignoring `meta.create_time`).
