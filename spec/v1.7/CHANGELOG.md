---
title: "ATIF v1.7 Changelog"
description: "Release notes for ATIF v1.7: embedded subagent trajectories, breaking SubagentTrajectoryRef resolution change, llm_call_count, is_copied_context, and context management convention."
atif_version: "1.7"
schema_version: "ATIF-v1.7"
status: "final"
release_date: "2026-04-27"
doc_type: "changelog"
order: 90
source_ref: "harbor-framework/harbor@0533a59c"
supersedes: "1.6"
---

# ATIF v1.7 Changelog

- **Schema Version:** `ATIF-v1.7`
- **Release Date:** 2026-04-27
- **Supersedes:** ATIF v1.6
- **Provenance:** [harbor-framework/harbor#1486](https://github.com/harbor-framework/harbor/pull/1486) · Commit [`0533a59c`](https://github.com/harbor-framework/harbor/commit/0533a59c41ce435d9e59ff8c82da67f6e5b6edc7) (`rfcs/0001-trajectory-format.md`)

## Summary

Enables single-file embedded subagent trajectories via `trajectory_id`, adds `extra` metadata on tool calls and observation results, introduces `llm_call_count` and `is_copied_context` on steps, and formalizes the `context_management` convention.

## Breaking Changes

> **Breaking Change vs. v1.6 (`SubagentTrajectoryRef`):** In ATIF v1.6 and earlier, `session_id` was required on `SubagentTrajectoryRef` and acted as the resolution key, so a reference of the form `{"session_id": "..."}` without `trajectory_path` validated. Under ATIF v1.7, `session_id` on `SubagentTrajectoryRef` is optional and **informational only** (because `session_id` is run-scoped and may collide across sibling subagents), and `{"session_id": "..."}` alone **no longer validates**. Every `SubagentTrajectoryRef` MUST set at least one of `trajectory_id` (matching an entry in the parent's `subagent_trajectories` array) or `trajectory_path` (pointing to an external trajectory file). Pre-v1.7 file-based references that already set `trajectory_path` remain valid in v1.7.

## Changes

- Added optional root-level `subagent_trajectories` array on `Trajectory` for single-file embedding of complete, independently valid subagent trajectories.
- Added `trajectory_id` to `Trajectory` (optional on standalone trajectories; required and unique across entries in a parent's `subagent_trajectories` array) and to `SubagentTrajectoryRefSchema` as the canonical embedded resolution key.
- Relaxed root `Trajectory.session_id` from Required to Optional and clarified that `session_id` is run-scoped (may be shared across parent, sibling subagents, and continuation segments, or omitted on embedded subagents).
- Updated `SubagentTrajectoryRefSchema` so `session_id` is optional and informational only, while at least one of `trajectory_id` (embedded) or `trajectory_path` (external file) MUST be set.
- Added optional `extra` metadata object to both `ToolCallSchema` and `ObservationResultSchema`.
- Added optional `llm_call_count` to `StepObject` for multi-call aggregation (`> 1`), single-call attribution (`1`), and deterministic non-LLM dispatch (`0` on `source: "agent"` steps, where `metrics` and `reasoning_content` must be absent and SFT pipelines must filter the step out).
- Added optional `is_copied_context` boolean to `StepObject` with normative rules requiring producers to mark steps copied across summarization/compression boundaries and SFT consumers to exclude them.
- Added Section VII (`Context Management Convention`) specifying `step.extra.context_management` (`type`: `"compaction"` | `"pruning"` | `"injection"`; `boundary`: `"replace"` | `"append"` | `"truncate"`) and the normative context-window reconstruction rule for `boundary = "replace"`.
- Contributed by Bryan Bednarski and Anuradha Karuppiah (NVIDIA).

## Specification

Read the archival [ATIF v1.7 Specification](./SPEC.md).
