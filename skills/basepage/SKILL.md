---
name: basepage
description: >-
  Build, design, and publish a website the user owns — a personal site, blog, or
  wiki — with the Basepage CLI. Use when the user wants to create or scaffold a site
  ("make me a website / blog / landing page / wiki", "build a site about X"), restyle
  or restructure an existing Basepage project, add pages or posts, run a local
  preview, or publish to GitHub Pages. Basepage owns the deterministic machinery
  (init / new / add / serve / build / publish); you supply the design and prose by
  editing plain files. Trigger on site-building intent, not on any mention of a URL.
---

# Basepage: build a site the user owns

Basepage is a small CLI that scaffolds, previews, and publishes a static site the
user owns outright (their files, their domain). **Basepage does no AI — you are the
intelligence.** It gives you deterministic primitives; you make the taste and content
decisions by editing files.

The split:
- **Structure** (kind, pages, posts, features) → run a Basepage command. Don't
  hand-write manifests, collections, or front matter — the commands get them right.
- **Design + prose** (CSS, templates, copy) → edit the files directly. This is your job.

A site has **one structure (kind)** set at `init`. You then **`add`** capabilities/
sections and **`new`** content onto it. Three verbs, three jobs — don't confuse them:
- **kind** (the site's structure) → `init --template <kind>`, or `restructure <kind>`
  to change an existing site. A kind is *what the site is* (wiki, blog, personal).
- **`add`** → a capability or section layered onto the site (`wikilinks`, `blog`
  section, `rss`). Never a kind — there is no `add wiki`.
- **`new`** → a content file (`page`, `post`, `note`).

## Workflow

1. **Set the structure from the user's intent** (table below) at creation. Always pass
   `--template` and `--yes` so `init` never blocks on a prompt:
   ```
   basepage init <dir> --template <kind> --title "<title>" --yes
   ```
   Pick the kind up front — don't init `blank` and then convert.
2. **Compose onto the site.** To change or extend an **existing** project, use
   `restructure`/`add`/`new` — never re-init a non-empty directory (init refuses, and
   copying a fresh scaffold over the top risks clobbering real content).
   - `basepage restructure wiki` — change an existing site's *structure* to a wiki.
   - `basepage add wikilinks` — enable the wiki *capability* (`[[links]]` + backlinks +
     a notes section) on any site, without changing its kind.
   - `basepage add blog` — add a blog *section* (posts + RSS) to any site, even a wiki.
   - `basepage new note <slug>` — a note (needs wikilinks).
   - `basepage new post <slug>` — a post (needs a blog).
   - `basepage new page <slug>` — a standalone page.
   - `basepage add <rss|syntax-highlight>` — enable a single feature.
3. **Design + write.** Edit `src/css/style.css` (start at the `:root` tokens) and the
   templates in `src/_includes/`. Write real copy into the markdown/`.njk` files. Take
   the look wherever the user asked.
4. **Preview.** `basepage serve` — it prints the localhost URL, and edits to content
   and CSS live-reload. Serve mode also injects local-only `Edit`/`+ New` tools for
   markdown pages/posts/notes. Use this to check your work.
5. **Publish** when the user approves: `basepage publish` (browser sign-in, no API
   keys — it reuses the GitHub CLI login if present). Set a `domain` in `basepage.json`
   first for a custom domain.

## Preset routing (intent → `--template`)

| User wants… | `--template` |
| --- | --- |
| a blog, posts, writing, essays, newsletter | `blog` |
| a résumé, portfolio, "about me", personal homepage | `personal` |
| a wiki, notes, knowledge base, digital garden, "second brain" | `wiki` |
| a landing page, "just a page", or anything that doesn't fit above | `blank` |

When unsure, start from `blank` and build up with `add`/`new` — a clean canvas is
easier to shape than undoing a preset's opinions. If the project **already exists**,
don't re-init: change its structure with `basepage restructure <kind>`, or layer on a
capability/section with `basepage add <wikilinks|blog|…>`.

## Project layout

```
basepage.json        Manifest: kind + features + title/tagline/domain. Source of truth.
eleventy.config.mjs  Build config. No node_modules — never add imports here.
AGENTS.md            Per-project editing contract (read it before editing).
src/
  _data/site.js      Exposes basepage.json to templates as `site`.
  _includes/         Layouts (base.njk wraps every page).
  index.njk          Home page.
  css/style.css      All styling; design tokens in :root at the top.
  posts/*.md         Posts (blog).   notes/*.md  Notes (wiki).
```

## Editing rules

- Route every internal link/asset through Eleventy's `url` filter:
  `{{ '/css/style.css' | url }}`, `{{ post.url | url }}`. Hard-coded paths break
  sub-path publishing.
- Site metadata (title, tagline, domain) lives **only** in `basepage.json`; templates
  read it via `site.*`. Don't duplicate it into content.
- Post front-matter `description` is metadata for SEO/sharing. Blog indexes should
  preview the actual post body, usually with `{{ post.templateContent | excerpt(36) }}`,
  rather than rendering `post.data.description`.
- Restyle by editing the `:root` tokens first, then rules.
- Features are data: enable them in `basepage.json` (via `add`), never by importing
  plugins in the scaffold config.

## Notes

- The `basepage` command should be on PATH (installed via `bun link`). If it isn't,
  run it as `bun run <path-to-basepage>/src/cli.ts <args>`.
- Wiki `[[wikilinks]]` render root-relative, so a wiki publishes cleanly to a custom
  domain or runs locally; set a `domain` before publishing a wiki (a no-domain GitHub
  project sub-path would break in-content wikilinks).
- Publish is human-gated: preview with `serve`, get the user's OK, then `publish`.
- Browser editing is local-only: `serve` injects the links and handles `/__edit`,
  `/__save`, `/__new`, and `/__create`; `build`/`publish` output stays plain static
  files. Saves are guarded to `.md` files under the site's `src/` directory, so
  templates like `src/index.njk` are not browser-editable.
