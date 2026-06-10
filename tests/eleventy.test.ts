import { test, expect, afterEach } from "bun:test";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initSite } from "../src/commands/init.ts";
import { build } from "../src/commands/build.ts";

const cwd = process.cwd();
afterEach(() => process.chdir(cwd));

function tmp() {
  return mkdtempSync(join(tmpdir(), "bp-build-"));
}

test("builds a site: html, passthrough css, and url filter honoring pathPrefix", async () => {
  const dir = join(tmp(), "site");
  initSite({ dir, template: "blog", title: "Ada", tagline: "Maths", domain: "ada.dev" });

  await build(dir, { pathPrefix: "/myrepo/" });

  const indexPath = join(dir, "_site", "index.html");
  expect(existsSync(indexPath)).toBe(true);
  expect(existsSync(join(dir, "_site", "css", "style.css"))).toBe(true);

  const html = readFileSync(indexPath, "utf8");
  // HTML links get exactly one path prefix for sub-path publishing.
  expect(html).toContain('href="/myrepo/css/style.css"');
  expect(html).toContain('href="/myrepo/feed.xml"');
  expect(html).not.toContain("/myrepo/myrepo/");
  // manifest metadata surfaces in the output
  expect(html).toContain("Ada");

  const feed = readFileSync(join(dir, "_site", "feed.xml"), "utf8");
  expect(feed).toContain('href="https://ada.dev/myrepo/feed.xml"');
  expect(feed).not.toContain("/myrepo/myrepo/");
});

test("rss feature produces an Atom feed for the blog kind", async () => {
  const dir = join(tmp(), "site");
  initSite({ dir, template: "blog", title: "Ada", domain: "ada.dev" });
  await build(dir);
  const feedPath = join(dir, "_site", "feed.xml");
  expect(existsSync(feedPath)).toBe(true);
  const feed = readFileSync(feedPath, "utf8");
  expect(feed).toContain("<feed");
  expect(feed).toContain("Ada");
});

test("blank kind builds a single page with no feed", async () => {
  const dir = join(tmp(), "card");
  initSite({ dir, template: "blank", title: "Card" });
  await build(dir);
  expect(existsSync(join(dir, "_site", "index.html"))).toBe(true);
  expect(existsSync(join(dir, "_site", "feed.xml"))).toBe(false);
});
