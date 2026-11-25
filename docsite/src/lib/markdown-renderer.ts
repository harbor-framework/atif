import fs from 'node:fs';
import path from 'node:path';
import {
  discoverSpecVersions,
  getDocsiteRoot,
  getSpecRoot,
  parseMarkdownWithFrontmatter,
  type VersionInfo,
} from './spec-loader';

export interface MirrorDocument {
  /** Route path without leading slash or `.md` suffix, e.g. `spec/v2.0/index` or `guides/quickstart` */
  routeKey: string;
  /** Resulting Markdown content */
  content: string;
}

/**
 * Rewrites relative links inside a `spec/` Markdown document so that an agent
 * traversing `.md` mirrors stays cleanly on same-origin `.md`, `/schema/`, and
 * `/examples/` URLs.
 */
export function rewriteSpecMarkdownLinks(
  markdown: string,
  context: {
    versionDir?: string;
    isReference?: boolean;
    isMasterChangelog?: boolean;
    targetMode: 'markdown' | 'html';
  }
): string {
  const { versionDir, isReference, isMasterChangelog, targetMode } = context;

  // Replace standard Markdown links [text](url) while avoiding fenced code blocks
  const lines = markdown.split('\n');
  let inFence = false;
  let fenceChar = '';

  const rewrittenLines = lines.map((line) => {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!inFence) {
        inFence = true;
        fenceChar = marker;
      } else if (marker === fenceChar) {
        inFence = false;
        fenceChar = '';
      }
      return line;
    }
    if (inFence) return line;

    return line.replace(/(!?\[[^\]]*\]\()([^)\s]+)([^)]*\))/g, (full, prefix, rawHref, suffix) => {
      // Leave external, mailto, anchor-only, and already-absolute site links untouched
      if (
        rawHref.startsWith('http://') ||
        rawHref.startsWith('https://') ||
        rawHref.startsWith('mailto:') ||
        rawHref.startsWith('#') ||
        rawHref.startsWith('/')
      ) {
        return full;
      }

      const [hrefPath, hashPart] = rawHref.split('#');
      const hash = hashPart ? `#${hashPart}` : '';

      const resolved = resolveRelativeSpecLink(hrefPath, {
        versionDir,
        isReference,
        isMasterChangelog,
        targetMode,
      });

      if (!resolved) return full;
      return `${prefix}${resolved}${hash}${suffix}`;
    });
  });

  return rewrittenLines.join('\n');
}

export function resolveRelativeSpecLink(
  hrefPath: string,
  context: {
    versionDir?: string;
    isReference?: boolean;
    isMasterChangelog?: boolean;
    targetMode: 'markdown' | 'html';
  }
): string | null {
  const { versionDir, isReference, isMasterChangelog, targetMode } = context;
  const specRoot = getSpecRoot();

  let baseDir: string;
  if (isMasterChangelog || !versionDir) {
    baseDir = specRoot;
  } else if (isReference) {
    baseDir = path.join(specRoot, versionDir, 'references');
  } else {
    baseDir = path.join(specRoot, versionDir);
  }

  const resolvedAbs = path.resolve(baseDir, hrefPath);
  const relFromSpec = path.relative(specRoot, resolvedAbs).replace(/\\/g, '/');

  // If link escapes `spec/`, leave it unchanged
  if (relFromSpec.startsWith('..')) {
    return null;
  }

  // Master changelog
  if (relFromSpec === 'CHANGELOG.md') {
    return targetMode === 'markdown' ? '/spec/changelog.md' : '/spec/changelog/';
  }

  // Versioned spec files: vX.Y/...
  const versionMatch = relFromSpec.match(/^(v\d+\.\d+)\/(.+)$/);
  if (!versionMatch) {
    return null;
  }
  const [, vDir, subPath] = versionMatch;

  if (subPath === 'SPEC.md') {
    return targetMode === 'markdown' ? `/spec/${vDir}/index.md` : `/spec/${vDir}/`;
  }
  if (subPath === 'CHANGELOG.md') {
    return targetMode === 'markdown' ? `/spec/${vDir}/changelog.md` : `/spec/${vDir}/changelog/`;
  }

  const refMatch = subPath.match(/^references\/([^/]+)\.md$/);
  if (refMatch) {
    return targetMode === 'markdown'
      ? `/spec/${vDir}/references/${refMatch[1]}.md`
      : `/spec/${vDir}/references/${refMatch[1]}/`;
  }

  const schemaMatch = subPath.match(/^schema\/(.+)$/);
  if (schemaMatch) {
    return `/schema/${vDir}/${schemaMatch[1]}`;
  }

  const exampleMatch = subPath.match(/^examples\/(.+)$/);
  if (exampleMatch) {
    return `/examples/${vDir}/${exampleMatch[1]}`;
  }

  return null;
}

