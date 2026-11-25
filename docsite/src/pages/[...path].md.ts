import type { APIRoute, GetStaticPaths } from 'astro';
import { collectAllMarkdownMirrors } from '../lib/markdown-renderer';

export const getStaticPaths: GetStaticPaths = () => {
  const mirrors = collectAllMarkdownMirrors();
  return mirrors.map((doc) => ({
    params: { path: doc.routeKey },
    props: { content: doc.content },
  }));
};

export const GET: APIRoute = ({ props }) => {
  const { content } = props as { content: string };
  return new Response(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
};
