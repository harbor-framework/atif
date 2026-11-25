#!/usr/bin/env node
/**
 * ATIF Specification, Schema, Example, and Conformance Suite Validator.
 *
 * Checks:
 * 1. YAML frontmatter contract on every spec/**\/*.md file:
 *    - Enforces Plan Section 4.1 contract (status strictly in {"draft", "final"},
 *      forbids superseded_by, forbids unknown keys, checks release_date & order).
 * 2. Relative Markdown links inside spec/v2.0/**\/*.md resolve to existing files.
 * 3. JSON Schema Draft 2020-12 meta-validation & compilation of spec/v2.0/schema/*.schema.json.
 * 4. All spec/v2.0/examples/*.jsonl (and spec/v1.8/examples/*.json if present).
 * 5. Every entry in conformance/manifest.json (v1_trajectory, v2_events,
 *    v2_trajectories, and both input + expected of v2_consolidation).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import YAML from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

let totalChecks = 0;
const failures = [];

function recordPass() {
  totalChecks += 1;
}

function recordFail(context, message) {
  totalChecks += 1;
  failures.push(`${context}: ${message}`);
}

function walkFiles(dir, predicate) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, predicate));
    } else if (predicate(full)) {
      results.push(full);
    }
  }
  return results.sort();
}

// ---------------------------------------------------------------------------
// 1. YAML Frontmatter Validation (spec/**/*.md)
// ---------------------------------------------------------------------------

const ALLOWED_FM_KEYS = new Set([
  'title',
  'description',
  'atif_version',
  'schema_version',
  'status',
  'release_date',
  'doc_type',
  'order',
  'source_ref',
  'supersedes',
]);

function extractFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;
  return YAML.parse(match[1]);
}

