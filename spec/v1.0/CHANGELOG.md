---
title: "ATIF v1.0 Changelog"
description: "Release notes for ATIF v1.0 (initial Agent Trajectory Interchange Format specification)."
atif_version: "1.0"
schema_version: "ATIF-v1.0"
status: "final"
release_date: "2025-10-25"
doc_type: "changelog"
order: 90
source_ref: "harbor-framework/harbor@130f3cfa"
---

# ATIF v1.0 Changelog

- **Schema Version:** `ATIF-v1.0`
- **Release Date:** 2025-10-25
- **Supersedes:** None (initial release)
- **Provenance:** [harbor-framework/harbor#56](https://github.com/harbor-framework/harbor/pull/56) · Commit [`130f3cfa`](https://github.com/harbor-framework/harbor/commit/130f3cfa847b6953403e2d1c0e19e25e1013bb44) (`docs/rfcs/0001-trajectory-format.md`)

## Summary

Initial public specification of the Agent Trajectory Interchange Format (`ATIF-v1.0`), establishing a unified JSON schema for autonomous LLM agent trajectories across debugging, evaluation, SFT, and RL workflows.

## Changes

- Defined root `Trajectory` object (`schema_version`, `session_id`, `agent`, `steps`, and optional `notes`, `final_metrics`).
- Defined `AgentSchema` (`name`, `version`, optional `model_name` and `extra`).
- Defined `StepObject` (`step_id`, `timestamp`, `source` in `system`/`user`/`agent`, `model_name`, `reasoning_effort`, `message`, `reasoning_content`, `tool_calls`, `observation`, `metrics`, `extra`).
- Defined `ToolCallSchema`, `ObservationSchema`, `ObservationResultSchema`, and `SubagentTrajectoryRefSchema` (single object reference in v1.0).
- Defined `MetricsSchema` (`prompt_tokens`, `completion_tokens`, `cached_tokens`, `cost_usd`, `logprobs`, `extra`) and `FinalMetricsSchema` aggregate totals.
- Included comparative analysis and reference trajectory examples from MiniSweAgent, OpenHands, and Gemini CLI.

## Specification

Read the archival [ATIF v1.0 Specification](./SPEC.md).
