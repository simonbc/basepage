import { test, expect, afterEach } from "bun:test";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initSite } from "../src/commands/init.ts";
import { restructure } from "../src/commands/restructure.ts";
import { newContent } from "../src/commands/new.ts";
import { build } from "../src/commands/build.ts";
import { readManifest } from "../src/lib/manifest.ts";

const cwd = process.cwd();
afterEach(() => process.chdir(cwd));

function site(template: string) {
  const dir = join(mkdtempSync(join(tmpdir(), "bp-restructure-")), "site");
  initSite({ dir, template, title: "Test" });
  return dir;
}

test("restructure wiki changes the kind in place and scaffolds the wiki", async () => {
  const dir = site("blank");
  const result = restructure(dir, "wiki");

  const m = readManifest(dir);
  expect(m.kind).toBe("wiki");
  expect(m.features).toContain("wikilinks");
  expect(m.features).toContain("backlinks");
  expect(existsSync(join(dir, "src", "_includes", "note.njk"))).toBe(true);

  // notes now work and build
  newContent({ siteDir: dir, type: "note", name: "Seed" });
  await build(dir);
  expect(existsSync(join(dir, "_site", "notes", "seed", "index.html"))).toBe(true);
});

test("restructure preserves existing content and rejects unknown kinds", () => {
  const dir = site("blank");
  expect(existsSync(join(dir, "src", "index.njk"))).toBe(true);
  restructure(dir, "wiki");
  // the blank home page is untouched
  expect(existsSync(join(dir, "src", "index.njk"))).toBe(true);
  expect(() => restructure(dir, "newspaper")).toThrow(/unknown structure/i);
});