function validateSpecFrontmatter() {
  const specDir = path.join(REPO_ROOT, 'spec');
  const mdFiles = walkFiles(specDir, (f) => f.endsWith('.md'));
  if (mdFiles.length === 0) {
    recordFail('spec/', 'No Markdown files found under spec/');
    return;
  }

  for (const file of mdFiles) {
    const rel = path.relative(REPO_ROOT, file);
    const content = fs.readFileSync(file, 'utf8');
    let fm;
    try {
      fm = extractFrontmatter(content);
    } catch (err) {
      recordFail(rel, `Invalid YAML frontmatter: ${err.message}`);
      continue;
    }
    if (!fm || typeof fm !== 'object' || Array.isArray(fm)) {
      recordFail(rel, 'Missing YAML frontmatter block');
      continue;
    }

    const errs = [];
    if ('superseded_by' in fm) {
      errs.push('Forbidden field "superseded_by" found (spec immutability violation)');
    }
    for (const key of Object.keys(fm)) {
      if (!ALLOWED_FM_KEYS.has(key)) {
        errs.push(`Unexpected frontmatter field "${key}"`);
      }
    }

    if (typeof fm.title !== 'string' || fm.title.trim().length === 0) {
      errs.push('Missing or invalid "title"');
    }
    if (typeof fm.description !== 'string' || fm.description.trim().length === 0) {
      errs.push('Missing or invalid "description"');
    }
    const atifVersion = fm.atif_version != null ? String(fm.atif_version) : '';
    if (!atifVersion) {
      errs.push('Missing "atif_version"');
    } else if (rel === path.join('spec', 'CHANGELOG.md')) {
      if (atifVersion !== 'all') {
        errs.push(`spec/CHANGELOG.md must set atif_version: "all" (got "${atifVersion}")`);
      }
      if ('schema_version' in fm && fm.schema_version !== undefined) {
        errs.push('spec/CHANGELOG.md should omit "schema_version"');
      }
      if ('supersedes' in fm && fm.supersedes !== undefined) {
        errs.push('spec/CHANGELOG.md should omit "supersedes"');
      }
    } else {
      const dirMatch = rel.match(/^spec\/v(\d+\.\d+)\//);
      if (!dirMatch) {
        errs.push(`Unexpected spec path outside spec/vX.Y/: ${rel}`);
      } else if (atifVersion !== dirMatch[1]) {
        errs.push(`atif_version "${atifVersion}" does not match directory v${dirMatch[1]}`);
      }
      if (typeof fm.schema_version !== 'string' || fm.schema_version !== `ATIF-v${atifVersion}`) {
        errs.push(`schema_version must be "ATIF-v${atifVersion}" (got ${JSON.stringify(fm.schema_version)})`);
      }
      if (atifVersion === '1.0' && 'supersedes' in fm && fm.supersedes !== undefined) {
        errs.push('v1.0 must omit "supersedes"');
      }
    }

    if (fm.status !== 'draft' && fm.status !== 'final') {
      errs.push(`status must be strictly "draft" or "final" (got ${JSON.stringify(fm.status)})`);
    }

    const rawDate =
      fm.release_date instanceof Date
        ? fm.release_date.toISOString().slice(0, 10)
        : String(fm.release_date ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      errs.push(`release_date must be ISO 8601 YYYY-MM-DD (got ${JSON.stringify(fm.release_date)})`);
    }

    if (!['spec', 'changelog', 'reference'].includes(fm.doc_type)) {
      errs.push(`doc_type must be "spec", "changelog", or "reference" (got ${JSON.stringify(fm.doc_type)})`);
    }

    if (typeof fm.order !== 'number' || !Number.isFinite(fm.order)) {
      errs.push(`order must be a finite number (got ${JSON.stringify(fm.order)})`);
    }

    if ('supersedes' in fm && fm.supersedes !== undefined) {
      if (!/^\d+\.\d+$/.test(String(fm.supersedes))) {
        errs.push(`supersedes must be major.minor string (got ${JSON.stringify(fm.supersedes)})`);
      }
    }

    if (errs.length > 0) {
      recordFail(rel, errs.join('; '));
    } else {
      recordPass();
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Relative Markdown Link Check in spec/v2.0/**/*.md and spec/CHANGELOG.md
// ---------------------------------------------------------------------------

function slugifyHeading(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*|__|\*|~/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-');
}

function collectHeadingSlugs(filePath, cache) {
  if (cache.has(filePath)) return cache.get(filePath);
  const slugs = new Set();
  const counts = new Map();
  const raw = fs.readFileSync(filePath, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    const base = slugifyHeading(m[1]);
    if (!base) continue;
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    slugs.add(seen === 0 ? base : `${base}-${seen}`);
  }
  cache.set(filePath, slugs);
  return slugs;
}

function validateV2RelativeLinks() {
  const targets = [
    path.join(REPO_ROOT, 'spec', 'CHANGELOG.md'),
    ...walkFiles(path.join(REPO_ROOT, 'spec', 'v2.0'), (f) => f.endsWith('.md')),
  ];
  const linkRe = /(?<!!)\[[^\]]+\]\(([^)]+)\)/g;
  const headingCache = new Map();

  for (const file of targets) {
    if (!fs.existsSync(file)) continue;
    const rel = path.relative(REPO_ROOT, file);
    // Strip fenced code blocks before scanning markdown links.
    const raw = fs.readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
    const errs = [];
    for (const m of raw.matchAll(linkRe)) {
      const href = m[1].trim();
      if (
        href.startsWith('http://') ||
        href.startsWith('https://') ||
        href.startsWith('mailto:')
      ) {
        continue;
      }
      if (href.startsWith('file://')) {
        errs.push(`Forbidden local file:// link: ${href}`);
        continue;
      }
      const [targetPath, fragment] = href.split('#');
      const resolved = targetPath ? path.resolve(path.dirname(file), targetPath) : file;
      if (!fs.existsSync(resolved)) {
        errs.push(`Broken relative link "${href}" (resolved: ${path.relative(REPO_ROOT, resolved)})`);
        continue;
      }
      if (fragment && resolved.endsWith('.md')) {
        const slugs = collectHeadingSlugs(resolved, headingCache);
        if (!slugs.has(fragment)) {
          errs.push(
            `Broken anchor "#${fragment}" in link "${href}" (target: ${path.relative(REPO_ROOT, resolved)})`
          );
        }
      }
    }
    if (errs.length > 0) {
      recordFail(rel, errs.join('; '));
    } else {
      recordPass();
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Load & Meta-Validate JSON Schema Draft 2020-12
// ---------------------------------------------------------------------------

function loadV2Validator() {
  const schemaDir = path.join(REPO_ROOT, 'spec', 'v2.0', 'schema');
  const schemaFiles = [
    'common-defs.schema.json',
    'canonical-actions.schema.json',
    'atif-record.schema.json',
  ];

  const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: true });
  addFormats(ajv);

  const loaded = {};
  for (const name of schemaFiles) {
    const full = path.join(schemaDir, name);
    const rel = path.relative(REPO_ROOT, full);
    let schema;
    try {
      schema = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (err) {
      recordFail(rel, `Invalid JSON: ${err.message}`);
      return null;
    }
    if (!ajv.validateSchema(schema)) {
      recordFail(rel, `Meta-schema errors: ${ajv.errorsText(ajv.errors)}`);
      return null;
    }
    ajv.addSchema(schema);
    loaded[name] = schema;
    recordPass();
  }

  let validateRecord;
  let validateCanonical;
  try {
    validateRecord = ajv.getSchema(loaded['atif-record.schema.json'].$id);
    validateCanonical = ajv.getSchema(loaded['canonical-actions.schema.json'].$id);
    if (!validateRecord || !validateCanonical) {
      throw new Error('Failed to retrieve compiled schemas by $id');
    }
    recordPass();
  } catch (err) {
    recordFail('spec/v2.0/schema/', `Schema compilation failed: ${err.message}`);
    return null;
  }

  return { ajv, validateRecord, validateCanonical };
}

// ---------------------------------------------------------------------------
// 4. ATIF v2.0 Document Validator (Per-Line Schema + Cross-Line Invariants)
// ---------------------------------------------------------------------------

function checkTokenInclusivity(metrics, label, errors) {
  if (!metrics || typeof metrics !== 'object') return;
  const cacheSum = (metrics.cache_read_tokens ?? 0) + (metrics.cache_write_tokens ?? 0);
  if (typeof metrics.input_tokens === 'number' && metrics.input_tokens < cacheSum) {
    errors.push(
      `${label}: input_tokens (${metrics.input_tokens}) < cache_read_tokens + cache_write_tokens (${cacheSum})`
    );
  }
  if (
    typeof metrics.output_tokens === 'number' &&
    typeof metrics.reasoning_tokens === 'number' &&
    metrics.output_tokens < metrics.reasoning_tokens
  ) {
    errors.push(
      `${label}: output_tokens (${metrics.output_tokens}) < reasoning_tokens (${metrics.reasoning_tokens})`
    );
  }
}

function validateV2Document(text, validateRecord, ajv, expectedMode = null) {
  const errors = [];
  const rawLines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (rawLines.length === 0) {
    return ['Empty NDJSON document'];
  }

  const records = [];
  for (let i = 0; i < rawLines.length; i += 1) {
    const lineNo = i + 1;
    let obj;
    try {
      obj = JSON.parse(rawLines[i]);
    } catch (err) {
      errors.push(`line ${lineNo}: invalid JSON (${err.message})`);
      continue;
    }
    const ok = validateRecord(obj);
    if (!ok) {
      errors.push(`line ${lineNo}: schema violation: ${ajv.errorsText(validateRecord.errors)}`);
      continue;
    }
    records.push({ lineNo, obj });
  }

  if (errors.length > 0) return errors;

  // Line 1 MUST be meta.
  const first = records[0].obj;
  if (first.type !== 'meta') {
    errors.push(`line 1: expected type "meta", got "${first.type}"`);
    return errors;
  }

  const docType = first.meta.document_type;
  if (expectedMode && docType !== expectedMode) {
    errors.push(`line 1: expected document_type "${expectedMode}", got "${docType}"`);
  }

  const allowedBody =
    docType === 'events'
      ? new Set(['event', 'extension'])
      : new Set(['session', 'trajectory', 'step', 'extension']);

  // State tracking for cross-line normative invariants.
  const seenSessions = new Set();
  const trajectoriesSeenForSession = new Set();
  const seenTrajectories = new Map(); // trajectory_id -> { lineNo, trajectory, stepIds: [], actionIds: Set }
  const seenEventsByTraj = new Map(); // trajectory_id -> Set<event_id>

  for (let i = 1; i < records.length; i += 1) {
    const { lineNo, obj } = records[i];
    if (obj.type === 'meta') {
      errors.push(`line ${lineNo}: duplicate "meta" record not allowed`);
      continue;
    }
    if (!allowedBody.has(obj.type)) {
      errors.push(`line ${lineNo}: record type "${obj.type}" is not allowed in "${docType}" documents`);
      continue;
    }

    if (docType === 'events' && obj.type === 'event') {
      const ev = obj.event;
      const tid = obj.trajectory_id ?? `__session__:${obj.session_id}`;
      if (!seenEventsByTraj.has(tid)) seenEventsByTraj.set(tid, new Set());
      const seenEvs = seenEventsByTraj.get(tid);

      if (ev.branch && ev.branch.after_event_id !== undefined) {
        if (!seenEvs.has(ev.branch.after_event_id)) {
          errors.push(
            `line ${lineNo}: event.branch.after_event_id "${ev.branch.after_event_id}" does not reference an earlier event in "${tid}"`
          );
        }
      }
      seenEvs.add(ev.event_id);

      if (ev.step?.metrics) {
        checkTokenInclusivity(ev.step.metrics, `line ${lineNo} event.step.metrics`, errors);
      }
      if (ev.action?.metrics) {
        checkTokenInclusivity(ev.action.metrics, `line ${lineNo} event.action.metrics`, errors);
      }
    }

    if (docType === 'trajectories') {
      if (obj.type === 'session') {
        if (trajectoriesSeenForSession.has(obj.session_id)) {
          errors.push(
            `line ${lineNo}: "session" row for "${obj.session_id}" must precede all "trajectory" rows for that session`
          );
        }
        seenSessions.add(obj.session_id);
      } else if (obj.type === 'trajectory') {
        if (obj.session_id) trajectoriesSeenForSession.add(obj.session_id);
        if (seenTrajectories.has(obj.trajectory_id)) {
          errors.push(`line ${lineNo}: duplicate trajectory_id "${obj.trajectory_id}"`);
          continue;
        }
        const t = obj.trajectory;
        if (t.parent_steps_excluded === true) {
          if (!t.parent_trajectory_id || !seenTrajectories.has(t.parent_trajectory_id)) {
            errors.push(
              `line ${lineNo}: parent_steps_excluded=true requires parent_trajectory_id "${t.parent_trajectory_id ?? ''}" earlier in the same file`
            );
          }
        }
        if (t.step_count === 0 && t.first_step_id !== undefined) {
          errors.push(`line ${lineNo}: first_step_id must be omitted when step_count == 0`);
        }
        if (Array.isArray(t.environments) && t.environments.length > 1) {
          for (let ei = 0; ei < t.environments.length; ei += 1) {
            if (!t.environments[ei].name) {
              errors.push(`line ${lineNo}: environments[${ei}].name is required when >1 environment is declared`);
            }
          }
        }
        seenTrajectories.set(obj.trajectory_id, {
          lineNo,
          trajectory: t,
          stepIds: [],
          actionIds: new Set(),
        });
      } else if (obj.type === 'step') {
        const entry = seenTrajectories.get(obj.trajectory_id);
        if (!entry) {
          errors.push(
            `line ${lineNo}: "step" row for "${obj.trajectory_id}" appeared before its "trajectory" row`
          );
          continue;
        }
        const sid = obj.step.step_id;
        if (entry.stepIds.length > 0) {
          const prev = entry.stepIds[entry.stepIds.length - 1];
          if (sid !== prev + 1) {
            errors.push(
              `line ${lineNo}: non-contiguous step_id ${sid} after ${prev} in trajectory "${obj.trajectory_id}"`
            );
          }
        } else if (entry.trajectory.first_step_id !== undefined && sid !== entry.trajectory.first_step_id) {
          errors.push(
            `line ${lineNo}: first step_id ${sid} does not match trajectory.first_step_id ${entry.trajectory.first_step_id}`
          );
        } else if (entry.trajectory.parent_steps_excluded !== true && entry.trajectory.first_step_id === undefined && sid !== 1) {
          errors.push(
            `line ${lineNo}: first step_id must be 1 for non-delta trajectory "${obj.trajectory_id}" (got ${sid})`
          );
        }
        entry.stepIds.push(sid);

        if (obj.step.metrics) {
          checkTokenInclusivity(obj.step.metrics, `line ${lineNo} step.metrics`, errors);
        }
        if (Array.isArray(obj.step.actions)) {
          for (const action of obj.step.actions) {
            if (entry.actionIds.has(action.action_id)) {
              errors.push(
                `line ${lineNo}: duplicate action_id "${action.action_id}" within trajectory "${obj.trajectory_id}"`
              );
            }
            entry.actionIds.add(action.action_id);
            if (action.metrics) {
              checkTokenInclusivity(action.metrics, `line ${lineNo} action(${action.action_id}).metrics`, errors);
            }
          }
        }
      }
    }
  }

  if (docType === 'trajectories') {
    for (const [tid, entry] of seenTrajectories.entries()) {
      if (
        entry.trajectory.step_count !== undefined &&
        entry.trajectory.step_count !== entry.stepIds.length
      ) {
        errors.push(
          `trajectory "${tid}": declared step_count (${entry.trajectory.step_count}) != serialized step rows (${entry.stepIds.length})`
        );
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 5. ATIF v1.x Document Validator (for conformance/v1/* & spec/v1.8/examples/*)
// ---------------------------------------------------------------------------

function collectEmbeddedV1TrajectoryIds(traj, out = new Set()) {
  if (!traj || typeof traj !== 'object') return out;
  if (typeof traj.trajectory_id === 'string' && traj.trajectory_id.length > 0) {
    out.add(traj.trajectory_id);
  }
  if (Array.isArray(traj.subagent_trajectories)) {
    for (const sub of traj.subagent_trajectories) {
      collectEmbeddedV1TrajectoryIds(sub, out);
    }
  }
  return out;
}

function validateV1Document(doc, pathPrefix = 'root', knownSubagentIds = null) {
  const errors = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return [`${pathPrefix}: expected JSON object`];
  }

  const sv = doc.schema_version;
  const svMatch = typeof sv === 'string' ? sv.match(/^ATIF-v1\.([0-8])$/) : null;
  if (!svMatch) {
    errors.push(`${pathPrefix}.schema_version: expected ATIF-v1.0..ATIF-v1.8, got ${JSON.stringify(sv)}`);
  }
  const minor = svMatch ? Number(svMatch[1]) : 8;

  // session_id required in v1.0-v1.6, optional in v1.7+
  if (minor <= 6) {
    if (typeof doc.session_id !== 'string' || doc.session_id.length === 0) {
      errors.push(`${pathPrefix}.session_id: required non-empty string in ${sv}`);
    }
  } else if (doc.session_id !== undefined && doc.session_id !== null && typeof doc.session_id !== 'string') {
    errors.push(`${pathPrefix}.session_id: must be a string if present`);
  }

  // agent required with name & version
  if (!doc.agent || typeof doc.agent !== 'object' || Array.isArray(doc.agent)) {
    errors.push(`${pathPrefix}.agent: required object`);
  } else {
    if (typeof doc.agent.name !== 'string' || doc.agent.name.length === 0) {
      errors.push(`${pathPrefix}.agent.name: required non-empty string`);
    }
    if (typeof doc.agent.version !== 'string' || doc.agent.version.length === 0) {
      errors.push(`${pathPrefix}.agent.version: required non-empty string`);
    }
  }

  const embeddedIds = knownSubagentIds ?? collectEmbeddedV1TrajectoryIds(doc);

  if (!Array.isArray(doc.steps) || doc.steps.length === 0) {
    errors.push(`${pathPrefix}.steps: required non-empty array`);
  } else {
    for (let i = 0; i < doc.steps.length; i += 1) {
      const step = doc.steps[i];
      const sp = `${pathPrefix}.steps[${i}]`;
      if (!step || typeof step !== 'object') {
        errors.push(`${sp}: expected object`);
        continue;
      }
      if (step.step_id !== i + 1) {
        errors.push(`${sp}.step_id: expected sequential ${i + 1}, got ${JSON.stringify(step.step_id)}`);
      }
      if (!['system', 'user', 'agent'].includes(step.source)) {
        errors.push(`${sp}.source: expected "system"|"user"|"agent", got ${JSON.stringify(step.source)}`);
      }
      if (step.message !== undefined && step.message !== null) {
        if (typeof step.message !== 'string' && !Array.isArray(step.message)) {
          errors.push(`${sp}.message: expected string or ContentPart[]`);
        } else if (Array.isArray(step.message)) {
          for (let pi = 0; pi < step.message.length; pi += 1) {
            const part = step.message[pi];
            if (!part || typeof part !== 'object') {
              errors.push(`${sp}.message[${pi}]: expected object`);
              continue;
            }
            const validTypes = minor >= 8 ? ['text', 'image', 'audio'] : ['text', 'image'];
            if (!validTypes.includes(part.type)) {
              errors.push(`${sp}.message[${pi}].type: invalid type ${JSON.stringify(part.type)} for ${sv}`);
            }
            if (part.type === 'audio' && (!part.source || !part.source.media_type || !part.source.path)) {
              errors.push(`${sp}.message[${pi}].source: audio part requires media_type and path`);
            }
            if (part.type === 'image' && (!part.source || !part.source.media_type || !part.source.path)) {
              errors.push(`${sp}.message[${pi}].source: image part requires media_type and path`);
            }
          }
        }
      }

      if (step.observation && Array.isArray(step.observation.results)) {
        for (let ri = 0; ri < step.observation.results.length; ri += 1) {
          const res = step.observation.results[ri];
          if (res && Array.isArray(res.subagent_trajectory_ref)) {
            for (let sri = 0; sri < res.subagent_trajectory_ref.length; sri += 1) {
              const ref = res.subagent_trajectory_ref[sri];
              if (minor >= 7 && ref && ref.trajectory_id && !ref.trajectory_path) {
                if (!embeddedIds.has(ref.trajectory_id)) {
                  errors.push(
                    `${sp}.observation.results[${ri}].subagent_trajectory_ref[${sri}]: trajectory_id "${ref.trajectory_id}" not found in subagent_trajectories`
                  );
                }
              }
            }
          }
        }
      }
    }
  }

  if (Array.isArray(doc.subagent_trajectories)) {
    for (let i = 0; i < doc.subagent_trajectories.length; i += 1) {
      errors.push(
        ...validateV1Document(doc.subagent_trajectories[i], `${pathPrefix}.subagent_trajectories[${i}]`, embeddedIds)
      );
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 6. Validate Examples & Conformance Manifest
// ---------------------------------------------------------------------------

function validateExamples(v2) {
  const v2Examples = [
    { file: 'spec/v2.0/examples/session.atif-e.jsonl', mode: 'events' },
    { file: 'spec/v2.0/examples/session.atif.jsonl', mode: 'trajectories' },
  ];

  for (const ex of v2Examples) {
    const full = path.join(REPO_ROOT, ex.file);
    if (!fs.existsSync(full)) {
      recordFail(ex.file, 'Missing example fixture');
      continue;
    }
    const errs = validateV2Document(fs.readFileSync(full, 'utf8'), v2.validateRecord, v2.ajv, ex.mode);
    if (errs.length > 0) {
      recordFail(ex.file, errs.join(' | '));
    } else {
      recordPass();
    }
  }

  // spec/v1.8/examples/*.json are RFC 0001 Section V native harness prior-art snapshots; verify valid JSON.
  const v1ExamplesDir = path.join(REPO_ROOT, 'spec', 'v1.8', 'examples');
  if (fs.existsSync(v1ExamplesDir)) {
    for (const file of walkFiles(v1ExamplesDir, (f) => f.endsWith('.json'))) {
      const rel = path.relative(REPO_ROOT, file);
      try {
        JSON.parse(fs.readFileSync(file, 'utf8'));
        recordPass();
      } catch (err) {
        recordFail(rel, `Invalid JSON: ${err.message}`);
      }
    }
  }
}

function validateConformance(v2) {
  const manifestPath = path.join(REPO_ROOT, 'conformance', 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    recordFail('conformance/manifest.json', 'Missing conformance manifest');
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    recordFail('conformance/manifest.json', `Invalid JSON: ${err.message}`);
    return;
  }

  if (!Array.isArray(manifest.cases) || manifest.cases.length === 0) {
    recordFail('conformance/manifest.json', 'manifest.cases must be a non-empty array');
    return;
  }

  const seenIds = new Set();
  for (const tc of manifest.cases) {
    const label = `conformance[${tc.id}]`;
    if (!tc.id || seenIds.has(tc.id)) {
      recordFail(label, 'Missing or duplicate test case id');
      continue;
    }
    seenIds.add(tc.id);

    const fullPath = path.join(REPO_ROOT, 'conformance', tc.path);
    if (!fs.existsSync(fullPath)) {
      recordFail(label, `Fixture file not found: conformance/${tc.path}`);
      continue;
    }

    if (tc.kind === 'v1_trajectory') {
      let errs = [];
      try {
        const doc = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        errs = validateV1Document(doc);
      } catch (err) {
        errs = [`Invalid JSON: ${err.message}`];
      }
      const isValid = errs.length === 0;
      if (isValid !== tc.expect_valid) {
        recordFail(
          label,
          tc.expect_valid
            ? `Expected valid v1 fixture but failed: ${errs.join(' | ')}`
            : 'Expected invalid v1 fixture to fail, but it passed!'
        );
      } else {
        recordPass();
      }
    } else if (tc.kind === 'v2_events' || tc.kind === 'v2_trajectories') {
      const mode = tc.kind === 'v2_events' ? 'events' : 'trajectories';
      const errs = validateV2Document(fs.readFileSync(fullPath, 'utf8'), v2.validateRecord, v2.ajv, mode);
      const isValid = errs.length === 0;
      if (isValid !== tc.expect_valid) {
        recordFail(
          label,
          tc.expect_valid
            ? `Expected valid ${mode} fixture but failed: ${errs.join(' | ')}`
            : `Expected invalid ${mode} fixture to fail, but it passed!`
        );
      } else {
        recordPass();
      }
    } else if (tc.kind === 'v2_consolidation') {
      const inputErrs = validateV2Document(fs.readFileSync(fullPath, 'utf8'), v2.validateRecord, v2.ajv, 'events');
      if (inputErrs.length > 0) {
        recordFail(label, `Invalid consolidation input (${tc.path}): ${inputErrs.join(' | ')}`);
        continue;
      }
      if (!tc.expected_path) {
        recordFail(label, 'v2_consolidation case missing expected_path');
        continue;
      }
      const expectedFull = path.join(REPO_ROOT, 'conformance', tc.expected_path);
      if (!fs.existsSync(expectedFull)) {
        recordFail(label, `Missing consolidation expected_path: conformance/${tc.expected_path}`);
        continue;
      }
      const expErrs = validateV2Document(
        fs.readFileSync(expectedFull, 'utf8'),
        v2.validateRecord,
        v2.ajv,
        'trajectories'
      );
      if (expErrs.length > 0) {
        recordFail(label, `Invalid consolidation expected (${tc.expected_path}): ${expErrs.join(' | ')}`);
      } else {
        recordPass();
      }
    } else {
      recordFail(label, `Unknown conformance kind "${tc.kind}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

validateSpecFrontmatter();
validateV2RelativeLinks();
const v2 = loadV2Validator();
if (v2) {
  validateExamples(v2);
  validateConformance(v2);
}

if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} of ${totalChecks} checks failed:\n`);
  for (const msg of failures) {
    console.error(`  - ${msg}`);
  }
  process.exit(1);
}

console.log(`PASS: All ${totalChecks} spec, frontmatter, schema, example, and conformance checks succeeded.`);
