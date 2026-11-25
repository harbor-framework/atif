import fs from 'node:fs';
import type { APIRoute, GetStaticPaths } from 'astro';
import { discoverSpecVersions } from '../../../lib/spec-loader';

export const getStaticPaths: GetStaticPaths = () => {
  const versions = discoverSpecVersions();
  const paths: Array<{
    params: { version: string; file: string };
    props: { filePath: string; fileName: string };
  }> = [];

  for (const v of versions) {
    for (const asset of v.examples) {
      paths.push({
        params: { version: v.dirName, file: asset.fileName },
        props: { filePath: asset.filePath, fileName: asset.fileName },
      });
    }
  }

  return paths;
};

export const GET: APIRoute = ({ props }) => {
  const { filePath, fileName } = props as { filePath: string; fileName: string };
  const bytes = fs.readFileSync(filePath);
  const contentType = fileName.endsWith('.json')
    ? 'application/json; charset=utf-8'
    : 'text/plain; charset=utf-8';

  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': contentType,
    },
  });
};
