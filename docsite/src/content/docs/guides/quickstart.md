---
title: Quickstart
description: Emit, inspect, and validate ATIF v2.0 trajectories in minutes across streaming event logs (.atif-e.jsonl) and consolidated trajectory documents (.atif.jsonl).
sidebar:
  order: 1
---

The **Agent Trajectory Interchange Format (ATIF) v2.0** uses a single newline-delimited JSON (NDJSON) envelope (`AtifRecord`) across two complementary document types: an append-only runtime stream for live capture and a consolidated document for analytics, evaluation, and training.

## Choose Your Document Type

Line 1 of every ATIF v2.0 file is a `type: "meta"` header that declares `schema_version: "ATIF-v2.0"` and `document_type`.

| Document Type | Extension | Allowed Body Row `type`s | When to Use |
| :--- | :--- | :--- | :--- |
| **`events`** | `.atif-e.jsonl` | `"event"`, `"extension"` | Live runtime capture inside an agent harness. Append one line per native event with zero buffering; derived fields (`step_id`, `final_metrics`, union `type` discriminators) are omitted until consolidation. |
| **`trajectories`** | `.atif.jsonl`<br>`.atif.tar.zst` | `"session"`, `"trajectory"`, `"step"`, `"extension"` | Evaluation, visualization, warehouse ingestion, SFT/RL datasets, and portable sharing. Every trajectory has contiguous `step_id`s (`1..N`), colocated `Action` inputs/outputs, and an optional line-1 `meta.manifest` directory preview. |

