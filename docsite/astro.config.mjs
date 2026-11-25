import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { buildStarlightSidebar, getSiteUrl } from './src/lib/spec-loader';
import { rehypeAtifSpec } from './src/lib/rehype-spec';

const siteUrl = getSiteUrl().replace(/\/+$/, '');

export default defineConfig({
  site: siteUrl,
  output: 'static',
  trailingSlash: 'ignore',
  markdown: {
    processor: unified({
      rehypePlugins: [rehypeAtifSpec],
    }),
  },
  integrations: [
    starlight({
      title: 'ATIF',
      description:
        'Agent Trajectory Interchange Format — Open standard for streaming AI agent events, consolidated trajectories, canonical actions, and warehouse analytics.',
      favicon: '/favicon.svg',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/harbor-framework/atif',
        },
      ],
      customCss: ['./src/styles/custom.css'],
      expressiveCode: {
        themes: ['github-dark-default', 'github-light-default'],
        styleOverrides: {
          borderRadius: '0.45rem',
          borderColor: 'var(--atif-border)',
          codeFontFamily: "var(--sl-font-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
          codeFontSize: '0.845rem',
          codeLineHeight: '1.65',
          frames: {
            editorActiveTabIndicatorTopColor: 'var(--atif-accent)',
            frameBoxShadowCssValue: 'none',
          },
        },
      },
      components: {
        Head: './src/components/starlight/Head.astro',
        SiteTitle: './src/components/starlight/SiteTitle.astro',
        Header: './src/components/starlight/Header.astro',
        PageTitle: './src/components/starlight/PageTitle.astro',
        Footer: './src/components/starlight/Footer.astro',
      },
      sidebar: buildStarlightSidebar(),
      credits: false,
      pagination: true,
    }),
    react(),
    sitemap({
      customPages: [`${siteUrl}/.well-known/skills/atif/SKILL.md`],
    }),
  ],
});
