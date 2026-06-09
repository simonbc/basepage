import { basename, resolve } from "node:path";
import { scaffold, type ScaffoldMeta } from "../lib/scaffold.ts";

export interface InitOptions extends ScaffoldMeta {
  dir: string;
  template?: string;
}

/** Pure, non-interactive scaffolding — the testable core of `basepage init`. */
export function initSite(opts: InitOptions): { dir: string; template: string } {
  const dir = resolve(opts.dir);
  const template = opts.template ?? "default";
  scaffold(dir, template, {
    title: opts.title ?? toTitle(basename(dir)),
    tagline: opts.tagline,
    domain: opts.domain,
  });
  return { dir, template };
}

/** Turn a directory slug into a reasonable default title ("my-site" → "My Site"). */
function toTitle(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
