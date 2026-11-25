import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Ajv2020Module, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import addFormatsModule from 'ajv-formats';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileCode2,
  GitBranch,
  Layers,
  Terminal,
  Trash2,
  Upload,
} from 'lucide-react';

// Safe CJS/ESM interop for Vite browser builds and Node SSR
const Ajv2020 =
  (Ajv2020Module as unknown as { default?: typeof Ajv2020Module }).default ?? Ajv2020Module;
const addFormats =
  (addFormatsModule as unknown as { default?: typeof addFormatsModule }).default ??
  addFormatsModule;

const SCHEMA_BASE_ID = 'https://atif.dev/schema/v2.0/atif-record.schema.json';

const RECORD_DEF_BY_TYPE: Record<string, string> = {
  meta: 'MetaRecord',
  event: 'EventRecord',
  session: 'SessionRecord',
  trajectory: 'TrajectoryRecord',
  step: 'StepRecord',
  extension: 'ExtensionRecord',
};

type PresetId = 'v2-trajectory' | 'v2-events' | 'invalid' | 'v1-legacy' | 'custom';
type DetectedKind =
  | 'empty'
  | 'v2-events'
  | 'v2-trajectories'
  | 'v1-json'
  | 'invalid-json'
  | 'unknown-json';

interface ValidationDiagnostic {
  line: number;
  recordType?: string;
  pointer: string;
  message: string;
  severity: 'error' | 'warning';
}

interface ParsedLineRecord {
  line: number;
  type?: string;
  data: Record<string, unknown>;
}

interface ValidationResult {
  detectedKind: DetectedKind;
  detectedLabel: string;
  diagnostics: ValidationDiagnostic[];
  records: ParsedLineRecord[];
  recordCounts: Record<string, number>;
  v1Doc?: Record<string, unknown>;
  schemaVersion?: string;
  documentType?: string;
}

interface CompiledValidators {
  root: ValidateFunction;
  byType: Record<string, ValidateFunction>;
}

const INVALID_SAMPLE_JSONL = [
  '{"type":"meta","meta":{"schema_version":"ATIF-v2.0","document_type":"trajectories","create_time":"2026-10-30T18:00:07Z"}}',
  '{"type":"trajectory","session_id":"sess-err","trajectory_id":"traj-err","trajectory":{"status":"running","step_count":2,"first_step_id":1,"agent":{"name":"demo-agent","model":{"name":"claude-sonnet-4-5"}}}}',
  '{"type":"step","session_id":"sess-err","trajectory_id":"traj-err","step":{"source":"agent","content":[{"type":"action","action_id":"act-1"}],"actions":[{"action_id":"act-1","type":"tool","executor":"browser","name":"Bash","arguments":{"command":"pytest"}}]}}',
  '{"type":"step","session_id":"sess-err","trajectory_id":"traj-err","step":{"step_id":2,"source":"agent","content":[{"type":"action","action_id":"act-2"}],"actions":[{"action_id":"act-2","type":"tool","executor":"environment","name":"Edit","canonical":{"type":"file_write","file_write":{"path":"/workspace/auth.py","operation":"edit","after_digest":"urn:sha256:not-a-valid-hex-digest"}}}]}}',
  '{"type":"event","session_id":"sess-err","trajectory_id":"traj-err","event":{"event_id":"ev-stray","timestamp":"2026-10-30T18:00:09Z","step":{"source":"user","content":[{"text":"Event row inside a trajectories document"}]}}}',
].join('\n');

const V1_LEGACY_SAMPLE_JSON = JSON.stringify(
  {
    schema_version: 'ATIF-v1.8',
    session_id: 'sess-legacy-42',
    agent: {
      name: 'harbor-agent',
      version: '1.4.2',
      model_name: 'anthropic/claude-sonnet-4-5',
    },
    steps: [
      {
        step_id: 1,
        timestamp: '2026-09-12T14:20:00Z',
        source: 'user',
        message: 'Check why test_login.py fails and summarize the fix.',
      },
      {
        step_id: 2,
        timestamp: '2026-09-12T14:20:02Z',
        source: 'agent',
        reasoning_content: 'Run pytest on tests/test_login.py to inspect the assertion failure.',
        message: 'Running the login test suite now.',
        tool_calls: [
          {
            tool_call_id: 'call_01',
            function_name: 'bash',
            arguments: { command: 'pytest tests/test_login.py' },
          },
        ],
        observation: {
          results: [
            {
              source_call_id: 'call_01',
              content: '1 passed in 0.18s',
            },
          ],
        },
        metrics: {
          prompt_tokens: 1450,
          completion_tokens: 68,
          cached_tokens: 900,
          cost_usd: 0.0021,
        },
      },
      {
        step_id: 3,
        timestamp: '2026-09-12T14:20:05Z',
        source: 'agent',
        message: [
          {
            type: 'text',
            text: 'All login tests pass after refreshing the fixture token.',
          },
          {
            type: 'audio',
            source: {
              media_type: 'audio/mp3',
              path: 'artifacts/summary.mp3',
              duration_sec: 4.2,
            },
          },
        ],
        metrics: {
          prompt_tokens: 1620,
          completion_tokens: 34,
          cached_tokens: 1400,
          cost_usd: 0.0012,
        },
      },
    ],
    final_metrics: {
      total_prompt_tokens: 3070,
      total_completion_tokens: 102,
      total_cached_tokens: 2300,
      total_cost_usd: 0.0033,
      total_steps: 3,
    },
  },
  null,
  2
);

function formatAjvErrors(errors: ErrorObject[] | null | undefined): Array<{
  pointer: string;
  message: string;
}> {
  if (!errors || errors.length === 0) return [];

  // Filter noisy wrapper errors (oneOf/if) when deeper specific errors exist
  const specific = errors.filter(
    (e) => e.keyword !== 'oneOf' && e.keyword !== 'if' && e.keyword !== 'anyOf'
  );
  const pool = specific.length > 0 ? specific : errors;

  const seen = new Set<string>();
  const formatted: Array<{ pointer: string; message: string }> = [];

  for (const err of pool) {
    const pointer = err.instancePath || '/';
    let msg = err.message ?? 'Schema validation error';

    if (err.keyword === 'enum' && Array.isArray(err.params?.allowedValues)) {
      const vals = (err.params.allowedValues as unknown[]).slice(0, 8).join(', ');
      msg = `must be one of: ${vals}`;
    } else if (err.keyword === 'additionalProperties' && err.params?.additionalProperty) {
      msg = `unexpected property "${String(err.params.additionalProperty)}"`;
    } else if (err.keyword === 'required' && err.params?.missingProperty) {
      msg = `missing required property "${String(err.params.missingProperty)}"`;
    } else if (err.keyword === 'const' && 'allowedValue' in (err.params ?? {})) {
      msg = `must equal ${JSON.stringify(err.params.allowedValue)}`;
    } else if (err.keyword === 'pattern') {
      msg = `does not match required pattern (${String(err.params?.pattern ?? '')})`;
    }

    const key = `${pointer}::${msg}`;
    if (!seen.has(key)) {
      seen.add(key);
      formatted.push({ pointer, message: msg });
    }
  }
  return formatted;
}

function getLineFromOffset(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}

function parseJsonErrorLine(text: string, err: unknown): number {
  const msg = err instanceof Error ? err.message : '';
  const lineMatch = msg.match(/line\s+(\d+)/i);
  if (lineMatch) return Math.max(1, Number(lineMatch[1]));
  const posMatch = msg.match(/position\s+(\d+)/i);
  if (posMatch) return getLineFromOffset(text, Number(posMatch[1]));
  return 1;
}

function validateV1Document(doc: Record<string, unknown>): ValidationDiagnostic[] {
  const diags: ValidationDiagnostic[] = [];
  const sv = String(doc.schema_version ?? '');
  if (!/^ATIF-v1\.[0-8]$/.test(sv)) {
    diags.push({
      line: 1,
      recordType: 'v1',
      pointer: '/schema_version',
      message: `expected ATIF-v1.0 through ATIF-v1.8, got "${sv}"`,
      severity: 'error',
    });
  }

  const agent = doc.agent as Record<string, unknown> | undefined;
  if (!agent || typeof agent !== 'object' || typeof agent.name !== 'string' || !agent.name) {
    diags.push({
      line: 1,
      recordType: 'v1',
      pointer: '/agent/name',
      message: 'missing required agent.name string',
      severity: 'error',
    });
  }

  const steps = doc.steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    diags.push({
      line: 1,
      recordType: 'v1',
      pointer: '/steps',
      message: 'steps must be a non-empty array',
      severity: 'error',
    });
    return diags;
  }

  steps.forEach((rawStep, idx) => {
    const step = rawStep as Record<string, unknown>;
    const expectedId = idx + 1;
    if (step?.step_id !== expectedId) {
      diags.push({
        line: 1,
        recordType: 'v1',
        pointer: `/steps/${idx}/step_id`,
        message: `expected sequential step_id ${expectedId}, got ${JSON.stringify(step?.step_id)}`,
        severity: 'error',
      });
    }
    if (!['system', 'user', 'agent'].includes(String(step?.source ?? ''))) {
      diags.push({
        line: 1,
        recordType: 'v1',
        pointer: `/steps/${idx}/source`,
        message: `invalid source "${String(step?.source ?? '')}" (expected system, user, or agent)`,
        severity: 'error',
      });
    }
    const callIds = new Set<string>();
    if (Array.isArray(step?.tool_calls)) {
      for (const tc of step.tool_calls as Array<Record<string, unknown>>) {
        if (typeof tc?.tool_call_id === 'string') callIds.add(tc.tool_call_id);
      }
    }
    const obs = step?.observation as { results?: Array<Record<string, unknown>> } | undefined;
    if (obs && Array.isArray(obs.results)) {
      obs.results.forEach((res, rIdx) => {
        if (res?.source_call_id && !callIds.has(String(res.source_call_id))) {
          diags.push({
            line: 1,
            recordType: 'v1',
            pointer: `/steps/${idx}/observation/results/${rIdx}/source_call_id`,
            message: `source_call_id "${String(res.source_call_id)}" does not match any tool_call_id in this step`,
            severity: 'error',
          });
        }
      });
    }
  });

  return diags;
}

