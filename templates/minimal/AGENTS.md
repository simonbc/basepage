# Editing contract for this Basepage site (minimal)

A single-page card. Plain files the owner controls; Basepage does no AI — you are the
intelligence. Keep changes small and reversible.

## Layout

```
basepage.json        Manifest: kind + features + title/tagline/domain.
eleventy.config.mjs  Build config. No node_modules — don't add imports here.
src/
  _data/site.js      Exposes basepage.json to the page as `site`.
  index.njk          The one page.
  css/style.css      All styling. Design tokens live in :root at the top.
```

## Rules

- Route assets through Eleventy's `url` filter: `{{ '/css/style.css' | url }}`.
- Site metadata (title, tagline, domain) lives only in `basepage.json` (`site.*`).
- Restyle by editing `:root` tokens first. Don't add scaffold dependencies.

## Commands (run by the human)

- `basepage serve` — live preview at http://localhost:8080
- `basepage build` — compile to `_site/`
- `basepage publish` — deploy to their domain
