import { test, expect } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addFeature } from "../src/commands/add.ts";
import { build } from "../src/commands/build.ts";
import { initSite } from "../src/commands/init.ts";
import { newContent } from "../src/commands/new.ts";
import {
  createEditableSource,
  editFileParamForInputPath,
  injectEditLink,
  readEditableSource,
  resolveEditableSourcePath,
  writeEditableSource,
} from "../src/lib/dev-editor.ts";

function site() {
  const dir = join(mkdtempSync(join(tmpdir(), "bp-edit-")), "site");
  initSite({ dir, template: "blank", title: "Test" });
  return dir;
}

test("save round-trip updates title and body while preserving other front matter", () => {
  const dir = site();
  const { path } = newContent({ siteDir: dir, type: "page", name: "About" });
  writeFileSync(
    path,
    `---
layout: base.njk
title: About
date: 2026-06-09
draft: false
---

# About

Old body.
`,
  );

  const source = readEditableSource(dir, "about.md");
  expect(source.title).toBe("About");
  expect(source.body).toContain("Old body.");

  writeEditableSource(dir, "about.md", "Edited About", "New body.\n\n[[Start here]]\n");

  const next = readFileSync(path, "utf8");
  expect(next).toContain("layout: base.njk");
  expect(next).toContain("date: 2026-06-09");
  expect(next).toContain("draft: false");
  expect(next).toContain('title: "Edited About"');
  expect(next).toContain("New body.\n\n[[Start here]]");
  expect(next).not.toContain("Old body.");
});

test("editor source paths are guarded to the site's src directory", () => {
  const dir = site();
  expect(() => resolveEditableSourcePath(dir, "../basepage.json")).toThrow(/inside src/i);
  expect(() => resolveEditableSourcePath(dir, "/tmp/outside.md")).toThrow(/invalid/i);
});

test("edit file params are derived only from editable src inputs", () => {
  const dir = site();
  expect(editFileParamForInputPath(dir, "./src/about.md")).toBe("about.md");
  expect(editFileParamForInputPath(dir, join(dir, "src", "notes", "one.md"))).toBe("notes/one.md");
  expect(editFileParamForInputPath(dir, "./src/index.njk")).toBeNull();
  expect(editFileParamForInputPath(dir, "./basepage-feed.njk")).toBeNull();
  expect(editFileParamForInputPath(dir, "./src/css/style.css")).toBeNull();
});

test("browser create maps typed input to a draft source file", () => {
  const dir = site();
  const created = createEditableSource(dir, {
    type: "page",
    title: "Fresh Page",
    slug: "../Fresh Page!",
    body: "Browser body.",
    draft: true,
  });

  expect(created.file).toBe("fresh-page.md");
  expect(created.url).toBe("/fresh-page/");
  expect(created.draft).toBe(true);
  const raw = readFileSync(join(dir, "src", "fresh-page.md"), "utf8");
  expect(raw).toContain("draft: true");
  expect(raw).toContain("# Fresh Page\n\nBrowser body.");
});

test("new link goes straight to the page editor when only pages are available", () => {
  const dir = site();
  const html = injectEditLink(dir, "<!doctype html><html><body></body></html>", {
    inputPath: "./src/index.njk",
    url: "/",
  });

  expect(html).toContain('/__new?type=page&amp;return=%2F');
  expect(html).not.toContain('<details class="basepage-dev-new">');
});

test("new link offers enabled content types as editor destinations", () => {
  const dir = site();
  addFeature(dir, "blog");
  const html = injectEditLink(dir, "<!doctype html><html><body></body></html>", {
    inputPath: "./src/index.njk",
    url: "/blog/",
  });

  expect(html).toContain('<details class="basepage-dev-new">');
  expect(html).toContain("New Post");
  expect(html).toContain("New Page");
  expect(html).toContain('/__new?type=post&amp;return=%2Fblog%2F');
  expect(html).toContain('/__new?type=page&amp;return=%2Fblog%2F');
});

test("normal builds do not include serve-only edit links", async () => {
  const dir = site();
  await build(dir);
  const html = readFileSync(join(dir, "_site", "index.html"), "utf8");
  expect(html).not.toContain("basepage-edit-link");
  expect(html).not.toContain("basepage-dev-links");
  expect(html).not.toContain("/__edit");
  expect(html).not.toContain("/__new");
});
