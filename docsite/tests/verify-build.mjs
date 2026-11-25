#!/usr/bin/env node
/**
 * Post-build verification suite for the ATIF documentation site (Plan Section 8.3 #4).
 *
 * Run from `docsite/`:
 *   node tests/verify-build.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const docsiteRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(docsiteRoot, '..');
const distDir = path.join(docsiteRoot, 'dist');
const specRoot = path.join(repoRoot, 'spec');

let passed = 0;
const failures = [];

function check(condition, message) {
  if (condition) {
    passed += 1;
  } else {
    failures.push(message);
  }
}

function fileExists(relPath) {
  return fs.existsSync(path.join(distDir, relPath));
}

function readDist(relPath) {
  return fs.readFileSync(path.join(distDir, relPath), 'utf-8');
}

function walkFiles(dir, predicate) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, predicate));
    } else if (entry.isFile() && (!predicate || predicate(full))) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Resolves a site pathname (e.g. `/guides/quickstart/`, `/spec/v2.0/index.md`, `/schema/v2.0/atif.proto`)
 * to a concrete file inside `docsite/dist/` matching standard directory `index.html` serving.
 */
function resolveDistUrl(urlPath) {
  const clean = urlPath.split('#')[0].split('?')[0];
  if (!clean.startsWith('/')) return null;
  const rel = clean.replace(/^\/+/, '');
  if (rel === '') {
    const idx = path.join(distDir, 'index.html');
    return fs.existsSync(idx) ? idx : null;
  }

  const direct = path.join(distDir, rel);
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) {
    return direct;
  }

  const asDirIndex = path.join(distDir, rel, 'index.html');
  if (fs.existsSync(asDirIndex) && fs.statSync(asDirIndex).isFile()) {
    return asDirIndex;
  }

  return null;
}

