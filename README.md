# Basepage

A small CLI for owning a website by talking to an AI agent. The agent edits plain
source files — markdown content **and** the templates/CSS — and Basepage turns them
into a static site you serve from your own domain. Basepage does no AI: you bring your
own agent (Claude Code, Codex, a local model). Basepage provides the deterministic
machinery the agent can't — scaffold, add structure, preview, publish.

Your files, your domain, your model.

## As an agent tool

Basepage is built to be driven by an agent. `init` scaffolds a **blank, legible
canvas** by default — the agent shapes it from your prompt by editing files and running
deterministic commands. There's a bundled Claude skill (`skills/basepage/SKILL.md`) so
you can just say:

> "Build me a blog about climbing, dark and minimal, then preview it."

and the agent picks a starting preset, scaffolds it, writes a post, restyles the
tokens, and serves it. Install the skill with `cp -r skills/basepage ~/.claude/skills/`.

The boundary: **structure** (kind, pages, posts, features) is deterministic CLI
commands; **design + prose** is the agent editing files.

## Install

```bash
bun install
```

The CLI runs with [Bun](https://bun.sh):

```bash
bun run src/cli.ts <command>     # or, once linked: basepage <command>
```

## Commands

| Command | What it does |
| --- | --- |
| `basepage init [dir]` | Scaffold a new site with a structure (blank canvas by default). |
| `basepage new <page\|post\|note> <name>` | Add content. |
| `basepage add <capability>` | Enable a capability/section (blog, wikilinks, rss, syntax-highlight). |
| `basepage restructure <kind>` | Change an existing site's structure (blank\|personal\|blog\|wiki). |
| `basepage serve [dir]` | Live preview with reload and browser edit links for markdown files. |
| `basepage build [dir]` | Compile to `_site/`. |
| `basepage publish [dir]` | Deploy to GitHub Pages. |
| `basepage unpublish [dir]` | Take the published site offline. |

`init` flags: `--template <blank\|personal\|blog\|wiki>` `--title` `--tagline` `--domain` `--yes`
`new` flags: `--title` `--dir`  ·  `serve` flags: `--port`  ·  `build` flags: `--output` `--pathprefix`

```bash
# scaffold a blank canvas, make it a blog, write a post, preview
basepage init mysite --title "Field Notes" --yes
basepage add blog mysite
basepage new post "first ascent" --dir mysite
basepage serve mysite          # http://localhost:8080 — edit in the browser or in src/
```

## How it works

Every project has a `basepage.json` declaring its kind and enabled features:

```json
{ "kind": "site", "features": ["blog", "rss"] }
```

The scaffold is dependency-free. Basepage runs its **own** bundled Eleventy against the
site folder and injects the manifest's opt-in features at build time — the posts
collection, date filters, the RSS feed, syntax highlighting, wikilinks/backlinks — so
the scaffold never imports plugins. `basepage add <feature>` just flips a manifest flag
(and drops in any presentation files); the build wiring is handled for you. The core
pipeline stays fixed: scaffold → persist → generate → view → publish.

### Local editing

`basepage serve` is also a tiny local editor. In serve mode only, Basepage injects an
`Edit` link into every generated HTML page backed by a markdown source file under
`src/`. The link opens a same-port editor at `/__edit` with a title field and markdown
body. Saving submits to `/__save`, updates the source file, preserves all other front
matter, and lets Eleventy's watcher rebuild the preview immediately. Template-backed
pages like `src/index.njk` are not browser-editable.

The editor is never written into `basepage build` output, so published GitHub Pages
sites stay plain static files. Saves are path-guarded and only existing `.md` files
inside the site's `src/` directory can be written.

### Presets (`--template`)

`basepage init` defaults to **blank**. The interactive picker (or an agent reading your
intent) chooses a richer starting point:

- **blank** — one legible page, neutral tokenized CSS. The default canvas.
- **personal** — a résumé-style homepage.
- **blog** — posts + an RSS feed + a chronological index.
- **wiki** — linked notes with `[[wikilinks]]` and automatic backlinks.

Presets are deliberately understated **bones**, not finished looks — easy for the agent
to restyle in any direction.

## Publishing

`basepage publish` deploys to GitHub Pages with **no API keys**. It signs in with
your browser via GitHub's device flow (or borrows the [GitHub CLI](https://cli.github.com)
token if you're already logged in), caching the result in `~/.basepage/token`.

- **No domain** → a project repo named after the folder, served at
  `<you>.github.io/<repo>/` (built with `--pathprefix=/<repo>/`).
- **Custom domain** (set `domain` in `basepage.json`) → a repo named after the domain,
  a `CNAME` file, the Pages custom domain set, and the registrar DNS records printed
  (apex → four A records; subdomain → a CNAME).

The build is pushed to a `gh-pages` branch (`main` stays the default branch).
`basepage unpublish` removes that branch to take the site offline; the repo is kept.

## Development

```bash
bun test        # manifest, scaffolding, and build machinery
```

Built with TypeScript + Bun, Eleventy bundled as a dependency.
