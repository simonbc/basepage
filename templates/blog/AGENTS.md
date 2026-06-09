# Editing contract for this Basepage blog

You are editing a **Basepage** blog: plain markdown posts that compile to a static site
the owner controls. Basepage does no AI — you are the intelligence. Keep changes small,
legible, and reversible.

## Layout

```
basepage.json        Manifest: kind + features (blog, rss) + title/tagline/domain.
eleventy.config.mjs  Build config. No node_modules — don't add imports here.
src/
  _data/site.js      Exposes basepage.json to templates as `site`.
  _includes/         base.njk wraps every page; post.njk wraps posts.
  index.njk          The home page — a chronological list of posts.
  posts/*.md         One markdown file per post. posts.json sets their layout/tag.
  css/style.css      All styling. Design tokens live in :root at the top.
```

## Rules

- **A post is a markdown file** in `src/posts/`, named `YYYY-MM-DD-slug.md`, with
  `title` and `date` in its front matter. Create one with `basepage new post <slug>`.
- The posts collection, `readableDate`/`isoDate` filters, and the `/feed.xml` Atom feed
  come from the `blog`/`rss` features — they're injected at build time, not defined in
  the scaffold config.
- Always route internal links/assets through the `url` filter:
  `{{ '/css/style.css' | url }}`, `{{ post.url | url }}`.
- Site metadata (title, tagline, domain) lives **only** in `basepage.json` (`site.*`).
- Restyle by editing the `:root` design tokens first.

## Commands (run by the human, or by you on their behalf)

- `basepage new post <slug>` — start a new post
- `basepage serve` — live preview at http://localhost:8080 with local Edit links for markdown files
- `basepage build` — compile to `_site/`
- `basepage publish` — deploy to GitHub Pages
