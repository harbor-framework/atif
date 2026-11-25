---
title: "Translating Native Harness Formats to ATIF v2.0"
description: "Non-normative 1:1 streaming translation examples for Claude Code, OpenAI Codex CLI, Cursor CLI, and end-to-end consolidation fixtures."
atif_version: "2.0"
schema_version: "ATIF-v2.0"
status: "draft"
release_date: "2026-11-25"
doc_type: "reference"
order: 40
source_ref: "harbor-framework/harbor#4134"
---

# Translating Native Harness Formats to ATIF v2.0

*Non-normative companion to [ATIF v2.0 Specification](../SPEC.md) · Status: Working Draft · Fixtures: [`session.atif-e.jsonl`](../examples/session.atif-e.jsonl) → [`session.atif.jsonl`](../examples/session.atif.jsonl).*

---

## Streaming Patterns Across Harnesses

This non-normative guide illustrates stateless 1:1 translation from native harness event logs into ATIF v2.0 `"events"` documents (`.atif-e.jsonl`), which the [Stream Consolidation Algorithm](../SPEC.md#stream-consolidation-algorithm) deterministically folds into `"trajectories"` documents (`.atif.jsonl`).

| Pattern | Harnesses | Native Turn Boundary | ATIF Mapping Strategy |
| :--- | :--- | :--- | :--- |
| **1. Message-ID-Keyed Content Slices** | Claude Code, Goose | Multiple `assistant` JSONL slices share `message.id` with repeated cumulative `usage`; `tool_result` arrives on `user` lines. | Emit each slice as `event.step` with `response_id = message.id` (merged by `R7` with snapshot-replaced `metrics`); emit each `tool_result` as `event.action` (`R2`, no `branch`; fan-out `K > 1` parallel results on one line as `"<uuid>#1".."<uuid>"`). |
| **2. Unkeyed Sequential Items & Chunks** | OpenAI Codex CLI, ACP, Cursor IDE | `reasoning`, `message`, `function_call`, `function_call_output`, and `token_count` stream without a shared message ID; rewinds emit `thread_rolled_back`. | Map items/chunks to `event.step` (`agent`), tool calls/outputs to `event.action`, and rollbacks to standalone `event.branch`. Rules `R6`–`R10` fold adjacent parts and open a new step after `OBSERVED`. |
| **3. Out-of-Order Top-Level Events** | Cursor CLI (`stream-json`) | `thinking`, `assistant`, and `tool_call` stream as top-level events sharing `model_call_id`. | Set `event.response_id = model_call_id`; Rule `R5` routes out-of-order slices to the matching `Step`. |
| **4. Explicit Step Brackets / Action-Observation** | OpenCode (`step-start`..`step-finish`), Pi (`parentId`), OpenHands | Explicit turn brackets or paired `Action`/`Observation` events. | Map bracket ID to `response_id`; map agent actions to `event.step` + `event.action` and environment observations to `event.action` updates (`R2`). |

---

## Claude Code (`~/.claude/projects/.../<session>.jsonl`)

### Native Claude Code JSONL (4 lines for 1 LLM Turn)

One Anthropic API response (`msg_01XYZ`) is written as three `type: "assistant"` lines (one per content block), followed by a `type: "user"` line carrying the `tool_result`:

```jsonl
{"parentUuid":"u-1","uuid":"a-1","type":"assistant","timestamp":"2026-10-30T10:00:01Z","sessionId":"sess-cc","cwd":"/repo","gitBranch":"main","version":"2.0.15","message":{"id":"msg_01XYZ","model":"claude-sonnet-4-5-20250929","role":"assistant","content":[{"type":"thinking","thinking":"Check git status first.","signature":"ErUBCkY..."}],"stop_reason":null,"usage":{"input_tokens":50,"cache_creation_input_tokens":100,"cache_read_input_tokens":1000,"output_tokens":12}}}
{"parentUuid":"a-1","uuid":"a-2","type":"assistant","timestamp":"2026-10-30T10:00:02Z","sessionId":"sess-cc","message":{"id":"msg_01XYZ","model":"claude-sonnet-4-5-20250929","role":"assistant","content":[{"type":"text","text":"I'll check the repository status."}],"stop_reason":null,"usage":{"input_tokens":50,"cache_creation_input_tokens":100,"cache_read_input_tokens":1000,"output_tokens":25}}}
{"parentUuid":"a-2","uuid":"a-3","type":"assistant","timestamp":"2026-10-30T10:00:03Z","sessionId":"sess-cc","message":{"id":"msg_01XYZ","model":"claude-sonnet-4-5-20250929","role":"assistant","content":[{"type":"tool_use","id":"toolu_01A","name":"Bash","input":{"command":"git status -s"}}],"stop_reason":"tool_use","usage":{"input_tokens":50,"cache_creation_input_tokens":100,"cache_read_input_tokens":1000,"output_tokens":45}}}
{"parentUuid":"a-3","uuid":"u-2","type":"user","timestamp":"2026-10-30T10:00:04Z","sessionId":"sess-cc","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_01A","content":"M src/auth.py","is_error":false}]}}
```

### Translation to `"events"` NDJSON (`.atif-e.jsonl`)

Line 1 emits the `meta` header, then each native turn line maps to an `EventRecord` line (normalizing Anthropic's `input_tokens = 50 + 100 + 1000 = 1150` per [Cross-Provider Token Normalization](../SPEC.md#cross-provider-token-normalization), and omitting `branch` since all four events follow linearly):

```jsonl
{"type":"meta","meta":{"schema_version":"ATIF-v2.0","document_type":"events","create_time":"2026-10-30T10:00:01Z"}}
{"type":"event","session_id":"sess-cc","trajectory_id":"sess-cc","event":{"event_id":"a-1","timestamp":"2026-10-30T10:00:01Z","response_id":"msg_01XYZ","step":{"source":"agent","content":[{"reasoning":{"text":"Check git status first.","signature":"ErUBCkY..."}}],"metrics":{"input_tokens":1150,"output_tokens":12,"cache_read_tokens":1000,"cache_write_tokens":100}}}}
{"type":"event","session_id":"sess-cc","trajectory_id":"sess-cc","event":{"event_id":"a-2","timestamp":"2026-10-30T10:00:02Z","response_id":"msg_01XYZ","step":{"source":"agent","content":[{"text":"I'll check the repository status."}],"metrics":{"input_tokens":1150,"output_tokens":25,"cache_read_tokens":1000,"cache_write_tokens":100}}}}
{"type":"event","session_id":"sess-cc","trajectory_id":"sess-cc","event":{"event_id":"a-3","timestamp":"2026-10-30T10:00:03Z","response_id":"msg_01XYZ","step":{"source":"agent","content":[{"action_id":"toolu_01A"}],"actions":[{"action_id":"toolu_01A","type":"tool","name":"Bash","arguments":{"command":"git status -s"},"canonical":{"shell_command":{"cwd":"/repo","command":"git status -s"}}}],"stop_reason":"tools","metrics":{"input_tokens":1150,"output_tokens":45,"cache_read_tokens":1000,"cache_write_tokens":100}}}}
{"type":"event","session_id":"sess-cc","trajectory_id":"sess-cc","event":{"event_id":"u-2","timestamp":"2026-10-30T10:00:04Z","action":{"action_id":"toolu_01A","errored":false,"output":[{"text":"M src/auth.py"}],"end_time":"2026-10-30T10:00:04Z"}}}
```

#### Single-Pass `parentUuid` Handling

Claude Code's `parentUuid` is a raw causal pointer, **not** a branch indicator; do not blindly copy `parentUuid` into `event.branch` (see [Streaming and Branching Rules](../SPEC.md#streaming-and-branching-rules)):

1. **Parallel `tool_result`s are not branches**: In Claude Code 2.1+, parallel tool calls emit separate `type: "user"` `tool_result` lines whose `parentUuid` points back to each result's own `tool_use` slice (and parallel tools may finish out of order). Translate `tool_result` lines into `{ action }` events with `branch` omitted; Rule `R2` correlates them by `action_id = tool_use_id`.
2. **Preserve or bridge non-turn records**: Non-turn records (`attachment`, `progress`, `queue-operation`, `file-history-snapshot`) sit in Claude Code's `parentUuid` chain. Map context-bearing `attachment` records (e.g., injected `CLAUDE.md` or hook outputs) to `{ step }` (`source: "system"`) or `{ action }` (`type: "internal"`, `canonical.synthetic_context`), and omit or emit bookkeeping records as pass-through `type: "extension"` lines. For any native record `r` that does not emit a trajectory `EventRecord`, maintain a single-pass `bridge: Map<uuid, last_emitted_id>` (`bridge[r.uuid] = resolve(r.parentUuid) ?? last_emitted_id`) so subsequent `parentUuid` pointers resolve cleanly.
3. **Emit `branch` only on genuine jumps**: On each emitted `{ step }` event (excluding linear continuation slices of the same `response_id` and post-tool-result turns whose `parentUuid` points to one of the current step's parallel `tool_result`s), resolve `target = resolve(logicalParentUuid ?? parentUuid)` through `bridge`. Emit `branch: { after_event_id: target }` (or `branch: {}` when `target == null` after prior events) only when `target` is an earlier emitted `event_id` prior to the current turn's `head`.

### Consolidated `StepRecord` (`.atif.jsonl`)

Rules `R6` → `R7` → `R7` → `R2` fold all four events into one `StepRecord` with snapshot-replaced `output_tokens: 45`:

```json
{
  "type": "step",
  "session_id": "sess-cc",
  "trajectory_id": "sess-cc",
  "step": {
    "step_id": 2,
    "event_ids": ["a-1", "a-2", "a-3"],
    "source": "agent",
    "start_time": "2026-10-30T10:00:01Z",
    "end_time": "2026-10-30T10:00:04Z",
    "content": [
      { "type": "reasoning", "reasoning": { "text": "Check git status first.", "signature": "ErUBCkY..." } },
      { "type": "text", "text": "I'll check the repository status." },
      { "type": "action", "action_id": "toolu_01A" }
    ],
    "actions": [
      {
        "action_id": "toolu_01A",
        "event_ids": ["a-3", "u-2"],
        "type": "tool",
        "name": "Bash",
        "errored": false,
        "arguments": { "command": "git status -s" },
        "output": [{ "type": "text", "text": "M src/auth.py" }],
        "end_time": "2026-10-30T10:00:04Z",
        "canonical": {
          "type": "shell_command",
          "shell_command": { "cwd": "/repo", "command": "git status -s" }
        }
      }
    ],
    "stop_reason": "tools",
    "metrics": {
      "input_tokens": 1150,
      "output_tokens": 45,
      "cache_read_tokens": 1000,
      "cache_write_tokens": 100,
      "response_id": "msg_01XYZ"
    }
  }
}
```

---

## OpenAI Codex CLI (`~/.codex/sessions/.../rollout-*.jsonl`)

### Native Codex CLI JSONL (Unkeyed Sequential Items)

Codex CLI emits `response_item` lines (`reasoning`, `message`, `function_call`, `function_call_output`) and `event_msg` (`token_count`) without a shared `message.id` or `parentUuid`:

```jsonl
{"timestamp":"2026-10-30T11:00:01Z","type":"response_item","payload":{"type":"reasoning","summary":[{"type":"summary_text","text":"Inspect src/main.rs"}],"encrypted_content":"gAAAAAB..."}}
{"timestamp":"2026-10-30T11:00:02Z","type":"response_item","payload":{"type":"function_call","name":"exec_command","arguments":"{\"cmd\":\"cargo test\",\"workdir\":\"/app\"}","call_id":"call_99"}}
{"timestamp":"2026-10-30T11:00:03Z","type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":2000,"cached_input_tokens":1500,"output_tokens":60,"reasoning_output_tokens":35}}}}
{"timestamp":"2026-10-30T11:00:05Z","type":"response_item","payload":{"type":"function_call_output","call_id":"call_99","output":"Process exited with code 0\nOutput:\ntest result: ok. 4 passed"}}
```

### Translation to `"events"` NDJSON (`.atif-e.jsonl`)

Because `branch` is omitted on linear events, Phase 1 links each event to the preceding event in stream order. A Codex `thread_rolled_back` event translates 1:1 into a standalone `{"event_id": "...", "branch": {"after_event_id": "<last_kept_event_id>", "reason": "rewind"}}` with no payload (or omits `after_event_id` when rolling back all turns). During Phase 2:

- `cx-1` opens `current_step` in `GENERATING` (`R6`), marking OpenAI's `summary_text` with `summarized: true`.
- `cx-2` merges standalone action `call_99` into `current_step` (`R7`), synthesizing `{ "type": "action", "action_id": "call_99" }` in `content`.
- `cx-3` attaches the `token_count` metrics to `current_step` (`R9`).
- `cx-4` attaches the output and partial `canonical.shell_command.exit_code` to `call_99` and transitions `current_step` to `OBSERVED` (`R2`), so the next `reasoning` or `message` item opens a new step via `R10`.

```jsonl
{"type":"meta","meta":{"schema_version":"ATIF-v2.0","document_type":"events","create_time":"2026-10-30T11:00:01Z"}}
{"type":"event","trajectory_id":"traj-cx","event":{"event_id":"cx-1","timestamp":"2026-10-30T11:00:01Z","step":{"source":"agent","content":[{"reasoning":{"text":"Inspect src/main.rs","summarized":true,"signature":"gAAAAAB..."}}]}}}
{"type":"event","trajectory_id":"traj-cx","event":{"event_id":"cx-2","timestamp":"2026-10-30T11:00:02Z","action":{"action_id":"call_99","type":"tool","name":"exec_command","arguments":{"cmd":"cargo test","workdir":"/app"},"canonical":{"shell_command":{"cwd":"/app","command":"cargo test"}}}}}
{"type":"event","trajectory_id":"traj-cx","event":{"event_id":"cx-3","timestamp":"2026-10-30T11:00:03Z","step":{"source":"agent","metrics":{"input_tokens":2000,"output_tokens":60,"cache_read_tokens":1500,"reasoning_tokens":35}}}}
{"type":"event","trajectory_id":"traj-cx","event":{"event_id":"cx-4","timestamp":"2026-10-30T11:00:05Z","action":{"action_id":"call_99","output":[{"text":"Process exited with code 0\nOutput:\ntest result: ok. 4 passed"}],"canonical":{"shell_command":{"exit_code":0}},"end_time":"2026-10-30T11:00:05Z"}}}
```

*(Note: `session_id` is omitted on this standalone single-trajectory Codex rollout because `session_id` is optional.)*

---

## Cursor CLI (`--output-format stream-json`)

### Native Cursor CLI JSONL (`model_call_id` Correlation)

Cursor CLI emits top-level `thinking`, `assistant`, and `tool_call` (`started` and `completed`) events correlated by `model_call_id`:

```jsonl
{"type":"thinking","subtype":"completed","text":"Let's read config.json.","model_call_id":"mc_77","timestamp_ms":1761825601000,"session_id":"cur-1"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Reading config.json."}]},"model_call_id":"mc_77","timestamp_ms":1761825602000,"session_id":"cur-1"}
{"type":"tool_call","subtype":"started","call_id":"tc_1","model_call_id":"mc_77","tool_call":{"readToolCall":{"args":{"path":"config.json"}}},"timestamp_ms":1761825602500,"session_id":"cur-1"}
{"type":"tool_call","subtype":"completed","call_id":"tc_1","model_call_id":"mc_77","tool_call":{"readToolCall":{"args":{"path":"config.json"},"result":{"success":{"content":"{\"port\":8080}"}}}},"timestamp_ms":1761825603000,"session_id":"cur-1"}
```

### Stateless 1:1 Translation to `"events"` NDJSON (`.atif-e.jsonl`)

Mapping `model_call_id` to `TrajectoryEvent.response_id` ensures all events from `mc_77` consolidate into the same `Step` via Rules `R5`/`R7` and `R2`:

```jsonl
{"type":"meta","meta":{"schema_version":"ATIF-v2.0","document_type":"events","create_time":"2026-10-30T12:00:01Z"}}
{"type":"event","session_id":"cur-1","trajectory_id":"cur-1","event":{"event_id":"cur-ev-1","timestamp":"2026-10-30T12:00:01Z","response_id":"mc_77","step":{"source":"agent","content":[{"reasoning":{"text":"Let's read config.json."}}]}}}
{"type":"event","session_id":"cur-1","trajectory_id":"cur-1","event":{"event_id":"cur-ev-2","timestamp":"2026-10-30T12:00:02Z","response_id":"mc_77","step":{"source":"agent","content":[{"text":"Reading config.json."}]}}}
{"type":"event","session_id":"cur-1","trajectory_id":"cur-1","event":{"event_id":"cur-ev-3","timestamp":"2026-10-30T12:00:02.500Z","response_id":"mc_77","action":{"action_id":"tc_1","type":"tool","name":"readToolCall","arguments":{"path":"config.json"},"canonical":{"file_read":{"scope":"workspace","path":"config.json"}},"start_time":"2026-10-30T12:00:02.500Z"}}}
{"type":"event","session_id":"cur-1","trajectory_id":"cur-1","event":{"event_id":"cur-ev-4","timestamp":"2026-10-30T12:00:03Z","response_id":"mc_77","action":{"action_id":"tc_1","output":[{"text":"{\"port\":8080}"}],"end_time":"2026-10-30T12:00:03Z"}}}
```

---

## Reference End-to-End Consolidation Fixture

The complete input `"events"` document and consolidated `"trajectories"` document walked through in [Appendix A: End-to-End Consolidation Walkthrough](../SPEC.md#appendix-a-end-to-end-consolidation-walkthrough) (including cancelled turn `ev-5`, `branch: { after_event_id: "ev-4" }` retry on `ev-6`, line-1 `meta.manifest`, `session` rollup, Delta branch `traj-1#retry-1`, and an appended `extension` record) are maintained as standalone fixtures ([`session.atif-e.jsonl`](../examples/session.atif-e.jsonl) and [`session.atif.jsonl`](../examples/session.atif.jsonl)) and included inline below:

<details>
<summary><strong>Input <code>events</code> Document (<code>session.atif-e.jsonl</code>)</strong></summary>

```jsonl
{"type":"meta","meta":{"schema_version":"ATIF-v2.0","document_type":"events","create_time":"2026-10-30T18:00:00Z"}}
{"type":"event","session_id":"sess-1","trajectory_id":"traj-1","event":{"event_id":"ev-0","timestamp":"2026-10-30T18:00:00Z","trajectory":{"agent":{"name":"claude-code","version":"2.0.15","model":{"name":"claude-sonnet-4-5","provider":"anthropic"}},"environments":[{"os":"linux","cwd":"/workspace"}]}}}
{"type":"event","session_id":"sess-1","trajectory_id":"traj-1","event":{"event_id":"ev-1","timestamp":"2026-10-30T18:00:01Z","step":{"source":"user","content":[{"text":"Run pytest on auth."}]}}}
{"type":"event","session_id":"sess-1","trajectory_id":"traj-1","event":{"event_id":"ev-2","timestamp":"2026-10-30T18:00:02Z","response_id":"msg_01","step":{"source":"agent","content":[{"reasoning":{"text":"I'll run pytest on test_auth.py."}}],"metrics":{"input_tokens":1200,"output_tokens":0,"cache_read_tokens":1000}}}}
{"type":"event","session_id":"sess-1","trajectory_id":"traj-1","event":{"event_id":"ev-3","timestamp":"2026-10-30T18:00:03Z","response_id":"msg_01","step":{"source":"agent","content":[{"text":"Running pytest now."},{"action_id":"toolu_01"}],"actions":[{"action_id":"toolu_01","type":"tool","name":"Bash","arguments":{"command":"pytest test_auth.py"},"canonical":{"shell_command":{"cwd":"/workspace","command":"pytest test_auth.py"}}}],"stop_reason":"tools","metrics":{"input_tokens":1200,"output_tokens":45,"cache_read_tokens":1000,"cost_usd":0.0015,"cost_source":"reported"}}}}
{"type":"event","session_id":"sess-1","trajectory_id":"traj-1","event":{"event_id":"ev-4","timestamp":"2026-10-30T18:00:04Z","action":{"action_id":"toolu_01","output":[{"text":"1 passed in 0.12s"}],"canonical":{"shell_command":{"exit_code":0}},"end_time":"2026-10-30T18:00:04Z"}}}
{"type":"event","session_id":"sess-1","trajectory_id":"traj-1","event":{"event_id":"ev-5","timestamp":"2026-10-30T18:00:05Z","response_id":"msg_bad","step":{"source":"agent","content":[{"text":" accidental extra edit..."}],"stop_reason":"cancelled","metrics":{"input_tokens":1300,"output_tokens":10,"cache_read_tokens":1200}}}}
{"type":"event","session_id":"sess-1","trajectory_id":"traj-1","event":{"event_id":"ev-6","branch":{"after_event_id":"ev-4"},"timestamp":"2026-10-30T18:00:06Z","response_id":"msg_02","step":{"source":"agent","content":[{"text":"All auth tests pass."}],"stop_reason":"completed","metrics":{"input_tokens":1300,"output_tokens":20,"cache_read_tokens":1200,"cost_usd":0.0008,"cost_source":"reported"}}}}
{"type":"event","session_id":"sess-1","trajectory_id":"traj-1","event":{"event_id":"ev-7","timestamp":"2026-10-30T18:00:06Z","trajectory":{"status":"completed"}}}
```

</details>

<details>
<summary><strong>Consolidated <code>trajectories</code> Document (<code>session.atif.jsonl</code>)</strong></summary>

```jsonl
{"type":"meta","meta":{"schema_version":"ATIF-v2.0","document_type":"trajectories","create_time":"2026-10-30T18:00:07Z","manifest":{"sessions":[{"type":"session","session_id":"sess-1","session":{"start_time":"2026-10-30T18:00:01Z","end_time":"2026-10-30T18:00:06Z","final_metrics":{"total_input_tokens":3800,"total_output_tokens":75,"total_cache_read_tokens":3400,"total_steps":4,"total_llm_calls":3,"total_duration_ms":5000.0}}}],"trajectories":[{"type":"trajectory","session_id":"sess-1","trajectory_id":"traj-1","trajectory":{"agent":{"name":"claude-code","model":{"name":"claude-sonnet-4-5"}},"status":"completed","step_count":3,"first_step_id":1,"start_time":"2026-10-30T18:00:01Z","end_time":"2026-10-30T18:00:06Z"}},{"type":"trajectory","session_id":"sess-1","trajectory_id":"traj-1#retry-1","trajectory":{"parent_trajectory_id":"traj-1","parent_reason":"retry","parent_step_id":2,"parent_steps_excluded":true,"agent":{"name":"claude-code","model":{"name":"claude-sonnet-4-5"}},"status":"cancelled","step_count":1,"first_step_id":3,"start_time":"2026-10-30T18:00:05Z","end_time":"2026-10-30T18:00:05Z"}}]}}}
{"type":"session","session_id":"sess-1","session":{"start_time":"2026-10-30T18:00:01Z","end_time":"2026-10-30T18:00:06Z","final_metrics":{"total_input_tokens":3800,"total_output_tokens":75,"total_cache_read_tokens":3400,"total_steps":4,"total_llm_calls":3,"total_duration_ms":5000.0}}}
{"type":"trajectory","session_id":"sess-1","trajectory_id":"traj-1","trajectory":{"child_trajectory_ids":["traj-1#retry-1"],"trajectory_depth":0,"status":"completed","start_time":"2026-10-30T18:00:01Z","end_time":"2026-10-30T18:00:06Z","step_count":3,"first_step_id":1,"agent":{"name":"claude-code","version":"2.0.15","model":{"name":"claude-sonnet-4-5","provider":"anthropic"}},"environments":[{"os":"linux","cwd":"/workspace"}],"final_metrics":{"total_input_tokens":2500,"total_output_tokens":65,"total_cache_read_tokens":2200,"total_cost_usd":0.0023,"cost_source":"reported","total_steps":3,"total_llm_calls":2,"total_duration_ms":5000.0}}}
{"type":"step","session_id":"sess-1","trajectory_id":"traj-1","step":{"step_id":1,"event_ids":["ev-1"],"source":"user","start_time":"2026-10-30T18:00:01Z","end_time":"2026-10-30T18:00:01Z","content":[{"type":"text","text":"Run pytest on auth."}]}}
{"type":"step","session_id":"sess-1","trajectory_id":"traj-1","step":{"step_id":2,"event_ids":["ev-2","ev-3"],"source":"agent","start_time":"2026-10-30T18:00:02Z","end_time":"2026-10-30T18:00:04Z","content":[{"type":"reasoning","reasoning":{"text":"I'll run pytest on test_auth.py."}},{"type":"text","text":"Running pytest now."},{"type":"action","action_id":"toolu_01"}],"actions":[{"action_id":"toolu_01","event_ids":["ev-3","ev-4"],"type":"tool","name":"Bash","arguments":{"command":"pytest test_auth.py"},"output":[{"type":"text","text":"1 passed in 0.12s"}],"end_time":"2026-10-30T18:00:04Z","canonical":{"type":"shell_command","shell_command":{"cwd":"/workspace","command":"pytest test_auth.py","exit_code":0}}}],"stop_reason":"tools","metrics":{"input_tokens":1200,"output_tokens":45,"cache_read_tokens":1000,"cost_usd":0.0015,"cost_source":"reported","response_id":"msg_01"}}}
{"type":"step","session_id":"sess-1","trajectory_id":"traj-1","step":{"step_id":3,"event_ids":["ev-6"],"source":"agent","start_time":"2026-10-30T18:00:06Z","end_time":"2026-10-30T18:00:06Z","content":[{"type":"text","text":"All auth tests pass."}],"stop_reason":"completed","metrics":{"input_tokens":1300,"output_tokens":20,"cache_read_tokens":1200,"cost_usd":0.0008,"cost_source":"reported","response_id":"msg_02"}}}
{"type":"trajectory","session_id":"sess-1","trajectory_id":"traj-1#retry-1","trajectory":{"parent_trajectory_id":"traj-1","parent_reason":"retry","parent_event_id":"ev-4","parent_step_id":2,"parent_steps_excluded":true,"ancestor_trajectory_ids":["traj-1"],"trajectory_depth":1,"status":"cancelled","start_time":"2026-10-30T18:00:05Z","end_time":"2026-10-30T18:00:05Z","step_count":1,"first_step_id":3,"agent":{"name":"claude-code","version":"2.0.15","model":{"name":"claude-sonnet-4-5","provider":"anthropic"}},"final_metrics":{"total_input_tokens":1300,"total_output_tokens":10,"total_cache_read_tokens":1200,"total_steps":1,"total_llm_calls":1,"total_duration_ms":0.0}}}
{"type":"step","session_id":"sess-1","trajectory_id":"traj-1#retry-1","step":{"step_id":3,"event_ids":["ev-5"],"source":"agent","start_time":"2026-10-30T18:00:05Z","end_time":"2026-10-30T18:00:05Z","content":[{"type":"text","text":" accidental extra edit..."}],"stop_reason":"cancelled","metrics":{"input_tokens":1300,"output_tokens":10,"cache_read_tokens":1200,"response_id":"msg_bad"}}}
{"type":"extension","session_id":"sess-1","trajectory_id":"traj-1","extension":{"namespace":"com.example.annotation","data":{"id":"ann-1","step_id":3,"key":"accuracy","verdict":"POSITIVE","score":1.0}}}
```

</details>
