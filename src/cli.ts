#!/usr/bin/env bun
import { basename, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { initSite } from "./commands/init.ts";
import { serve } from "./commands/serve.ts";
import { build, formatBytes } from "./commands/build.ts";
import { publish, unpublish } from "./commands/publish.ts";
import { newContent } from "./commands/new.ts";
import { searchSite, type SearchResult } from "./commands/search.ts";
import { addFeature, ADD_TARGETS } from "./commands/add.ts";
import { restructure } from "./commands/restructure.ts";
import { basepageHome, readRegistry, registerSite, setDefaultSite } from "./lib/basepage-home.ts";
import { listTemplates, describeTemplates, resolveTemplateChoice } from "./lib/scaffold.ts";
import { resolveSiteDir } from "./lib/site-resolver.ts";
import type { Interface as ReadlineInterface } from "node:readline/promises";

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
  const interactive = stdin.isTTY && flags.yes !== true;

  let template = str(flags.template);
  let title = str(flags.title);
  let tagline = str(flags.tagline);
  let domain = str(flags.domain);

  if (interactive) {
    const rl = createInterface({ input: stdin, output: stdout });
    try {
      if (!template) template = await pickTemplate(rl);
      const defTitle = title ?? toTitle(basename(dir));
      title = (await rl.question(`\nSite title (${defTitle}): `)).trim() || defTitle;
      tagline = (await rl.question(`Tagline${tagline ? ` (${tagline})` : ""}: `)).trim() || tagline;
      domain =
        (await rl.question(`Custom domain (optional)${domain ? ` (${domain})` : ""}: `)).trim() ||
        domain;
    } finally {
      rl.close();
    }
  }

  const { dir: created, template: used } = initSite({ dir, template: template ?? "blank", title, tagline, domain });
  const rel = relativeOrDot(created);
  console.log(`\n✓ Created a "${used}" basepage in ${rel}\n`);
  console.log("Next:");
  if (rel !== ".") console.log(`  cd ${rel}`);
  console.log("  basepage serve     # live preview; prints the localhost URL");
  console.log("  …use Edit/+ New in the browser, or edit src/ directly\n");
}

/** Ask which kind of site to scaffold, looping until a valid choice. */
async function pickTemplate(rl: ReadlineInterface): Promise<string> {
  const choices = describeTemplates();
  const names = choices.map((c) => c.name);

  console.log("\nWhat are you building?");
  choices.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.label}${i === 0 ? "  (default)" : ""}\n     ${c.blurb}`);
  });

  while (true) {
    const answer = await rl.question("\nChoose a number [1]: ");
    const choice = resolveTemplateChoice(answer, names);
    if (choice === "empty") return names[0];
    if (choice === "invalid") {
      console.log(`  Enter a number between 1 and ${names.length}.`);
      continue;
    }
    return choice.name;
  }
}

async function cmdServe(positionals: string[], flags: Record<string, string | boolean>) {
  const dir = resolve(positionals[0] ?? ".");
  const requestedPort = flags.port ? Number(flags.port) : undefined;
  const { port } = await serve(dir, { port: requestedPort });
  console.log(`Serving ${relativeOrDot(dir)} at http://localhost:${port} — Ctrl-C to stop\n`);
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

async function cmdNew(positionals: string[], flags: Record<string, string | boolean>) {
  const type = positionals[0];
  const name = positionals[1];
  if (type !== "page" && type !== "post" && type !== "note") {
    throw new Error("Usage: basepage new <page|post|note> <name>");
  }
  if (!name) throw new Error(`Usage: basepage new ${type} <name>`);
  const dir = resolveSiteDir({ site: str(flags.site), dir: str(flags.dir) });
  const { path } = newContent({ siteDir: dir, type, name, title: str(flags.title) });
  console.log(`✓ Created ${relativeOrDot(path)}`);
}

async function cmdCapture(positionals: string[], flags: Record<string, string | boolean>) {
  const to = str(flags.to) || str(flags.site) || positionals[0];
  const type = str(flags.type) || "note";
  const title = str(flags.title);
  if (!to) throw new Error("Usage: basepage capture <site> --title <title> [--type note|post|page] [--body <text>|--body -]");
  if (type !== "page" && type !== "post" && type !== "note") throw new Error("--type must be page, post, or note.");
  if (!title) throw new Error("--title is required.");

  const bodyFlag = str(flags.body);
  const body = bodyFlag === "-" || bodyFlag === undefined ? await readStdinIfAvailable() : bodyFlag;
  const dir = resolveSiteDir({ site: to });
  const { path } = newContent({ siteDir: dir, type, name: str(flags.name) || title, title, body });
  console.log(`✓ Captured ${type} in ${relativeOrDot(path)}`);
}

