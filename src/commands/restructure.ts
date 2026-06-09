import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { manifestPath, readManifest } from "../lib/manifest.ts";
import { listTemplates, TEMPLATES_DIR } from "../lib/scaffold.ts";
import { ensureBlogScaffold, ensureWikiScaffold } from "./add.ts";

export interface RestructureResult {
  kind: string;
  /** Features enabled by the new structure. */
  features: string[];
  /** Scaffold files created (paths relative to the site dir). */
  createdFiles: string[];
}

/**
 * Change an existing site's structure (its kind) in place — e.g. turn a plain
 * site into a wiki. Applies the preset's kind + default features and scaffolds
 * the matching presentation files, without touching your content.
 */
export function restructure(siteDir: string, kind: string): RestructureResult {
  const dir = resolve(siteDir);
  readManifest(dir); // validate it's a Basepage project

  const presets = listTemplates();
  if (!presets.includes(kind)) {
    throw new Error(`Unknown structure "${kind}". Try: ${presets.join(", ")}`);
  }

  // The preset's manifest declares the kind + the features that define it.
  const preset = JSON.parse(readFileSync(join(TEMPLATES_DIR, kind, "basepage.json"), "utf8"));

  const file = manifestPath(dir);
  const raw = JSON.parse(readFileSync(file, "utf8"));
  raw.kind = preset.kind ?? raw.kind;

  const features = new Set<string>(Array.isArray(raw.features) ? raw.features : []);
  for (const f of (preset.features as string[] | undefined) ?? []) features.add(f);

  const createdFiles: string[] = [];
  if (features.has("blog")) createdFiles.push(...ensureBlogScaffold(dir));
  if (features.has("wikilinks") || features.has("backlinks")) {
    createdFiles.push(...ensureWikiScaffold(dir));
  }

  raw.features = [...features];
  writeFileSync(file, JSON.stringify(raw, null, 2) + "\n");

  return { kind, features: [...features], createdFiles };
}
