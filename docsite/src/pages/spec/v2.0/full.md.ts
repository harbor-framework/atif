import type { APIRoute } from 'astro';
import { getSpecVersion } from '../../../lib/spec-loader';
import { renderSpecMarkdownMirror } from '../../../lib/markdown-renderer';

export const GET: APIRoute = () => {
  const v2 = getSpecVersion('v2.0');
  if (!v2) {
    return new Response('# ATIF v2.0 Specification\n\nSpecification sources not found.\n', {
      status: 404,
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    });
  }

  const sections: string[] = [];

  const tocLines = [
    '# ATIF v2.0 Complete Specification Bundle',
    '',
    `> Single-fetch bundle combining \`spec/v2.0/SPEC.md\` and all companion references (released ${v2.releaseDate || '2026-11-25'}).`,
    '> Machine-readable schemas are served separately:',
    ...v2.schemas
      .filter((s) => !s.fileName.endsWith('.yaml'))
      .map((s) => `> - \`${s.href}\` (${s.label})`),
    ...v2.examples.map((e) => `> - \`${e.href}\` (Reference fixture)`),
    '',
    '## Included Documents',
    '',
    `1. ${v2.title} (\`/spec/v2.0/index.md\`)`,
    ...v2.references.map((ref, i) => `${i + 2}. ${ref.title} (\`${ref.mdHref}\`)`),
  ];

  sections.push(tocLines.join('\n'));

  sections.push(
    renderSpecMarkdownMirror(v2.specFilePath, {
      versionDir: v2.dirName,
      versionInfo: v2,
    }).trim()
  );

  for (const ref of v2.references) {
    sections.push(
      renderSpecMarkdownMirror(ref.filePath, {
        versionDir: v2.dirName,
        isReference: true,
        versionInfo: v2,
      }).trim()
    );
  }

  const bundle = sections.join('\n\n---\n\n') + '\n';

  return new Response(bundle, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
};
