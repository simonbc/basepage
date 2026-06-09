import { test, expect, afterEach } from "bun:test";
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initSite } from "../src/commands/init.ts";
import { addFeature } from "../src/commands/add.ts";
import { newContent } from "../src/commands/new.ts";
import { build } from "../src/commands/build.ts";
import { readManifest } from "../src/lib/manifest.ts";

const cwd = process.cwd();
afterEach(() => process.chdir(cwd));

function site(template: string) {
  const dir = join(mkdtempSync(join(tmpdir(), "bp-add-")), "site");
  initSite({ dir, template, title: "Test" });
  return dir;
}

test("add blog turns a blank site into a blog: manifest + scaffold files", () => {
  const dir = site("blank");
  const result = addFeature(dir, "blog");

  const m = readManifest(dir);
  expect(m.features).toContain("blog");
  expect(m.features).toContain("rss");
  expect(result.added).toEqual(["blog", "rss"]);

  expect(existsSync(join(dir, "src", "posts", "posts.json"))).toBe(true);
  expect(existsSync(join(dir, "src", "_includes", "post.njk"))).toBe(true);
});

test("a blank site, made a blog, then given a post, builds the post + feed", async () => {
  const dir = site("blank");
  addFeature(dir, "blog");
  newContent({ siteDir: dir, type: "post", name: "hello", date: new Date("2026-02-02T00:00:00Z") });

  await build(dir);
  expect(existsSync(join(dir, "_site", "posts", "2026-02-02-hello", "index.html"))).toBe(true);
  expect(existsSync(join(dir, "_site", "feed.xml"))).toBe(true);
});

test("add preserves existing manifest fields and is idempotent", () => {
  const dir = site("blank");
  addFeature(dir, "syntax-highlight");
  addFeature(dir, "syntax-highlight");
  const m = readManifest(dir);
  expect(m.title).toBe("Test");
  expect(m.features.filter((f) => f === "syntax-highlight")).toHaveLength(1);
});

test("add wiki turns a blank site into a wiki: kind, features, scaffold files", () => {
  const dir = site("blank");
  const result = addFeature(dir, "wiki");

  const m = readManifest(dir);
  expect(m.kind).toBe("wiki");
  expect(m.features).toContain("wikilinks");
  expect(m.features).toContain("backlinks");
  expect(result.added).toEqual(["wikilinks", "backlinks"]);

  expect(existsSync(join(dir, "src", "notes", "notes.json"))).toBe(true);
  expect(existsSync(join(dir, "src", "_includes", "note.njk"))).toBe(true);
});

test("a blank site, made a wiki, resolves wikilinks and renders backlinks", async () => {
  const dir = site("blank");
  addFeature(dir, "wiki");
  newContent({ siteDir: dir, type: "note", name: "Alpha", title: "Alpha" });
  // Beta links to Alpha, so Alpha should get a backlink from Beta.
  const { path: beta } = newContent({ siteDir: dir, type: "note", name: "Beta", title: "Beta" });
  writeFileSync(beta, "---\ntitle: Beta\n---\n\nSee [[Alpha]] for details.\n");

  await build(dir);
  const alpha = readFileSync(join(dir, "_site", "notes", "alpha", "index.html"), "utf8");
  const betaHtml = readFileSync(join(dir, "_site", "notes", "beta", "index.html"), "utf8");
  // Beta's wikilink resolved to Alpha's page
  expect(betaHtml).toContain('href="/notes/alpha/"');
  // Alpha shows a backlink from Beta
  expect(alpha).toContain("Linking here");
  expect(alpha).toContain('href="/notes/beta/"');
});

test("rejects an unknown feature", () => {
  const dir = site("blank");
  expect(() => addFeature(dir, "telepathy")).toThrow(/unknown/i);
});
