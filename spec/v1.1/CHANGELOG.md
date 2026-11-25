---
title: "ATIF v1.1 Changelog"
description: "Release notes for ATIF v1.1: optional root-level extra custom metadata field."
atif_version: "1.1"
schema_version: "ATIF-v1.1"
status: "final"
release_date: "2025-10-25"
doc_type: "changelog"
order: 90
source_ref: "harbor-framework/harbor@f5308f11"
supersedes: "1.0"
---

# ATIF v1.1 Changelog

- **Schema Version:** `ATIF-v1.1`
- **Release Date:** 2025-10-25
- **Supersedes:** ATIF v1.0
- **Provenance:** [harbor-framework/harbor#65](https://github.com/harbor-framework/harbor/pull/65) · Commit [`f5308f11`](https://github.com/harbor-framework/harbor/commit/f5308f111280fd84a67ef624335b5b96d131f907) (`docs/rfcs/0001-trajectory-format.md`)

## Summary

Adds root-level extensibility to ATIF trajectories alongside Harbor's initial trajectory validator and test suite.

## Changes

- Added optional root-level `extra` object field on `Trajectory` for custom trajectory-wide metadata not covered by the core schema.
- Added an inline `Version History` section to the specification document and updated the end-to-end JSON example to `ATIF-v1.1`.
- Paired in Harbor PR #65 with the initial `TrajectoryValidator` implementation and strict extra-field validation tests.

## Specification

Read the archival [ATIF v1.1 Specification](./SPEC.md).
