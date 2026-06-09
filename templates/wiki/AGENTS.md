# Editing contract for this Basepage wiki

You are editing a **Basepage** wiki: plain markdown notes that compile to a linked
static site the owner controls. Basepage does no AI — you are the intelligence. Keep
changes small, legible, and reversible.

## Layout

```
basepage.json        Manifest: kind "wiki" + features (wikilinks, backlinks).
eleventy.config.mjs  Build config. No node_modules — don't add imports here.
src/
  _data/site.js      Exposes basepage.json to templates as `site`.
  _includes/         base.njk wraps every page; note.njk wraps notes + backlinks.
  index.njk          The wiki home (intro + list of all notes).
  notes/*.md         One markdown file per note. notes.json sets their layout/tag.
  css/style.css      All styling. Design tokens live in :root at the top.
```

## Rules

- **A note is a markdown file** in `src/notes/` with a `title` in its front matter.
  The title is how other notes link to it.
- **Link notes with wikilinks:** `[[Note title]]`, or `[[Note title|display text]]`.
  Basepage resolves them and builds the **backlinks** ("Linking here") shown on each
  note automatically — you never maintain backlinks by hand.
- Route the links/assets you write in templates through the `url` filter
  (`{{ note.url | url }}`, `{{ '/css/style.css' | url }}`).
- Site metadata (title, tagline, domain) lives **only** in `basepage.json` (`site.*`).
- Restyle by editing the `:root` design tokens first. Don't add scaffold dependencies.

## Caveat

In-content `[[wikilinks]]` render as root-relative links, so a wiki publishes cleanly
to a **custom domain** or runs locally. Sub-path publishing (a no-domain GitHub
project page at `/<repo>/`) will break those in-content links — set a `domain` in
`basepage.json` if you intend to publish a wiki.

## Commands (run by the human)

- `basepage serve` — live preview at http://localhost:8080
- `basepage build` — compile to `_site/`
- `basepage publish` — deploy to their domain
