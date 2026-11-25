import type { APIRoute } from 'astro';
import { discoverSpecVersions, getLatestSpecVersion } from '../../../../lib/spec-loader';

export const GET: APIRoute = () => {
  const versions = discoverSpecVersions();
  const latest = getLatestSpecVersion();
  const legacy = versions.find((v) => v.role === 'legacy');
  const vDir = latest?.dirName ?? 'v2.0';

  const rows: string[] = [
    `| Core v2.0 Specification | [\`/spec/${vDir}/index.md\`](/spec/${vDir}/index.md) | Normative dual-mode NDJSON spec, lineage, actions, compaction, blobs |`,
    `| Single-Fetch v2.0 Bundle | [\`/spec/${vDir}/full.md\`](/spec/${vDir}/full.md) | Core spec + all companion references concatenated |`,
  ];

  if (latest) {
    for (const ref of latest.references) {
      const label = ref.title.replace(/^ATIF\s+v\d+\.\d+\s+/i, '');
      rows.push(`| ${label} | [\`${ref.mdHref}\`](${ref.mdHref}) | ${ref.description || 'Companion reference'} |`);
    }
    for (const schema of latest.schemas) {
      if (schema.fileName === 'buf.yaml') continue;
      rows.push(`| ${schema.label} | [\`${schema.href}\`](${schema.href}) | Machine-readable schema (${schema.lang}) |`);
    }
    for (const ex of latest.examples) {
      rows.push(`| Reference Fixture (\`${ex.fileName}\`) | [\`${ex.href}\`](${ex.href}) | Valid ${vDir} NDJSON example |`);
    }
  }

  if (legacy) {
    rows.push(
      `| Legacy ${legacy.dirName} Specification | [\`${legacy.mdHref}\`](${legacy.mdHref}) | Final ATIF v${legacy.major}.x single-document JSON spec |`
    );
  }
  rows.push(`| v1.x to v2.0 Migration Guide | [\`/guides/migrating-from-v1.md\`](/guides/migrating-from-v1.md) | Practical upgrade path and breaking changes |`);
  rows.push(`| Master Changelog | [\`/spec/changelog.md\`](/spec/changelog.md) | Version timeline from v1.0 through ${vDir} |`);

  const content = [
    '---',
    'name: atif',
    'description: Agent Trajectory Interchange Format (ATIF v2.0) specification index, schemas, and migration references. Use when reading, generating, validating, consolidating, or migrating ATIF v1.x or v2.0 agent trajectories.',
    '---',
    '',
    '# ATIF (Agent Trajectory Interchange Format)',
    '',
    'ATIF v2.0 is a unified NDJSON standard for AI agent interaction traces with two document modes sharing one `AtifRecord` envelope: append-only runtime **events** (`.atif-e.jsonl`, `document_type: "events"`) and consolidated **trajectories** (`.atif.jsonl` / `.atif.tar.zst`, `document_type: "trajectories"`).',
    'Readers dispatch on line 1 `meta.document_type` (never filename alone), fold event streams deterministically into contiguous `1..N` steps via 3-phase consolidation, and validate lines against JSON Schema 2020-12.',
    'Every page on this site exposes a raw `.md` mirror; fetch only the specific same-origin documents below needed for your task.',
    '',
    '## Canonical References (Same-Origin)',
    '',
    '| Resource | Path | Purpose |',
    '| :--- | :--- | :--- |',
    ...rows,
    '',
    '## Quick Validation Checklist',
    '',
    '1. Verify line 1 is `{"type":"meta","meta":{"schema_version":"ATIF-v2.0","document_type":"events"|"trajectories",...}}`.',
    '2. Validate each NDJSON line against `/schema/v2.0/atif-record.schema.json` (resolving `$ref` via `canonical-actions.schema.json` and `common-defs.schema.json`).',
    '3. Keep `events` rows (`event`, `extension`) strictly separated from `trajectories` rows (`session`, `trajectory`, `step`, `extension`).',
    '',
  ].join('\n');

  return new Response(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
};
