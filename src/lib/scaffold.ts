import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Bundled templates live at <repo>/templates — one directory per kind. */
export const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "templates");

export interface ScaffoldMeta {
  title?: string;
  tagline?: string;
  domain?: string;
}

export function listTemplates(): string[] {
  return readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

export function templateExists(name: string): boolean {
  return existsSync(join(TEMPLATES_DIR, name)) && listTemplates().includes(name);
}

function isEmptyDir(dir: string): boolean {
  if (!existsSync(dir)) return true;
  return readdirSync(dir).length === 0;
}

/**
 * Copy a bundled template into `targetDir` and merge user metadata into the
 * template's `basepage.json`. The template owns `kind` + default `features`;
 * init only layers in title/tagline/domain.
 */
export function scaffold(targetDir: string, templateName: string, meta: ScaffoldMeta): void {
  if (!templateExists(templateName)) {
    throw new Error(`Unknown template "${templateName}". Available: ${listTemplates().join(", ")}`);
  }
  if (!isEmptyDir(targetDir)) {
    throw new Error(`Target directory is not empty: ${targetDir}`);
  }

  mkdirSync(targetDir, { recursive: true });
  cpSync(join(TEMPLATES_DIR, templateName), targetDir, { recursive: true });

  const manifestFile = join(targetDir, "basepage.json");
  const base = JSON.parse(readFileSync(manifestFile, "utf8"));
  const merged = { ...base };
  for (const [key, value] of Object.entries(meta)) {
    if (value !== undefined && value !== "") merged[key] = value;
  }
  writeFileSync(manifestFile, JSON.stringify(merged, null, 2) + "\n");
}
