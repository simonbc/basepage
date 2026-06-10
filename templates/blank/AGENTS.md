# Editing contract for this Basepage site

You are editing a **Basepage** site: plain source files that compile to a static site
the owner controls. This started as a **blank canvas** — one legible page, nothing
assumed. Your job is to shape it from the owner's prompts. Basepage does no AI; you are
the intelligence. Keep changes small, legible, and reversible.

## Layout

```
basepage.json        Manifest: kind + enabled features + title/tagline/domain.
eleventy.config.mjs  Build config. No node_modules — don't add imports here.
src/
  _data/site.js      Exposes basepage.json to templates as `site`.
  _includes/base.njk The page shell every page uses.
  index.njk          The home page.
  css/style.css      All styling. Design tokens live in :root at the top.
```

## How to evolve it

- **Design** = `src/css/style.css` (start with the `:root` tokens) + the `_includes/`
  templates. Take it anywhere the owner asks.
- **Add a page** → `basepage new page <slug>` (creates `src/<slug>.md`), then write it.
- **Make it a blog** → `basepage add blog`, then `basepage new post <slug>` per post.
- **Other features** → `basepage add <rss|wikilinks|syntax-highlight>`. Features are
  declared in `basepage.json` and injected by Basepage at build time.
- Always route internal links/assets through the `url` filter:
  `{{ '/css/style.css' | url }}`, `{{ page.url | url }}`.
- Site metadata (title, tagline, domain) lives **only** in `basepage.json` (`site.*`).

## Commands (run by the human, or by you on their behalf)

- `basepage serve` — live preview with local Edit/+ New tools for markdown content
- `basepage build` — compile to `_site/`
- `basepage publish` — deploy to GitHub Pages
