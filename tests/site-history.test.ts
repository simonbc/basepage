import { test, expect } from "bun:test";
import { mkdtempSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initSite } from "../src/commands/init.ts";
import { newContent } from "../src/commands/new.ts";
import { changedFiles, diffRevisions, fileAtRevision, listRevisions } from "../src/lib/site-history.ts";

function tmp() {
  return join(mkdtempSync(join(tmpdir(), "bp-history-")), "site");
}

test("init creates a local git repo with an initial commit", () => {
  const dir = tmp();
  initSite({ dir, template: "blank", title: "History" });

  expect(existsSync(join(dir, ".git"))).toBe(true);
  expect(readFileSync(join(dir, ".gitignore"), "utf8")).toContain("_site/");
  const revisions = listRevisions(dir);
  expect(revisions).toHaveLength(1);
  expect(revisions[0].subject).toBe("Initial Basepage site");
});

test("new content creates a revision and exposes diffs", () => {
  const dir = tmp();
  initSite({ dir, template: "blank", title: "History" });

  newContent({ siteDir: dir, type: "page", name: "About", body: "First body." });

  const revisions = listRevisions(dir);
  expect(revisions).toHaveLength(2);
  expect(revisions[0].subject).toBe("Add page: About");

  const files = changedFiles(dir, revisions[1].hash, revisions[0].hash);
  expect(files).toContainEqual({ status: "A", file: "src/about.md" });
  expect(diffRevisions(dir, revisions[1].hash, revisions[0].hash)).toContain("+First body.");
  expect(fileAtRevision(dir, revisions[0].hash, "src/about.md")).toContain("First body.");
});

test("history ignores build output", () => {
  const dir = tmp();
  initSite({ dir, template: "blank", title: "History" });

  mkdirSync(join(dir, "_site"), { recursive: true });
  writeFileSync(join(dir, "_site", "index.html"), "built");

  expect(listRevisions(dir)).toHaveLength(1);
});
