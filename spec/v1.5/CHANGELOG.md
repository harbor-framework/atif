---
title: "ATIF v1.5 Changelog"
description: "Release notes for ATIF v1.5: optional tool_definitions on AgentSchema for SFT pipelines."
atif_version: "1.5"
schema_version: "ATIF-v1.5"
status: "final"
release_date: "2025-12-22"
doc_type: "changelog"
order: 90
source_ref: "harbor-framework/harbor@c573843e"
supersedes: "1.4"
---

# ATIF v1.5 Changelog

- **Schema Version:** `ATIF-v1.5`
- **Release Date:** 2025-12-22
- **Supersedes:** ATIF v1.4
- **Provenance:** [harbor-framework/harbor#225](https://github.com/harbor-framework/harbor/pull/225) · Commit [`c573843e`](https://github.com/harbor-framework/harbor/commit/c573843e92437a0937b13fa6b5c6be44a3bf5f8b) (`docs/rfcs/0001-trajectory-format.md`)

## Summary

Adds structured tool/function definitions to `AgentSchema` so supervised fine-tuning (SFT) pipelines can reconstruct exact function-calling schemas alongside trajectories.

## Changes

- Added optional `tool_definitions` array field to `AgentSchema`, with each element following OpenAI's function-calling schema (`type` and `function` fields containing the tool signature and documentation).
- Updated the end-to-end example trajectory to `ATIF-v1.5` illustrating `agent.tool_definitions`.

## Specification

Read the archival [ATIF v1.5 Specification](./SPEC.md).