function validateInput(
  rawText: string,
  validators: CompiledValidators | null
): ValidationResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return {
      detectedKind: 'empty',
      detectedLabel: 'No input',
      diagnostics: [],
      records: [],
      recordCounts: {},
    };
  }

  const physicalLines = rawText.split(/\r?\n/);
  const nonEmptyLines: Array<{ line: number; text: string }> = [];
  physicalLines.forEach((lineText, idx) => {
    const t = lineText.trim();
    if (t.length > 0) nonEmptyLines.push({ line: idx + 1, text: t });
  });

  // Step 1-4 format detection per spec/v2.0/references/v1-migration.md
  let firstLineParsed: unknown = undefined;
  let firstLineParseOk = false;
  try {
    firstLineParsed = JSON.parse(nonEmptyLines[0].text);
    firstLineParseOk = true;
  } catch {
    firstLineParseOk = false;
  }

  // Case A: Full-file pretty-printed JSON (e.g., v1.x JSON)
  if (!firstLineParseOk) {
    try {
      const fullDoc = JSON.parse(rawText) as unknown;
      if (fullDoc && typeof fullDoc === 'object' && !Array.isArray(fullDoc)) {
        const obj = fullDoc as Record<string, unknown>;
        if (typeof obj.schema_version === 'string' && obj.schema_version.startsWith('ATIF-v1')) {
          return {
            detectedKind: 'v1-json',
            detectedLabel: `${obj.schema_version} · legacy JSON`,
            diagnostics: validateV1Document(obj),
            records: [],
            recordCounts: { steps: Array.isArray(obj.steps) ? obj.steps.length : 0 },
            v1Doc: obj,
            schemaVersion: obj.schema_version,
          };
        }
        return {
          detectedKind: 'unknown-json',
          detectedLabel: 'Unrecognized JSON',
          diagnostics: [
            {
              line: 1,
              pointer: '/',
              message:
                'Valid JSON object, but neither ATIF v2.0 NDJSON (line 1 type: "meta") nor ATIF v1.x (schema_version: "ATIF-v1.*").',
              severity: 'error',
            },
          ],
          records: [],
          recordCounts: {},
        };
      }
      return {
        detectedKind: 'unknown-json',
        detectedLabel: 'Unrecognized JSON',
        diagnostics: [
          {
            line: 1,
            pointer: '/',
            message: 'Expected an ATIF v2.0 NDJSON stream or an ATIF v1.x JSON object.',
            severity: 'error',
          },
        ],
        records: [],
        recordCounts: {},
      };
    } catch (err) {
      const errLine = parseJsonErrorLine(rawText, err);
      const errMsg = err instanceof Error ? err.message : 'Invalid JSON syntax';
      return {
        detectedKind: 'invalid-json',
        detectedLabel: 'Invalid JSON',
        diagnostics: [
          {
            line: errLine,
            pointer: '/',
            message: `JSON syntax error: ${errMsg}`,
            severity: 'error',
          },
        ],
        records: [],
        recordCounts: {},
      };
    }
  }

  // Case B: Single-line minified ATIF v1.x JSON
  if (
    firstLineParsed &&
    typeof firstLineParsed === 'object' &&
    !Array.isArray(firstLineParsed) &&
    typeof (firstLineParsed as Record<string, unknown>).schema_version === 'string' &&
    String((firstLineParsed as Record<string, unknown>).schema_version).startsWith('ATIF-v1') &&
    nonEmptyLines.length === 1
  ) {
    const obj = firstLineParsed as Record<string, unknown>;
    return {
      detectedKind: 'v1-json',
      detectedLabel: `${String(obj.schema_version)} · legacy JSON`,
      diagnostics: validateV1Document(obj),
      records: [],
      recordCounts: { steps: Array.isArray(obj.steps) ? obj.steps.length : 0 },
      v1Doc: obj,
      schemaVersion: String(obj.schema_version),
    };
  }

  // Case C: NDJSON (ATIF v2.0 events or trajectories, or malformed NDJSON)
  const diagnostics: ValidationDiagnostic[] = [];
  const records: ParsedLineRecord[] = [];
  const recordCounts: Record<string, number> = {};

  let documentType: string | undefined;
  let schemaVersion: string | undefined;
  let detectedKind: DetectedKind = 'unknown-json';
  let detectedLabel = 'ATIF v2.0 NDJSON';

  const firstObj =
    firstLineParsed && typeof firstLineParsed === 'object' && !Array.isArray(firstLineParsed)
      ? (firstLineParsed as Record<string, unknown>)
      : null;

  if (firstObj?.type === 'meta') {
    const meta = firstObj.meta as Record<string, unknown> | undefined;
    schemaVersion = typeof meta?.schema_version === 'string' ? meta.schema_version : undefined;
    documentType = typeof meta?.document_type === 'string' ? meta.document_type : undefined;
    if (documentType === 'events') {
      detectedKind = 'v2-events';
      detectedLabel = `${schemaVersion ?? 'ATIF-v2.0'} · events`;
    } else if (documentType === 'trajectories') {
      detectedKind = 'v2-trajectories';
      detectedLabel = `${schemaVersion ?? 'ATIF-v2.0'} · trajectories`;
    } else {
      detectedKind = 'unknown-json';
      detectedLabel = 'ATIF v2.0 · invalid meta';
    }
  } else if (firstObj?.type === 'event') {
    detectedKind = 'v2-events';
    documentType = 'events';
    detectedLabel = 'ATIF-v2.0 · events (headerless)';
    diagnostics.push({
      line: nonEmptyLines[0].line,
      recordType: 'event',
      pointer: '/',
      message: 'Missing required line-1 meta record (type: "meta", document_type: "events").',
      severity: 'error',
    });
  } else {
    diagnostics.push({
      line: nonEmptyLines[0].line,
      recordType: typeof firstObj?.type === 'string' ? firstObj.type : undefined,
      pointer: '/type',
      message: 'Line 1 must be a meta record with type: "meta" and schema_version: "ATIF-v2.0".',
      severity: 'error',
    });
  }

  // Document-level state trackers
  const seenTrajectories = new Set<string>();
  const lastStepIdByTraj = new Map<string, number>();
  let metaSeenCount = 0;

  for (const entry of nonEmptyLines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(entry.text);
    } catch (err) {
      diagnostics.push({
        line: entry.line,
        pointer: '/',
        message: `JSON syntax error: ${err instanceof Error ? err.message : 'invalid JSON'}`,
        severity: 'error',
      });
      continue;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      diagnostics.push({
        line: entry.line,
        pointer: '/',
        message: 'Each NDJSON line must be a JSON object (AtifRecord).',
        severity: 'error',
      });
      continue;
    }

    const obj = parsed as Record<string, unknown>;
    const rType = typeof obj.type === 'string' ? obj.type : undefined;
    records.push({ line: entry.line, type: rType, data: obj });
    if (rType) {
      recordCounts[rType] = (recordCounts[rType] ?? 0) + 1;
    }

    // 1. JSON Schema 2020-12 line validation via Ajv
    if (validators) {
      const targetValidator =
        rType && validators.byType[rType] ? validators.byType[rType] : validators.root;
      const valid = targetValidator(obj);
      if (!valid) {
        const errs = formatAjvErrors(targetValidator.errors);
        if (errs.length === 0) {
          diagnostics.push({
            line: entry.line,
            recordType: rType,
            pointer: '/',
            message: 'Record does not conform to ATIF v2.0 JSON Schema.',
            severity: 'error',
          });
        } else {
          for (const e of errs) {
            diagnostics.push({
              line: entry.line,
              recordType: rType,
              pointer: e.pointer,
              message: e.message,
              severity: 'error',
            });
          }
        }
      }
    }

    // 2. Document-level normative checks
    if (rType === 'meta') {
      metaSeenCount++;
      if (metaSeenCount > 1) {
        diagnostics.push({
          line: entry.line,
          recordType: 'meta',
          pointer: '/type',
          message: 'Duplicate meta record; a document may contain only one line-1 meta header.',
          severity: 'error',
        });
      }
    }

    if (documentType === 'events' && rType && !['meta', 'event', 'extension'].includes(rType)) {
      diagnostics.push({
        line: entry.line,
        recordType: rType,
        pointer: '/type',
        message: `Row type "${rType}" is not allowed in document_type: "events" (allowed: event, extension).`,
        severity: 'error',
      });
    }

    if (
      documentType === 'trajectories' &&
      rType &&
      !['meta', 'session', 'trajectory', 'step', 'extension'].includes(rType)
    ) {
      diagnostics.push({
        line: entry.line,
        recordType: rType,
        pointer: '/type',
        message: `Row type "${rType}" is not allowed in document_type: "trajectories" (allowed: session, trajectory, step, extension).`,
        severity: 'error',
      });
    }

    if (rType === 'trajectory' && typeof obj.trajectory_id === 'string') {
      const tid = obj.trajectory_id;
      const traj = obj.trajectory as Record<string, unknown> | undefined;
      if (
        traj?.parent_steps_excluded === true &&
        typeof traj.parent_trajectory_id === 'string' &&
        !seenTrajectories.has(traj.parent_trajectory_id)
      ) {
        diagnostics.push({
          line: entry.line,
          recordType: 'trajectory',
          pointer: '/trajectory/parent_steps_excluded',
          message: `Delta Mode (parent_steps_excluded: true) requires parent "${traj.parent_trajectory_id}" earlier in the same file.`,
          severity: 'error',
        });
      }
      seenTrajectories.add(tid);
    }

    if (rType === 'step' && typeof obj.trajectory_id === 'string') {
      const tid = obj.trajectory_id;
      const step = obj.step as Record<string, unknown> | undefined;
      if (!seenTrajectories.has(tid)) {
        diagnostics.push({
          line: entry.line,
          recordType: 'step',
          pointer: '/trajectory_id',
          message: `Step references trajectory "${tid}" before its trajectory header row.`,
          severity: 'error',
        });
      }
      if (typeof step?.step_id === 'number') {
        const prev = lastStepIdByTraj.get(tid);
        if (prev !== undefined && step.step_id !== prev + 1) {
          diagnostics.push({
            line: entry.line,
            recordType: 'step',
            pointer: '/step/step_id',
            message: `Non-contiguous step_id ${step.step_id} for "${tid}" (expected ${prev + 1}).`,
            severity: 'error',
          });
        }
        lastStepIdByTraj.set(tid, step.step_id);
      }

      // Inclusive token accounting check
      const metrics = step?.metrics as Record<string, unknown> | undefined;
      if (metrics) {
        const inp = typeof metrics.input_tokens === 'number' ? metrics.input_tokens : undefined;
        const cr = typeof metrics.cache_read_tokens === 'number' ? metrics.cache_read_tokens : 0;
        const cw = typeof metrics.cache_write_tokens === 'number' ? metrics.cache_write_tokens : 0;
        if (inp !== undefined && inp < cr + cw) {
          diagnostics.push({
            line: entry.line,
            recordType: 'step',
            pointer: '/step/metrics/input_tokens',
            message: `Inclusive token invariant violated: input_tokens (${inp}) < cache_read_tokens (${cr}) + cache_write_tokens (${cw}).`,
            severity: 'warning',
          });
        }
        const out = typeof metrics.output_tokens === 'number' ? metrics.output_tokens : undefined;
        const rsn = typeof metrics.reasoning_tokens === 'number' ? metrics.reasoning_tokens : 0;
        if (out !== undefined && out < rsn) {
          diagnostics.push({
            line: entry.line,
            recordType: 'step',
            pointer: '/step/metrics/output_tokens',
            message: `Inclusive token invariant violated: output_tokens (${out}) < reasoning_tokens (${rsn}).`,
            severity: 'warning',
          });
        }
      }
    }
  }

  return {
    detectedKind,
    detectedLabel,
    diagnostics,
    records,
    recordCounts,
    schemaVersion,
    documentType,
  };
}

// ============================================================================
// Formatting helpers for Visual Trajectory Explorer
// ============================================================================

function formatInt(val: unknown): string {
  if (typeof val !== 'number' || Number.isNaN(val)) return '—';
  return val.toLocaleString('en-US');
}

function formatCost(val: unknown): string {
  if (typeof val !== 'number' || Number.isNaN(val)) return '—';
  if (val === 0) return '$0.00';
  if (val < 0.01) return `$${val.toFixed(4)}`;
  return `$${val.toFixed(3)}`;
}

