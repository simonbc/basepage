# Basepage

A small CLI for owning a personal website by talking to an AI agent. The agent edits
plain source files — markdown content **and** the templates/CSS — and Basepage turns
them into a static site you serve from your own domain. Basepage does no AI: you bring
your own agent (Claude Code, Codex, a local model). Basepage provides the deterministic
machinery the agent can't — scaffold, preview, publish.

Your files, your domain, your model.

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
| `basepage init [dir]` | Scaffold a new site (interactive; `--yes` to skip prompts). |
| `basepage serve [dir]` | Live preview with reload on every content/CSS edit. |
| `basepage build [dir]` | Compile to `_site/`. |

`init` flags: `--template <default\|minimal>` `--title` `--tagline` `--domain` `--yes`
`serve` flags: `--port`  ·  `build` flags: `--output` `--pathprefix`

```bash
bun run src/cli.ts init mysite --title "Ada Lovelace" --domain ada.dev
cd mysite
basepage serve          # http://localhost:8080 — edit src/ and watch it reload
```

## How it works

A content **kind** = a template + a default feature manifest. Every project has a
`basepage.json` declaring its kind and enabled features:

```json
{ "kind": "site", "features": ["rss"] }
```

The scaffold is dependency-free. Basepage runs its **own** bundled Eleventy against the
site folder and layers the manifest's opt-in plugins (RSS, syntax highlighting, …) in
programmatically at build time — the scaffold never imports them. Adding a feature is a
bundled plugin a kind can enable; adding a kind is a template plus a default manifest.
Neither touches the core pipeline: scaffold → persist → generate → view → publish.

### Templates (kinds)

- **default** — résumé + blog, with an RSS feed. Light/dark via `:root` tokens.
- **minimal** — a one-page card.

## Development

```bash
bun test        # manifest, scaffolding, and build machinery
```

Built with TypeScript + Bun, Eleventy bundled as a dependency.
