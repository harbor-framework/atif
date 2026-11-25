import { render } from 'pele';

interface MdastNode {
  type: string;
  lang?: string | null;
  value?: string;
  children?: MdastNode[];
}

/**
 * Build-time remark plugin that compiles fenced `mermaid` code blocks into
 * CSS-variable-themed inline SVG diagrams via Obsidian's `pele` renderer.
 *
 * Runs before Starlight/Expressive Code so diagrams render as crisp, zero-JS
 * SVGs that automatically adapt to light and dark modes via `--pele-*` tokens,
 * while raw `.md` mirrors continue to expose the original Mermaid source.
 */
export function remarkPeleMermaid() {
  return (tree: MdastNode) => {
    const visit = (node: MdastNode) => {
      if (!Array.isArray(node.children)) return;

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === 'code' && child.lang === 'mermaid' && typeof child.value === 'string') {
          const result = render(child.value);
          if (!result?.svg) {
            throw new Error(`pele failed to render Mermaid diagram:\n${child.value}`);
          }
          node.children[i] = {
            type: 'html',
            value: `<figure class="atif-diagram" role="figure" aria-label="Diagram"><div class="atif-diagram__canvas">${result.svg}</div></figure>`,
          };
          continue;
        }
        visit(child);
      }
    };

    visit(tree);
  };
}
