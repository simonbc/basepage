import { test, expect, afterEach } from "bun:test";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initSite } from "../src/commands/init.ts";
import { build } from "../src/commands/build.ts";
import { newContent } from "../src/commands/new.ts";

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
  expect(html).toContain('href="/myrepo/feed.json"');
  expect(html).not.toContain("/myrepo/myrepo/");
  // manifest metadata surfaces in the output
  expect(html).toContain("Ada");
  // Blog index previews the post body, not the SEO/social description front matter.
  expect(html).toContain("This is a starter post.");
  expect(html).not.toContain("The first post on a blog I actually own.");

  const feed = readFileSync(join(dir, "_site", "feed.xml"), "utf8");
  expect(feed).toContain('href="https://ada.dev/myrepo/feed.xml"');
  expect(feed).not.toContain("/myrepo/myrepo/");

  const jsonFeed = JSON.parse(readFileSync(join(dir, "_site", "feed.json"), "utf8"));
  expect(jsonFeed.feed_url).toBe("https://ada.dev/myrepo/feed.json");
  expect(jsonFeed.home_page_url).toBe("https://ada.dev/myrepo/");
  expect(JSON.stringify(jsonFeed)).not.toContain("/myrepo/myrepo/");
});

test("rss feature produces RSS 2.0 and JSON feeds for the blog kind", async () => {
  const dir = join(tmp(), "site");
  initSite({ dir, template: "blog", title: "Ada", domain: "ada.dev" });
  await build(dir);
  const feedPath = join(dir, "_site", "feed.xml");
  const jsonFeedPath = join(dir, "_site", "feed.json");
  expect(existsSync(feedPath)).toBe(true);
  expect(existsSync(jsonFeedPath)).toBe(true);

  const feed = readFileSync(feedPath, "utf8");
  expect(feed).toContain('<rss version="2.0"');
  expect(feed).toContain("<channel>");
  expect(feed).toContain("<item>");
  expect(feed).toContain("<title>Ada</title>");
  expect(feed).toContain("<guid isPermaLink=\"true\">https://ada.dev/posts/2026-01-15-hello-world/</guid>");
  expect(feed).toContain("<pubDate>Thu, 15 Jan 2026 00:00:00 GMT</pubDate>");
  expect(feed).not.toContain("<feed");
  expect(feed).toContain("Ada");

  const jsonFeed = JSON.parse(readFileSync(jsonFeedPath, "utf8"));
  expect(jsonFeed.version).toBe("https://jsonfeed.org/version/1.1");
  expect(jsonFeed.title).toBe("Ada");
  expect(jsonFeed.home_page_url).toBe("https://ada.dev/");
  expect(jsonFeed.feed_url).toBe("https://ada.dev/feed.json");
  expect(jsonFeed.items[0]).toMatchObject({
    id: "https://ada.dev/posts/2026-01-15-hello-world/",
    url: "https://ada.dev/posts/2026-01-15-hello-world/",
    title: "Hello, world",
  });
  expect(jsonFeed.items[0].content_html).toContain("<p>");
});

test("blank kind builds a single page with no feed", async () => {
  const dir = join(tmp(), "card");
  initSite({ dir, template: "blank", title: "Card" });
  await build(dir);
  expect(existsSync(join(dir, "_site", "index.html"))).toBe(true);
  expect(existsSync(join(dir, "_site", "feed.xml"))).toBe(false);
  expect(existsSync(join(dir, "_site", "feed.json"))).toBe(false);
});

test("draft markdown is excluded from normal builds", async () => {
  const dir = join(tmp(), "site");
  initSite({ dir, template: "blog", title: "Ada", domain: "ada.dev" });
  newContent({
    siteDir: dir,
    type: "post",
    name: "Private Thought",
    title: "Private Thought",
    body: "Not ready.",
    date: new Date("2026-04-05T00:00:00Z"),
    draft: true,
  });

  await build(dir);
  expect(existsSync(join(dir, "_site", "posts", "2026-04-05-private-thought", "index.html"))).toBe(false);
  const feed = readFileSync(join(dir, "_site", "feed.xml"), "utf8");
  const jsonFeed = readFileSync(join(dir, "_site", "feed.json"), "utf8");
  expect(feed).not.toContain("Private Thought");
  expect(jsonFeed).not.toContain("Private Thought");
});
