#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { initSite } from "./commands/init.ts";
import { serve } from "./commands/serve.ts";
import { build, formatBytes } from "./commands/build.ts";
import { publish, unpublish } from "./commands/publish.ts";
import { checkDomain, setDomain, type DomainCheckResult } from "./commands/domain.ts";
import { newContent } from "./commands/new.ts";
import { searchSite, type SearchResult } from "./commands/search.ts";
import { indexSite, refreshSemanticIndexIfReady, searchSemanticIndex } from "./commands/index.ts";
import { addFeature, ADD_TARGETS } from "./commands/add.ts";
import { restructure } from "./commands/restructure.ts";
import { autoRegisterSite, basepageHome, readRegistry, setDefaultSite } from "./lib/basepage-home.ts";
import { manifestPath } from "./lib/manifest.ts";
import { listTemplates, describeTemplates, resolveTemplateChoice } from "./lib/scaffold.ts";
import { resolveSiteDir } from "./lib/site-resolver.ts";
import { ensureSiteHistory } from "./lib/site-history.ts";
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
  const existing = existsSync(manifestPath(dir));
  if (existing) {
    ensureSiteHistory(dir);
    const registered = autoRegisterSite(dir);
    console.log(`\n✓ Already a Basepage site in ${relativeOrDot(dir)}`);
    console.log("✓ Local git history is ready");
    console.log(`✓ Remembered as "${registered.alias}"${registered.defaulted ? " (default)" : ""}\n`);
    console.log("Next:");
    console.log("  basepage serve     # live preview; prints the localhost URL");
    console.log("  …use Edit/+ New in the browser, or edit src/ directly\n");
    return;
  }

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
  const registered = autoRegisterSite(created);
  const rel = relativeOrDot(created);
  console.log(`\n✓ Created a "${used}" basepage in ${rel}\n`);
  console.log(`✓ Remembered as "${registered.alias}"${registered.defaulted ? " (default)" : ""}\n`);
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

async function cmdPublish(positionals: string[], flags: Record<string, string | boolean>) {
  const dir = resolveSiteDir({ site: str(flags.site), dir: positionals[0] });
  const domain = str(flags.domain);
  if (domain) {
    const result = setDomain(dir, domain);
    console.log(`✓ Domain set to ${result.domain}`);
  }

  const { url, plan, repoCreated, login } = await publish(dir);

  if (plan.dns && plan.cname) {
    console.log(`\n✓ Published the GitHub Pages deploy for ${plan.cname}`);
    console.log(`  Repo: https://github.com/${login}/${plan.repo}`);
    if (repoCreated) console.log("  First deploys can take a minute to finish on GitHub.");
    console.log(`\n${url} will not work until DNS points at GitHub Pages.`);
    console.log("Add these DNS records at your registrar:");
    for (const r of plan.dns) {
      console.log(`  ${r.type.padEnd(5)} ${r.host.padEnd(6)} ${r.value}`);
    }
    try {
      const check = await checkDomain(dir, { domain: plan.cname, login });
      printPublishDomainStatus(check);
    } catch {
      console.log("\nDNS status could not be checked automatically.");
    }
    console.log("\nNext:");
    console.log("  1. Add/update the DNS records above.");
    console.log("  2. Wait for DNS to propagate.");
    console.log("  3. Run `basepage domain check` to confirm the domain is ready.");
    return;
  }

  console.log(`\n✓ Published to ${url}`);
  if (repoCreated) console.log("  First deploys can take a minute to finish on GitHub.");
}

async function cmdDomain(positionals: string[], flags: Record<string, string | boolean>) {
  const subcommand = positionals[0] || "check";

  if (subcommand === "set") {
    const domain = positionals[1];
    if (!domain) throw new Error("Usage: basepage domain set <domain> [dir]");
    const dir = resolveSiteDir({ site: str(flags.site), dir: positionals[2] });
    const result = setDomain(dir, domain);
    console.log(`✓ Domain set to ${result.domain}`);
    console.log(`Run \`basepage domain check\` after updating DNS.`);
    return;
  }

  if (subcommand === "check") {
    const domainArg = positionals[1] && looksLikeDomain(positionals[1]) ? positionals[1] : undefined;
    const dir = resolveSiteDir({ site: str(flags.site), dir: positionals[domainArg ? 2 : 1] });
    const result = await checkDomain(dir, { domain: domainArg, login: str(flags.login) });
    printDomainCheck(result);
    return;
  }

  throw new Error("Usage: basepage domain <set|check> [domain] [dir]");
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
  const site = str(flags.site);
  const dir = resolveSiteDir({ site, dir: str(flags.dir) });
  const { path } = newContent({ siteDir: dir, type, name, title: str(flags.title) });
  await refreshSemanticIndexIfReady({ site, siteDir: dir });
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
  await refreshSemanticIndexIfReady({ site: to, siteDir: dir });
  console.log(`✓ Captured ${type} in ${relativeOrDot(path)}`);
}

