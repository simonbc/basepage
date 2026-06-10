import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { manifestPath } from "./manifest.ts";
import { basepageHome, resolveDefaultSite, resolveRegisteredSite } from "./basepage-home.ts";

export interface ResolveSiteOptions {
  site?: string;
  dir?: string;
  cwd?: string;
  home?: string;
}

export function resolveSiteDir(opts: ResolveSiteOptions = {}): string {
  const home = opts.home || basepageHome();
  if (opts.site) return resolveRegisteredSite(opts.site, home).path;
  if (opts.dir) return resolve(opts.dir);

  const cwd = resolve(opts.cwd || process.cwd());
  if (existsSync(manifestPath(cwd))) return cwd;

  const def = resolveDefaultSite(home);
  if (def) return def.path;

  throw new Error("No Basepage site found. Run inside a site, pass `--site <name>`, or run `basepage init <dir>` once so Basepage can track it.");
}
