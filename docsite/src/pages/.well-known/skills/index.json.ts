import type { APIRoute } from 'astro';

const SKILL_INDEX = [
  {
    name: 'atif',
    description:
      'Agent Trajectory Interchange Format (ATIF v2.0) specification index, schemas, and migration references. Use when reading, generating, validating, consolidating, or migrating ATIF v1.x or v2.0 agent trajectories.',
    path: '/.well-known/skills/atif/SKILL.md',
  },
];

export const GET: APIRoute = () => {
  return new Response(JSON.stringify(SKILL_INDEX, null, 2) + '\n', {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
