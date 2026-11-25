import path from 'node:path';
import { getSpecRoot } from './spec-loader';

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

interface VFileLike {
  history?: string[];
  path?: string;
}

const ALERT_META: Record<string, { kind: string; label: string }> = {
  NOTE: { kind: 'note', label: 'Note' },
  TIP: { kind: 'tip', label: 'Tip' },
  IMPORTANT: { kind: 'important', label: 'Important' },
  WARNING: { kind: 'warning', label: 'Warning' },
  CAUTION: { kind: 'caution', label: 'Caution' },
};

/**
 * Rehype plugin that:
 * 1. Wraps every Markdown `<table>` inside `<div class="atif-table-wrap">` so
 *    wide specification tables scroll cleanly horizontally without ever
 *    breaking desktop or mobile layouts.
 * 2. On `spec/` Markdown files:
 *    - Strips a leading top-level `<h1>` (Starlight's PageTitle already renders
 *      the authoritative single `<h1>` from frontmatter.title).
 *    - Rewrites relative links (`./references/*.md`, `../SPEC.md`, `../schema/*`,
 *      `./examples/*`) to canonical site HTML/asset URLs.
 * 3. Converts GitHub-style alert blockquotes (`> [!NOTE]`, `> [!IMPORTANT]`,
 *    etc.) into semantic `<aside class="atif-callout atif-callout--*">` elements.
 */
export function rehypeAtifSpec() {
  const specRoot = getSpecRoot();

  return (tree: HastNode, file: VFileLike) => {
    const filePath = file.history?.[0] ?? file.path ?? '';
    const isSpecFile = Boolean(filePath && path.resolve(filePath).startsWith(specRoot));

    // Remove a redundant leading <h1> in spec/ files (Starlight PageTitle renders H1)
    if (isSpecFile && Array.isArray(tree.children)) {
      const firstElemIdx = tree.children.findIndex((n) => n.type === 'element');
      if (firstElemIdx !== -1 && tree.children[firstElemIdx].tagName === 'h1') {
        tree.children.splice(firstElemIdx, 1);
      }
    }

    const visit = (node: HastNode) => {
      if (!node.children || !Array.isArray(node.children)) return;

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];

        // Transform GitHub-style alert blockquotes
        if (child.type === 'element' && child.tagName === 'blockquote') {
          const transformed = tryTransformAlertBlockquote(child);
          if (transformed) {
            node.children[i] = transformed;
            visit(transformed);
            continue;
          }
        }

        // Wrap direct <table> children in <div class="atif-table-wrap">
        if (
          child.type === 'element' &&
          child.tagName === 'table' &&
          !(
            node.type === 'element' &&
            node.tagName === 'div' &&
            Array.isArray(node.properties?.className) &&
            (node.properties.className as string[]).includes('atif-table-wrap')
          )
        ) {
          node.children[i] = {
            type: 'element',
            tagName: 'div',
            properties: { className: ['atif-table-wrap'] },
            children: [child],
          };
          visit(child);
          continue;
        }

        if (isSpecFile && child.type === 'element' && child.tagName === 'a') {
          const href = child.properties?.href;
          if (typeof href === 'string') {
            const rewritten = rewriteHtmlSpecHref(href, filePath, specRoot);
            if (rewritten) {
              child.properties = { ...child.properties, href: rewritten };
            }
          }
        }

        visit(child);
      }
    };

    visit(tree);
  };
}

function tryTransformAlertBlockquote(blockquote: HastNode): HastNode | null {
  const children = blockquote.children;
  if (!children) return null;

  const firstPIdx = children.findIndex((c) => c.type === 'element' && c.tagName === 'p');
  if (firstPIdx === -1) return null;

  const firstP = children[firstPIdx];
  if (!firstP.children || firstP.children.length === 0) return null;

  const firstText = firstP.children[0];
  if (firstText.type !== 'text' || typeof firstText.value !== 'string') return null;

  const match = firstText.value.match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\r?\n|\s*)/i);
  if (!match) return null;

  const meta = ALERT_META[match[1].toUpperCase()];
  if (!meta) return null;

  const remainder = firstText.value.slice(match[0].length);
  const nextPChildren = [...firstP.children];
  if (remainder.length > 0) {
    nextPChildren[0] = { type: 'text', value: remainder };
  } else {
    nextPChildren.shift();
    // Strip leading <br> if GitHub markdown produced one right after [!NOTE]
    if (nextPChildren[0]?.type === 'element' && nextPChildren[0].tagName === 'br') {
      nextPChildren.shift();
    }
  }

  const bodyChildren = children.slice();
  if (nextPChildren.length > 0) {
    bodyChildren[firstPIdx] = { ...firstP, children: nextPChildren };
  } else {
    bodyChildren.splice(firstPIdx, 1);
  }

  return {
    type: 'element',
    tagName: 'aside',
    properties: {
      className: ['atif-callout', `atif-callout--${meta.kind}`],
      role: 'note',
    },
    children: [
      {
        type: 'element',
        tagName: 'p',
        properties: { className: ['atif-callout__title'] },
        children: [{ type: 'text', value: meta.label }],
      },
      {
        type: 'element',
        tagName: 'div',
        properties: { className: ['atif-callout__body'] },
        children: bodyChildren,
      },
    ],
  };
}

function rewriteHtmlSpecHref(href: string, filePath: string, specRoot: string): string | null {
  if (
    href.startsWith('http://') ||
    href.startsWith('https://') ||
    href.startsWith('mailto:') ||
    href.startsWith('#') ||
    href.startsWith('/')
  ) {
    return null;
  }

  const [rawPath, hashPart] = href.split('#');
  if (!rawPath) return null;
  const hash = hashPart ? `#${hashPart}` : '';

  const resolvedAbs = path.resolve(path.dirname(filePath), rawPath);
  const relFromSpec = path.relative(specRoot, resolvedAbs).replace(/\\/g, '/');
  if (relFromSpec.startsWith('..')) {
    return null;
  }

  if (relFromSpec === 'CHANGELOG.md') {
    return `/spec/changelog/${hash}`;
  }

  const versionMatch = relFromSpec.match(/^(v\d+\.\d+)\/(.+)$/);
  if (!versionMatch) return null;
  const [, vDir, subPath] = versionMatch;

  if (subPath === 'SPEC.md') {
    return `/spec/${vDir}/${hash}`;
  }
  if (subPath === 'CHANGELOG.md') {
    return `/spec/${vDir}/changelog/${hash}`;
  }

  const refMatch = subPath.match(/^references\/([^/]+)\.md$/);
  if (refMatch) {
    return `/spec/${vDir}/references/${refMatch[1]}/${hash}`;
  }

  const schemaMatch = subPath.match(/^schema\/(.+)$/);
  if (schemaMatch) {
    return `/schema/${vDir}/${schemaMatch[1]}${hash}`;
  }

  const exampleMatch = subPath.match(/^examples\/(.+)$/);
  if (exampleMatch) {
    return `/examples/${vDir}/${exampleMatch[1]}${hash}`;
  }

  return null;
}
