import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export type SpecStatus = 'draft' | 'final';
export type VersionRole = 'latest' | 'legacy' | 'archived' | 'draft';
export type SpecDocType = 'spec' | 'changelog' | 'reference';

export interface SpecFrontmatter {
  title: string;
  description: string;
  atif_version: string;
  schema_version?: string;
  status: SpecStatus;
  release_date: string;
  doc_type: SpecDocType;
  order: number;
  source_ref?: string;
  supersedes?: string;
}

export interface SpecReferenceInfo {
  slug: string;
  fileName: string;
  title: string;
  description: string;
  order: number;
  href: string;
  mdHref: string;
  filePath: string;
}

export interface SpecAssetInfo {
  fileName: string;
  href: string;
  filePath: string;
  label: string;
  lang: string;
}

export interface VersionInfo {
  version: string;
  dirName: string;
  major: number;
  minor: number;
  status: SpecStatus;
  role: VersionRole;
  roleLabel: string;
  displayLabel: string;
  title: string;
  description: string;
  releaseDate: string;
  schemaVersion?: string;
  supersedes?: string;
  sourceRef?: string;
  href: string;
  mdHref: string;
  altMdHref: string;
  specFilePath: string;
  latestVersion: string;
  latestHref: string;
  latestInMajorVersion?: string;
  latestInMajorHref?: string;
  hasChangelog: boolean;
  changelogHref?: string;
  changelogMdHref?: string;
  changelogFilePath?: string;
  references: SpecReferenceInfo[];
  schemas: SpecAssetInfo[];
  examples: SpecAssetInfo[];
}

export interface ParsedMarkdownFile {
  frontmatter: Record<string, unknown>;
  body: string;
  raw: string;
}

const SITE_URL_DEFAULT = 'https://atif.dev';

export function getSiteUrl(): string {
  return process.env.ATIF_SITE_URL || SITE_URL_DEFAULT;
}

/**
 * Resolves the repository root containing `spec/` and `docsite/`.
 */
export function getRepoRoot(): string {
  const candidates = [
    path.resolve(process.cwd(), '..'),
    process.cwd(),
    path.resolve(import.meta.dirname ?? '.', '../../..'),
  ];
  for (const candidate of candidates) {
    if (
      fs.existsSync(path.join(candidate, 'docsite')) &&
      (fs.existsSync(path.join(candidate, 'spec')) ||
        fs.existsSync(path.join(candidate, 'LICENSE')))
    ) {
      return candidate;
    }
  }
  return path.resolve(process.cwd(), '..');
}

export function getSpecRoot(): string {
  return path.join(getRepoRoot(), 'spec');
}

export function getDocsiteRoot(): string {
  return path.join(getRepoRoot(), 'docsite');
}

/**
 * Parses YAML frontmatter and Markdown body from a file string.
 */
export function parseMarkdownWithFrontmatter(raw: string): ParsedMarkdownFile {
  const normalized = raw.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: normalized, raw: normalized };
  }
  const frontmatter = (YAML.parse(match[1]) as Record<string, unknown>) ?? {};
  return { frontmatter, body: match[2], raw: normalized };
}

export function readParsedMarkdown(filePath: string): ParsedMarkdownFile {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return parseMarkdownWithFrontmatter(raw);
}