// ---------------------------------------------------------------------------
// 0. Build output exists
// ---------------------------------------------------------------------------
check(fs.existsSync(distDir), `Build output directory missing: ${distDir}`);
if (!fs.existsSync(distDir)) {
  console.error('FAIL: docsite/dist does not exist. Run `npm run build` first.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. All 10 spec versions + 4 v2.0 references + changelogs + core pages
// ---------------------------------------------------------------------------
const expectedVersions = [
  'v1.0', 'v1.1', 'v1.2', 'v1.3', 'v1.4', 'v1.5', 'v1.6', 'v1.7', 'v1.8', 'v2.0',
];
for (const v of expectedVersions) {
  check(fileExists(`spec/${v}/index.html`), `Missing HTML for /spec/${v}/`);
  check(fileExists(`spec/${v}/changelog/index.html`), `Missing HTML for /spec/${v}/changelog/`);
  check(fileExists(`spec/${v}/index.md`), `Missing Markdown mirror /spec/${v}/index.md`);
  check(fileExists(`spec/${v}.md`), `Missing alternate Markdown mirror /spec/${v}.md`);
  check(fileExists(`spec/${v}/changelog.md`), `Missing Markdown mirror /spec/${v}/changelog.md`);
}

const expectedV2Refs = [
  'canonical-actions',
  'harness-examples',
  'migration-and-extensions',
  'projections',
];
for (const ref of expectedV2Refs) {
  check(
    fileExists(`spec/v2.0/references/${ref}/index.html`),
    `Missing HTML for /spec/v2.0/references/${ref}/`
  );
  check(
    fileExists(`spec/v2.0/references/${ref}.md`),
    `Missing Markdown mirror /spec/v2.0/references/${ref}.md`
  );
}

check(fileExists('index.html'), 'Missing landing page /index.html');
check(fileExists('spec/index.html'), 'Missing redirect page /spec/index.html');
check(fileExists('spec/changelog/index.html'), 'Missing master changelog /spec/changelog/index.html');
check(fileExists('validator/index.html'), 'Missing interactive validator /validator/index.html');

for (const guide of [
  'quickstart',
  'migrating-from-v1',
  'sdks-and-tooling',
  'ecosystem',
  'governance',
]) {
  check(fileExists(`guides/${guide}/index.html`), `Missing guide /guides/${guide}/index.html`);
  check(fileExists(`guides/${guide}.md`), `Missing guide Markdown mirror /guides/${guide}.md`);
}

// Check embedded atif.proto and warehouse.sql inside projections.html
if (fileExists('spec/v2.0/references/projections/index.html')) {
  const projHtml = readDist('spec/v2.0/references/projections/index.html');
  check(
    projHtml.includes('atif.proto') && projHtml.includes('AtifRecord'),
    'projections page does not embed atif.proto schema source'
  );
  check(
    projHtml.includes('warehouse.sql') && projHtml.includes('CREATE TABLE'),
    'projections page does not embed warehouse.sql DDL source'
  );
}

// ---------------------------------------------------------------------------
// 2. Derived version lifecycle roles & banners
// ---------------------------------------------------------------------------
if (fileExists('spec/index.html')) {
  const specRedirectHtml = readDist('spec/index.html');
  check(
    specRedirectHtml.includes('/spec/v2.0/'),
    '/spec/index.html does not redirect to latest final /spec/v2.0/'
  );
}

if (fileExists('spec/v2.0/index.html')) {
  const v2Html = readDist('spec/v2.0/index.html');
  check(v2Html.includes('v2.0 (Latest)'), 'v2.0 page missing derived "v2.0 (Latest)" label');
  check(
    !v2Html.includes('data-spec-role="legacy"') &&
      !v2Html.includes('data-spec-role="archived"') &&
      !v2Html.includes('data-spec-role="draft"'),
    'v2.0 (Latest) should not render a legacy/archived/draft status banner'
  );
}

if (fileExists('spec/v1.8/index.html')) {
  const v18Html = readDist('spec/v1.8/index.html');
  check(v18Html.includes('v1.8 (Legacy)'), 'v1.8 page missing derived "v1.8 (Legacy)" label');
  check(
    v18Html.includes('data-spec-role="legacy"'),
    'v1.8 page missing Legacy SpecStatusBanner'
  );
  check(
    v18Html.includes('/spec/v2.0/'),
    'v1.8 Legacy banner must link to latest /spec/v2.0/'
  );
}

for (const archivedVer of ['v1.0', 'v1.1', 'v1.2', 'v1.3', 'v1.4', 'v1.5', 'v1.6', 'v1.7']) {
  if (fileExists(`spec/${archivedVer}/index.html`)) {
    const html = readDist(`spec/${archivedVer}/index.html`);
    check(
      html.includes(`${archivedVer} (Archived)`),
      `${archivedVer} page missing derived "${archivedVer} (Archived)" label`
    );
    check(
      html.includes('data-spec-role="archived"'),
      `${archivedVer} page missing Archived SpecStatusBanner`
    );
    check(
      html.includes('/spec/v2.0/') && html.includes('/spec/v1.8/'),
      `${archivedVer} Archived banner must link to both /spec/v2.0/ and /spec/v1.8/`
    );
  }
}

// ---------------------------------------------------------------------------
// 3. 100% HTML <-> .md parity + clean CommonMark + <link rel="alternate">
// ---------------------------------------------------------------------------
const htmlFiles = walkFiles(distDir, (f) => f.endsWith('.html'));
check(htmlFiles.length >= 25, `Expected >=25 rendered HTML pages, found ${htmlFiles.length}`);

const JSX_LEAK_PATTERNS = [
  /<script\b/i,
  /<style\b/i,
  /^\s*import\s+.*from\s+['"]/m,
  /<TrajectoryValidator\b/,
  /<CardGrid\b/,
  /<LinkCard\b/,
  /<TabItem\b/,
];

for (const htmlFile of htmlFiles) {
  const relHtml = path.relative(distDir, htmlFile).replace(/\\/g, '/');
  if (relHtml === '404.html') continue;

  check(
    relHtml === 'index.html' || relHtml.endsWith('/index.html'),
    `HTML page /${relHtml} is not emitted as a directory index.html page`
  );

  const html = fs.readFileSync(htmlFile, 'utf-8');
  const altMatch = html.match(
    /<link\b[^>]*rel=["']alternate["'][^>]*type=["']text\/markdown["'][^>]*href=["']([^"']+)["'][^>]*>/i
  ) || html.match(
    /<link\b[^>]*type=["']text\/markdown["'][^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*>/i
  );

  check(
    Boolean(altMatch),
    `HTML page /${relHtml} missing <link rel="alternate" type="text/markdown" href="..."> in <head>`
  );

  if (altMatch) {
    const mdHref = altMatch[1];
    const resolvedMd = resolveDistUrl(mdHref);
    check(
      Boolean(resolvedMd && resolvedMd.endsWith('.md')),
      `HTML page /${relHtml} points to missing .md mirror: ${mdHref}`
    );

    if (resolvedMd && fs.existsSync(resolvedMd)) {
      const mdContent = fs.readFileSync(resolvedMd, 'utf-8').trim();
      check(mdContent.length > 40, `Markdown mirror ${mdHref} is unexpectedly short/empty`);

      // Strip fenced code blocks before checking for leaked JSX/script/imports
      const mdWithoutFences = mdContent.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '');
      for (const pattern of JSX_LEAK_PATTERNS) {
        check(
          !pattern.test(mdWithoutFences),
          `Markdown mirror ${mdHref} contains leaked JSX/script artifact matching ${pattern}`
        );
      }
    }
  }
}

// Check full.md and llms.txt
check(fileExists('spec/v2.0/full.md'), 'Missing /spec/v2.0/full.md bundle');
if (fileExists('spec/v2.0/full.md')) {
  const fullMd = readDist('spec/v2.0/full.md');
  check(fullMd.length > 50000, `/spec/v2.0/full.md seems truncated (${fullMd.length} bytes)`);
  check(
    fullMd.includes('Canonical Actions') && fullMd.includes('Projections'),
    '/spec/v2.0/full.md missing concatenated companion references'
  );
}
check(fileExists('llms.txt'), 'Missing /llms.txt');
if (fileExists('llms.txt')) {
  const llmsTxt = readDist('llms.txt');
  check(
    llmsTxt.includes('/.well-known/skills/atif/SKILL.md') && llmsTxt.includes('/spec/v2.0/index.md'),
    '/llms.txt missing core skill/spec pointers'
  );
}

// ---------------------------------------------------------------------------
// 4. IETF draft-zzn-dvs-00 HTTP-Discoverable Skill verification
// ---------------------------------------------------------------------------
const skillIndexRel = '.well-known/skills/index.json';
const skillMdRel = '.well-known/skills/atif/SKILL.md';

check(fileExists(skillIndexRel), `Missing DVS skill index: /${skillIndexRel}`);
check(fileExists(skillMdRel), `Missing DVS skill document: /${skillMdRel}`);

if (fileExists(skillIndexRel)) {
  try {
    const parsedIndex = JSON.parse(readDist(skillIndexRel));
    check(Array.isArray(parsedIndex) && parsedIndex.length >= 1, 'DVS index.json must be a non-empty JSON array');
    const atifEntry = parsedIndex.find((s) => s.name === 'atif');
    check(Boolean(atifEntry), 'DVS index.json missing entry with name "atif"');
    if (atifEntry) {
      check(/^[a-z0-9-]{1,64}$/.test(atifEntry.name), `DVS name invalid: ${atifEntry.name}`);
      check(
        typeof atifEntry.description === 'string' &&
          atifEntry.description.length > 0 &&
          atifEntry.description.length <= 1024,
        'DVS index description must be non-empty and <= 1024 chars'
      );
      check(
        atifEntry.path === '/.well-known/skills/atif/SKILL.md',
        `DVS path mismatch: ${atifEntry.path}`
      );
      check(Boolean(resolveDistUrl(atifEntry.path)), `DVS path target missing: ${atifEntry.path}`);
    }
  } catch (err) {
    check(false, `DVS index.json invalid JSON: ${err.message}`);
  }
}

if (fileExists(skillMdRel)) {
  const skillRaw = readDist(skillMdRel);
  const fmMatch = skillRaw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  check(Boolean(fmMatch), 'SKILL.md missing valid YAML frontmatter');
  if (fmMatch) {
    const fm = YAML.parse(fmMatch[1]);
    check(
      typeof fm?.name === 'string' && /^[a-z0-9-]{1,64}$/.test(fm.name),
      `SKILL.md frontmatter name invalid: ${fm?.name}`
    );
    check(
      typeof fm?.description === 'string' &&
        fm.description.length > 0 &&
        fm.description.length <= 1024,
      'SKILL.md frontmatter description must be non-empty and <= 1024 chars'
    );
    const lineCount = skillRaw.trim().split('\n').length;
    check(lineCount <= 90, `SKILL.md should remain lightweight (<=90 lines, got ${lineCount})`);
    check(
      fmMatch[2].includes('"type":"meta","meta":{'),
      'SKILL.md validation checklist must show nested meta envelope ({"type":"meta","meta":{...}})'
    );

    // Verify every same-origin Markdown link in SKILL.md resolves to a built file
    const linkMatches = [...fmMatch[2].matchAll(/\]\((\/[^)\s]+)\)/g)];
    check(linkMatches.length >= 8, `Expected >=8 same-origin links in SKILL.md, found ${linkMatches.length}`);
    for (const m of linkMatches) {
      const target = m[1];
      check(
        Boolean(resolveDistUrl(target)),
        `SKILL.md links to non-existent same-origin path: ${target}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Sitemap includes /.well-known/skills/atif/SKILL.md
// ---------------------------------------------------------------------------
const sitemapFiles = walkFiles(distDir, (f) => /sitemap.*\.xml$/i.test(path.basename(f)));
check(sitemapFiles.length > 0, 'No sitemap XML files found in docsite/dist/');
const combinedSitemap = sitemapFiles.map((f) => fs.readFileSync(f, 'utf-8')).join('\n');
check(
  combinedSitemap.includes('/.well-known/skills/atif/SKILL.md'),
  'sitemap XML does not include /.well-known/skills/atif/SKILL.md (required by draft-zzn-dvs-00 §3.2)'
);

// ---------------------------------------------------------------------------
// 6. Raw /schema/v2.0/* and /examples/* byte-for-byte parity
// ---------------------------------------------------------------------------
const requiredV2Schemas = [
  'atif.proto',
  'warehouse.sql',
  'atif-record.schema.json',
  'canonical-actions.schema.json',
  'common-defs.schema.json',
];
for (const fileName of requiredV2Schemas) {
  const srcPath = path.join(specRoot, 'v2.0', 'schema', fileName);
  const outPath = path.join(distDir, 'schema', 'v2.0', fileName);
  check(fs.existsSync(outPath), `Missing built schema asset: /schema/v2.0/${fileName}`);
  if (fs.existsSync(srcPath) && fs.existsSync(outPath)) {
    check(
      Buffer.compare(fs.readFileSync(srcPath), fs.readFileSync(outPath)) === 0,
      `Schema byte mismatch for /schema/v2.0/${fileName}`
    );
  }
}

const requiredV2Examples = ['session.atif-e.jsonl', 'session.atif.jsonl'];
for (const fileName of requiredV2Examples) {
  const srcPath = path.join(specRoot, 'v2.0', 'examples', fileName);
  const outPath = path.join(distDir, 'examples', 'v2.0', fileName);
  check(fs.existsSync(outPath), `Missing built example asset: /examples/v2.0/${fileName}`);
  if (fs.existsSync(srcPath) && fs.existsSync(outPath)) {
    check(
      Buffer.compare(fs.readFileSync(srcPath), fs.readFileSync(outPath)) === 0,
      `Example byte mismatch for /examples/v2.0/${fileName}`
    );
  }
}

const v18ExamplesDir = path.join(specRoot, 'v1.8', 'examples');
if (fs.existsSync(v18ExamplesDir)) {
  for (const fileName of fs.readdirSync(v18ExamplesDir)) {
    const srcPath = path.join(v18ExamplesDir, fileName);
    const outPath = path.join(distDir, 'examples', 'v1.8', fileName);
    check(fs.existsSync(outPath), `Missing built v1.8 example: /examples/v1.8/${fileName}`);
    if (fs.existsSync(outPath)) {
      check(
        Buffer.compare(fs.readFileSync(srcPath), fs.readFileSync(outPath)) === 0,
        `Example byte mismatch for /examples/v1.8/${fileName}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 7. Root firebase.json verification
// ---------------------------------------------------------------------------
const firebasePath = path.join(repoRoot, 'firebase.json');
check(fs.existsSync(firebasePath), 'Missing root firebase.json');
if (fs.existsSync(firebasePath)) {
  try {
    const fb = JSON.parse(fs.readFileSync(firebasePath, 'utf-8'));
    check(fb?.hosting?.public === 'docsite/dist', 'firebase.json hosting.public must be "docsite/dist"');
    check(
      fb?.hosting?.cleanUrls === undefined,
      'firebase.json hosting.cleanUrls must not be set'
    );
    check(
      fb?.hosting?.trailingSlash === undefined,
      'firebase.json hosting.trailingSlash must not be set'
    );

    const redirects = fb?.hosting?.redirects ?? [];
    check(
      redirects.some((r) => r.source === '/spec' && r.destination === '/spec/v2.0/'),
      'firebase.json missing /spec -> /spec/v2.0/ redirect'
    );

    const headers = fb?.hosting?.headers ?? [];
    const hasHeader = (source, key, value) =>
      headers.some(
        (h) =>
          h.source === source &&
          Array.isArray(h.headers) &&
          h.headers.some((kv) => kv.key.toLowerCase() === key.toLowerCase() && kv.value === value)
      );

    check(
      hasHeader('**/*.md', 'Content-Type', 'text/markdown; charset=utf-8'),
      'firebase.json missing text/markdown; charset=utf-8 header for **/*.md'
    );
    check(
      hasHeader('/.well-known/skills/*/SKILL.md', 'Content-Type', 'text/markdown; charset=utf-8'),
      'firebase.json missing text/markdown; charset=utf-8 header for /.well-known/skills/*/SKILL.md'
    );
    check(
      hasHeader('/.well-known/skills/index.json', 'Content-Type', 'application/json; charset=utf-8'),
      'firebase.json missing application/json; charset=utf-8 header for /.well-known/skills/index.json'
    );
  } catch (err) {
    check(false, `firebase.json invalid JSON: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// 8. Internal root-relative link & /_astro/ asset integrity across all HTML pages
// ---------------------------------------------------------------------------
const brokenLinks = [];
const missingAssets = [];
for (const htmlFile of htmlFiles) {
  const relHtml = path.relative(distDir, htmlFile).replace(/\\/g, '/');
  if (relHtml === '404.html') continue;
  const html = fs.readFileSync(htmlFile, 'utf-8');

  for (const m of html.matchAll(/\bhref=["'](\/[^"'#?]*)/g)) {
    const target = m[1];
    if (target.startsWith('//') || target.startsWith('/pagefind/')) {
      continue;
    }
    if (!resolveDistUrl(target)) {
      if (target.startsWith('/_astro/')) {
        missingAssets.push(`/${relHtml} -> ${target}`);
      } else {
        brokenLinks.push(`/${relHtml} -> ${target}`);
      }
    }
  }

  for (const m of html.matchAll(/\bsrc=["'](\/_astro\/[^"'#?]+)/g)) {
    const target = m[1];
    if (!resolveDistUrl(target)) {
      missingAssets.push(`/${relHtml} -> ${target}`);
    }
  }
}
check(
  missingAssets.length === 0,
  `Missing /_astro/ stylesheet/script assets detected (${missingAssets.length}):\n  - ${missingAssets.slice(0, 15).join('\n  - ')}`
);
check(
  brokenLinks.length === 0,
  `Broken internal links detected (${brokenLinks.length}):\n  - ${brokenLinks.slice(0, 15).join('\n  - ')}`
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (failures.length > 0) {
  console.error(`\nATIF docsite verification FAILED (${failures.length} failure(s), ${passed} passed):\n`);
  for (const f of failures) {
    console.error(`  [FAIL] ${f}`);
  }
  process.exit(1);
}

console.log(`ATIF docsite verification PASSED (${passed} checks green, ${htmlFiles.length} HTML pages verified).`);
