---
title: "ATIF v1.3 Changelog"
description: "Release notes for ATIF v1.3: optional completion_token_ids on MetricsSchema for RL training."
atif_version: "1.3"
schema_version: "ATIF-v1.3"
status: "final"
release_date: "2025-11-11"
doc_type: "changelog"
order: 90
source_ref: "harbor-framework/harbor@54cbc0f8"
supersedes: "1.2"
---

# ATIF v1.3 Changelog

- **Schema Version:** `ATIF-v1.3`
- **Release Date:** 2025-11-11
- **Supersedes:** ATIF v1.2
- **Provenance:** [harbor-framework/harbor#84](https://github.com/harbor-framework/harbor/pull/84) · Commit [`54cbc0f8`](https://github.com/harbor-framework/harbor/commit/54cbc0f8429c6523944defcec95042bbf78348c5) (`docs/rfcs/0001-trajectory-format.md`)

## Summary

Adds completion token ID tracking to per-step LLM metrics so reinforcement learning pipelines can consume exact rollout tokens without retokenization drift.

## Changes

- Added optional `completion_token_ids` array of integers to `MetricsSchema` for recording the exact response token IDs generated in each agent step.
- Specified that `completion_token_ids` and `logprobs` should align element-for-element when both are present and match `completion_tokens` in length.
- Updated the example trajectory to `ATIF-v1.3` with aligned `completion_token_ids` and `logprobs`.

## Specification

Read the archival [ATIF v1.3 Specification](./SPEC.md).
