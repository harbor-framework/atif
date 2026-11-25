---
title: "ATIF v2.0 Canonical Actions Catalog"
description: "Normative semantic action overlay catalog (Action.canonical) normalizing tool calls across agent harnesses."
atif_version: "2.0"
schema_version: "ATIF-v2.0"
status: "draft"
release_date: "2026-11-25"
doc_type: "reference"
order: 10
source_ref: "harbor-framework/harbor#4134"
---

# ATIF v2.0 Canonical Actions Catalog

*Normative companion to [ATIF v2.0 Specification](../SPEC.md) · Status: Working Draft · Machine-readable schema: [`canonical-actions.schema.json`](../schema/canonical-actions.schema.json).*

---

## Overview

`Action.canonical` is an optional, strongly typed semantic overlay attached alongside raw `Action.name`, `Action.arguments`, and `Action.output`:

1. **Non-destructive overlay**: Raw harness calls and outputs remain untouched on `Action`; `Action.canonical` adds normalized fields for cross-harness analysis.
2. **Single active variant + orthogonal `mcp`**: At most one semantic member below MUST be populated (`oneof action` in [`atif.proto`](../schema/atif.proto)). `canonical.mcp` is orthogonal so MCP-backed tools can simultaneously populate a semantic variant (`file_read`, `search`, etc.).
3. **Derived `type` discriminator**: `CanonicalAction.type` is optional in `"events"` documents and MUST be populated in `"trajectories"` documents and SQL projections (set to the active variant key, or `"mcp_tool"` when only `mcp` is populated).
4. **Partial event updates**: In `"events"` output updates (`R2`), `Action.canonical` MAY supply partial fields (e.g., `{ shell_command: { exit_code: 0 } }`), which consolidation merges per [Field-Level Merge Rules](../SPEC.md#field-level-merge-and-folding-rules).

Common primitive and metadata types (`ArdUrn`, `Extensions`, `FinalMetrics`, `Modality`, `ModelMetadata`, `Sha256Urn`, `Timestamp`) are defined in [ATIF v2.0 Specification](../SPEC.md#common-primitive-types). Resource identifier fields (`identifier`, `*_identifier`) accept optional ARD URNs per [Resource Identifiers](../SPEC.md#resource-identifiers).

---

## Envelope and Shared Types

### `CanonicalAction`

```ts
export type CanonicalActionType =
  | "multi"
  | "subagent"
  | "message_send"
  | "message_read"
  | "elicitation"
  | "timer"
  | "synthetic_context"
  | "task_status"
  | "task_list"
  | "task_stop"
  | "shell_command"
  | "shell_send_input"
  | "script_exec"
  | "file_read"
  | "file_write"
  | "file_search"
  | "file_list"
  | "file_move"
  | "file_delete"
  | "search"
  | "web_fetch"
  | "skill_activate"
  | "skill_reference"
  | "skill_script"
  | "generate_media"
  | "mcp_tool"
  | "extension"
  | "resource_discovery";

export interface CanonicalAction {
  type?: CanonicalActionType;
  reason?: string;
  mcp?: CanonicalMcpProvenance;

  multi?: CanonicalMultiAction;
  subagent?: CanonicalSubagent;
  message_send?: CanonicalMessageSend;
  message_read?: CanonicalMessageRead;
  elicitation?: CanonicalElicitation;
  timer?: CanonicalTimer;
  synthetic_context?: CanonicalSyntheticContext;
  task_status?: CanonicalTaskStatus;
  task_list?: CanonicalTaskList;
  task_stop?: CanonicalTaskStop;
  shell_command?: CanonicalShellCommand;
  shell_send_input?: CanonicalShellSendInput;
  script_exec?: CanonicalScriptExec;
  file_read?: CanonicalFileRead;
  file_write?: CanonicalFileWrite;
  file_search?: CanonicalFileSearch;
  file_list?: CanonicalFileList;
  file_move?: CanonicalFileMove;
  file_delete?: CanonicalFileDelete;
  search?: CanonicalSearch;
  web_fetch?: CanonicalWebFetch;
  skill_activate?: CanonicalSkillActivate;
  skill_reference?: CanonicalSkillReference;
  skill_script?: CanonicalSkillScript;
  generate_media?: CanonicalGenerateMedia;
  extension?: CanonicalExtension;
  resource_discovery?: CanonicalResourceDiscovery;

  extensions?: Extensions;
}
```

- `reason` records an explanation provided by the agent for invoking this action.
- `mcp` records orthogonal MCP server/tool provenance (`CanonicalMcpProvenance`).
- At most one semantic variant (`multi` through `resource_discovery`) MUST be populated on a single `CanonicalAction`.

### `CanonicalMcpProvenance`

Orthogonal MCP provenance attached to `CanonicalAction.mcp`; may accompany any semantic variant or stand alone (`type: "mcp_tool"`).

```ts
export interface CanonicalMcpProvenance {
  server_name: string;
  server_identifier?: ArdUrn | string;
  tool_name: string;
}
```

- `server_name`: Configured MCP server name (e.g., `"github"`, `"filesystem"`, `"postgres"`).
- `server_identifier`: Optional ARD URN (`"urn:air:..."`) for the MCP server.
- `tool_name`: Unprefixed MCP tool name invoked on the server (e.g., `"get_issue"`, `"read_file"`).

*Informative mappings:* `mcp__<server>__<tool>` (Claude Code, OpenCode, Pi), `MCP_TOOL` (Antigravity).

### `FileScope`

Closed vocabulary classifying the logical storage scope of filesystem actions:

```ts
export type FileScope =
  | "workspace"
  | "computer"
  | "memory"
  | "session"
  | "scratch"
  | "artifact";
```

| Value | Meaning |
| :--- | :--- |
| `"workspace"` | Project repository or working directory files. |
| `"computer"` | Host/container OS files outside the project workspace. |
| `"memory"` | Persistent cross-session agent memory files (e.g., `CLAUDE.md`, `MEMORY.md`). |
| `"session"` | Ephemeral session state or plan files. |
| `"scratch"` | Throwaway scratchpad or temporary directory files. |
| `"artifact"` | Structured deliverable artifacts presented to the user. |

### `MessageParticipant`

Participant identity in multi-agent messaging (`message_send` and `message_read`), separating local runtime handle (`name`), execution path (`trajectory_id`), and catalog identity (`identifier`):

```ts
export interface MessageParticipant {
  name?: string;
  trajectory_id?: string;
  identifier?: ArdUrn | string;
}
```

---

## Utility

### `multi`

Ordered or concurrent batch of canonical actions dispatched within a single wrapper or code-mode action.

```ts
export interface CanonicalMultiAction {
  actions: CanonicalAction[];
}
```

*Informative mappings:* `multi_tool_use.parallel`, multi-file `apply_patch` batches, code-mode action batches.

---

## Agent Coordination and Lifecycle

### `subagent`

Delegation to a child agent trajectory.

```ts
export interface CanonicalSubagent {
  trajectory_id?: string;
  uri?: string;
  agent_name?: string;
  agent_identifier?: ArdUrn | string;
  prompt?: string;
  usage?: FinalMetrics;
}
```

- `trajectory_id`: Target subagent `trajectory_id` in the same document or warehouse.
- `uri`: RFC 3986 URI or relative path to an external subagent trajectory file.
- `agent_name`, `agent_identifier`: Invoked subagent role/template name and optional ARD URN.
- `prompt`: Task prompt delegated to the subagent.
- `usage`: Informational aggregated token/cost usage for the subagent run (not double-counted into parent or session `final_metrics`).

*Informative mappings:* `Task`, `Agent` (Claude Code); `spawn_agent` (Codex); `task` (OpenCode, DeepAgents); `invoke_subagent` (Antigravity); `delegate_to_agent` (Goose).

### `message_send`

Direct teammate message, async worker input, or shared-board post.

```ts
export interface CanonicalMessageSend {
  sender?: MessageParticipant;
  recipients?: MessageParticipant[];
  broadcast?: boolean;
  task_id?: string;
  channel_id?: string;
  thread_id?: string;
  message_id?: string;
  message?: string;
}
```

- `sender`: Optional sender identity when distinct from `Trajectory.agent` (defaults to the enclosing trajectory).
- `recipients`: Addressed recipients (omitted on unaddressed channel posts or broadcasts).
- `broadcast`: `true` when broadcast to all peers in a team, swarm, or channel.
- `task_id`: Target background task ID when messaging an async worker.
- `channel_id`, `thread_id`, `message_id`: Board/channel/room ID, thread ID, and assigned message ID or board sequence number.
- `message`: Optional message body (subject to `Action.truncated_fields["canonical.message_send.message"]` when oversized).

*Informative mappings:* `SendMessage` (Claude Code); `send_input` (Codex); `send_message`, `post_message` (Antigravity); `post`, `reply` (Vercel Board).

### `message_read`

Reading or waiting on incoming peer messages or a shared board.

```ts
export interface CanonicalMessageRead {
  channel_id?: string;
  thread_id?: string;
  message_ids?: string[];
  senders?: MessageParticipant[];
  wait?: boolean;
}
```

- `channel_id`, `thread_id`: Board, channel, inbox, or thread read or waited on.
- `message_ids`: Message IDs or board sequence numbers received (joins to `CanonicalMessageSend.message_id`).
- `senders`: Sender participants of the messages read, when known.
- `wait`: `true` when the action parks or blocks waiting for incoming messages.

*Informative mappings:* `read_board`, `swarm_wait` (Antigravity); `read`, `wait` (Vercel Board).

### `elicitation`

Clarifying question or structured input request presented to the user.

```ts
export interface CanonicalElicitation {
  question: string;
  choices?: string[];
  requested_schema?: Record<string, unknown>;
}
```

- `choices`: Optional selectable options offered to the user.
- `requested_schema`: Optional JSON Schema when requesting structured form input.

*Informative mappings:* `AskUserQuestion` (Claude Code); `request_user_input` (Codex); `question` (OpenCode); `ask_question` (Antigravity).

### `timer`

One-shot timer or recurring cron schedule delivering a future wakeup prompt.

```ts
export interface CanonicalTimer {
  duration_sec?: number;
  cron_expression?: string;
  expire_time?: Timestamp;
  prompt?: string;
}
```

- `duration_sec`: One-shot timer duration in seconds (mutually exclusive with `cron_expression`).
- `cron_expression`: Recurring 5-field cron schedule (mutually exclusive with `duration_sec`).
- `expire_time`: Absolute wall-clock expiration timestamp.
- `prompt`: Wakeup prompt delivered when the timer or cron fires.

*Informative mappings:* `schedule` (Antigravity).

### `synthetic_context`

Harness-injected synthetic context block.

```ts
export interface CanonicalSyntheticContext {
  source: "system" | "environment" | "event";
}
```

`source` is a closed vocabulary identifying the origin of the injected context block.

---

## Task and Process Management

### `task_status`

Polling or waiting on a background task's progress or output.

```ts
export interface CanonicalTaskStatus {
  task_id: string;
  wait?: boolean;
  wait_timeout_sec?: number;
}
```

- `wait`: `true` when waiting for progress or completion rather than returning an instant snapshot.
- `wait_timeout_sec`: Maximum seconds waited for output or completion.

*Informative mappings:* `TaskOutput` (Claude Code); `manage_task` (`status`, Antigravity); `wait` (Codex).

### `task_list`

Listing active (and optionally completed) background tasks.

```ts
export interface CanonicalTaskList {
  task_type?: string;
  include_completed?: boolean;
}
```

*Informative mappings:* `manage_task` (`list`, Antigravity).

### `task_stop`

Terminating a background task or shell process.

```ts
export interface CanonicalTaskStop {
  task_id: string;
  signal?: string;
  reason?: string;
}
```

- `signal`: OS signal sent to the process (e.g., `"SIGTERM"`, `"SIGKILL"`).

*Informative mappings:* `TaskStop`, `KillShell` (Claude Code); `manage_task` (`kill`, Antigravity); `close_agent` (Codex).

---

## Command and Script Execution

### `shell_command`

Executing a shell command in an environment or persistent PTY.

```ts
export interface CanonicalShellCommand {
  task_id?: string;
  cwd?: string;
  command: string;
  exit_code?: number;
}
```

- `task_id`: Background task ID if backgrounded or running in a persistent PTY.
- `cwd`: Working directory in which the command executed.
- `exit_code`: Process exit status code (`0` for success).

*Informative mappings:* `Bash` (Claude Code); `exec_command`, `shell`, `local_shell_call` (Codex); `bash` (OpenCode, Pi); `run_command` (Antigravity); `run_terminal_cmd` (Cursor); `bash_command` (Terminus 2); `execute_bash` (OpenHands).

### `shell_send_input`

Writing standard input bytes or characters to an interactive PTY or background shell.

```ts
export interface CanonicalShellSendInput {
  task_id: string;
  input: string;
}
```

*Informative mappings:* `write_stdin` (Codex); `manage_task` (`send_input`, Antigravity).

### `script_exec`

Executing a script file, notebook cell, or inline workflow program.

```ts
export interface CanonicalScriptExec {
  pid?: string;
  language?: string;
  path?: string;
  source?: string;
  arguments?: string[];
  exit_code?: number;
}
```

- `pid`: Process or kernel session identifier (e.g., Jupyter/IPython kernel ID).
- `language`: Programming language (e.g., `"python"`, `"javascript"`).
- `path`, `source`: Disk path or inline source code executed.

*Informative mappings:* `execute_ipython_cell` (OpenHands).

---

## Filesystem Operations

### `file_read`

Reading a file or line range from a storage scope.

```ts
export interface CanonicalFileRead {
  scope?: FileScope;
  path: string;
  line_start?: number;
  line_end?: number;
  digest?: Sha256Urn;
}
```

- `line_start`, `line_end`: 1-based inclusive line range when partial lines were requested.
- `digest`: Optional SHA-256 digest (`"urn:sha256:<hex>"`) of the file version read.

*Informative mappings:* `Read` (Claude Code); `read` (OpenCode, Pi); `read_file` (Antigravity); `readToolCall` (Cursor).

### `file_write`

Creating, editing, or appending to a file.

```ts
export interface CanonicalFileWrite {
  scope?: FileScope;
  path: string;
  operation?: "create" | "edit" | "append";
  diff?: string;
  before_digest?: Sha256Urn;
  after_digest?: Sha256Urn;
}
```

- `operation`: Closed vocabulary (`"create"` for a new file, `"edit"` for modifying/replacing an existing file, `"append"` for appending).
- `diff`: Unified diff (`--- a/...`, `+++ b/...`, `@@ ... @@`) representing the change.
- `before_digest`, `after_digest`: Optional pre-write (omitted on `"create"`) and post-write SHA-256 digests.

*Informative mappings:* `Edit`, `MultiEdit`, `Write` (Claude Code); `apply_patch` (Codex); `edit`, `write`, `patch` (OpenCode, Pi); `edit_file`, `write_file` (Antigravity); `editToolCall` (Cursor); `str_replace_editor` (SWE-Agent, OpenHands).

### `file_search`

Searching file contents by regex or substring pattern.

```ts
export interface CanonicalFileSearch {
  scope?: FileScope;
  query: string;
  directory?: string;
  file_extensions?: string[];
}
```

*Informative mappings:* `Grep` (Claude Code); `grep` (OpenCode, Pi); `grep_search` (Antigravity).

### `file_list`

Listing directory entries or matching file paths by glob.

```ts
export interface CanonicalFileList {
  scope?: FileScope;
  directory: string;
  glob_pattern?: string;
  recursive?: boolean;
}
```

*Informative mappings:* `Glob`, `LS` (Claude Code); `list`, `glob` (OpenCode, Pi); `find_by_name` (Antigravity).

### `file_move`

Moving or renaming a file or directory.

```ts
export interface CanonicalFileMove {
  scope?: FileScope;
  source: string;
  destination: string;
}
```

*Informative mappings:* `apply_patch` move entries (Codex).

### `file_delete`

Deleting a file or directory.

```ts
export interface CanonicalFileDelete {
  scope?: FileScope;
  path: string;
  recursive?: boolean;
  before_digest?: Sha256Urn;
}
```

- `before_digest`: Optional pre-delete file SHA-256 digest (`"urn:sha256:<hex>"`).

*Informative mappings:* `delete_file` (Cursor); `apply_patch` delete entries (Codex).

---

## Information Retrieval and Web

### `search`

Querying a search engine, code index, or internal knowledge base.

```ts
export interface CanonicalSearch {
  query: string;
  source?: string;
}
```

- `source`: Search corpus or provider (e.g., `"web"`, `"codebase"`, `"docs"`).

*Informative mappings:* `WebSearch` (Claude Code); `web_search_call` (Codex); `websearch` (OpenCode); `search_web`, `code_search`, `moma_search` (Antigravity).

### `web_fetch`

Performing an HTTP request to fetch a URL.

```ts
export interface CanonicalWebFetch {
  method?: string;
  url: string;
  headers?: Record<string, unknown>;
  request_body?: string;
  response_status?: number;
}
```

- `method`: HTTP method (defaults to `"GET"`).
- `response_status`: HTTP status code (e.g., `200`, `404`).

*Informative mappings:* `WebFetch` (Claude Code); `webfetch` (OpenCode).

---

## Skills

### `skill_activate`

Activating or invoking an agent skill.

```ts
export interface CanonicalSkillActivate {
  skill_name: string;
  skill_identifier?: ArdUrn | string;
  prompt?: string;
}
```

*Informative mappings:* `Skill` (Claude Code, OpenCode, Pi).

### `skill_reference`

Reading a reference file inside a skill bundle (e.g., `SKILL.md`, `references/api.md`).

```ts
export interface CanonicalSkillReference {
  skill_name: string;
  skill_identifier?: ArdUrn | string;
  path: string;
}
```

### `skill_script`

Executing a helper script bundled with a skill.

```ts
export interface CanonicalSkillScript {
  skill_name: string;
  skill_identifier?: ArdUrn | string;
  script_name: string;
  arguments?: string[];
  cwd?: string;
}
```

---

## Media Generation

### `generate_media`

Generating image, audio, or video assets via a media model.

```ts
export interface CanonicalGenerateMedia {
  modality: Modality;
  prompt: string;
  model?: ModelMetadata;
  candidate_count?: number;
}
```

---

## Extensibility and Resource Discovery

### `extension`

Namespaced custom semantic action not covered by the core catalog.

```ts
export interface CanonicalExtension {
  namespace: string;
  data?: Record<string, unknown>;
}
```

- `namespace`: Reverse-DNS domain or RFC 3986 URI (e.g., `"com.example.deploy_service"`).
- `data`: Optional schema-governed JSON object payload.

### `resource_discovery`

Searching for available tools, skills, plugins, or MCP resources.

```ts
export interface CanonicalResourceDiscovery {
  query: string;
  types?: string[];
}
```

- `types`: Resource categories queried (e.g., `["tool", "skill", "plugin"]`).

*Informative mappings:* `ToolSearch` (Claude Code); `skill_search`, `search_marketplace` (Antigravity).

---

## Normalization Examples

*This section is non-normative.*

### File Edit Normalized to `file_write`

```json
{
  "action_id": "call_edit_1",
  "type": "tool",
  "name": "Edit",
  "arguments": {
    "file_path": "/workspace/src/auth.py",
    "old_string": "if token.exp < now:",
    "new_string": "if token.exp <= now:"
  },
  "output": [
    {
      "type": "text",
      "text": "The file /workspace/src/auth.py has been updated."
    }
  ],
  "canonical": {
    "type": "file_write",
    "reason": "Fix off-by-one token expiration boundary check",
    "file_write": {
      "scope": "workspace",
      "path": "/workspace/src/auth.py",
      "operation": "edit",
      "diff": "@@ -42,1 +42,1 @@\n-if token.exp < now:\n+if token.exp <= now:",
      "before_digest": "urn:sha256:4a8b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b",
      "after_digest": "urn:sha256:9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e"
    }
  }
}
```

### MCP Tool Call with Orthogonal `canonical.mcp`

Domain-specific MCP tools set `type: "mcp_tool"`. MCP tools matching a semantic action (e.g., `mcp__filesystem__read_file`) populate both `canonical.mcp` and the semantic member (`canonical.file_read`, with `type: "file_read"`):

```json
{
  "action_id": "call_mcp_1",
  "type": "tool",
  "name": "mcp__github__get_issue",
  "arguments": {
    "owner": "acme",
    "repo": "auth",
    "issue_number": 42
  },
  "output": [
    {
      "type": "data",
      "data": {
        "number": 42,
        "title": "Support ATIF v2.0 streaming consolidation",
        "state": "open"
      }
    }
  ],
  "canonical": {
    "type": "mcp_tool",
    "mcp": {
      "server_name": "github",
      "server_identifier": "urn:air:github:mcp:github-mcp-server",
      "tool_name": "get_issue"
    }
  }
}
```

### Multi-Agent Messaging (`message_send` and `message_read`)

```json
{
  "action_id": "call_post_12",
  "type": "tool",
  "name": "post_message",
  "arguments": {
    "channel": "parser",
    "text": "@verifier check #12 — all lexer tests pass"
  },
  "output": [
    {
      "type": "data",
      "data": { "status": "posted", "seq": 12, "channel": "parser" }
    }
  ],
  "canonical": {
    "type": "message_send",
    "message_send": {
      "sender": { "name": "parser", "trajectory_id": "sess-42#parser" },
      "recipients": [{ "name": "verifier", "trajectory_id": "sess-42#verifier" }],
      "channel_id": "parser",
      "message_id": "12",
      "message": "@verifier check #12 — all lexer tests pass"
    }
  }
}
```

Corresponding read action on the receiving worker:

```json
{
  "action_id": "call_read_1",
  "type": "tool",
  "name": "read_board",
  "arguments": { "channel": "parser", "since": 11 },
  "output": [
    {
      "type": "text",
      "text": "#12 parser: @verifier check #12 — all lexer tests pass"
    }
  ],
  "canonical": {
    "type": "message_read",
    "message_read": {
      "channel_id": "parser",
      "message_ids": ["12"],
      "senders": [{ "name": "parser", "trajectory_id": "sess-42#parser" }]
    }
  }
}
```
