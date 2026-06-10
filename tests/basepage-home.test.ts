import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initSite } from "../src/commands/init.ts";
import {
  autoRegisterSite,
  readRegistry,
  registerSite,
  resolveRegisteredSite,
  setDefaultSite,
} from "../src/lib/basepage-home.ts";
import { resolveSiteDir } from "../src/lib/site-resolver.ts";

test("registers and resolves sites from a Basepage home registry", () => {
  const root = mkdtempSync(join(tmpdir(), "bp-home-"));
  const home = join(root, "home");
  const siteDir = join(root, "notes");
  initSite({ dir: siteDir, template: "wiki", title: "Notes" });

  registerSite(siteDir, { alias: "notes", home });
  const registry = readRegistry(home);

  expect(registry.sites.notes.path).toBe(siteDir);
  expect(registry.sites.notes.title).toBe("Notes");
  expect(registry.sites.notes.features).toContain("wikilinks");
  expect(resolveRegisteredSite("notes", home).path).toBe(siteDir);
  expect(resolveSiteDir({ site: "notes", home })).toBe(siteDir);
});

test("resolves a default site when cwd is not a Basepage site", () => {
  const root = mkdtempSync(join(tmpdir(), "bp-home-default-"));
  const home = join(root, "home");
  const siteDir = join(root, "blog");
  const otherDir = join(root, "elsewhere");
  initSite({ dir: siteDir, template: "blog", title: "Blog" });

  registerSite(siteDir, { alias: "blog", home });
  setDefaultSite("blog", { home });

  expect(resolveSiteDir({ cwd: otherDir, home })).toBe(siteDir);
});

test("auto-register remembers a new site and sets the first one as default", () => {
  const root = mkdtempSync(join(tmpdir(), "bp-home-auto-"));
  const home = join(root, "home");
  const siteDir = join(root, "notes");
  initSite({ dir: siteDir, template: "wiki", title: "Notes" });

  const result = autoRegisterSite(siteDir, { home });
  const registry = readRegistry(home);

  expect(result.alias).toBe("notes");
  expect(result.defaulted).toBe(true);
  expect(registry.defaults.site).toBe("notes");
  expect(registry.sites.notes.path).toBe(siteDir);
});

test("auto-register avoids overwriting an existing alias", () => {
  const root = mkdtempSync(join(tmpdir(), "bp-home-alias-"));
  const home = join(root, "home");
  const first = join(root, "one", "notes");
  const second = join(root, "two", "notes");
  initSite({ dir: first, template: "blank", title: "First" });
  initSite({ dir: second, template: "blank", title: "Second" });

  expect(autoRegisterSite(first, { home }).alias).toBe("notes");
  expect(autoRegisterSite(second, { home }).alias).toBe("notes-2");

  const registry = readRegistry(home);
  expect(registry.sites.notes.path).toBe(first);
  expect(registry.sites["notes-2"].path).toBe(second);
});