async function cmdSites(positionals: string[], flags: Record<string, string | boolean>) {
  const subcommand = positionals[0] || "list";
  const home = str(flags.home) || basepageHome();

  if (subcommand === "add") {
    const dir = resolve(positionals[1] ?? ".");
    const alias = str(flags.as);
    const site = registerSite(dir, { alias, home });
    console.log(`✓ Registered ${alias || basename(dir)} → ${site.path}`);
    return;
  }

  if (subcommand === "list") {
    const registry = readRegistry(home);
    const names = Object.keys(registry.sites).sort();
    if (!names.length) {
      console.log("No registered sites. Run `basepage sites add <dir> --as <name>`.");
      return;
    }
    for (const name of names) {
      const site = registry.sites[name];
      const marker = registry.defaults.site === name ? " (default)" : "";
      console.log(`${name}${marker}\t${site.path}`);
    }
    return;
  }

  if (subcommand === "default") {
    const alias = positionals[1];
    if (!alias) throw new Error("Usage: basepage sites default <name>");
    setDefaultSite(alias, { home });
    console.log(`✓ Default site is ${alias}`);
    return;
  }

  throw new Error("Usage: basepage sites <add|list|default>");
}

async function cmdSearch(positionals: string[], flags: Record<string, string | boolean>) {
  const limit = flags.limit ? Number(flags.limit) : undefined;
  const semantic = flags.semantic === true;
  const registry = readRegistry();
  const first = positionals[0];
  const siteArg = str(flags.site) || (first && (first === "all" || registry.sites[first]) ? first : undefined);
  const queryParts = siteArg && siteArg === first ? positionals.slice(1) : positionals;
  const query = queryParts.join(" ").trim();
  if (!query) throw new Error("Usage: basepage search [site|all] <query> [--semantic] [--limit n]");

  if (siteArg === "all") {
    const results = Object.entries(registry.sites).flatMap(([name, site]) =>
      searchSite(site.path, query, { semantic, limit }).map((result) => ({ ...result, site: name })),
    );
    printSearchResults(results.sort((a, b) => b.score - a.score).slice(0, limit ?? 10));
    return;
  }

  const dir = resolveSiteDir({ site: siteArg });
  printSearchResults(searchSite(dir, query, { semantic, limit }));
}

async function cmdAdd(positionals: string[]) {
  const target = positionals[0];
  if (!target) throw new Error(`Usage: basepage add <${ADD_TARGETS.join("|")}>`);
  const dir = resolve(positionals[1] ?? ".");
  const { added, createdFiles } = addFeature(dir, target);
  console.log(`✓ Enabled ${added.join(" + ")}`);
  for (const f of createdFiles) console.log(`  + ${f}`);
}

async function cmdRestructure(positionals: string[]) {
  const kind = positionals[0];
  if (!kind) throw new Error("Usage: basepage restructure <blank|personal|blog|wiki>");
  const dir = resolve(positionals[1] ?? ".");
  const { createdFiles } = restructure(dir, kind);
  console.log(`✓ Restructured as a ${kind}`);
  for (const f of createdFiles) console.log(`  + ${f}`);
}

function toTitle(slug: string): string {
  return slug.replace(/[-_]+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase()) || "My Basepage";
}

function relativeOrDot(target: string): string {
  const rel = relative(process.cwd(), resolve(target));
  return rel === "" ? "." : rel;
}

async function readStdinIfAvailable(): Promise<string> {
  if (stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function printSearchResults(results: Array<SearchResult & { site?: string }>): void {
  if (!results.length) {
    console.log("No matches.");
    return;
  }
  for (const result of results) {
    const site = result.site ? `[${result.site}] ` : "";
    console.log(`${site}${result.title}  ${result.url}`);
    console.log(`  ${result.file}`);
    if (result.excerpt) console.log(`  ${result.excerpt}`);
  }
}

function usage() {
  console.log(`basepage ${VERSION} — own your corner of the web, edited by your agent

Usage:
  basepage init [dir]        Scaffold a new site (interactive; blank canvas by default)
  basepage new <page|post|note> <name>   Add a page, post, or note
  basepage capture <site> --title <s>     Save stdin/body as a new page, post, or note
  basepage search [site|all] <query>      Search registered or current-site markdown
  basepage sites <add|list|default>       Register sites in ~/.basepage/sites.json
  basepage add <capability>  Enable a capability/section (${ADD_TARGETS.join(", ")})
  basepage restructure <kind>   Change the site's structure (blank|personal|blog|wiki)
  basepage serve [dir]       Live preview with reload + local authoring tools
  basepage build [dir]       Compile to _site/
  basepage publish [dir]     Deploy to GitHub Pages (browser sign-in, no keys)
  basepage unpublish [dir]   Take the published site offline

init flags:   --template <${listTemplates().join("|")}>  --title <s>  --tagline <s>  --domain <s>  --yes
new flags:    --title <s>  --dir <dir>  --site <name>
capture flags: --to <name>  --type <note|post|page>  --title <s>  --body <s|->
search flags: --site <name>  --semantic  --limit <n>
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
    case "new":
      return cmdNew(positionals, flags);
    case "capture":
      return cmdCapture(positionals, flags);
    case "sites":
      return cmdSites(positionals, flags);
    case "search":
      return cmdSearch(positionals, flags);
    case "add":
      return cmdAdd(positionals);
    case "restructure":
      return cmdRestructure(positionals);
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
