import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addFeature } from "../src/commands/add.ts";
import { initSite } from "../src/commands/init.ts";
import { newContent } from "../src/commands/new.ts";
import { searchSite } from "../src/commands/search.ts";

function site() {
  const dir = join(mkdtempSync(join(tmpdir(), "bp-search-")), "site");
  initSite({ dir, template: "blank", title: "Search" });
  return dir;
}

test("search finds markdown by title and body text", () => {
  const dir = site();
  newContent({
    siteDir: dir,
    type: "page",
    name: "database-notes",
    title: "Database Notes",
    body: "These notes cover Postgres migrations and rollback plans.",
  });

  const results = searchSite(dir, "postgres rollback");

  expect(results).toHaveLength(1);
  expect(results[0].title).toBe("Database Notes");
  expect(results[0].file).toBe("database-notes.md");
  expect(results[0].excerpt).toContain("Postgres migrations");
});

test("semantic search ranks conceptually similar local notes without external services", () => {
  const dir = site();
  addFeature(dir, "wikilinks");
  newContent({
    siteDir: dir,
    type: "note",
    name: "publishing-history",
    title: "Publishing History",
    body: "Git commits make revision history easy to inspect and restore.",
  });
  newContent({
    siteDir: dir,
    type: "note",
    name: "cooking",
    title: "Cooking",
    body: "Pasta dough needs flour, eggs, and patient kneading.",
  });

  const results = searchSite(dir, "git revision history", { semantic: true });

  expect(results[0].title).toBe("Publishing History");
  expect(results[0].score).toBeGreaterThan(0);
});

test("search ignores non-markdown files", () => {
  const dir = site();
  writeFileSync(join(dir, "src", "index.njk"), "special template words");
  newContent({ siteDir: dir, type: "page", name: "hello", title: "Hello", body: "Plain markdown." });

  expect(searchSite(dir, "special template words")).toHaveLength(0);
});
