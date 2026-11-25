import type { APIRoute } from 'astro';
import { discoverSpecVersions, getLatestSpecVersion, type VersionInfo } from '../lib/spec-loader';

function appendVersionSection(lines: string[], v: VersionInfo, heading: string) {
  lines.push(`## ${heading}`, '');
  lines.push(`- [${v.title}](${v.mdHref}): Core normative specification`);
  if (v.dirName === 'v2.0') {
    lines.push(
      `- [Complete ${v.dirName} Single-Fetch Bundle](/spec/${v.dirName}/full.md): Core spec + all companion references in one Markdown file`
    );
  }
  for (const ref of v.references) {
    lines.push(`- [${ref.title}](${ref.mdHref})${ref.description ? `: ${ref.description}` : ''}`);
  }
  if (v.changelogMdHref) {
    lines.push(`- [${v.dirName} Changelog](${v.changelogMdHref}): Changes and highlights`);
  }
  if (v.schemas.length > 0) {
    lines.push('', `### Machine-Readable Schemas (${v.dirName})`, '');
    for (const schema of v.schemas) {
      lines.push(`- [${schema.label}](${schema.href})`);
    }
  }
  if (v.examples.length > 0) {
    lines.push('', `### Reference Examples (${v.dirName})`, '');
    for (const ex of v.examples) {
      lines.push(`- [${ex.fileName}](${ex.href})`);
    }
  }
  lines.push('');
}

export const GET: APIRoute = () => {
  const versions = discoverSpecVersions();
  const latest = getLatestSpecVersion();
  const drafts = versions.filter((v) => v.role === 'draft');
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
  ];

  for (const draft of drafts) {
    appendVersionSection(lines, draft, `Working Draft Specification (${draft.dirName} — Draft)`);
  }

  if (latest) {
    appendVersionSection(lines, latest, `Specification (${latest.dirName} — Latest Final)`);
  }

  lines.push(
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
