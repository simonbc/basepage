import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** A Basepage project manifest (`basepage.json`). */
export interface Manifest {
  /** Content kind — selects the template + default feature set (site, wiki, …). */
  kind: string;
  /** Opt-in features for this kind (rss, wikilinks, syntax-highlight, …). */
  features: string[];
  title?: string;
  tagline?: string;
  /** Custom domain, when the site is published to one. */
  domain?: string;
}

export function manifestPath(siteDir: string): string {
  return join(siteDir, "basepage.json");
}

/** Read and validate the manifest for a site directory. Throws with guidance on failure. */
export function readManifest(siteDir: string): Manifest {
  const path = manifestPath(siteDir);
  if (!existsSync(path)) {
    throw new Error(`No basepage.json in ${siteDir} — run \`basepage init\` first.`);
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`basepage.json is not valid JSON: ${(err as Error).message}`);
  }

  if (typeof raw.kind !== "string" || raw.kind.length === 0) {
    throw new Error('basepage.json must declare a non-empty string "kind".');
  }

  return {
    kind: raw.kind,
    features: Array.isArray(raw.features) ? (raw.features as string[]) : [],
    title: typeof raw.title === "string" ? raw.title : undefined,
    tagline: typeof raw.tagline === "string" ? raw.tagline : undefined,
    domain: typeof raw.domain === "string" ? raw.domain : undefined,
  };
}