function parseVersionDir(dirName: string): { major: number; minor: number; version: string } | null {
  const match = dirName.match(/^v(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    version: `${match[1]}.${match[2]}`,
  };
}

function classifySchemaAsset(fileName: string): { label: string; lang: string } {
  if (fileName.endsWith('.proto')) return { label: 'Protobuf (atif.proto)', lang: 'protobuf' };
  if (fileName.endsWith('.sql')) return { label: 'Warehouse DDL (warehouse.sql)', lang: 'sql' };
  if (fileName === 'atif-record.schema.json') return { label: 'Record JSON Schema', lang: 'json' };
  if (fileName === 'canonical-actions.schema.json') {
    return { label: 'Canonical Actions Schema', lang: 'json' };
  }
  if (fileName === 'common-defs.schema.json') return { label: 'Common Defs Schema', lang: 'json' };
  if (fileName.endsWith('.json')) return { label: fileName, lang: 'json' };
  if (fileName.endsWith('.yaml') || fileName.endsWith('.yml')) {
    return { label: fileName, lang: 'yaml' };
  }
  return { label: fileName, lang: 'text' };
}

const ROLE_LABELS: Record<VersionRole, string> = {
  latest: 'Latest',
  legacy: 'Legacy',
  archived: 'Archived',
  draft: 'Draft',
};

/**
 * Discovers all spec/v<major>.<minor>/ directories, sorts by descending semver
 * (major, minor), and derives Latest / Legacy / Archived / Draft roles purely
 * from version sequence + intrinsic `status: "draft" | "final"`.
 */
export function discoverSpecVersions(): VersionInfo[] {
  const specRoot = getSpecRoot();
  if (!fs.existsSync(specRoot)) {
    return [];
  }

  const entries = fs.readdirSync(specRoot, { withFileTypes: true });
  interface RawVersion {
    version: string;
    dirName: string;
    major: number;
    minor: number;
    frontmatter: Partial<SpecFrontmatter>;
    specFilePath: string;
    dirPath: string;
  }

  const rawVersions: RawVersion[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const parsed = parseVersionDir(entry.name);
    if (!parsed) continue;
    const dirPath = path.join(specRoot, entry.name);
    const specFilePath = path.join(dirPath, 'SPEC.md');
    if (!fs.existsSync(specFilePath)) continue;

    const { frontmatter } = readParsedMarkdown(specFilePath);
    rawVersions.push({
      ...parsed,
      dirName: entry.name,
      frontmatter: frontmatter as Partial<SpecFrontmatter>,
      specFilePath,
      dirPath,
    });
  }

  // Sort descending by (major, minor)
  rawVersions.sort((a, b) => {
    if (a.major !== b.major) return b.major - a.major;
    return b.minor - a.minor;
  });

  // Identify highest final overall and highest final per major
  const latestFinal = rawVersions.find((v) => (v.frontmatter.status ?? 'final') === 'final');
  const highestFinalByMajor = new Map<number, RawVersion>();
  for (const rv of rawVersions) {
    const status: SpecStatus = rv.frontmatter.status === 'draft' ? 'draft' : 'final';
    if (status === 'final' && !highestFinalByMajor.has(rv.major)) {
      highestFinalByMajor.set(rv.major, rv);
    }
  }

  const latestVersion = latestFinal?.version ?? rawVersions[0]?.version ?? '2.0';
  const latestHref = `/spec/v${latestVersion}/`;

  return rawVersions.map((rv): VersionInfo => {
    const status: SpecStatus = rv.frontmatter.status === 'draft' ? 'draft' : 'final';
    let role: VersionRole;
    if (status === 'draft') {
      role = 'draft';
    } else if (latestFinal && rv.version === latestFinal.version) {
      role = 'latest';
    } else if (
      latestFinal &&
      rv.major < latestFinal.major &&
      highestFinalByMajor.get(rv.major)?.version === rv.version
    ) {
      role = 'legacy';
    } else {
      role = 'archived';
    }

    const latestInMajor = highestFinalByMajor.get(rv.major);
    const latestInMajorVersion =
      latestInMajor && latestInMajor.version !== rv.version ? latestInMajor.version : undefined;
    const latestInMajorHref = latestInMajorVersion ? `/spec/v${latestInMajorVersion}/` : undefined;

    // Discover references/*.md
    const references: SpecReferenceInfo[] = [];
    const refsDir = path.join(rv.dirPath, 'references');
    if (fs.existsSync(refsDir)) {
      for (const refFile of fs.readdirSync(refsDir)) {
        if (!refFile.endsWith('.md')) continue;
        const slug = refFile.replace(/\.md$/, '');
        const filePath = path.join(refsDir, refFile);
        const { frontmatter } = readParsedMarkdown(filePath);
        references.push({
          slug,
          fileName: refFile,
          title: String(frontmatter.title ?? slug),
          description: String(frontmatter.description ?? ''),
          order: typeof frontmatter.order === 'number' ? frontmatter.order : 50,
          href: `/spec/${rv.dirName}/references/${slug}/`,
          mdHref: `/spec/${rv.dirName}/references/${slug}.md`,
          filePath,
        });
      }
      references.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
    }

    // Discover schema/*
    const schemas: SpecAssetInfo[] = [];
    const schemaDir = path.join(rv.dirPath, 'schema');
    if (fs.existsSync(schemaDir)) {
      for (const fileName of fs.readdirSync(schemaDir).sort()) {
        const filePath = path.join(schemaDir, fileName);
        if (!fs.statSync(filePath).isFile()) continue;
        const { label, lang } = classifySchemaAsset(fileName);
        schemas.push({
          fileName,
          href: `/schema/${rv.dirName}/${fileName}`,
          filePath,
          label,
          lang,
        });
      }
    }

    // Discover examples/*
    const examples: SpecAssetInfo[] = [];
    const examplesDir = path.join(rv.dirPath, 'examples');
    if (fs.existsSync(examplesDir)) {
      for (const fileName of fs.readdirSync(examplesDir).sort()) {
        const filePath = path.join(examplesDir, fileName);
        if (!fs.statSync(filePath).isFile()) continue;
        examples.push({
          fileName,
          href: `/examples/${rv.dirName}/${fileName}`,
          filePath,
          label: fileName,
          lang: fileName.endsWith('.json') || fileName.endsWith('.jsonl') ? 'json' : 'text',
        });
      }
    }

    const changelogFilePath = path.join(rv.dirPath, 'CHANGELOG.md');
    const hasChangelog = fs.existsSync(changelogFilePath);
    const roleLabel = ROLE_LABELS[role];

    return {
      version: rv.version,
      dirName: rv.dirName,
      major: rv.major,
      minor: rv.minor,
      status,
      role,
      roleLabel,
      displayLabel: `${rv.dirName} (${roleLabel})`,
      title: String(rv.frontmatter.title ?? `ATIF ${rv.dirName} Specification`),
      description: String(rv.frontmatter.description ?? ''),
      releaseDate: String(rv.frontmatter.release_date ?? ''),
      schemaVersion: rv.frontmatter.schema_version,
      supersedes: rv.frontmatter.supersedes,
      sourceRef: rv.frontmatter.source_ref,
      href: `/spec/${rv.dirName}/`,
      mdHref: `/spec/${rv.dirName}/index.md`,
      altMdHref: `/spec/${rv.dirName}.md`,
      specFilePath: rv.specFilePath,
      latestVersion,
      latestHref,
      latestInMajorVersion,
      latestInMajorHref,
      hasChangelog,
      changelogHref: hasChangelog ? `/spec/${rv.dirName}/changelog/` : undefined,
      changelogMdHref: hasChangelog ? `/spec/${rv.dirName}/changelog.md` : undefined,
      changelogFilePath: hasChangelog ? changelogFilePath : undefined,
      references,
      schemas,
      examples,
    };
  });
}

export function getLatestSpecVersion(): VersionInfo | undefined {
  const versions = discoverSpecVersions();
  return versions.find((v) => v.role === 'latest') ?? versions[0];
}

export function getSpecVersion(dirOrVersion: string): VersionInfo | undefined {
  const normalized = dirOrVersion.startsWith('v') ? dirOrVersion : `v${dirOrVersion}`;
  return discoverSpecVersions().find((v) => v.dirName === normalized);
}

/**
 * Returns the canonical `.md` mirror URL for any site HTML pathname.
 */
export function getCanonicalMdUrl(pathname: string): string {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/') {
    return '/index.md';
  }
  // Version root pages (/spec/v2.0) prefer /spec/v2.0/index.md (with /spec/v2.0.md also emitted)
  if (/^\/spec\/v\d+\.\d+$/.test(clean)) {
    return `${clean}/index.md`;
  }
  // /spec redirects to latest spec version
  if (clean === '/spec') {
    const latest = getLatestSpecVersion();
    return latest ? latest.mdHref : '/spec/v2.0/index.md';
  }
  return `${clean}.md`;
}

