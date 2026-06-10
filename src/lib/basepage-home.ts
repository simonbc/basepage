import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { readManifest } from "./manifest.ts";

export interface RegisteredSite {
  path: string;
  title?: string;
  features: string[];
}

export interface SiteRegistry {
  sites: Record<string, RegisteredSite>;
  defaults: Record<string, string>;
}

export function basepageHome(env: Record<string, string | undefined> = process.env): string {
  return resolve(env.BASEPAGE_HOME || join(homedir(), ".basepage"));
}

export function registryPath(home = basepageHome()): string {
  return join(home, "sites.json");
}

export function emptyRegistry(): SiteRegistry {
  return { sites: {}, defaults: {} };
}

export function readRegistry(home = basepageHome()): SiteRegistry {
  const file = registryPath(home);
  if (!existsSync(file)) return emptyRegistry();

  const raw = JSON.parse(readFileSync(file, "utf8"));
  return {
    sites: isRecord(raw.sites) ? normalizeSites(raw.sites) : {},
    defaults: isRecord(raw.defaults) ? normalizeDefaults(raw.defaults) : {},
  };
}

export function writeRegistry(registry: SiteRegistry, home = basepageHome()): void {
  mkdirSync(home, { recursive: true });
  writeFileSync(registryPath(home), `${JSON.stringify(registry, null, 2)}\n`);
}

export function registerSite(siteDir: string, opts: { alias?: string; home?: string } = {}): RegisteredSite {
  const dir = resolve(siteDir);
  const manifest = readManifest(dir);
  const alias = normalizeAlias(opts.alias || basename(dir));
  if (!alias) throw new Error("Site alias is required.");

  const registry = readRegistry(opts.home);
  const site = {
    path: dir,
    title: manifest.title,
    features: manifest.features,
  };
  registry.sites[alias] = site;
  writeRegistry(registry, opts.home);
  return site;
}

export function setDefaultSite(alias: string, opts: { key?: string; home?: string } = {}): void {
  const name = normalizeAlias(alias);
  const registry = readRegistry(opts.home);
  if (!registry.sites[name]) throw new Error(`Unknown site "${alias}". Run \`basepage sites add\` first.`);
  registry.defaults[opts.key || "site"] = name;
  writeRegistry(registry, opts.home);
}

export function resolveRegisteredSite(alias: string, home = basepageHome()): RegisteredSite {
  const registry = readRegistry(home);
  const site = registry.sites[normalizeAlias(alias)];
  if (!site) throw new Error(`Unknown site "${alias}". Run \`basepage sites list\` to see registered sites.`);
  return site;
}

export function resolveDefaultSite(home = basepageHome()): RegisteredSite | null {
  const registry = readRegistry(home);
  const alias = registry.defaults.site;
  return alias ? registry.sites[alias] ?? null : null;
}

export function normalizeAlias(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeSites(raw: Record<string, unknown>): Record<string, RegisteredSite> {
  const sites: Record<string, RegisteredSite> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isRecord(value) || typeof value.path !== "string") continue;
    sites[normalizeAlias(key)] = {
      path: resolve(value.path),
      title: typeof value.title === "string" ? value.title : undefined,
      features: Array.isArray(value.features) ? value.features.filter((item): item is string => typeof item === "string") : [],
    };
  }
  return sites;
}

function normalizeDefaults(raw: Record<string, unknown>): Record<string, string> {
  const defaults: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") defaults[normalizeAlias(key)] = normalizeAlias(value);
  }
  return defaults;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