async function cmdSites(positionals: string[], flags: Record<string, string | boolean>) {
  const subcommand = positionals[0] || "list";
  const home = str(flags.home) || basepageHome();

  if (subcommand === "list") {
    const registry = readRegistry(home);
    const names = Object.keys(registry.sites).sort();
    if (!names.length) {
      console.log("No sites yet. Run `basepage init <dir>` to create one.");
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

  throw new Error("Usage: basepage sites <list|default>");
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
    const results = (await Promise.all(Object.entries(registry.sites).map(async ([name, site]) =>
      (await searchRememberedSite(name, site.path, query, { semantic, limit })).map((result) => ({ ...result, site: name })),
    ))).flat();
    printSearchResults(results.sort((a, b) => b.score - a.score).slice(0, limit ?? 10));
    return;
  }

  const dir = resolveSiteDir({ site: siteArg });
  printSearchResults(await searchRememberedSite(siteArg, dir, query, { semantic, limit }));
}

async function cmdIndex(positionals: string[]) {
  const target = positionals[0] || "all";
  const registry = readRegistry();

  if (target === "all") {
    const entries = Object.entries(registry.sites);
    if (!entries.length) throw new Error("No remembered sites. Run `basepage init <dir>` first.");
    for (const [name, site] of entries) {
      const result = await indexSite({ site: name, siteDir: site.path });
      console.log(`✓ Indexed ${name}: ${result.files} files, ${result.chunks} chunks (${result.model})`);
    }
    return;
  }

  const dir = resolveSiteDir({ site: target });
  const result = await indexSite({ site: target, siteDir: dir });
  console.log(`✓ Indexed ${target}: ${result.files} files, ${result.chunks} chunks (${result.model})`);
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

function looksLikeDomain(input: string): boolean {
  return /^https?:\/\//.test(input) || (/^[^/\\]+$/.test(input) && input.includes("."));
}

function printDomainCheck(result: DomainCheckResult): void {
  console.log(`DNS check for ${result.domain}`);
  for (const check of result.checks) {
    const label = `${check.type.padEnd(5)} ${check.host}`;
    const actual = check.actual.length ? check.actual.join(", ") : "(none)";
    const expected = check.expected.length
      ? check.expected.join(", ")
      : "any *.github.io CNAME (pass --login <github-user> for an exact check)";
    console.log(`  ${check.ok ? "✓" : "✗"} ${label}`);
    console.log(`    actual:   ${actual}`);
    console.log(`    expected: ${expected}`);
  }

  if (result.ok) {
    console.log("\n✓ DNS is ready for GitHub Pages.");
    return;
  }

  console.log("\nAdd/update these DNS records at your registrar:");
  for (const r of result.instructions) {
    console.log(`  ${r.type.padEnd(5)} ${r.host.padEnd(6)} ${r.value}`);
  }
}

function printPublishDomainStatus(result: DomainCheckResult): void {
  if (result.ok) {
    console.log("\n✓ DNS already points at GitHub Pages.");
    return;
  }

  console.log("\nDNS is not ready yet. Current records:");
  for (const check of result.checks) {
    const actual = check.actual.length ? check.actual.join(", ") : "(none)";
    console.log(`  ${check.type.padEnd(5)} ${check.host.padEnd(6)} ${actual}`);
  }
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

async function searchRememberedSite(
  site: string | undefined,
  dir: string,
  query: string,
  opts: { semantic: boolean; limit?: number },
): Promise<SearchResult[]> {
  if (!opts.semantic || !site) return searchSite(dir, query, opts);

  try {
    const indexed = await searchSemanticIndex({ site, query, limit: opts.limit });
    if (indexed.length) return indexed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/No embedding provider configured|OPENAI_API_KEY|VOYAGE_API_KEY|Ollama/.test(message)) throw err;
  }

  return searchSite(dir, query, opts);
}

function usage() {
  console.log(`basepage ${VERSION} — own your corner of the web, edited by your agent

Usage:
  basepage init [dir]        Scaffold a new site (interactive; blank canvas by default)
  basepage new <page|post|note> <name>   Add a page, post, or note
  basepage capture <site> --title <s>     Save stdin/body as a new page, post, or note
  basepage search [site|all] <query>      Search remembered or current-site markdown
  basepage index [site|all]               Build the local embedding index
  basepage sites <list|default>           Show remembered sites or set the default
  basepage domain <set|check> [domain]    Set or verify a custom domain
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
index env:    BASEPAGE_EMBEDDING_PROVIDER=<voyage|openai|ollama|local>  BASEPAGE_EMBEDDING_MODEL=<model>
domain flags: --login <github-user>  --site <name>
serve flags:  --port <n>
build flags:  --output <dir>  --pathprefix </repo/>
publish flags: --domain <domain>  --site <name>
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
    case "domain":
      return cmdDomain(positionals, flags);
    case "search":
      return cmdSearch(positionals, flags);
    case "index":
      return cmdIndex(positionals);
    case "add":
      return cmdAdd(positionals);
    case "restructure":
      return cmdRestructure(positionals);
    case "publish":
      return cmdPublish(positionals, flags);
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
