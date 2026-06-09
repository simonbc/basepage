#!/usr/bin/env bun
import { basename, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { initSite } from "./commands/init.ts";
import { serve } from "./commands/serve.ts";
import { build, formatBytes } from "./commands/build.ts";
import { publish, unpublish } from "./commands/publish.ts";
import { listTemplates } from "./lib/scaffold.ts";

const VERSION = "0.1.0";

/** Tiny flag parser: `--key value`, `--key=value`, and `--bool`. Returns positionals + flags. */
function parseArgs(argv: string[]) {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      if (eq !== -1) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        flags[body] = argv[++i];
      } else {
        flags[body] = true;
      }
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, flags };
}

const str = (v: string | boolean | undefined): string | undefined =>
  typeof v === "string" ? v : undefined;

async function cmdInit(positionals: string[], flags: Record<string, string | boolean>) {
  const dir = resolve(positionals[0] ?? ".");
  const template = str(flags.template) ?? "default";
  const interactive = stdin.isTTY && flags.yes !== true;

  let title = str(flags.title);
  let tagline = str(flags.tagline);
  let domain = str(flags.domain);

  if (interactive) {
    const rl = createInterface({ input: stdin, output: stdout });
    try {
      const defTitle = title ?? toTitle(basename(dir));
      title = (await rl.question(`Site title (${defTitle}): `)).trim() || defTitle;
      tagline = (await rl.question(`Tagline${tagline ? ` (${tagline})` : ""}: `)).trim() || tagline;
      domain =
        (await rl.question(`Custom domain (optional)${domain ? ` (${domain})` : ""}: `)).trim() ||
        domain;
    } finally {
      rl.close();
    }
  }

  const { dir: created } = initSite({ dir, template, title, tagline, domain });
  const rel = relativeOrDot(created);
  console.log(`\n✓ Created a "${template}" basepage in ${rel}\n`);
  console.log("Next:");
  if (rel !== ".") console.log(`  cd ${rel}`);
  console.log("  basepage serve     # live preview at http://localhost:8080");
  console.log("  …edit src/ and src/css/style.css — the browser reloads as you go\n");
}

async function cmdServe(positionals: string[], flags: Record<string, string | boolean>) {
  const dir = resolve(positionals[0] ?? ".");
  const port = flags.port ? Number(flags.port) : 8080;
  console.log(`Serving ${relativeOrDot(dir)} at http://localhost:${port} — Ctrl-C to stop\n`);
  await serve(dir, { port });
}

async function cmdBuild(positionals: string[], flags: Record<string, string | boolean>) {
  const dir = resolve(positionals[0] ?? ".");
  const { output, fileCount, bytes } = await build(dir, {
    output: str(flags.output),
    pathPrefix: str(flags.pathprefix),
  });
  console.log(`✓ Built ${fileCount} files (${formatBytes(bytes)}) to ${relativeOrDot(output)}`);
}

async function cmdPublish(positionals: string[]) {
  const dir = resolve(positionals[0] ?? ".");
  const { url, plan, repoCreated } = await publish(dir);

  console.log(`\n✓ Published to ${url}`);
  if (repoCreated) console.log("  (first deploy can take a minute to go live)");

  if (plan.dns && plan.cname) {
    console.log(`\nTo point ${plan.cname} at GitHub, add these DNS records at your registrar:`);
    for (const r of plan.dns) {
      console.log(`  ${r.type.padEnd(5)} ${r.host.padEnd(6)} ${r.value}`);
    }
    console.log("\nThe site is live at the github.io URL now; the custom domain works once DNS propagates.");
  }
}

async function cmdUnpublish(positionals: string[]) {
  const dir = resolve(positionals[0] ?? ".");
  const { repo, removed } = await unpublish(dir);
  console.log(removed ? `✓ Took ${repo} offline.` : `${repo} was not published.`);
}

function toTitle(slug: string): string {
  return slug.replace(/[-_]+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase()) || "My Basepage";
}

function relativeOrDot(target: string): string {
  const rel = relative(process.cwd(), resolve(target));
  return rel === "" ? "." : rel;
}

function usage() {
  console.log(`basepage ${VERSION} — own your corner of the web, edited by your agent

Usage:
  basepage init [dir]      Scaffold a new site (interactive)
  basepage serve [dir]     Live preview with reload on every edit
  basepage build [dir]     Compile to _site/
  basepage publish [dir]   Deploy to GitHub Pages (browser sign-in, no keys)
  basepage unpublish [dir] Take the published site offline

init flags:   --template <${listTemplates().join("|")}>  --title <s>  --tagline <s>  --domain <s>  --yes
serve flags:  --port <n>
build flags:  --output <dir>  --pathprefix </repo/>
`);
}

async function main() {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  const command = positionals.shift();

  if (flags.version || command === "version") return console.log(VERSION);
  if (!command || flags.help || command === "help") return usage();

  switch (command) {
    case "init":
      return cmdInit(positionals, flags);
    case "serve":
      return cmdServe(positionals, flags);
    case "build":
      return cmdBuild(positionals, flags);
    case "publish":
      return cmdPublish(positionals);
    case "unpublish":
      return cmdUnpublish(positionals);
    default:
      console.error(`Unknown command: ${command}\n`);
      usage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\n✗ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