:::tip[Portable Blob Archives]
When offloading large tool outputs, diffs, or media assets into a single portable file, package `atif.jsonl` as the **first entry** of a Zstandard-compressed tar archive (`.atif.tar.zst`) alongside `blobs/sha256/<first-2-hex>/<64-hex>`. See [Truncation, Blobs, and Archive Packaging](/spec/v2.0/#truncation-blobs-and-archive-packaging).
:::

---

## Producer Path A: Emit a Consolidated Trajectory (`.atif.jsonl`)

If your harness or post-hoc converter already has completed turns, emit a `.atif.jsonl` file directly. Every line is a self-contained JSON object wrapped in the `AtifRecord` envelope:

```jsonl
{"type":"meta","meta":{"schema_version":"ATIF-v2.0","document_type":"trajectories","create_time":"2026-10-30T18:00:07Z"}}
{"type":"trajectory","trajectory_id":"traj-1","trajectory":{"status":"completed","start_time":"2026-10-30T18:00:01Z","end_time":"2026-10-30T18:00:04Z","step_count":2,"first_step_id":1,"agent":{"name":"my-agent","version":"1.0.0","model":{"name":"claude-sonnet-4-5","provider":"anthropic"}},"environments":[{"os":"linux","cwd":"/workspace"}],"final_metrics":{"total_input_tokens":1200,"total_output_tokens":45,"total_cache_read_tokens":1000,"total_cost_usd":0.0015,"cost_source":"reported","total_steps":2,"total_llm_calls":1,"total_duration_ms":3000.0}}}
{"type":"step","trajectory_id":"traj-1","step":{"step_id":1,"source":"user","start_time":"2026-10-30T18:00:01Z","end_time":"2026-10-30T18:00:01Z","content":[{"type":"text","text":"Run pytest on auth."}]}}
{"type":"step","trajectory_id":"traj-1","step":{"step_id":2,"source":"agent","start_time":"2026-10-30T18:00:02Z","end_time":"2026-10-30T18:00:04Z","content":[{"type":"reasoning","reasoning":{"text":"I'll run pytest on test_auth.py."}},{"type":"text","text":"Running pytest now."},{"type":"action","action_id":"toolu_01"}],"actions":[{"action_id":"toolu_01","type":"tool","executor":"environment","name":"Bash","arguments":{"command":"pytest test_auth.py"},"output":[{"type":"text","text":"1 passed in 0.12s"}],"end_time":"2026-10-30T18:00:04Z","canonical":{"type":"shell_command","shell_command":{"cwd":"/workspace","command":"pytest test_auth.py","exit_code":0}}}],"stop_reason":"tools","metrics":{"input_tokens":1200,"output_tokens":45,"cache_read_tokens":1000,"cost_usd":0.0015,"cost_source":"reported","response_id":"msg_01"}}}
```

### Core Producer Invariants

1. **Line 1 `meta` header**: Emit exactly one `type: "meta"` record on line 1 with `schema_version: "ATIF-v2.0"` and `document_type: "trajectories"`. On batch writes, populate `meta.manifest` with lightweight `session` and `trajectory` previews (omitting heavy catalogs like `system_instructions` and `tools`).
2. **Required `trajectory_id`, optional `session_id`**: Every trajectory must have a unique `trajectory_id` within the file. Standalone single-trajectory runs may omit `session_id` and `"session"` rows; multi-trajectory runs share a `session_id` and emit a `"session"` row before its trajectories.
3. **Row ordering**: Emit each `"trajectory"` row before its `"step"` rows, and emit each trajectory's `"step"` rows in strictly contiguous ascending `step_id` order (`1, 2, ..., N`, or starting at `first_step_id` for Delta branches).
4. **Unique `action_id` & derived `type` discriminators**: Keep `Action.action_id` unique within `trajectory_id`. In `.atif.jsonl`, always populate `ContentPart.type` (`"text"`, `"reasoning"`, `"action"`, `"image"`, etc.) and `CanonicalAction.type` (`"shell_command"`, `"file_write"`, `"mcp_tool"`, etc.).
5. **Inclusive token accounting**: `input_tokens` **must** include `cache_read_tokens` and `cache_write_tokens`, and `output_tokens` **must** include `reasoning_tokens`. See [Cross-Provider Token Normalization](/spec/v2.0/#cross-provider-token-normalization).

---

## Producer Path B: Stream Live Harness Events (`.atif-e.jsonl`)

Harnesses that want crash-safe, O(1)-memory runtime logging should append `EventRecord` lines to a `.atif-e.jsonl` file as native events happen:

```jsonl
{"type":"meta","meta":{"schema_version":"ATIF-v2.0","document_type":"events","create_time":"2026-10-30T18:00:00Z"}}
{"type":"event","session_id":"sess-1","trajectory_id":"traj-1","event":{"event_id":"ev-0","timestamp":"2026-10-30T18:00:00Z","trajectory":{"agent":{"name":"claude-code","version":"2.0.15","model":{"name":"claude-sonnet-4-5","provider":"anthropic"}},"environments":[{"os":"linux","cwd":"/workspace"}]}}}
{"type":"event","session_id":"sess-1","trajectory_id":"traj-1","event":{"event_id":"ev-1","timestamp":"2026-10-30T18:00:01Z","step":{"source":"user","content":[{"text":"Run pytest on auth."}]}}}
{"type":"event","session_id":"sess-1","trajectory_id":"traj-1","event":{"event_id":"ev-2","timestamp":"2026-10-30T18:00:02Z","response_id":"msg_01","step":{"source":"agent","content":[{"reasoning":{"text":"I'll run pytest on test_auth.py."}},{"text":"Running pytest now."},{"action_id":"toolu_01"}],"actions":[{"action_id":"toolu_01","type":"tool","name":"Bash","arguments":{"command":"pytest test_auth.py"},"canonical":{"shell_command":{"cwd":"/workspace","command":"pytest test_auth.py"}}}],"stop_reason":"tools","metrics":{"input_tokens":1200,"output_tokens":45,"cache_read_tokens":1000}}}}
{"type":"event","session_id":"sess-1","trajectory_id":"traj-1","event":{"event_id":"ev-3","timestamp":"2026-10-30T18:00:04Z","action":{"action_id":"toolu_01","output":[{"text":"1 passed in 0.12s"}],"canonical":{"shell_command":{"exit_code":0}},"end_time":"2026-10-30T18:00:04Z"}}}
{"type":"event","session_id":"sess-1","trajectory_id":"traj-1","event":{"event_id":"ev-4","timestamp":"2026-10-30T18:00:05Z","response_id":"msg_bad","step":{"source":"agent","content":[{"text":"accidental extra edit..."}],"stop_reason":"cancelled"}}}
{"type":"event","session_id":"sess-1","trajectory_id":"traj-1","event":{"event_id":"ev-5","branch":{"after_event_id":"ev-3"},"timestamp":"2026-10-30T18:00:06Z","response_id":"msg_02","step":{"source":"agent","content":[{"text":"All auth tests pass."}],"stop_reason":"completed"}}}
{"type":"event","session_id":"sess-1","trajectory_id":"traj-1","event":{"event_id":"ev-6","timestamp":"2026-10-30T18:00:06Z","trajectory":{"status":"completed"}}}
```

Notice how lightweight runtime emission is:
- **Linear by default**: You never track `parent_event_id` on normal turns. Only emit `event.branch` (`{ "after_event_id": "ev-3" }`) when rewinding, retrying, or branching.
- **No turn buffering**: Multiple content slices sharing a `response_id` fold into one `Step`, and subsequent `{ "action": { "action_id": "toolu_01", ... } }` events merge `output`, `end_time`, and partial `canonical` updates (like `exit_code: 0`) onto the original action in place.
- **Deterministic consolidation**: The three-phase [Stream Consolidation Algorithm](/spec/v2.0/#stream-consolidation-algorithm) transforms `.atif-e.jsonl` into `.atif.jsonl`, turning displaced event tips (`ev-4`) into sibling Delta trajectories (`traj-1#retry-1`).

For complete harness-specific mappings (Claude Code, Codex CLI, Cursor CLI), see [Translating Native Harness Formats](/spec/v2.0/references/harness-examples/) and download the reference fixtures [session.atif-e.jsonl](/examples/v2.0/session.atif-e.jsonl) and [session.atif.jsonl](/examples/v2.0/session.atif.jsonl).

---

## Consumer Path: Detect Format & Stream Records

Consumers loading an arbitrary ATIF file **must not rely on file extensions alone**. Detect the format in four deterministic steps:

1. Parse line 1 as JSON. If `type == "meta"`, it is **ATIF v2.0 NDJSON** — dispatch on `meta.document_type` (`"events"` vs `"trajectories"`).
2. If line 1 parses as JSON and `schema_version` starts with `"ATIF-v1"`, it is minified **ATIF v1.x JSON**.
3. If line 1 parses as JSON and `type == "event"`, it is a headerless **ATIF v2.0 `"events"` stream**.
4. Otherwise, parse the full file as a single JSON object — pretty-printed **ATIF v1.x JSON** (`trajectory.json`).

### Reading Line-1 `meta.manifest` & Streaming Steps (Python)

Reading only line 1 lets dashboards, indexes, and dataset loaders inspect session counts, models, statuses, and metrics in O(1) memory without parsing multi-megabyte step histories:

```python
import json
from pathlib import Path
from typing import Any


def inspect_atif(path: Path) -> None:
    with path.open("r", encoding="utf-8") as fh:
        first_line = fh.readline().strip()
        if not first_line:
            raise ValueError("Empty ATIF file")

        try:
            header: dict[str, Any] = json.loads(first_line)
        except json.JSONDecodeError:
            # Pretty-printed ATIF v1.x JSON document
            fh.seek(0)
            v1_doc = json.load(fh)
            print(f"ATIF v1.x: {v1_doc['schema_version']} ({len(v1_doc['steps'])} steps)")
            return

        if header.get("type") == "meta":
            meta = header["meta"]
            doc_type = meta["document_type"]
            print(f"{meta['schema_version']} ({doc_type})")

            # Fast O(1) preview when meta.manifest is present
            manifest = meta.get("manifest") or {}
            for row in manifest.get("trajectories", []):
                traj = row.get("trajectory", {})
                print(
                    f"  manifest trajectory={row['trajectory_id']} "
                    f"status={traj.get('status')} steps={traj.get('step_count')}"
                )

            # Stream body rows sequentially without loading the whole file
            for raw_line in fh:
                line = raw_line.strip()
                if not line:
                    continue
                record = json.loads(line)
                rtype = record.get("type")
                if rtype == "step":
                    step = record["step"]
                    print(f"  [{record['trajectory_id']}] step {step['step_id']} ({step['source']})")
                elif rtype not in {"session", "trajectory", "event", "extension"}:
                    continue  # Forward-compatibility: skip unknown record types
        elif str(header.get("schema_version", "")).startswith("ATIF-v1"):
            print(f"ATIF v1.x (minified): {header['schema_version']}")
        elif header.get("type") == "event":
            print("ATIF v2.0 headerless events stream")
        else:
            raise ValueError("Unrecognized ATIF document")
```

:::note[Normative Reader Requirements]
Conformant ATIF v2.0 readers must support lines of **at least 16 MiB** (to accommodate large `agent.tools` schemas), ignore unknown fields on `DocumentMeta`, skip unknown row `type`s, accept any `ATIF-v2.x` minor version, and leniently accept decimal-string integer values emitted by `protojson` serializers.
:::

---

## Validate with JSON Schema 2020-12

ATIF v2.0 ships official **JSON Schema Draft 2020-12** definitions that validate every `AtifRecord` line:

- [`/schema/v2.0/atif-record.schema.json`](/schema/v2.0/atif-record.schema.json) — Universal `AtifRecord` line envelope (`meta`, `event`, `session`, `trajectory`, `step`, `extension`)
- [`/schema/v2.0/canonical-actions.schema.json`](/schema/v2.0/canonical-actions.schema.json) — `Action.canonical` semantic union and orthogonal `mcp` provenance
- [`/schema/v2.0/common-defs.schema.json`](/schema/v2.0/common-defs.schema.json) — Shared definitions (`ContentPart`, `StepMetrics`, `FinalMetrics`, `BlobReference`, `TruncationInfo`, `EnvironmentDefinition`, `EventBranch`, `Citation`, `ApprovalInfo`)

### Option 1: Validate in the Browser

Paste or drop any `.atif-e.jsonl`, `.atif.jsonl`, or v1.x `.json` file into the **[Interactive ATIF Validator & Trajectory Explorer](/validator/)** for instant line-by-line JSON Pointer diagnostics and visual step inspection — everything runs locally in your browser with Ajv.

### Option 2: Validate in Node.js (Ajv Draft 2020-12)

```js
import fs from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const common = JSON.parse(fs.readFileSync("spec/v2.0/schema/common-defs.schema.json", "utf8"));
const canonical = JSON.parse(fs.readFileSync("spec/v2.0/schema/canonical-actions.schema.json", "utf8"));
const record = JSON.parse(fs.readFileSync("spec/v2.0/schema/atif-record.schema.json", "utf8"));

ajv.addSchema(common);
ajv.addSchema(canonical);
const validate = ajv.compile(record);

const lines = fs.readFileSync("spec/v2.0/examples/session.atif.jsonl", "utf8").trim().split("\n");
for (const [idx, line] of lines.entries()) {
  const row = JSON.parse(line);
  if (!validate(row)) {
    console.error(`Line ${idx + 1} invalid:`, validate.errors);
    process.exit(1);
  }
}
console.log(`Validated ${lines.length} ATIF v2.0 records.`);
```

If you have the `atif` repository cloned locally, you can validate the entire spec, examples, and language-agnostic conformance suite in one command:

```bash
(cd scripts && npm ci && node validate-spec.mjs)
```

---

## Next Steps

- Read the complete **[ATIF v2.0 Specification](/spec/v2.0/)** and **[Canonical Actions Catalog](/spec/v2.0/references/canonical-actions/)**.
- Upgrading existing v1.x producers or pipelines? Follow **[Migrating from ATIF v1.x to v2.0](/guides/migrating-from-v1/)**.
- Inspect a real session interactively in the **[ATIF Validator & Trajectory Explorer](/validator/)**.
- Explore SDKs, Protobuf codegen, and the conformance suite in **[SDKs & Tooling](/guides/sdks-and-tooling/)**.
