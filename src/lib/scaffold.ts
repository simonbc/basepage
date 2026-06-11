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

export interface TemplateInfo {
  name: string;
  /** Human label for the picker (from the template's basepage.json `label`). */
  label: string;
  /** One-line description (from the template's basepage.json `description`). */
  blurb: string;
}

/** Order templates for the picker; the first is the default. */
const TEMPLATE_ORDER = ["blank", "personal", "blog", "wiki"];

export function listTemplates(): string[] {
  const names = readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  return names.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function rank(name: string): number {
  const i = TEMPLATE_ORDER.indexOf(name);
  return i === -1 ? TEMPLATE_ORDER.length : i;
}

export function templateExists(name: string): boolean {
  return existsSync(join(TEMPLATES_DIR, name)) && listTemplates().includes(name);
}

function readTemplateManifest(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(TEMPLATES_DIR, name, "basepage.json"), "utf8"));
}

/** Templates with their picker label + blurb, in presentation order. */
export function describeTemplates(): TemplateInfo[] {
  return listTemplates().map((name) => {
    const m = readTemplateManifest(name);
    return {
      name,
      label: typeof m.label === "string" ? m.label : name,
      blurb: typeof m.description === "string" ? m.description : "",
    };
  });
}

/**
 * Interpret a picker answer against the available template names.
 * `"empty"` → no answer (use the default); `"invalid"` → re-prompt.
 */
export function resolveTemplateChoice(
  input: string,
  names: string[],
): { name: string } | "empty" | "invalid" {
  const trimmed = input.trim();
  if (!trimmed) return "empty";
  if (/^\d+$/.test(trimmed)) {
    const picked = names[Number(trimmed) - 1];
    return picked ? { name: picked } : "invalid";
  }
  const match = names.find((n) => n.toLowerCase() === trimmed.toLowerCase());
  return match ? { name: match } : "invalid";
}

function isEmptyDir(dir: string): boolean {
  if (!existsSync(dir)) return true;
  return readdirSync(dir).every((entry) => entry === ".git");
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
  // `label`/`description` are picker metadata for init — not part of a site's manifest.
  delete base.label;
  delete base.description;
  const merged = { ...base };
  for (const [key, value] of Object.entries(meta)) {
    if (value !== undefined && value !== "") merged[key] = value;
  }
  writeFileSync(manifestFile, JSON.stringify(merged, null, 2) + "\n");
}
