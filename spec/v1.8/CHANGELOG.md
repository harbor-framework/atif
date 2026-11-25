---
title: "ATIF v1.8 Changelog"
description: "Release notes for ATIF v1.8: audio content parts and AudioSourceSchema."
atif_version: "1.8"
schema_version: "ATIF-v1.8"
status: "final"
release_date: "2026-08-26"
doc_type: "changelog"
order: 90
source_ref: "harbor-framework/harbor@74cc6312"
supersedes: "1.7"
---

# ATIF v1.8 Changelog

- **Schema Version:** `ATIF-v1.8`
- **Release Date:** 2026-08-26
- **Supersedes:** ATIF v1.7
- **Provenance:** [harbor-framework/harbor#2605](https://github.com/harbor-framework/harbor/pull/2605) · Commit [`74cc6312`](https://github.com/harbor-framework/harbor/commit/74cc6312018c349c6bd2400c89a0ac4983ac1085) (`rfcs/0001-trajectory-format.md`)

## Summary

Extends ATIF multimodal content parts with path/URL-referenced audio clips, canonical audio MIME types with alias normalization, and strict `ContentPart` type-vs-source validation.

## Changes

- Added `"audio"` as a valid `ContentPartSchema.type` alongside `"text"` and `"image"`, enabling spoken user inputs and audio agent responses.
- Added `AudioSourceSchema` mirroring `ImageSourceSchema` (`media_type` + `path`) plus optional `duration_sec` (float seconds) for audio billing and dataset statistics.
- Defined 8 canonical audio MIME types (`audio/wav`, `audio/mpeg`, `audio/mp4`, `audio/aac`, `audio/ogg`, `audio/flac`, `audio/webm`, `audio/aiff`) and consumer normalization rules for common aliases (including `audio/mp3` → `audio/mpeg`).
- Enforced strict `ContentPart` validation: consumers MUST reject a `source` whose schema kind disagrees with `type`.
- Documented the `audio/` relative storage convention, guidance to represent transcripts as separate `text` parts, and explicit exclusion of raw/streaming audio (PCM, G.711) and video.

## Specification

Read the archival [ATIF v1.8 Specification](./SPEC.md).
