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
| `basepage capture <site> --title <s>` | Save stdin/body as a new page, post, or note in a registered site. |
| `basepage search [site\|all] <query>` | Search markdown in the current site or registered sites. |
| `basepage sites <add\|list\|default>` | Register sites in `~/.basepage/sites.json`. |
| `basepage add <capability>` | Enable a capability/section (blog, wikilinks, rss, syntax-highlight). |
| `basepage restructure <kind>` | Change an existing site's structure (blank\|personal\|blog\|wiki). |
| `basepage serve [dir]` | Live preview with reload and browser authoring tools. |
| `basepage build [dir]` | Compile to `_site/`. |
| `basepage publish [dir]` | Deploy to GitHub Pages. |
| `basepage unpublish [dir]` | Take the published site offline. |

`init` flags: `--template <blank\|personal\|blog\|wiki>` `--title` `--tagline` `--domain` `--yes`
`new` flags: `--title` `--dir` `--site`  ·  `capture` flags: `--to` `--type` `--title` `--body`
`search` flags: `--site` `--semantic` `--limit`  ·  `serve` flags: `--port`  ·  `build` flags: `--output` `--pathprefix`

```bash
# scaffold a blank canvas, make it a blog, write a post, preview
basepage init mysite --title "Field Notes" --yes
basepage add blog mysite
basepage new post "first ascent" --dir mysite
basepage serve mysite          # prints a localhost URL — edit in the browser or in src/
```

## Registered Sites And Search

Register sites once to use them from any working directory:

```bash
basepage sites add ~/sites/notes --as notes
basepage sites add ~/sites/blog --as blog
basepage sites default notes
```

The registry lives in `~/.basepage/sites.json` and stores paths plus cached metadata,
not source content. Content stays in each site's `src/` folder.

Once registered, commands can target sites by name:

```bash
basepage new note "git-backed history" --site notes
printf "Summary text" | basepage capture notes --title "Meeting summary" --type note --body -
basepage search notes "revision history"
basepage search all "publishing tradeoffs" --semantic
```

Plain search matches title, path, and markdown body text. `--semantic` uses a local,
zero-dependency ranking pass over tokens, stems, phrases, and character n-grams. It
does not call an embedding API or write a vector database yet, but the command shape is
ready for that later.

## How it works

Every project has a `basepage.json` declaring its kind and enabled features:

```json
{ "kind": "site", "features": ["blog", "rss"] }
```

The scaffold is dependency-free. Basepage runs its **own** bundled Eleventy against the
site folder and injects the manifest's opt-in features at build time — the posts
collection, date filters, RSS and JSON feeds, syntax highlighting, wikilinks/backlinks — so
the scaffold never imports plugins. `basepage add <feature>` just flips a manifest flag
(and drops in any presentation files); the build wiring is handled for you. The core
pipeline stays fixed: scaffold → persist → generate → view → publish.

### Local editing

`basepage serve` is also a tiny local authoring UI. In serve mode only, Basepage
injects local tools into generated HTML pages: `Edit` appears on pages backed by a
markdown source file under `src/`, and `+ New` appears everywhere. `Edit` opens a
same-port editor at `/__edit` with a title field, draft checkbox, and markdown body.
When multiple content types are enabled, `+ New` opens a small picker for page, post,
or note. Each choice goes straight to `/__new?type=...`, a blank editor for that
content type. New browser-created content defaults to `draft: true`.

Saving submits to `/__save` or `/__create`, updates source files, preserves unrelated
front matter, and lets Eleventy's watcher rebuild the preview immediately.
Template-backed pages like `src/index.njk` are not browser-editable, but they still
offer `+ New`.

The editor is never written into `basepage build` output, so published GitHub Pages
sites stay plain static files. Saves are path-guarded and only existing `.md` files
inside the site's `src/` directory can be written.

`draft: true` content is visible in `basepage serve`, but excluded from `basepage build`
and `basepage publish`. Uncheck `Draft` in the editor to publish it.

### Presets (`--template`)

`basepage init` defaults to **blank**. The interactive picker (or an agent reading your
intent) chooses a richer starting point:

- **blank** — one legible page, neutral tokenized CSS. The default canvas.
- **personal** — a résumé-style homepage.
- **blog** — posts + RSS/JSON feeds + a chronological index.
- **wiki** — linked notes with `[[wikilinks]]` and automatic backlinks.

Presets are deliberately understated **bones**, not finished looks — easy for the agent
to restyle in any direction.

Blog post `description` front matter is metadata for SEO and social sharing. Blog
indexes preview the actual post body with Basepage's `excerpt` filter instead of
rendering the description as visible copy.

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
