# Editing contract for this Basepage site

You are editing a **Basepage** project: plain source files that compile to a static
site the owner controls. Basepage does no AI — you are the intelligence. Keep changes
small, legible, and reversible.

## Layout

```
basepage.json        Manifest: kind + enabled features + title/tagline/domain.
eleventy.config.mjs  Build config. No node_modules — don't add imports here.
src/
  _data/site.js      Exposes basepage.json to templates as `site`.
  _includes/         Layouts (base.njk wraps every page; post.njk wraps posts).
  index.njk          The homepage (résumé).
  blog.njk           The writing index.
  posts/*.md         One markdown file per post. posts.json sets their layout/tag.
  css/style.css      All styling. Design tokens live in :root at the top.
AGENTS.md            This file.
```

## Rules

- **Content** is markdown/Nunjucks in `src/`. **Design** is `src/css/style.css` plus
  the `_includes/` templates. Both are fair game — restyling by prompt is the point.
- Always route internal links and assets through Eleventy's `url` filter:
  `{{ '/css/style.css' | url }}`, `{{ post.url | url }}`. Hard-coded paths break when
  the site is published to a sub-path.
- Site metadata (title, tagline, domain) lives **only** in `basepage.json`. Templates
  read it via `site.*`. Don't duplicate it into content.
- To restyle, prefer editing the `:root` design tokens before touching rules.
- Don't add dependencies to the scaffold or import plugins in `eleventy.config.mjs`.
  Features are enabled in `basepage.json` and injected by Basepage at build time.
- A new post is a new file in `src/posts/` with `title` + `date` front matter.

## Commands (run by the human)

- `basepage serve` — live preview at http://localhost:8080
- `basepage build` — compile to `_site/`
- `basepage publish` — deploy to their domain