function formatDuration(ms: unknown): string {
  if (typeof ms !== 'number' || Number.isNaN(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)}s`;
}

function formatShortTime(ts: unknown): string {
  if (typeof ts !== 'string' || !ts) return '';
  const m = ts.match(/T(\d{2}:\d{2}:\d{2})/);
  return m ? m[1] : ts;
}

function getCanonicalKind(canonical: Record<string, unknown> | undefined): string | null {
  if (!canonical || typeof canonical !== 'object') return null;
  if (typeof canonical.type === 'string') return canonical.type;
  const knownKeys = [
    'shell_command',
    'shell_send_input',
    'script_exec',
    'file_read',
    'file_write',
    'file_search',
    'file_list',
    'file_move',
    'file_delete',
    'subagent',
    'message_send',
    'message_read',
    'elicitation',
    'timer',
    'synthetic_context',
    'task_status',
    'task_list',
    'task_stop',
    'search',
    'web_fetch',
    'skill_activate',
    'skill_reference',
    'skill_script',
    'generate_media',
    'resource_discovery',
    'multi',
    'extension',
  ];
  for (const k of knownKeys) {
    if (canonical[k] !== undefined) return k;
  }
  if (canonical.mcp !== undefined) return 'mcp_tool';
  return null;
}

function summarizeCanonical(canonical: Record<string, unknown> | undefined): string | null {
  if (!canonical || typeof canonical !== 'object') return null;
  const sc = canonical.shell_command as Record<string, unknown> | undefined;
  if (sc) {
    const cmd = typeof sc.command === 'string' ? sc.command : '';
    const exit = typeof sc.exit_code === 'number' ? ` · exit ${sc.exit_code}` : '';
    return `${cmd}${exit}`.trim() || null;
  }
  const fw = canonical.file_write as Record<string, unknown> | undefined;
  if (fw) {
    const op = typeof fw.operation === 'string' ? `${fw.operation} ` : '';
    return `${op}${String(fw.path ?? '')}`.trim() || null;
  }
  const fr = canonical.file_read as Record<string, unknown> | undefined;
  if (fr) {
    const range =
      typeof fr.line_start === 'number'
        ? `:${fr.line_start}${typeof fr.line_end === 'number' ? `-${fr.line_end}` : ''}`
        : '';
    return `${String(fr.path ?? '')}${range}` || null;
  }
  const fd = canonical.file_delete as Record<string, unknown> | undefined;
  if (fd && typeof fd.path === 'string') return `delete ${fd.path}`;
  const sub = canonical.subagent as Record<string, unknown> | undefined;
  if (sub) {
    return [sub.agent_name, sub.trajectory_id].filter(Boolean).join(' · ') || null;
  }
  const ms = canonical.message_send as Record<string, unknown> | undefined;
  if (ms) {
    const ch = typeof ms.channel_id === 'string' ? `#${ms.channel_id}` : '';
    const msg = typeof ms.message === 'string' ? ms.message.slice(0, 72) : '';
    return [ch, msg].filter(Boolean).join(' ') || null;
  }
  const wf = canonical.web_fetch as Record<string, unknown> | undefined;
  if (wf && typeof wf.url === 'string') {
    const status = typeof wf.response_status === 'number' ? ` (${wf.response_status})` : '';
    return `${String(wf.method ?? 'GET')} ${wf.url}${status}`;
  }
  const srch = canonical.search as Record<string, unknown> | undefined;
  if (srch && typeof srch.query === 'string') return `"${srch.query}"`;
  const mcp = canonical.mcp as Record<string, unknown> | undefined;
  if (mcp) return `${String(mcp.server_name ?? '')}/${String(mcp.tool_name ?? '')}`;
  return null;
}

function extractOutputPreview(output: unknown): string | null {
  if (!Array.isArray(output) || output.length === 0) return null;
  const texts: string[] = [];
  for (const part of output as Array<Record<string, unknown>>) {
    if (typeof part?.text === 'string' && part.text.trim()) {
      texts.push(part.text.trim());
    } else if (part?.data && typeof part.data === 'object') {
      texts.push(JSON.stringify(part.data));
    } else if (part?.source && typeof part.source === 'object') {
      const s = part.source as Record<string, unknown>;
      texts.push(`[${String(s.media_type ?? 'media')} ${String(s.uri ?? '')}]`);
    }
  }
  if (texts.length === 0) return null;
  const joined = texts.join('\n');
  return joined.length > 260 ? `${joined.slice(0, 260)}…` : joined;
}

// ============================================================================
// Sub-components (flat hairline-structured Operate Mode)
// ============================================================================

function ActionItem({ action }: { action: Record<string, unknown> }) {
  const name = typeof action.name === 'string' ? action.name : String(action.action_id ?? 'action');
  const canonical = action.canonical as Record<string, unknown> | undefined;
  const canonicalKind = getCanonicalKind(canonical);
  const canonicalSummary = summarizeCanonical(canonical);
  const executor = typeof action.executor === 'string' ? action.executor : null;
  const envName = typeof action.environment_name === 'string' ? action.environment_name : null;
  const errored = action.errored === true;
  const approval = action.approval as Record<string, unknown> | undefined;
  const outputPreview = extractOutputPreview(action.output);
  const mcp = canonical?.mcp as Record<string, unknown> | undefined;

  return (
    <div className="tv-action">
      <div className="tv-action__head">
        <span className="tv-action__name">
          <Terminal size={13} aria-hidden="true" />
          <code>{name}</code>
        </span>
        {canonicalKind && <span className="tv-tag tv-tag--accent">{canonicalKind}</span>}
        {executor && (
          <span className="tv-tag tv-tag--neutral" title="Action.executor plane">
            {executor}
            {envName ? `:${envName}` : ''}
          </span>
        )}
        {mcp && canonicalKind !== 'mcp_tool' && (
          <span className="tv-tag tv-tag--neutral">
            mcp:{String(mcp.server_name ?? '')}
          </span>
        )}
        {errored && <span className="tv-tag tv-tag--error">errored</span>}
        {approval && (
          <span className="tv-tag tv-tag--neutral">
            {String(approval.decision ?? '')} ({String(approval.authority ?? '')})
          </span>
        )}
      </div>

      {canonicalSummary && <div className="tv-action__summary">{canonicalSummary}</div>}

      {outputPreview && (
        <pre className="tv-action__output">{outputPreview}</pre>
      )}

      <details className="tv-details">
        <summary>Raw action payload</summary>
        <pre className="tv-raw-json">{JSON.stringify(action, null, 2)}</pre>
      </details>
    </div>
  );
}

