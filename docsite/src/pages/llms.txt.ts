import type { APIRoute } from 'astro';
import { discoverSpecVersions, getLatestSpecVersion } from '../lib/spec-loader';

export const GET: APIRoute = () => {
  const versions = discoverSpecVersions();
  const latest = getLatestSpecVersion();
  const legacy = versions.find((v) => v.role === 'legacy');

  const lines: string[] = [
    '# ATIF — Agent Trajectory Interchange Format',
    '',
    '> Open standard for streaming AI agent runtime events (`.atif-e.jsonl`), consolidated trajectories (`.atif.jsonl`), canonical actions, and wire/warehouse projections.',
    '',
    '## Agent Discovery (IETF draft-zzn-dvs-00)',
    '',
    '- [DVS Skill Index](/.well-known/skills/index.json): Machine-readable HTTP skill discovery manifest',
    '- [ATIF Agent Skill](/.well-known/skills/atif/SKILL.md): Compact pointer skill with canonical Markdown and schema references',
    '',
    `## Specification (${latest?.dirName ?? 'v2.0'} — Latest)`,
    '',
  ];

  if (latest) {
    lines.push(`- [${latest.title}](${latest.mdHref}): Core normative specification`);
    lines.push(`- [Complete ${latest.dirName} Single-Fetch Bundle](/spec/${latest.dirName}/full.md): Core spec + all companion references in one Markdown file`);
    for (const ref of latest.references) {
      lines.push(`- [${ref.title}](${ref.mdHref})${ref.description ? `: ${ref.description}` : ''}`);
    }
    if (latest.changelogMdHref) {
      lines.push(`- [${latest.dirName} Changelog](${latest.changelogMdHref}): Breaking changes and release highlights`);
    }
  }

  if (latest && latest.schemas.length > 0) {
    lines.push('', `## Machine-Readable Schemas (${latest.dirName})`, '');
    for (const schema of latest.schemas) {
      lines.push(`- [${schema.label}](${schema.href})`);
    }
  }

  if (latest && latest.examples.length > 0) {
    lines.push('', `## Reference Examples (${latest.dirName})`, '');
    for (const ex of latest.examples) {
      lines.push(`- [${ex.fileName}](${ex.href})`);
    }
  }

  lines.push(
    '',
    '## Guides',
    '',
    '- [Quickstart](/guides/quickstart.md): Emit, read, and validate ATIF v2.0 files',
    '- [Migrating from v1.x](/guides/migrating-from-v1.md): Practical upgrade guide from ATIF v1.x JSON to v2.0 NDJSON',
    '- [SDKs & Tooling](/guides/sdks-and-tooling.md): Python SDK roadmap, Protobuf codegen, and conformance suite',
    '- [Ecosystem](/guides/ecosystem.md): Agent harnesses, OpenTelemetry, and warehouse integrations',
    '- [Governance](/guides/governance.md): Immutable spec versioning, RFC workflow, and open governance',
    '- [Interactive Validator](/validator.md): Browser-based JSON Schema 2020-12 validator and explorer',
    '',
    '## Historical Versions',
    '',
    '- [Master Version Changelog](/spec/changelog.md): Complete ATIF v1.0 through v2.0 history'
  );

  if (legacy) {
    lines.push(`- [${legacy.title} (${legacy.roleLabel})](${legacy.mdHref}): Final ATIF v${legacy.major}.x specification`);
  }

  return new Response(lines.join('\n') + '\n', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
