---
title: "ATIF v1.4 Changelog"
description: "Release notes for ATIF v1.4: optional prompt_token_ids on MetricsSchema and root continued_trajectory_ref."
atif_version: "1.4"
schema_version: "ATIF-v1.4"
status: "final"
release_date: "2025-12-11"
doc_type: "changelog"
order: 90
source_ref: "harbor-framework/harbor@b6c9ef26"
supersedes: "1.3"
---

# ATIF v1.4 Changelog

- **Schema Version:** `ATIF-v1.4`
- **Release Date:** 2025-12-11
- **Supersedes:** ATIF v1.3
- **Provenance:** [harbor-framework/harbor#183](https://github.com/harbor-framework/harbor/pull/183) · Commit [`b6c9ef26`](https://github.com/harbor-framework/harbor/commit/b6c9ef2662be40a96b6b7e0077aeebbf3c955831) (`docs/rfcs/0001-trajectory-format.md`)

## Summary

Adds prompt token ID capture for full tokenization fidelity and introduces root-level continuation links for multi-file trajectories.

## Changes

- Added optional `prompt_token_ids` array of integers to `MetricsSchema` capturing the exact prompt token IDs sent to the LLM for that turn (including prior chat history when applicable), with length matching `prompt_tokens`.
- Added optional root-level `continued_trajectory_ref` string field on `Trajectory` to link continuation trajectory files when context management strategies (such as summarization) span multiple files.

## Specification

Read the archival [ATIF v1.4 Specification](./SPEC.md).
