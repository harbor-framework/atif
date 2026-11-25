---
title: "ATIF v1.2 Changelog"
description: "Release notes for ATIF v1.2: system-step observations, prompt_tokens inclusivity clarification, and array subagent_trajectory_ref."
atif_version: "1.2"
schema_version: "ATIF-v1.2"
status: "final"
release_date: "2025-10-31"
doc_type: "changelog"
order: 90
source_ref: "harbor-framework/harbor@72ec923e"
supersedes: "1.1"
---

# ATIF v1.2 Changelog

- **Schema Version:** `ATIF-v1.2`
- **Release Date:** 2025-10-31
- **Supersedes:** ATIF v1.1
- **Provenance:** [harbor-framework/harbor#76](https://github.com/harbor-framework/harbor/pull/76) · Commit [`72ec923e`](https://github.com/harbor-framework/harbor/commit/72ec923e15315668d14eeb91b4573520d8806a6f) (`docs/rfcs/0001-trajectory-format.md`)

## Summary

Extends `observation` to `system` steps, clarifies inclusive `prompt_tokens` accounting, updates `subagent_trajectory_ref` to an array, and documents Harbor's Pydantic reference implementation.

## Compatibility Notes

> **Compatibility Note vs. v1.1:** Two semantic/structural refinements landed in `ATIF-v1.2`: (1) `prompt_tokens` changed from excluding `cached_tokens` to **including** `cached_tokens` (with `non_cached_prompt_tokens = prompt_tokens - cached_tokens`), and (2) `ObservationResultSchema.subagent_trajectory_ref` changed from a single object to an array of `SubagentTrajectoryRefSchema` objects.

## Changes

- Extended `StepObject.observation` so `system` steps can carry observations for system-initiated operations (such as subagent delegation, context management, environment resets, or checkpoint creation).
- Clarified `MetricsSchema.prompt_tokens` semantics so `prompt_tokens` includes **all** input tokens (both cached and non-cached), with `cached_tokens` representing the cache-hit subset; updated step and trajectory cost formulas to subtract `cached_tokens` when computing non-cached input tokens.
- Changed `ObservationResultSchema.subagent_trajectory_ref` from a single object to an **array** of `SubagentTrajectoryRefSchema` objects (use a singleton array for one subagent).
- Added Section VI (`Implementation`) documenting Harbor's Pydantic models (`src/harbor/models/trajectories/`), `TrajectoryValidator`, and Terminus 2 agent integration, and updated project references from Sandboxes to Harbor.

## Specification

Read the archival [ATIF v1.2 Specification](./SPEC.md).
