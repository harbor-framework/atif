import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

const stringOrNumber = z.union([z.string(), z.number()]).transform((v) => String(v));
const isoDate = z
  .union([z.string(), z.date()])
  .transform((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v));

/**
 * Immutable specification frontmatter contract (Plan Section 4.1).
 * `status` is strictly "draft" | "final"; `superseded_by` is forbidden by `.strict()`.
 */
export const specFrontmatterSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1),
    atif_version: stringOrNumber,
    schema_version: z.string().optional(),
    status: z.enum(['draft', 'final']),
    release_date: isoDate,
    doc_type: z.enum(['spec', 'changelog', 'reference']),
    order: z.number(),
    source_ref: z.string().optional(),
    supersedes: stringOrNumber.optional(),
  })
  .strict();

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema(),
  }),
  specs: defineCollection({
    loader: glob({
      base: '../spec',
      pattern: '**/*.md',
      generateId: ({ entry }) => entry.replace(/\.md$/i, ''),
    }),
    schema: specFrontmatterSchema,
  }),
};
