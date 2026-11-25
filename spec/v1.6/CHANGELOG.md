---
title: "ATIF v1.6 Changelog"
description: "Release notes for ATIF v1.6: multimodal image support via ContentPartSchema and ImageSourceSchema."
atif_version: "1.6"
schema_version: "ATIF-v1.6"
status: "final"
release_date: "2026-02-03"
doc_type: "changelog"
order: 90
source_ref: "harbor-framework/harbor@3e68bc8b"
supersedes: "1.5"
---

# ATIF v1.6 Changelog

- **Schema Version:** `ATIF-v1.6`
- **Release Date:** 2026-02-03
- **Supersedes:** ATIF v1.5
- **Provenance:** [harbor-framework/harbor#549](https://github.com/harbor-framework/harbor/pull/549) · Commit [`3e68bc8b`](https://github.com/harbor-framework/harbor/commit/3e68bc8b7390dc66e95847554088121e3fef3f99) (`docs/rfcs/0001-trajectory-format.md`)

## Summary

Introduces multimodal image content support in step messages and observation results using file/URL references rather than inline base64 payloads.

## Changes

- Added `ContentPartSchema` (`type`: `"text"` or `"image"`, conditional `text` and `source` fields) for structured multimodal content.
- Added `ImageSourceSchema` (`media_type` in `image/jpeg`, `image/png`, `image/gif`, `image/webp`, and `path` accepting relative paths, absolute paths, or URLs; local `images/` subdirectory convention).
- Extended `StepObject.message` and `ObservationResultSchema.content` to accept either a plain `String` or an `Array` of `ContentPart` objects.
- Documented Harbor's `content.py` models (`ContentPart`, `ImageSource`) and `Trajectory.has_multimodal_content()` helper.

## Specification

Read the archival [ATIF v1.6 Specification](./SPEC.md).