function StepTimelineRow({
  step,
  line,
  onJumpLine,
}: {
  step: Record<string, unknown>;
  line?: number;
  onJumpLine?: (line: number) => void;
}) {
  const stepId = step.step_id;
  const source = String(step.source ?? 'unknown');
  const agentName = typeof step.agent_name === 'string' ? step.agent_name : null;
  const stopReason = typeof step.stop_reason === 'string' ? step.stop_reason : null;
  const startTime = formatShortTime(step.start_time ?? step.timestamp);
  const metrics = step.metrics as Record<string, unknown> | undefined;
  const compaction = step.compaction as Record<string, unknown> | undefined;
  const citations = Array.isArray(step.citations)
    ? (step.citations as Array<Record<string, unknown>>)
    : [];
  const originalTraj =
    typeof step.original_trajectory_id === 'string' ? step.original_trajectory_id : null;

  const actionsList = Array.isArray(step.actions)
    ? (step.actions as Array<Record<string, unknown>>)
    : [];
  const actionsById = new Map<string, Record<string, unknown>>();
  for (const act of actionsList) {
    if (typeof act.action_id === 'string') actionsById.set(act.action_id, act);
  }
  const renderedActionIds = new Set<string>();

  const contentParts = Array.isArray(step.content)
    ? (step.content as Array<Record<string, unknown>>)
    : [];

  return (
    <div className="tv-step">
      <div className="tv-step__head">
        <div className="tv-step__id-group">
          {line && onJumpLine ? (
            <button
              type="button"
              className="tv-step__num"
              onClick={() => onJumpLine(line)}
              title={`Jump to line ${line}`}
            >
              #{String(stepId ?? '—')}
            </button>
          ) : (
            <span className="tv-step__num">#{String(stepId ?? '—')}</span>
          )}
          <span className={`tv-source tv-source--${source}`}>
            {source}
            {agentName ? ` · ${agentName}` : ''}
          </span>
          {stopReason && <span className="tv-muted-meta">{stopReason}</span>}
          {originalTraj && (
            <span className="tv-muted-meta" title="Copied from parent/source trajectory">
              copied:{originalTraj}
            </span>
          )}
        </div>

        <div className="tv-step__meta-right">
          {metrics && (
            <span className="tv-tabular tv-muted-meta">
              {typeof metrics.input_tokens === 'number' && `${formatInt(metrics.input_tokens)} in`}
              {typeof metrics.output_tokens === 'number' &&
                ` · ${formatInt(metrics.output_tokens)} out`}
              {typeof metrics.cost_usd === 'number' && ` · ${formatCost(metrics.cost_usd)}`}
              {typeof metrics.duration_ms === 'number' &&
                ` · ${formatDuration(metrics.duration_ms)}`}
            </span>
          )}
          {startTime && <span className="tv-tabular tv-muted-meta">{startTime}</span>}
        </div>
      </div>

      {compaction && (
        <div className="tv-compaction">
          <strong>Context Compaction</strong>
          {' · '}
          {String(compaction.trigger ?? 'compaction')}
          {compaction.boundary ? ` (${String(compaction.boundary)})` : ''}
          {typeof compaction.step_id_start === 'number' &&
            ` · steps ${compaction.step_id_start}–${String(compaction.step_id_end ?? '?')}`}
          {typeof compaction.tokens_before === 'number' &&
            typeof compaction.tokens_after === 'number' &&
            ` · ${formatInt(compaction.tokens_before)} → ${formatInt(compaction.tokens_after)} tok`}
          {typeof compaction.summary === 'string' && (
            <p className="tv-compaction__summary">{compaction.summary}</p>
          )}
        </div>
      )}

      <div className="tv-step__body">
        {contentParts.map((part, idx) => {
          const pType =
            typeof part.type === 'string'
              ? part.type
              : part.text !== undefined
                ? 'text'
                : part.reasoning !== undefined
                  ? 'reasoning'
                  : part.action_id !== undefined
                    ? 'action'
                    : part.data !== undefined
                      ? 'data'
                      : part.source !== undefined
                        ? 'media'
                        : 'unknown';

          if (pType === 'reasoning') {
            const r = part.reasoning as Record<string, unknown> | undefined;
            const rText = typeof r?.text === 'string' ? r.text : null;
            const flags = [
              r?.summarized ? 'summarized' : null,
              r?.signature ? 'signed' : null,
              !rText ? 'redacted' : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <details key={idx} className="tv-reasoning" open={Boolean(rText && rText.length < 220)}>
                <summary>
                  Reasoning{flags ? ` (${flags})` : ''}
                </summary>
                {rText && <p className="tv-reasoning__text">{rText}</p>}
              </details>
            );
          }

          if (pType === 'text' && typeof part.text === 'string') {
            return (
              <p key={idx} className="tv-step__text">
                {part.text}
              </p>
            );
          }

          if (pType === 'action' && typeof part.action_id === 'string') {
            const linked = actionsById.get(part.action_id);
            if (linked) {
              renderedActionIds.add(part.action_id);
              return <ActionItem key={idx} action={linked} />;
            }
            return (
              <div key={idx} className="tv-muted-meta">
                Action marker: <code>{part.action_id}</code>
              </div>
            );
          }

          if (pType === 'data' && part.data !== undefined) {
            return (
              <details key={idx} className="tv-details">
                <summary>Structured data part</summary>
                <pre className="tv-raw-json">{JSON.stringify(part.data, null, 2)}</pre>
              </details>
            );
          }

          if (part.source && typeof part.source === 'object') {
            const src = part.source as Record<string, unknown>;
            return (
              <div key={idx} className="tv-media-ref">
                <span className="tv-tag tv-tag--neutral">{pType}</span>
                <code>{String(src.media_type ?? 'application/octet-stream')}</code>
                {typeof src.uri === 'string' && <span className="tv-muted-meta">{src.uri}</span>}
                {typeof src.duration_sec === 'number' && (
                  <span className="tv-tabular tv-muted-meta">{src.duration_sec}s</span>
                )}
              </div>
            );
          }

          return null;
        })}

        {/* Render any actions not explicitly referenced by a content action marker */}
        {actionsList
          .filter((a) => !renderedActionIds.has(String(a.action_id ?? '')))
          .map((act, idx) => (
            <ActionItem key={`unlinked-${idx}`} action={act} />
          ))}

        {typeof step.error === 'string' && (
          <div className="tv-step__error">
            <AlertCircle size={14} aria-hidden="true" />
            <span>{step.error}</span>
          </div>
        )}

        {citations.length > 0 && (
          <div className="tv-citations">
            <div className="tv-citations__title">Citations ({citations.length})</div>
            <ul>
              {citations.map((c, idx) => (
                <li key={idx}>
                  {typeof c.uri === 'string' ? (
                    <a href={c.uri} target="_blank" rel="noopener noreferrer">
                      {typeof c.title === 'string' && c.title ? c.title : c.uri}
                    </a>
                  ) : (
                    <span>{typeof c.title === 'string' ? c.title : 'Citation'}</span>
                  )}
                  {typeof c.cited_text === 'string' && (
                    <span className="tv-muted-meta"> — “{c.cited_text}”</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// Normalize ATIF v1.x JSON steps into the unified Step shape for visual exploration
function normalizeV1Steps(v1Doc: Record<string, unknown>): Array<Record<string, unknown>> {
  const rawSteps = Array.isArray(v1Doc.steps)
    ? (v1Doc.steps as Array<Record<string, unknown>>)
    : [];

  return rawSteps.map((s) => {
    const content: Array<Record<string, unknown>> = [];
    if (typeof s.reasoning_content === 'string' && s.reasoning_content.trim()) {
      content.push({ type: 'reasoning', reasoning: { text: s.reasoning_content } });
    }
    if (typeof s.message === 'string' && s.message.trim()) {
      content.push({ type: 'text', text: s.message });
    } else if (Array.isArray(s.message)) {
      for (const p of s.message as Array<Record<string, unknown>>) {
        if (p?.type === 'text') {
          content.push({ type: 'text', text: p.text });
        } else if (p?.source && typeof p.source === 'object') {
          const src = p.source as Record<string, unknown>;
          content.push({
            type: p.type,
            source: {
              media_type: src.media_type,
              uri: src.path ?? src.uri,
              duration_sec: src.duration_sec,
            },
          });
        }
      }
    }

    const obsResults =
      s.observation &&
      typeof s.observation === 'object' &&
      Array.isArray((s.observation as Record<string, unknown>).results)
        ? ((s.observation as Record<string, unknown>).results as Array<Record<string, unknown>>)
        : [];
    const resultsByCall = new Map<string, Array<Record<string, unknown>>>();
    for (const r of obsResults) {
      const key = typeof r.source_call_id === 'string' ? r.source_call_id : '__unlinked__';
      const arr = resultsByCall.get(key) ?? [];
      arr.push(r);
      resultsByCall.set(key, arr);
    }

    const actions: Array<Record<string, unknown>> = [];
    if (Array.isArray(s.tool_calls)) {
      for (const tc of s.tool_calls as Array<Record<string, unknown>>) {
        const callId = String(tc.tool_call_id ?? '');
        const matching = resultsByCall.get(callId) ?? [];
        const outputParts: Array<Record<string, unknown>> = [];
        for (const r of matching) {
          if (typeof r.content === 'string') {
            outputParts.push({ type: 'text', text: r.content });
          } else if (Array.isArray(r.content)) {
            outputParts.push(...(r.content as Array<Record<string, unknown>>));
          }
        }
        content.push({ type: 'action', action_id: callId });
        actions.push({
          action_id: callId,
          type: 'tool',
          name: tc.function_name,
          arguments: tc.arguments,
          output: outputParts,
        });
      }
    }

    const m = s.metrics as Record<string, unknown> | undefined;
    const normalizedMetrics = m
      ? {
          input_tokens: m.prompt_tokens,
          output_tokens: m.completion_tokens,
          cache_read_tokens: m.cached_tokens,
          cost_usd: m.cost_usd,
        }
      : undefined;

    return {
      step_id: s.step_id,
      source: s.source,
      start_time: s.timestamp,
      content,
      actions,
      metrics: normalizedMetrics,
    };
  });
}

// ============================================================================
// Main Component
// ============================================================================

export default function TrajectoryValidator() {
  const [input, setInput] = useState<string>('');
  const [activePreset, setActivePreset] = useState<PresetId>('v2-trajectory');
  const [activeTab, setActiveTab] = useState<'validation' | 'explorer'>('validation');
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [selectedTrajectoryId, setSelectedTrajectoryId] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);

  const [validators, setValidators] = useState<CompiledValidators | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [sampleLoading, setSampleLoading] = useState<boolean>(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sampleCacheRef = useRef<Record<string, string>>({});

  // Load and compile JSON Schema 2020-12 on mount
  const loadSchemas = useCallback(async () => {
    setSchemaError(null);
    try {
      const [commonRes, canonicalRes, recordRes] = await Promise.all([
        fetch('/schema/v2.0/common-defs.schema.json'),
        fetch('/schema/v2.0/canonical-actions.schema.json'),
        fetch('/schema/v2.0/atif-record.schema.json'),
      ]);

      if (!commonRes.ok || !canonicalRes.ok || !recordRes.ok) {
        throw new Error(
          `Failed to load schemas (HTTP ${commonRes.status}/${canonicalRes.status}/${recordRes.status})`
        );
      }

      const [commonSchema, canonicalSchema, recordSchema] = await Promise.all([
        commonRes.json(),
        canonicalRes.json(),
        recordRes.json(),
      ]);

      const ajv = new Ajv2020({ allErrors: true, strict: false });
      addFormats(ajv);
      ajv.addSchema(commonSchema);
      ajv.addSchema(canonicalSchema);
      ajv.addSchema(recordSchema);

      const rootId = typeof recordSchema.$id === 'string' ? recordSchema.$id : SCHEMA_BASE_ID;
      const rootFn = ajv.getSchema(rootId) ?? ajv.compile(recordSchema);
      const byType: Record<string, ValidateFunction> = {};
      for (const [recordType, defName] of Object.entries(RECORD_DEF_BY_TYPE)) {
        const sub = ajv.getSchema(`${rootId}#/$defs/${defName}`);
        if (sub) byType[recordType] = sub;
      }

      setValidators({ root: rootFn, byType });
    } catch (err) {
      setSchemaError(err instanceof Error ? err.message : 'Unable to compile ATIF JSON Schemas');
    }
  }, []);

  const loadPreset = useCallback(async (preset: PresetId) => {
    setActivePreset(preset);
    setActiveLine(null);

    if (preset === 'invalid') {
      setInput(INVALID_SAMPLE_JSONL);
      setActiveTab('validation');
      return;
    }
    if (preset === 'v1-legacy') {
      setInput(V1_LEGACY_SAMPLE_JSON);
      return;
    }

    const url =
      preset === 'v2-events'
        ? '/examples/v2.0/session.atif-e.jsonl'
        : '/examples/v2.0/session.atif.jsonl';

    if (sampleCacheRef.current[url]) {
      setInput(sampleCacheRef.current[url]);
      return;
    }

    setSampleLoading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = (await res.text()).trimEnd();
      sampleCacheRef.current[url] = text;
      setInput(text);
    } catch {
      setInput(INVALID_SAMPLE_JSONL);
    } finally {
      setSampleLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSchemas();
    void loadPreset('v2-trajectory');
  }, [loadSchemas, loadPreset]);

  const result = useMemo(() => validateInput(input, validators), [input, validators]);

  const errorCount = useMemo(
    () => result.diagnostics.filter((d) => d.severity === 'error').length,
    [result.diagnostics]
  );
  const warningCount = useMemo(
    () => result.diagnostics.filter((d) => d.severity === 'warning').length,
    [result.diagnostics]
  );

  const errorLineSet = useMemo(() => {
    const s = new Set<number>();
    for (const d of result.diagnostics) {
      if (d.severity === 'error') s.add(d.line);
    }
    return s;
  }, [result.diagnostics]);

  // Build structured data for Explorer tab
  const explorerModel = useMemo(() => {
    if (result.detectedKind === 'v1-json' && result.v1Doc) {
      const doc = result.v1Doc;
      const agent = (doc.agent ?? {}) as Record<string, unknown>;
      const fm = (doc.final_metrics ?? {}) as Record<string, unknown>;
      const steps = normalizeV1Steps(doc);
      return {
        mode: 'v1' as const,
        meta: {
          schema_version: doc.schema_version,
          document_type: 'v1.x JSON',
        } as Record<string, unknown>,
        sessionId: typeof doc.session_id === 'string' ? doc.session_id : undefined,
        trajectories: [
          {
            id: String(doc.trajectory_id ?? doc.session_id ?? 'v1-trajectory'),
            trajectory: {
              agent: {
                name: agent.name,
                version: agent.version,
                model: { name: agent.model_name },
              },
              status: 'completed',
              step_count: steps.length,
              final_metrics: {
                total_input_tokens: fm.total_prompt_tokens,
                total_output_tokens: fm.total_completion_tokens,
                total_cache_read_tokens: fm.total_cached_tokens,
                total_cost_usd: fm.total_cost_usd,
                total_steps: fm.total_steps ?? steps.length,
              },
            } as Record<string, unknown>,
            steps: steps.map((st) => ({ step: st, line: 1 })),
          },
        ],
        events: [] as Array<{ line: number; record: Record<string, unknown> }>,
        extensions: [] as Array<{ line: number; record: Record<string, unknown> }>,
        sessions: [] as Array<Record<string, unknown>>,
      };
    }

    if (result.detectedKind === 'v2-trajectories') {
      let meta: Record<string, unknown> | undefined;
      const sessions: Array<Record<string, unknown>> = [];
      const trajOrder: string[] = [];
      const trajMap = new Map<
        string,
        {
          id: string;
          sessionId?: string;
          trajectory: Record<string, unknown>;
          steps: Array<{ step: Record<string, unknown>; line: number }>;
        }
      >();
      const extensions: Array<{ line: number; record: Record<string, unknown> }> = [];

      for (const rec of result.records) {
        const d = rec.data;
        if (rec.type === 'meta' && d.meta && typeof d.meta === 'object') {
          meta = d.meta as Record<string, unknown>;
        } else if (rec.type === 'session') {
          sessions.push(d);
        } else if (rec.type === 'trajectory' && typeof d.trajectory_id === 'string') {
          const id = d.trajectory_id;
          if (!trajMap.has(id)) {
            trajOrder.push(id);
            trajMap.set(id, {
              id,
              sessionId: typeof d.session_id === 'string' ? d.session_id : undefined,
              trajectory: (d.trajectory as Record<string, unknown>) ?? {},
              steps: [],
            });
          }
        } else if (rec.type === 'step' && typeof d.trajectory_id === 'string') {
          const id = d.trajectory_id;
          if (!trajMap.has(id)) {
            trajOrder.push(id);
            trajMap.set(id, { id, trajectory: {}, steps: [] });
          }
          if (d.step && typeof d.step === 'object') {
            trajMap.get(id)!.steps.push({ step: d.step as Record<string, unknown>, line: rec.line });
          }
        } else if (rec.type === 'extension') {
          extensions.push({ line: rec.line, record: d });
        }
      }

      return {
        mode: 'trajectories' as const,
        meta,
        sessions,
        trajectories: trajOrder.map((id) => trajMap.get(id)!),
        events: [] as Array<{ line: number; record: Record<string, unknown> }>,
        extensions,
      };
    }

    if (result.detectedKind === 'v2-events') {
      let meta: Record<string, unknown> | undefined;
      const events: Array<{ line: number; record: Record<string, unknown> }> = [];
      const extensions: Array<{ line: number; record: Record<string, unknown> }> = [];

      for (const rec of result.records) {
        const d = rec.data;
        if (rec.type === 'meta' && d.meta && typeof d.meta === 'object') {
          meta = d.meta as Record<string, unknown>;
        } else if (rec.type === 'event') {
          events.push({ line: rec.line, record: d });
        } else if (rec.type === 'extension') {
          extensions.push({ line: rec.line, record: d });
        }
      }

      return {
        mode: 'events' as const,
        meta,
        sessions: [] as Array<Record<string, unknown>>,
        trajectories: [] as Array<{
          id: string;
          trajectory: Record<string, unknown>;
          steps: Array<{ step: Record<string, unknown>; line: number }>;
        }>,
        events,
        extensions,
      };
    }

    return null;
  }, [result]);

  // Keep selected trajectory valid when input changes
  useEffect(() => {
    if (explorerModel && explorerModel.trajectories.length > 0) {
      const exists = explorerModel.trajectories.some((t) => t.id === selectedTrajectoryId);
      if (!exists) setSelectedTrajectoryId(explorerModel.trajectories[0].id);
    } else {
      setSelectedTrajectoryId('');
    }
  }, [explorerModel, selectedTrajectoryId]);

  const jumpToLine = useCallback(
    (lineNum: number) => {
      setActiveLine(lineNum);
      const ta = textareaRef.current;
      if (!ta) return;

      const lines = input.split(/\r?\n/);
      const clamped = Math.max(1, Math.min(lineNum, lines.length));
      let startOffset = 0;
      for (let i = 0; i < clamped - 1; i++) {
        startOffset += lines[i].length + 1;
      }
      const endOffset = startOffset + (lines[clamped - 1]?.length ?? 0);

      ta.focus();
      ta.setSelectionRange(startOffset, endOffset);

      const lineHeight = 21;
      const targetScroll = Math.max(0, (clamped - 4) * lineHeight);
      ta.scrollTop = targetScroll;
      if (gutterRef.current) gutterRef.current.scrollTop = targetScroll;
    },
    [input]
  );

  const handleScroll = useCallback(() => {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setActivePreset('custom');
        setActiveLine(null);
        setInput(reader.result);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const lineCount = useMemo(() => Math.max(1, input.split(/\r?\n/).length), [input]);
  const activeTraj = explorerModel?.trajectories.find((t) => t.id === selectedTrajectoryId) ??
    explorerModel?.trajectories[0];

  const isValid =
    result.detectedKind !== 'empty' &&
    result.detectedKind !== 'invalid-json' &&
    result.detectedKind !== 'unknown-json' &&
    errorCount === 0;

  return (
    <div className="tv-root not-content" data-testid="atif-validator">
      <style>{VALIDATOR_CSS}</style>

      {schemaError && (
        <div className="tv-banner tv-banner--error" role="alert">
          <AlertCircle size={15} aria-hidden="true" />
          <span>{schemaError}</span>
          <button type="button" className="tv-link-btn" onClick={() => void loadSchemas()}>
            Retry
          </button>
        </div>
      )}

      <div className="tv-workspace">
        {/* LEFT PANE: INPUT & EDITOR */}
        <section
          className={`tv-pane tv-pane--input ${isDragging ? 'tv-pane--dragging' : ''}`}
          aria-label="ATIF document input"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <div className="tv-toolbar">
            <div className="tv-preset-group" role="group" aria-label="Sample fixtures">
              <button
                type="button"
                className={`tv-tool-btn ${activePreset === 'v2-trajectory' ? 'tv-tool-btn--active' : ''}`}
                onClick={() => void loadPreset('v2-trajectory')}
              >
                v2.0 Trajectory
              </button>
              <button
                type="button"
                className={`tv-tool-btn ${activePreset === 'v2-events' ? 'tv-tool-btn--active' : ''}`}
                onClick={() => void loadPreset('v2-events')}
              >
                v2.0 Events
              </button>
              <button
                type="button"
                className={`tv-tool-btn ${activePreset === 'invalid' ? 'tv-tool-btn--active' : ''}`}
                onClick={() => void loadPreset('invalid')}
              >
                Invalid
              </button>
              <button
                type="button"
                className={`tv-tool-btn ${activePreset === 'v1-legacy' ? 'tv-tool-btn--active' : ''}`}
                onClick={() => void loadPreset('v1-legacy')}
              >
                v1.x Legacy
              </button>
            </div>

            <div className="tv-action-group">
              <input
                ref={fileInputRef}
                type="file"
                accept=".jsonl,.json,.txt"
                className="tv-sr-only"
                aria-label="Upload ATIF file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                className="tv-tool-btn"
                onClick={() => fileInputRef.current?.click()}
                title="Upload .atif.jsonl, .atif-e.jsonl, or .json"
              >
                <Upload size={13} aria-hidden="true" />
                <span>Upload</span>
              </button>
              <button
                type="button"
                className="tv-tool-btn"
                onClick={() => {
                  setActivePreset('custom');
                  setActiveLine(null);
                  setInput('');
                }}
                title="Clear editor"
              >
                <Trash2 size={13} aria-hidden="true" />
                <span>Clear</span>
              </button>
            </div>
          </div>

          <div className="tv-editor-wrap">
            <div className="tv-gutter tv-tabular" ref={gutterRef} aria-hidden="true">
              {Array.from({ length: lineCount }, (_, i) => {
                const ln = i + 1;
                const hasErr = errorLineSet.has(ln);
                const isSelected = activeLine === ln;
                return (
                  <div
                    key={ln}
                    className={`tv-gutter__line ${hasErr ? 'tv-gutter__line--error' : ''} ${
                      isSelected ? 'tv-gutter__line--active' : ''
                    }`}
                  >
                    {ln}
                  </div>
                );
              })}
            </div>
            <textarea
              ref={textareaRef}
              className="tv-textarea"
              value={input}
              onChange={(e) => {
                setActivePreset('custom');
                setInput(e.target.value);
              }}
              onScroll={handleScroll}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              placeholder="Paste or drop an .atif.jsonl, .atif-e.jsonl, or ATIF v1.x .json file…"
              aria-label="ATIF JSON or NDJSON input"
            />
          </div>

          <div className="tv-pane-footer tv-tabular">
            <span>
              {sampleLoading ? 'Loading fixture…' : `${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`}
              {' · '}
              {`${(new Blob([input]).size / 1024).toFixed(1)} KiB`}
            </span>
            <span>
              {validators ? 'Ajv Draft 2020-12 ready' : 'Loading schemas…'}
              {activeLine ? ` · L${activeLine}` : ''}
            </span>
          </div>
        </section>

        {/* RIGHT PANE: STATUS, VALIDATION DIAGNOSTICS, & VISUAL EXPLORER */}
        <section className="tv-pane tv-pane--output" aria-label="Validation and trajectory explorer">
          <div className="tv-status-bar">
            <div className="tv-status-left">
              <span className="tv-format-label" data-testid="detected-format">
                <FileCode2 size={14} aria-hidden="true" />
                <span>{result.detectedLabel}</span>
              </span>

              {result.detectedKind !== 'empty' && (
                <span
                  className={`tv-verdict ${isValid ? 'tv-verdict--valid' : 'tv-verdict--invalid'}`}
                  data-testid="validation-status"
                >
                  {isValid ? (
                    <>
                      <CheckCircle2 size={14} aria-hidden="true" />
                      <span className="tv-tabular">
                        Valid
                        {result.records.length > 0
                          ? ` · ${result.records.length} records`
                          : result.recordCounts.steps
                            ? ` · ${result.recordCounts.steps} steps`
                            : ''}
                        {warningCount > 0 ? ` (${warningCount} warning)` : ''}
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={14} aria-hidden="true" />
                      <span className="tv-tabular">
                        {errorCount} {errorCount === 1 ? 'error' : 'errors'}
                      </span>
                    </>
                  )}
                </span>
              )}
            </div>

            <div className="tv-tabs" role="tablist" aria-label="Output view">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'validation'}
                className={`tv-tab ${activeTab === 'validation' ? 'tv-tab--active' : ''}`}
                onClick={() => setActiveTab('validation')}
              >
                Validation
                {errorCount > 0 && <span className="tv-tab__count tv-tabular">{errorCount}</span>}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'explorer'}
                className={`tv-tab ${activeTab === 'explorer' ? 'tv-tab--active' : ''}`}
                onClick={() => setActiveTab('explorer')}
              >
                Explorer
              </button>
            </div>
          </div>

          <div className="tv-output-body">
            {result.detectedKind === 'empty' ? (
              <div className="tv-empty">
                Paste or drop an ATIF file on the left, or pick a sample preset above to validate and inspect it.
              </div>
            ) : activeTab === 'validation' ? (
              <div className="tv-validation-view" role="tabpanel">
                {result.diagnostics.length > 0 ? (
                  <ul className="tv-diag-list" data-testid="diagnostics-list">
                    {result.diagnostics.map((d, i) => (
                      <li key={i} className="tv-diag-item">
                        <button
                          type="button"
                          className={`tv-diag-btn ${activeLine === d.line ? 'tv-diag-btn--active' : ''}`}
                          onClick={() => jumpToLine(d.line)}
                        >
                          <span
                            className={`tv-diag-line tv-tabular ${
                              d.severity === 'warning' ? 'tv-diag-line--warn' : 'tv-diag-line--err'
                            }`}
                          >
                            L{d.line}
                          </span>
                          <span className="tv-diag-content">
                            <span className="tv-diag-meta">
                              {d.recordType && <code className="tv-diag-type">{d.recordType}</code>}
                              <code className="tv-diag-ptr">{d.pointer}</code>
                            </span>
                            <span className="tv-diag-msg">{d.message}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="tv-valid-summary" data-testid="valid-summary">
                    <div className="tv-valid-lead">
                      <CheckCircle2 size={16} aria-hidden="true" />
                      <span>
                        {result.detectedKind === 'v1-json'
                          ? `All structural checks passed for ${result.schemaVersion}.`
                          : 'Every NDJSON line conforms to ATIF v2.0 JSON Schema 2020-12 and document ordering invariants.'}
                      </span>
                    </div>

                    {result.detectedKind === 'v1-json' && (
                      <p className="tv-legacy-hint">
                        ATIF v1.x monolithic JSON detected. See{' '}
                        <a href="/guides/migrating-from-v1/">Migrating from v1.x to v2.0</a> for lossless NDJSON upgrade rules.
                      </p>
                    )}

                    {Object.keys(result.recordCounts).length > 0 && (
                      <div className="tv-count-strip tv-tabular">
                        {Object.entries(result.recordCounts).map(([kind, count]) => (
                          <div key={kind} className="tv-count-cell">
                            <span className="tv-count-cell__k">{kind}</span>
                            <span className="tv-count-cell__v">{count}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {result.records.length > 0 && (
                      <div className="tv-line-index">
                        <div className="tv-subhead">Records (click to highlight line)</div>
                        <ul className="tv-record-list">
                          {result.records.map((rec) => {
                            const tid =
                              typeof rec.data.trajectory_id === 'string'
                                ? rec.data.trajectory_id
                                : typeof rec.data.session_id === 'string'
                                  ? rec.data.session_id
                                  : '';
                            const detail =
                              rec.type === 'step'
                                ? `step #${String((rec.data.step as Record<string, unknown>)?.step_id ?? '?')} (${String((rec.data.step as Record<string, unknown>)?.source ?? '')})`
                                : rec.type === 'event'
                                  ? `${String((rec.data.event as Record<string, unknown>)?.event_id ?? '')}`
                                  : rec.type === 'extension'
                                    ? String(
                                        (rec.data.extension as Record<string, unknown>)
                                          ?.namespace ?? ''
                                      )
                                    : rec.type === 'meta'
                                      ? String(
                                          (rec.data.meta as Record<string, unknown>)
                                            ?.document_type ?? ''
                                        )
                                      : '';
                            return (
                              <li key={rec.line}>
                                <button
                                  type="button"
                                  className={`tv-record-row ${activeLine === rec.line ? 'tv-record-row--active' : ''}`}
                                  onClick={() => jumpToLine(rec.line)}
                                >
                                  <span className="tv-tabular tv-muted-meta">L{rec.line}</span>
                                  <code>{rec.type ?? 'unknown'}</code>
                                  <span className="tv-record-row__id">{tid}</span>
                                  <span className="tv-muted-meta">{detail}</span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* EXPLORER TAB */
              <div className="tv-explorer-view" role="tabpanel" data-testid="trajectory-explorer">
                {!explorerModel ? (
                  <div className="tv-empty">
                    Fix JSON syntax errors or provide an ATIF document to inspect it visually.
                  </div>
                ) : explorerModel.mode === 'events' ? (
                  <div className="tv-events-explorer">
                    <div className="tv-metrics-strip tv-metrics-strip--events tv-tabular">
                      <div>
                        <span className="tv-metric-k">Mode</span>
                        <span className="tv-metric-v">events stream</span>
                      </div>
                      <div>
                        <span className="tv-metric-k">Events</span>
                        <span className="tv-metric-v">{explorerModel.events.length}</span>
                      </div>
                      <div>
                        <span className="tv-metric-k">Branches</span>
                        <span className="tv-metric-v">
                          {
                            explorerModel.events.filter(
                              (e) =>
                                Boolean((e.record.event as Record<string, unknown>)?.branch)
                            ).length
                          }
                        </span>
                      </div>
                      {typeof explorerModel.meta?.create_time === 'string' && (
                        <div>
                          <span className="tv-metric-k">Created</span>
                          <span className="tv-metric-v">
                            {formatShortTime(explorerModel.meta.create_time)}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="tv-timeline">
                      {explorerModel.events.map(({ line, record }) => {
                        const ev = (record.event ?? {}) as Record<string, unknown>;
                        const evId = String(ev.event_id ?? '');
                        const branch = ev.branch as Record<string, unknown> | undefined;
                        const payloadKind = ev.step
                          ? 'step'
                          : ev.action
                            ? 'action'
                            : ev.trajectory
                              ? 'trajectory'
                              : ev.session
                                ? 'session'
                                : branch
                                  ? 'branch'
                                  : 'event';
                        const stepSlice = ev.step as Record<string, unknown> | undefined;
                        const actionSlice = ev.action as Record<string, unknown> | undefined;
                        const trajSlice = ev.trajectory as Record<string, unknown> | undefined;

                        return (
                          <div key={`${line}-${evId}`} className="tv-step">
                            <div className="tv-step__head">
                              <div className="tv-step__id-group">
                                <button
                                  type="button"
                                  className="tv-step__num"
                                  onClick={() => jumpToLine(line)}
                                  title={`Jump to line ${line}`}
                                >
                                  {evId || `L${line}`}
                                </button>
                                <span className={`tv-source tv-source--${payloadKind}`}>
                                  {payloadKind}
                                  {stepSlice?.source ? ` · ${String(stepSlice.source)}` : ''}
                                </span>
                                {typeof ev.response_id === 'string' && (
                                  <code className="tv-muted-code">{ev.response_id}</code>
                                )}
                                {branch && (
                                  <span className="tv-tag tv-tag--warn">
                                    <GitBranch size={12} aria-hidden="true" />
                                    {branch.after_event_id
                                      ? `branch after ${String(branch.after_event_id)}`
                                      : 'branch from root'}
                                  </span>
                                )}
                              </div>
                              <span className="tv-tabular tv-muted-meta">
                                {formatShortTime(ev.timestamp)}
                              </span>
                            </div>

                            <div className="tv-step__body">
                              {trajSlice && (
                                <div className="tv-muted-meta">
                                  {Boolean(trajSlice.agent) &&
                                    typeof (trajSlice.agent as Record<string, unknown>).name ===
                                      'string' && (
                                      <span>
                                        Agent:{' '}
                                        <strong>
                                          {String((trajSlice.agent as Record<string, unknown>).name)}
                                        </strong>
                                        {' · '}
                                      </span>
                                    )}
                                  {typeof trajSlice.status === 'string' && (
                                    <span>
                                      status: <code>{trajSlice.status}</code>
                                    </span>
                                  )}
                                </div>
                              )}

                              {stepSlice &&
                                Array.isArray(stepSlice.content) &&
                                (stepSlice.content as Array<Record<string, unknown>>).map(
                                  (part, pIdx) => {
                                    if (typeof part.text === 'string') {
                                      return (
                                        <p key={pIdx} className="tv-step__text">
                                          {part.text}
                                        </p>
                                      );
                                    }
                                    if (
                                      part.reasoning &&
                                      typeof (part.reasoning as Record<string, unknown>).text ===
                                        'string'
                                    ) {
                                      return (
                                        <p key={pIdx} className="tv-reasoning__text">
                                          <em>Reasoning:</em>{' '}
                                          {String((part.reasoning as Record<string, unknown>).text)}
                                        </p>
                                      );
                                    }
                                    return null;
                                  }
                                )}

                              {stepSlice &&
                                Array.isArray(stepSlice.actions) &&
                                (stepSlice.actions as Array<Record<string, unknown>>).map(
                                  (act, aIdx) => <ActionItem key={aIdx} action={act} />
                                )}

                              {actionSlice && <ActionItem action={actionSlice} />}

                              <details className="tv-details">
                                <summary>Raw event JSON</summary>
                                <pre className="tv-raw-json">{JSON.stringify(record, null, 2)}</pre>
                              </details>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* TRAJECTORIES OR V1.X EXPLORER */
                  <div className="tv-traj-explorer">
                    {explorerModel.trajectories.length > 1 && (
                      <div className="tv-traj-switcher" role="group" aria-label="Trajectories">
                        {explorerModel.trajectories.map((item) => {
                          const isCurrent = item.id === activeTraj?.id;
                          const reason =
                            typeof item.trajectory.parent_reason === 'string'
                              ? item.trajectory.parent_reason
                              : null;
                          const isDelta = item.trajectory.parent_steps_excluded === true;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className={`tv-traj-btn ${isCurrent ? 'tv-traj-btn--active' : ''}`}
                              onClick={() => setSelectedTrajectoryId(item.id)}
                            >
                              <span className="tv-traj-btn__id">
                                {reason ? (
                                  <GitBranch size={13} aria-hidden="true" />
                                ) : (
                                  <Layers size={13} aria-hidden="true" />
                                )}
                                <code>{item.id}</code>
                              </span>
                              <span className="tv-traj-btn__sub tv-tabular">
                                {reason ? `${reason}${isDelta ? ' · delta' : ''}` : 'root'}
                                {' · '}
                                {item.steps.length} {item.steps.length === 1 ? 'step' : 'steps'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {activeTraj && (() => {
                      const t = activeTraj.trajectory;
                      const agent = (t.agent ?? {}) as Record<string, unknown>;
                      const model = (agent.model ?? {}) as Record<string, unknown>;
                      const fm = (t.final_metrics ?? {}) as Record<string, unknown>;
                      const envs = Array.isArray(t.environments)
                        ? (t.environments as Array<Record<string, unknown>>)
                        : [];
                      const parentId =
                        typeof t.parent_trajectory_id === 'string'
                          ? t.parent_trajectory_id
                          : null;

                      // Compute step rollups fallback when final_metrics omitted
                      let sumIn = 0;
                      let sumOut = 0;
                      let sumCost = 0;
                      let hasMetrics = false;
                      for (const { step } of activeTraj.steps) {
                        const m = step.metrics as Record<string, unknown> | undefined;
                        if (m) {
                          if (typeof m.input_tokens === 'number') {
                            sumIn += m.input_tokens;
                            hasMetrics = true;
                          }
                          if (typeof m.output_tokens === 'number') {
                            sumOut += m.output_tokens;
                            hasMetrics = true;
                          }
                          if (typeof m.cost_usd === 'number') {
                            sumCost += m.cost_usd;
                            hasMetrics = true;
                          }
                        }
                      }

                      const totalIn =
                        typeof fm.total_input_tokens === 'number'
                          ? fm.total_input_tokens
                          : hasMetrics
                            ? sumIn
                            : undefined;
                      const totalOut =
                        typeof fm.total_output_tokens === 'number'
                          ? fm.total_output_tokens
                          : hasMetrics
                            ? sumOut
                            : undefined;
                      const totalCache =
                        typeof fm.total_cache_read_tokens === 'number'
                          ? fm.total_cache_read_tokens
                          : undefined;
                      const totalCost =
                        typeof fm.total_cost_usd === 'number'
                          ? fm.total_cost_usd
                          : hasMetrics && sumCost > 0
                            ? sumCost
                            : undefined;
                      const totalDur =
                        typeof fm.total_duration_ms === 'number' ? fm.total_duration_ms : undefined;

                      return (
                        <>
                          <div className="tv-metrics-strip tv-metrics-strip--traj tv-tabular">
                            <div>
                              <span className="tv-metric-k">Agent / Model</span>
                              <span className="tv-metric-v">
                                {String(agent.name ?? '—')}
                                {typeof model.name === 'string' ? ` · ${model.name}` : ''}
                              </span>
                            </div>
                            <div>
                              <span className="tv-metric-k">Status</span>
                              <span className="tv-metric-v">{String(t.status ?? '—')}</span>
                            </div>
                            <div>
                              <span className="tv-metric-k">Steps</span>
                              <span className="tv-metric-v">{activeTraj.steps.length}</span>
                            </div>
                            <div>
                              <span className="tv-metric-k">Input / Output</span>
                              <span className="tv-metric-v">
                                {formatInt(totalIn)} / {formatInt(totalOut)}
                                {totalCache ? ` (${formatInt(totalCache)} cached)` : ''}
                              </span>
                            </div>
                            <div>
                              <span className="tv-metric-k">Cost</span>
                              <span className="tv-metric-v">{formatCost(totalCost)}</span>
                            </div>
                            <div>
                              <span className="tv-metric-k">Duration</span>
                              <span className="tv-metric-v">{formatDuration(totalDur)}</span>
                            </div>
                          </div>

                          {parentId && (
                            <div className="tv-lineage-note">
                              <GitBranch size={13} aria-hidden="true" />
                              <span>
                                Branched from <code>{parentId}</code>
                                {typeof t.parent_reason === 'string' &&
                                  ` (${t.parent_reason})`}
                                {typeof t.parent_step_id === 'number' &&
                                  ` after step #${t.parent_step_id}`}
                                {t.parent_steps_excluded === true &&
                                  ` · Delta Mode (starts at step #${String(t.first_step_id ?? '?')})`}
                              </span>
                            </div>
                          )}

                          {(explorerModel.meta || envs.length > 0) && (
                            <details className="tv-meta-disclosure">
                              <summary>
                                <ChevronRight size={14} aria-hidden="true" />
                                <span>
                                  Document metadata
                                  {envs.length > 0 ? ` & ${envs.length} environment${envs.length > 1 ? 's' : ''}` : ''}
                                  {explorerModel.meta?.manifest ? ' & manifest' : ''}
                                </span>
                              </summary>
                              <div className="tv-meta-grid">
                                {envs.length > 0 && (
                                  <div className="tv-env-list">
                                    {envs.map((env, idx) => (
                                      <div key={idx} className="tv-env-row">
                                        <strong>{String(env.name ?? `env[${idx}]`)}</strong>
                                        <span>
                                          {[env.os, env.arch, env.cwd].filter(Boolean).join(' · ')}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {explorerModel.meta && (
                                  <pre className="tv-raw-json">
                                    {JSON.stringify(explorerModel.meta, null, 2)}
                                  </pre>
                                )}
                              </div>
                            </details>
                          )}

                          <div className="tv-timeline">
                            {activeTraj.steps.map(({ step, line }, idx) => (
                              <StepTimelineRow
                                key={`${activeTraj.id}-${String(step.step_id ?? idx)}`}
                                step={step}
                                line={line}
                                onJumpLine={jumpToLine}
                              />
                            ))}
                          </div>
                        </>
                      );
                    })()}

                    {explorerModel.extensions.length > 0 && (
                      <div className="tv-extensions-section">
                        <div className="tv-subhead">
                          Extension Records ({explorerModel.extensions.length})
                        </div>
                        {explorerModel.extensions.map(({ line, record }, idx) => {
                          const ext = (record.extension ?? {}) as Record<string, unknown>;
                          return (
                            <div key={idx} className="tv-ext-row">
                              <div className="tv-ext-row__head">
                                <button
                                  type="button"
                                  className="tv-step__num"
                                  onClick={() => jumpToLine(line)}
                                >
                                  L{line}
                                </button>
                                <code>{String(ext.namespace ?? 'extension')}</code>
                                {typeof record.trajectory_id === 'string' && (
                                  <span className="tv-muted-meta">
                                    target: {record.trajectory_id}
                                  </span>
                                )}
                              </div>
                              <pre className="tv-raw-json">
                                {JSON.stringify(ext.data ?? ext, null, 2)}
                              </pre>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

const VALIDATOR_CSS = `
.tv-root {
  --tv-pass-bg: var(--atif-pass-bg, oklch(0.23 0.042 158));
  --tv-pass-text: var(--atif-pass-ink, oklch(0.86 0.085 158));
  --tv-err-bg: var(--atif-error-bg, oklch(0.235 0.048 24));
  --tv-err-text: var(--atif-error-ink, oklch(0.88 0.085 24));
  --tv-err-border: var(--atif-error-border, oklch(0.48 0.115 24));
  --tv-warn-bg: var(--atif-amber-bg, oklch(0.235 0.040 76));
  --tv-warn-text: var(--atif-amber-ink, oklch(0.88 0.085 78));
  --tv-accent-tint: var(--atif-accent-tint, var(--sl-color-accent-low));
  --tv-accent-ink: var(--atif-accent-tint-ink, var(--sl-color-accent-high));
  font-family: var(--sl-font);
  color: var(--sl-color-gray-1);
}

.tv-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

.tv-tabular {
  font-variant-numeric: tabular-nums;
}

.tv-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 0.9rem;
  margin-bottom: 0.85rem;
  border-radius: 0.4rem;
  font-size: 0.875rem;
}

.tv-banner--error {
  background: var(--tv-err-bg);
  color: var(--tv-err-text);
  border: 1px solid var(--tv-err-border);
}

.tv-link-btn {
  margin-left: auto;
  background: transparent;
  border: none;
  color: inherit;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
}

/* 2-pane Operate workspace */
.tv-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.04fr) minmax(0, 1.08fr);
  gap: 1rem;
  align-items: stretch;
}

.tv-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  margin: 0;
  border: 1px solid var(--atif-border);
  border-radius: 0.5rem;
  background: var(--atif-surface);
  overflow: hidden;
  min-height: 36rem;
  max-height: 46rem;
}

.tv-pane--dragging {
  border-color: var(--sl-color-accent);
  outline: 2px dashed var(--sl-color-accent);
  outline-offset: -3px;
}

/* Toolbar — single compact horizontal row on desktop */
.tv-toolbar {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  padding: 0.5rem 0.65rem;
  background: var(--atif-surface-subtle);
  border-bottom: 1px solid var(--atif-border);
  overflow-x: auto;
}

.tv-preset-group,
.tv-action-group {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}

.tv-tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.26rem;
  padding: 0.25rem 0.48rem;
  margin: 0;
  border-radius: 0.35rem;
  border: 1px solid var(--atif-border-strong);
  background: var(--atif-surface);
  color: var(--sl-color-gray-1);
  font-family: var(--sl-font);
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1.3;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 120ms ease, background-color 120ms ease, color 120ms ease;
}

.tv-tool-btn:hover {
  border-color: var(--sl-color-accent);
  color: var(--sl-color-white);
}

.tv-tool-btn:focus-visible {
  outline: 2px solid var(--sl-color-accent);
  outline-offset: 2px;
}

.tv-tool-btn--active {
  background: var(--sl-color-accent-low);
  border-color: var(--sl-color-accent);
  color: var(--sl-color-accent-high);
  font-weight: 600;
}

/* Line-numbered editor */
.tv-editor-wrap {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  background: var(--sl-color-bg);
}

.tv-gutter {
  width: 3rem;
  flex-shrink: 0;
  padding: 0.75rem 0;
  background: var(--atif-surface-subtle);
  border-right: 1px solid var(--atif-border);
  overflow: hidden;
  user-select: none;
  font-family: var(--sl-font-mono);
  font-size: 0.8125rem;
  line-height: 21px;
  color: var(--atif-text-muted);
  text-align: right;
}

.tv-gutter__line {
  padding-right: 0.6rem;
  height: 21px;
  line-height: 21px;
  margin: 0;
}

.tv-gutter__line--error {
  background: var(--tv-err-bg);
  color: var(--tv-err-text);
  font-weight: 600;
}

.tv-gutter__line--active {
  background: var(--sl-color-accent-low);
  color: var(--sl-color-accent-high);
  font-weight: 700;
}

.tv-textarea {
  flex: 1;
  min-width: 0;
  width: 100%;
  border: none;
  resize: none;
  padding: 0.75rem 0.85rem;
  margin: 0;
  background: transparent;
  color: var(--sl-color-white);
  font-family: var(--sl-font-mono);
  font-size: 0.8125rem;
  line-height: 21px;
  white-space: pre;
  overflow: auto;
  tab-size: 2;
}

.tv-textarea:focus {
  outline: none;
}

.tv-pane-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.45rem 0.75rem;
  border-top: 1px solid var(--atif-border);
  background: var(--atif-surface-subtle);
  font-size: 0.8125rem;
  color: var(--atif-text-muted);
}

/* Output status bar & tabs */
.tv-status-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 0.85rem;
  padding: 0.5rem 0.85rem 0;
  background: var(--atif-surface-subtle);
  border-bottom: 1px solid var(--atif-border);
}

.tv-status-left {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  padding-bottom: 0.5rem;
}

.tv-format-label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--sl-color-white);
}

.tv-verdict {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.16rem 0.55rem;
  border-radius: 0.3rem;
  font-size: 0.8125rem;
  font-weight: 600;
}

.tv-verdict--valid {
  background: var(--tv-pass-bg);
  color: var(--tv-pass-text);
}

.tv-verdict--invalid {
  background: var(--tv-err-bg);
  color: var(--tv-err-text);
}

.tv-tabs {
  display: flex;
  align-items: stretch;
  gap: 0.25rem;
}

.tv-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.75rem;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  font-family: var(--sl-font);
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--atif-text-muted);
  cursor: pointer;
}

.tv-tab:hover {
  color: var(--sl-color-white);
}

.tv-tab:focus-visible {
  outline: 2px solid var(--sl-color-accent);
  outline-offset: -2px;
}

.tv-tab--active {
  color: var(--sl-color-white);
  border-bottom-color: var(--sl-color-accent);
  font-weight: 600;
}

.tv-tab__count {
  padding: 0.02rem 0.4rem;
  border-radius: 999px;
  background: var(--tv-err-bg);
  color: var(--tv-err-text);
  font-size: 0.75rem;
  font-weight: 600;
}

.tv-output-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.9rem 1rem;
}

.tv-empty {
  padding: 2.5rem 1rem;
  text-align: center;
  color: var(--atif-text-muted);
  font-size: 0.92rem;
}

/* Validation diagnostics */
.tv-diag-list {
  list-style: none;
  margin: 0 !important;
  padding: 0 !important;
  border-top: 1px solid var(--atif-border);
}

.tv-diag-item {
  margin: 0 !important;
  border-bottom: 1px solid var(--atif-border);
}

.tv-diag-btn {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  width: 100%;
  padding: 0.65rem 0.4rem;
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  color: inherit;
  font-family: var(--sl-font);
  transition: background-color 120ms ease;
}

.tv-diag-btn:hover,
.tv-diag-btn--active {
  background: var(--atif-surface-subtle);
}

.tv-diag-btn:focus-visible {
  outline: 2px solid var(--sl-color-accent);
  outline-offset: -2px;
}

.tv-diag-line {
  flex-shrink: 0;
  min-width: 2.4rem;
  text-align: center;
  padding: 0.12rem 0.35rem;
  border-radius: 0.25rem;
  font-family: var(--sl-font-mono);
  font-size: 0.8125rem;
  font-weight: 600;
}

.tv-diag-line--err {
  background: var(--tv-err-bg);
  color: var(--tv-err-text);
}

.tv-diag-line--warn {
  background: var(--tv-warn-bg);
  color: var(--tv-warn-text);
}

.tv-diag-content {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.tv-diag-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}

.tv-diag-type {
  font-size: 0.8125rem;
  font-weight: 600;
  padding: 0.05rem 0.35rem;
  border-radius: 0.25rem;
  background: var(--sl-color-accent-low);
  color: var(--sl-color-accent-high);
  border: none !important;
}

.tv-diag-ptr {
  font-size: 0.8125rem;
  color: var(--sl-color-white);
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
  word-break: break-all;
}

.tv-diag-msg {
  font-size: 0.875rem;
  line-height: 1.45;
  color: var(--sl-color-gray-2);
}

/* Valid summary */
.tv-valid-summary {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.tv-valid-lead {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  color: var(--tv-pass-text);
  font-size: 0.92rem;
  font-weight: 500;
  line-height: 1.45;
}

.tv-valid-lead svg {
  flex-shrink: 0;
  margin-top: 0.15rem;
}

.tv-legacy-hint {
  margin: 0 !important;
  padding: 0.65rem 0.8rem;
  border-radius: 0.375rem;
  background: var(--tv-warn-bg);
  color: var(--tv-warn-text);
  font-size: 0.85rem;
}

.tv-legacy-hint a {
  color: inherit;
  font-weight: 600;
  text-decoration: underline;
}

.tv-count-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.25rem;
  padding: 0.65rem 0;
  border-top: 1px solid var(--atif-border);
  border-bottom: 1px solid var(--atif-border);
}

.tv-count-cell {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
}

.tv-count-cell__k {
  font-size: 0.8125rem;
  color: var(--atif-text-muted);
  font-family: var(--sl-font-mono);
}

.tv-count-cell__v {
  font-size: 0.95rem;
  font-weight: 650;
  color: var(--sl-color-white);
}

.tv-subhead {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--atif-text-muted);
  margin-bottom: 0.45rem;
}

.tv-record-list {
  list-style: none;
  margin: 0 !important;
  padding: 0 !important;
  border-top: 1px solid var(--atif-border);
}

.tv-record-list li {
  margin: 0 !important;
  border-bottom: 1px solid var(--atif-border);
}

.tv-record-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.45rem 0.35rem;
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  font-family: var(--sl-font);
  font-size: 0.8125rem;
  color: var(--sl-color-gray-1);
}

.tv-record-row:hover,
.tv-record-row--active {
  background: var(--atif-surface-subtle);
}

.tv-record-row code {
  font-size: 0.8125rem;
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
  color: var(--sl-color-accent-high);
  font-weight: 600;
}

.tv-record-row__id {
  font-family: var(--sl-font-mono);
  color: var(--sl-color-white);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Explorer: compact flat hairline design */
.tv-traj-explorer,
.tv-events-explorer {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.tv-traj-switcher {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.tv-traj-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
  padding: 0.42rem 0.7rem;
  border-radius: 0.375rem;
  border: 1px solid var(--atif-border-strong);
  background: var(--atif-surface-subtle);
  cursor: pointer;
  text-align: left;
  font-family: var(--sl-font);
}

.tv-traj-btn--active {
  background: var(--sl-color-accent-low);
  border-color: var(--sl-color-accent);
}

.tv-traj-btn__id {
  display: inline-flex;
  align-items: center;
  gap: 0.32rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--sl-color-white);
}

.tv-traj-btn--active .tv-traj-btn__id,
.tv-traj-btn--active .tv-traj-btn__sub {
  color: var(--sl-color-accent-high);
}

.tv-traj-btn__id code {
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
  font-size: inherit;
  color: inherit;
}

.tv-traj-btn__sub {
  font-size: 0.8125rem;
  color: var(--atif-text-muted);
}

/* Balanced metrics summary strip */
.tv-metrics-strip {
  display: grid;
  gap: 0.65rem 1.25rem;
  padding: 0.7rem 0;
  border-top: 1px solid var(--atif-border);
  border-bottom: 1px solid var(--atif-border);
}

.tv-metrics-strip--traj {
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 0.85fr) minmax(0, 0.7fr);
}

.tv-metrics-strip--events {
  grid-template-columns: repeat(auto-fit, minmax(7.25rem, 1fr));
}

.tv-metrics-strip > div {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.tv-metric-k {
  font-size: 0.8125rem;
  color: var(--atif-text-muted);
}

.tv-metric-v {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--sl-color-white);
  overflow-wrap: anywhere;
}

.tv-lineage-note {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 0.65rem;
  border-radius: 0.35rem;
  background: var(--atif-surface-subtle);
  border: 1px solid var(--atif-border);
  font-size: 0.8125rem;
  color: var(--sl-color-gray-2);
}

.tv-meta-disclosure {
  font-size: 0.8125rem;
  color: var(--atif-text-muted);
  border: none;
  padding: 0;
  margin: 0;
}

.tv-meta-disclosure > summary {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0;
  cursor: pointer;
  font-weight: 500;
  color: var(--sl-color-gray-2);
  list-style: none;
}

.tv-meta-disclosure > summary::before,
.tv-meta-disclosure > summary::-webkit-details-marker,
.tv-meta-disclosure > summary::marker {
  display: none !important;
  content: none !important;
}

.tv-meta-disclosure > summary svg {
  transition: transform 140ms ease;
}

.tv-meta-disclosure[open] > summary svg {
  transform: rotate(90deg);
}

.tv-meta-grid {
  margin-top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tv-env-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.tv-env-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-family: var(--sl-font-mono);
  font-size: 0.8125rem;
  color: var(--sl-color-gray-1);
}

/* Flat hairline-divided step timeline */
.tv-timeline {
  display: flex;
  flex-direction: column;
}

.tv-step {
  padding: 0.85rem 0;
  border-bottom: 1px solid var(--atif-border);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tv-step:last-child {
  border-bottom: none;
}

.tv-step__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem 0.75rem;
}

.tv-step__id-group,
.tv-step__meta-right {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
}

.tv-step__num {
  padding: 0.1rem 0.38rem;
  border-radius: 0.25rem;
  border: 1px solid var(--atif-border);
  background: var(--atif-surface-subtle);
  color: var(--sl-color-white);
  font-family: var(--sl-font-mono);
  font-size: 0.8125rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.tv-step__num:hover {
  border-color: var(--sl-color-accent);
}

.tv-source {
  font-size: 0.8125rem;
  font-weight: 650;
  text-transform: lowercase;
}

.tv-source--user {
  color: var(--sl-color-white);
}

.tv-source--agent {
  color: var(--sl-color-accent-high);
}

.tv-source--system,
.tv-source--trajectory,
.tv-source--session {
  color: var(--atif-text-muted);
}

.tv-source--action,
.tv-source--step {
  color: var(--sl-color-accent-high);
}

.tv-muted-meta {
  font-size: 0.8125rem;
  color: var(--atif-text-muted);
}

.tv-muted-code {
  font-size: 0.8125rem;
  color: var(--atif-text-muted);
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
}

.tv-step__body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-left: 0.1rem;
}

.tv-step__text {
  margin: 0 !important;
  font-size: 0.92rem;
  line-height: 1.55;
  color: var(--sl-color-gray-1);
  white-space: pre-wrap;
}

.tv-reasoning {
  padding: 0.4rem 0.65rem;
  border-radius: 0.35rem;
  background: var(--atif-surface-subtle);
  font-size: 0.85rem;
}

.tv-reasoning summary {
  cursor: pointer;
  font-weight: 550;
  color: var(--atif-text-muted);
}

.tv-reasoning__text {
  margin: 0.35rem 0 0 !important;
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--sl-color-gray-2);
  white-space: pre-wrap;
}

.tv-compaction {
  padding: 0.55rem 0.7rem;
  border-radius: 0.35rem;
  background: var(--tv-warn-bg);
  color: var(--tv-warn-text);
  font-size: 0.85rem;
}

.tv-compaction__summary {
  margin: 0.3rem 0 0 !important;
  font-size: 0.84rem;
}

/* Action block (flat tinted surface, zero nested cards) */
.tv-action {
  padding: 0.6rem 0.75rem;
  border-radius: 0.375rem;
  background: var(--atif-surface-subtle);
  border: 1px solid var(--atif-border);
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.tv-action__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}

.tv-action__name {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--sl-color-white);
}

.tv-action__name code {
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
  font-size: 0.85rem;
  color: inherit;
}

.tv-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.08rem 0.42rem;
  border-radius: 0.25rem;
  font-family: var(--sl-font-mono);
  font-size: 0.8125rem;
  font-weight: 550;
  line-height: 1.35;
}

.tv-tag--accent {
  background: var(--sl-color-accent-low);
  color: var(--sl-color-accent-high);
}

.tv-tag--neutral {
  background: var(--atif-surface);
  border: 1px solid var(--atif-border);
  color: var(--sl-color-gray-2);
}

.tv-tag--error {
  background: var(--tv-err-bg);
  color: var(--tv-err-text);
}

.tv-tag--warn {
  background: var(--tv-warn-bg);
  color: var(--tv-warn-text);
}

.tv-action__summary {
  font-family: var(--sl-font-mono);
  font-size: 0.8125rem;
  color: var(--sl-color-gray-1);
  overflow-x: auto;
}

.tv-action__output {
  margin: 0 !important;
  padding: 0.45rem 0.6rem;
  border-radius: 0.3rem;
  background: var(--sl-color-bg);
  border: 1px solid var(--atif-border);
  font-family: var(--sl-font-mono);
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--sl-color-gray-2);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.tv-media-ref {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.8125rem;
}

.tv-step__error {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--tv-err-text);
  font-size: 0.85rem;
}

.tv-citations {
  font-size: 0.8125rem;
}

.tv-citations__title {
  font-weight: 600;
  color: var(--atif-text-muted);
  margin-bottom: 0.2rem;
}

.tv-citations ul {
  margin: 0 !important;
  padding-left: 1.15rem !important;
}

.tv-details {
  font-size: 0.8125rem;
  border: none;
  padding: 0;
  margin: 0;
}

.tv-details > summary {
  cursor: pointer;
  color: var(--atif-text-muted);
  font-weight: 500;
  user-select: none;
}

.tv-details > summary::before {
  display: none;
}

.tv-raw-json {
  margin: 0.4rem 0 0 !important;
  padding: 0.55rem 0.7rem;
  border-radius: 0.3rem;
  background: var(--sl-color-bg);
  border: 1px solid var(--atif-border);
  font-family: var(--sl-font-mono);
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--sl-color-gray-1);
  overflow-x: auto;
  max-height: 18rem;
}

.tv-extensions-section {
  padding-top: 0.85rem;
  border-top: 1px solid var(--atif-border);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tv-ext-row {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.tv-ext-row__head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
}

@media (max-width: 960px) {
  .tv-workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  .tv-toolbar {
    flex-wrap: wrap;
  }

  .tv-preset-group {
    flex-wrap: wrap;
  }

  .tv-pane {
    min-height: 24rem;
    max-height: 36rem;
  }
}

@media (max-width: 520px) {
  .tv-metrics-strip--traj {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
`;