/**
 * Reads a raw file from `spec/<version>/schema/<fileName>`.
 */
export function readSchemaFile(versionDir: string, fileName: string): string | null {
  const filePath = path.join(getSpecRoot(), versionDir, 'schema', fileName);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Builds the Starlight sidebar items array, dynamically highlighting the active
 * spec version (when viewing a spec page) and keeping authored guides + versions
 * cleanly organized.
 */
export interface SidebarLinkItem {
  label: string;
  link: string;
  badge?: { text: string; variant?: 'note' | 'tip' | 'caution' | 'danger' | 'success' | 'default' };
  attrs?: Record<string, string>;
}

export interface SidebarGroupItem {
  label: string;
  collapsed?: boolean;
  items: Array<SidebarLinkItem | SidebarGroupItem>;
}

export function buildStarlightSidebar(activeVersionDir?: string): SidebarGroupItem[] {
  const versions = discoverSpecVersions();
  const latest = versions.find((v) => v.role === 'latest') ?? versions[0];
  const current =
    (activeVersionDir ? versions.find((v) => v.dirName === activeVersionDir) : undefined) ??
    latest;

  const isViewingHistorical = Boolean(current && latest && current.dirName !== latest.dirName);
  const groups: SidebarGroupItem[] = [];

  if (current) {
    const specItems: SidebarLinkItem[] = [
      {
        label: 'Core Specification',
        link: current.href,
        badge:
          current.role === 'latest'
            ? { text: 'Latest', variant: 'success' }
            : current.role === 'legacy'
              ? { text: 'Legacy', variant: 'caution' }
              : current.role === 'draft'
                ? { text: 'Draft', variant: 'note' }
                : { text: 'Archived', variant: 'default' },
      },
    ];

    if (current.hasChangelog && current.changelogHref) {
      specItems.push({
        label: `${current.dirName} Changelog`,
        link: current.changelogHref,
      });
    }

    specItems.push({
      label: 'Version History',
      link: '/spec/changelog/',
    });

    groups.push({
      label: `Specification (${current.dirName})`,
      items: specItems,
    });

    if (current.references.length > 0) {
      const refItems: SidebarLinkItem[] = current.references.map((ref) => {
        const shortLabel = formatReferenceSidebarLabel(ref.slug, ref.title);
        return {
          label: shortLabel,
          link: ref.href,
        };
      });
      groups.push({
        label: `${current.dirName} References`,
        items: refItems,
      });
    }
  } else {
    // Fallback before spec/ is populated
    groups.push({
      label: 'Specification (v2.0)',
      items: [
        { label: 'Core Specification', link: '/spec/v2.0/', badge: { text: 'Latest', variant: 'success' } },
        { label: 'v2.0 Changelog', link: '/spec/v2.0/changelog/' },
        { label: 'Version History', link: '/spec/changelog/' },
      ],
    });
    groups.push({
      label: 'v2.0 References',
      items: [
        { label: 'Canonical Actions', link: '/spec/v2.0/references/canonical-actions/' },
        { label: 'Harness Examples', link: '/spec/v2.0/references/harness-examples/' },
        { label: 'Migration & Extensions', link: '/spec/v2.0/references/migration-and-extensions/' },
        { label: 'Wire & Warehouse Projections', link: '/spec/v2.0/references/projections/' },
      ],
    });
  }

  if (isViewingHistorical && latest) {
    groups.push({
      label: `Latest (${latest.dirName})`,
      items: [
        { label: `${latest.dirName} Specification`, link: latest.href, badge: { text: 'Latest', variant: 'success' } },
      ],
    });
  }

  groups.push({
    label: 'Guides',
    items: [
      { label: 'Quickstart', link: '/guides/quickstart/' },
      { label: 'Migrating from v1.x', link: '/guides/migrating-from-v1/' },
      { label: 'SDKs & Tooling', link: '/guides/sdks-and-tooling/' },
      { label: 'Ecosystem', link: '/guides/ecosystem/' },
      { label: 'Governance', link: '/guides/governance/' },
    ],
  });

  groups.push({
    label: 'Tools & Schemas',
    items: [
      { label: 'Interactive Validator', link: '/validator/' },
      { label: 'Agent Skill (SKILL.md)', link: '/.well-known/skills/atif/SKILL.md' },
      { label: 'llms.txt', link: '/llms.txt' },
    ],
  });

  return groups;
}

function formatReferenceSidebarLabel(slug: string, title: string): string {
  switch (slug) {
    case 'canonical-actions':
      return 'Canonical Actions';
    case 'harness-examples':
      return 'Harness Examples';
    case 'migration-and-extensions':
      return 'Migration & Extensions';
    case 'projections':
      return 'Wire & Warehouse Projections';
    default:
      return title.replace(/^ATIF\s+v\d+\.\d+\s+/i, '').trim() || slug;
  }
}
