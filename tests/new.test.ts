import { test, expect } from "bun:test";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initSite } from "../src/commands/init.ts";
import { newContent, slugify } from "../src/commands/new.ts";

function site(template: string) {
  const dir = join(mkdtempSync(join(tmpdir(), "bp-new-")), "site");
  initSite({ dir, template, title: "Test" });
  return dir;
}

test("slugify normalizes arbitrary names", () => {
  expect(slugify("About Me")).toBe("about-me");
  expect(slugify("  Hello, World!  ")).toBe("hello-world");
});

test("new page creates a markdown file with title front matter", () => {
  const dir = site("blank");
  const { path } = newContent({ siteDir: dir, type: "page", name: "About Me" });
  expect(path).toBe(join(dir, "src", "about-me.md"));
  const body = readFileSync(path, "utf8");
  expect(body).toMatch(/title: About Me/);
  expect(body).toMatch(/layout: base.njk/);
});

test("new post requires a blog, with a helpful error", () => {
  const dir = site("blank");
  expect(() => newContent({ siteDir: dir, type: "post", name: "hi" })).toThrow(/add blog/);
});

test("new post on a blog writes a dated file with title + date", () => {
  const dir = site("blog");
  const { path } = newContent({
    siteDir: dir,
    type: "post",
    name: "My First Post",
    date: new Date("2026-03-04T00:00:00Z"),
  });
  expect(path).toBe(join(dir, "src", "posts", "2026-03-04-my-first-post.md"));
  const body = readFileSync(path, "utf8");
  expect(body).toMatch(/title: My First Post/);
  expect(body).toMatch(/date: 2026-03-04/);
});

test("new note requires a wiki, with a helpful error", () => {
  const dir = site("blank");
  expect(() => newContent({ siteDir: dir, type: "note", name: "idea" })).toThrow(/add wiki/i);
});

test("new note on a wiki writes into src/notes with a title", () => {
  const dir = site("wiki");
  const { path } = newContent({ siteDir: dir, type: "note", name: "My Idea" });
  expect(path).toBe(join(dir, "src", "notes", "my-idea.md"));
  expect(readFileSync(path, "utf8")).toMatch(/title: My Idea/);
});

test("refuses to overwrite an existing file", () => {
  const dir = site("blank");
  newContent({ siteDir: dir, type: "page", name: "about" });
  expect(() => newContent({ siteDir: dir, type: "page", name: "about" })).toThrow(/exists/i);
});