/**
 * Strips MDX/JSX imports, exports, Starlight wrapper components, and script/style
 * tags to emit crisp, agent-friendly CommonMark.
 */
export function stripMdxToCommonMark(raw: string): string {
  const { frontmatter, body } = parseMarkdownWithFrontmatter(raw);
  const title = typeof frontmatter.title === 'string' ? frontmatter.title.trim() : '';
  const description =
    typeof frontmatter.description === 'string' ? frontmatter.description.trim() : '';

  // Extract hero tagline/actions if present on splash pages (e.g., index.mdx)
  const hero = frontmatter.hero as
    | {
        title?: string;
        tagline?: string;
        actions?: Array<{ text?: string; link?: string }>;
      }
    | undefined;

  // Protect fenced code blocks while transforming MDX constructs outside them
  const codeBlocks: string[] = [];
  let text = body.replace(/(^|\n)(```[\s\S]*?```|~~~[\s\S]*?~~~)/g, (_m, lead, block) => {
    const idx = codeBlocks.length;
    codeBlocks.push(block);
    return `${lead}@@CODE_BLOCK_${idx}@@`;
  });

  // Remove <script>...</script> and <style>...</style> blocks
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');

  // Remove MDX comments {/* ... */}
  text = text.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

  // Remove top-level ESM import and export statements (single or multi-line)
  text = text.replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '');
  text = text.replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '');
  text = text.replace(/^\s*export\s+(?:const|let|var|default|function)\s+.*$/gm, '');

  // Convert <LinkCard title="..." description="..." href="..." /> to Markdown bullet
  text = text.replace(
    /<LinkCard\b([^>]*?)\/>/g,
    (_m, attrs: string) => {
      const cardTitle = extractAttr(attrs, 'title') ?? 'Link';
      const cardHref = extractAttr(attrs, 'href') ?? '#';
      const cardDesc = extractAttr(attrs, 'description');
      return cardDesc ? `- [${cardTitle}](${cardHref}) — ${cardDesc}` : `- [${cardTitle}](${cardHref})`;
    }
  );

  // Convert <Card title="...">...</Card> to heading + content
  text = text.replace(
    /<Card\b([^>]*)>([\s\S]*?)<\/Card>/g,
    (_m, attrs: string, inner: string) => {
      const cardTitle = extractAttr(attrs, 'title');
      const cleaned = inner.trim();
      return cardTitle ? `\n### ${cardTitle}\n\n${cleaned}\n` : `\n${cleaned}\n`;
    }
  );

  // Convert <Aside type="..." title="...">...</Aside> to blockquote
  text = text.replace(
    /<Aside\b([^>]*)>([\s\S]*?)<\/Aside>/g,
    (_m, attrs: string, inner: string) => {
      const type = (extractAttr(attrs, 'type') ?? 'note').toUpperCase();
      const asideTitle = extractAttr(attrs, 'title');
      const header = asideTitle ? `**${asideTitle}**` : `**${type}**`;
      const lines = inner
        .trim()
        .split('\n')
        .map((l) => `> ${l}`);
      return `\n> ${header}\n>\n${lines.join('\n')}\n`;
    }
  );

  // Convert <TabItem label="...">...</TabItem> to subheading + content
  text = text.replace(
    /<TabItem\b([^>]*)>([\s\S]*?)<\/TabItem>/g,
    (_m, attrs: string, inner: string) => {
      const label = extractAttr(attrs, 'label');
      const cleaned = inner.trim();
      return label ? `\n#### ${label}\n\n${cleaned}\n` : `\n${cleaned}\n`;
    }
  );

  // Convert <Badge text="..." /> inline
  text = text.replace(/<Badge\b([^>]*?)\/>/g, (_m, attrs: string) => {
    const badgeText = extractAttr(attrs, 'text');
    return badgeText ? `\`${badgeText}\`` : '';
  });

  // Replace interactive React/Astro islands with descriptive Markdown pointers
  text = text.replace(/<TrajectoryValidator\b[^>]*\/?>(?:<\/TrajectoryValidator>)?/g, () => {
    return [
      '> **Interactive Browser Tool**: This page hosts a client-side ATIF JSON Schema 2020-12 validator and visual trajectory explorer.',
      '> For programmatic or CLI validation, use the published schemas directly:',
      '> - `/schema/v2.0/atif-record.schema.json`',
      '> - `/schema/v2.0/canonical-actions.schema.json`',
      '> - `/schema/v2.0/common-defs.schema.json`',
      '> - Sample events: `/examples/v2.0/session.atif-e.jsonl`',
      '> - Sample trajectories: `/examples/v2.0/session.atif.jsonl`',
    ].join('\n');
  });

  // Unwrap structural Starlight container tags while keeping inner text
  const unwrapTags = ['CardGrid', 'Tabs', 'Steps', 'FileTree'];
  for (const tag of unwrapTags) {
    const openRe = new RegExp(`<${tag}\\b[^>]*>`, 'g');
    const closeRe = new RegExp(`</${tag}>`, 'g');
    text = text.replace(openRe, '\n').replace(closeRe, '\n');
  }

  // Convert <a href="...">text</a> into Markdown links
  text = text.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  // Strip remaining HTML/JSX tags cleanly while preserving inner text
  text = text.replace(/<([A-Z][A-Za-z0-9]*)\b[^>]*\/>/g, '');
  text = text.replace(/<\/?[A-Z][A-Za-z0-9]*\b[^>]*>/g, '');
  text = text.replace(/<\/?(?:div|section|article|header|footer|span|figure|figcaption|nav|main)\b[^>]*>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<hr\s*\/?>/gi, '\n---\n');
  text = text.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, lvl, inner) => {
    return `\n${'#'.repeat(Number(lvl))} ${inner.replace(/<[^>]+>/g, '').trim()}\n`;
  });
  text = text.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n');
  text = text.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
  text = text.replace(/<\/?(?:ul|ol)\b[^>]*>/gi, '\n');
  text = text.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  text = text.replace(/<strong\b[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  text = text.replace(/<em\b[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  // Strip any leftover raw HTML tags outside code blocks
  text = text.replace(/<svg[\s\S]*?<\/svg>/gi, '');

  // Strip decorative arrow/separator-only lines produced by visual layout elements
  text = text.replace(/^\s*(?:·|→)\s*$/gm, '');

  // Decode common HTML entities outside code blocks
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

  // Dedent lines outside fenced code blocks so JSX nesting indentation
  // never turns prose into CommonMark indented code blocks
  text = text
    .split('\n')
    .map((line) => {
      // Preserve Markdown list continuation / nested list indentation up to 2 spaces
      if (/^\s{0,4}[-*+]\s+/.test(line) || /^\s{0,4}\d+\.\s+/.test(line)) {
        return line.replace(/^\s+/, (ws) => (ws.length >= 2 ? '  ' : ''));
      }
      return line.trim();
    })
    .join('\n');

  // Restore protected code blocks
  text = text.replace(/@@CODE_BLOCK_(\d+)@@/g, (_m, idxStr) => codeBlocks[Number(idxStr)] ?? '');

  // Normalize blank lines
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  // Build final clean CommonMark header
  const headerParts: string[] = [];
  const headingTitle = hero?.title || title;
  if (headingTitle && !text.startsWith(`# ${headingTitle}`) && !/^#\s+/.test(text)) {
    headerParts.push(`# ${headingTitle}`);
  }
  const leadSummary = hero?.tagline || description;
  if (leadSummary) {
    headerParts.push(`> ${leadSummary}`);
  }
  if (hero?.actions && hero.actions.length > 0) {
    const actionLinks = hero.actions
      .filter((a) => a.text && a.link)
      .map((a) => `- [${a.text}](${a.link})`);
    if (actionLinks.length > 0) {
      headerParts.push(actionLinks.join('\n'));
    }
  }

  return [...headerParts, text].filter(Boolean).join('\n\n') + '\n';
}

function extractAttr(attrs: string, name: string): string | undefined {
  const match = attrs.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`));
  return match ? (match[1] ?? match[2]) : undefined;
}

/**
 * Formats a `spec/` Markdown file into a clean standalone `.md` mirror with
 * canonical `.md` links and concise metadata header.
 */
export function renderSpecMarkdownMirror(
  filePath: string,
  context: {
    versionDir?: string;
    isReference?: boolean;
    isMasterChangelog?: boolean;
    versionInfo?: VersionInfo;
  }
): string {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const { frontmatter, body } = parseMarkdownWithFrontmatter(raw);
  const rewrittenBody = rewriteSpecMarkdownLinks(body.trim(), {
    versionDir: context.versionDir,
    isReference: context.isReference,
    isMasterChangelog: context.isMasterChangelog,
    targetMode: 'markdown',
  });

  const metaLines: string[] = [];
  if (context.versionInfo) {
    metaLines.push(
      `> **ATIF ${context.versionInfo.dirName}** (${context.versionInfo.roleLabel}) | Status: \`${context.versionInfo.status}\`${
        context.versionInfo.schemaVersion
          ? ` | Schema: \`${context.versionInfo.schemaVersion}\``
          : ''
      }${context.versionInfo.releaseDate ? ` | Released: ${context.versionInfo.releaseDate}` : ''}`
    );
    if (context.versionInfo.role === 'legacy' || context.versionInfo.role === 'archived') {
      metaLines.push(
        `> Latest specification: [ATIF v${context.versionInfo.latestVersion}](/spec/v${context.versionInfo.latestVersion}/index.md)`
      );
    }
  } else if (typeof frontmatter.description === 'string' && frontmatter.description.trim()) {
    metaLines.push(`> ${frontmatter.description.trim()}`);
  }

  const title = typeof frontmatter.title === 'string' ? frontmatter.title.trim() : '';
  const hasH1 = /^#\s+/m.test(rewrittenBody.slice(0, 300));
  const parts: string[] = [];
  if (title && !hasH1) {
    parts.push(`# ${title}`);
  }
  if (metaLines.length > 0) {
    parts.push(metaLines.join('\n'));
  }
  parts.push(rewrittenBody);

  return parts.join('\n\n') + '\n';
}

/**
 * Collects every `.md` mirror route that should be emitted into `docsite/dist/`.
 */
export function collectAllMarkdownMirrors(): MirrorDocument[] {
  const mirrors: MirrorDocument[] = [];
  const specRoot = getSpecRoot();
  const docsRoot = path.join(getDocsiteRoot(), 'src', 'content', 'docs');

  // 1. Authored Starlight docs pages under docsite/src/content/docs/**
  if (fs.existsSync(docsRoot)) {
    const walkDocs = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDocs(fullPath);
        } else if (entry.isFile() && /\.(md|mdx)$/.test(entry.name)) {
          const rel = path.relative(docsRoot, fullPath).replace(/\\/g, '/');
          const routeKey = rel.replace(/\.(md|mdx)$/, '');
          const raw = fs.readFileSync(fullPath, 'utf-8');
          const cleaned = stripMdxToCommonMark(raw);
          mirrors.push({ routeKey, content: cleaned });
        }
      }
    };
    walkDocs(docsRoot);
  }

  // 2. Master spec/CHANGELOG.md
  const masterChangelogPath = path.join(specRoot, 'CHANGELOG.md');
  if (fs.existsSync(masterChangelogPath)) {
    mirrors.push({
      routeKey: 'spec/changelog',
      content: renderSpecMarkdownMirror(masterChangelogPath, { isMasterChangelog: true }),
    });
  }

  // 3. All discovered spec/vX.Y/ versions, changelogs, and references
  const versions = discoverSpecVersions();
  for (const v of versions) {
    const specContent = renderSpecMarkdownMirror(v.specFilePath, {
      versionDir: v.dirName,
      versionInfo: v,
    });
    // Emit BOTH /spec/vX.Y/index.md AND /spec/vX.Y.md
    mirrors.push({ routeKey: `spec/${v.dirName}/index`, content: specContent });
    mirrors.push({ routeKey: `spec/${v.dirName}`, content: specContent });

    if (v.hasChangelog && v.changelogFilePath) {
      mirrors.push({
        routeKey: `spec/${v.dirName}/changelog`,
        content: renderSpecMarkdownMirror(v.changelogFilePath, {
          versionDir: v.dirName,
          versionInfo: v,
        }),
      });
    }

    for (const ref of v.references) {
      mirrors.push({
        routeKey: `spec/${v.dirName}/references/${ref.slug}`,
        content: renderSpecMarkdownMirror(ref.filePath, {
          versionDir: v.dirName,
          isReference: true,
          versionInfo: v,
        }),
      });
    }
  }

  // Deduplicate by routeKey
  const seen = new Set<string>();
  return mirrors.filter((m) => {
    if (seen.has(m.routeKey)) return false;
    seen.add(m.routeKey);
    return true;
  });
}
