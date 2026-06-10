import Eleventy from "@11ty/eleventy";
import { resolve } from "node:path";
import { createDevEditorMiddleware, injectEditLink } from "./dev-editor.ts";
import { readManifest, type Manifest } from "./manifest.ts";

export interface EleventyOptions {
  /** Output directory, relative to the site dir. Defaults to `_site`. */
  output?: string;
  /** Path prefix for sub-path publishing (e.g. `/repo/` on GitHub project pages). */
  pathPrefix?: string;
  /** Dev-server port (serve mode only). */
  port?: number;
  /** Eleventy run mode. `serve` enables the dev server + live reload. */
  runMode?: "build" | "watch" | "serve";
}

/**
 * Construct an Eleventy instance for a scaffolded site.
 *
 * The scaffold owns a minimal, dependency-free `eleventy.config.mjs` (passthrough,
 * watch targets, collections, filters). Basepage layers the manifest's opt-in
 * features on top via the `config` callback, importing the matching plugins from
 * *its own* node_modules — the scaffold never imports them.
 *
 * Eleventy resolves config-relative paths (passthrough/watch) against the cwd, so
 * we chdir into the site dir, matching the scaffold author's mental model.
 */
export async function createEleventy(siteDir: string, opts: EleventyOptions = {}) {
  const dir = resolve(siteDir);
  const manifest = readManifest(dir);

  process.chdir(dir);

  const elev = new Eleventy("src", opts.output ?? "_site", {
    configPath: "eleventy.config.mjs",
    async config(cfg: any) {
      if (opts.port) cfg.setServerOptions({ port: opts.port });
      applyUrlFilters(cfg, opts.pathPrefix);
      applyHtmlPathPrefix(cfg, opts.pathPrefix);
      if (opts.runMode === "serve") applyDevEditor(cfg, dir);
      await applyFeatures(cfg, manifest);
    },
  });

  if (opts.runMode) elev.setRunMode(opts.runMode);
  return { elev, manifest };
}

function applyUrlFilters(cfg: any, pathPrefix = "/"): void {
  // Basepage owns path-prefixing so scaffold templates keep using Eleventy's
  // legacy `url` filter without getting double-prefixed by Eleventy v3's HTML
  // Base transform. Non-HTML virtual templates like feeds use this filter.
  cfg.addFilter("basepageUrl", (url = "") => prefixUrl(url, pathPrefix));
  cfg.addFilter("jsonStringify", (value: unknown) => JSON.stringify(value ?? ""));
  cfg.addFilter("xmlEscape", xmlEscape);
  cfg.addFilter("cdata", cdata);
  cfg.addFilter("basepageDateToRfc822", dateToRfc822);
}

function applyHtmlPathPrefix(cfg: any, pathPrefix = "/"): void {
  if (normalizePathPrefix(pathPrefix) === "/") return;
  cfg.addTransform("basepage-path-prefix", function (this: any, content: string) {
    if (!this.outputPath?.endsWith(".html")) return content;
    return prefixHtmlUrls(content, pathPrefix);
  });
}

function applyDevEditor(cfg: any, siteDir: string): void {
  cfg.setServerOptions({
    middleware: [createDevEditorMiddleware(siteDir)],
  });
  cfg.addTransform("basepage-dev-edit-link", function (this: any, content: string) {
    return injectEditLink(siteDir, content, {
      inputPath: this.page?.inputPath ?? this.inputPath,
      url: this.page?.url ?? this.url,
    });
  });
}

function prefixUrl(url: string, pathPrefix = "/"): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url) || (url.startsWith("//") && url !== "//")) {
    return url;
  }
  const prefix = normalizePathPrefix(pathPrefix);
  if (prefix === "/") return url;
  if (url === "/" || url === "") return prefix;
  if (!url.startsWith("/")) return url;
  return `${prefix.replace(/\/$/, "")}${url}`;
}

function normalizePathPrefix(pathPrefix = "/"): string {
  if (!pathPrefix || pathPrefix === "/") return "/";
  return `/${pathPrefix.replace(/^\/+|\/+$/g, "")}/`;
}

function prefixHtmlUrls(content: string, pathPrefix = "/"): string {
  return content.replace(
    /\b(href|src|action)=(["'])(.*?)\2/g,
    (_match, attr: string, quote: string, url: string) =>
      `${attr}=${quote}${prefixUrl(url, pathPrefix)}${quote}`,
  );
}

/** Inject the bundled Eleventy plugins enabled by the manifest's feature list. */
async function applyFeatures(cfg: any, manifest: Manifest): Promise<void> {
  const features = new Set(manifest.features);

  if (features.has("blog")) {
    // Blog machinery lives here (not in the scaffold config) so any kind can become
    // a blog by flipping a manifest flag. Posts are markdown tagged "post".
    cfg.addCollection("posts", (api: any) =>
      api.getFilteredByTag("post").sort((a: any, b: any) => b.date - a.date),
    );
    cfg.addFilter("readableDate", (d: Date | string) =>
      new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    );
    cfg.addFilter("isoDate", (d: Date | string) => new Date(d).toISOString().slice(0, 10));
  }

  if (features.has("syntax-highlight")) {
    const syntax = (await import("@11ty/eleventy-plugin-syntaxhighlight")).default;
    cfg.addPlugin(syntax);
  }

  if (features.has("rss")) {
    const rss = await import("@11ty/eleventy-plugin-rss");
    cfg.addPlugin(rss.default ?? rss);
    // Virtual feed templates — kept out of the scaffold so the site stays
    // dependency-free; only present when the feature is on.
    cfg.addTemplate("basepage-feed.njk", RSS_FEED_TEMPLATE, {
      permalink: "/feed.xml",
      eleventyExcludeFromCollections: true,
    });
    cfg.addTemplate("basepage-json-feed.njk", JSON_FEED_TEMPLATE, {
      permalink: "/feed.json",
      eleventyExcludeFromCollections: true,
    });
  }

  if (features.has("wikilinks") || features.has("backlinks")) {
    const interlinker = (await import("@photogabble/eleventy-plugin-interlinker")).default;
    cfg.addPlugin(interlinker, { defaultLayout: undefined });
    // Notes collection lives here (not in the scaffold config) so any kind can
    // become a wiki by flipping a manifest flag. Notes are markdown tagged "note".
    cfg.addCollection("notes", (api: any) =>
      api
        .getFilteredByTag("note")
        .sort((a: any, b: any) => (a.data.title || "").localeCompare(b.data.title || "")),
    );
  }
}

/**
 * Feeds rendered by Basepage when `rss` is enabled. Reads `site` (from the
 * scaffold's `_data/site.js`) and `collections.posts`. Absolute URLs are formed
 * from `site.domain` when present; otherwise links are root-relative.
 */
const RSS_FEED_TEMPLATE = `<?xml version="1.0" encoding="utf-8"?>
{%- set origin = ("https://" + site.domain) if site.domain else "" -%}
{%- set homeUrl = origin + ('/' | basepageUrl) -%}
{%- set feedUrl = origin + ('/feed.xml' | basepageUrl) -%}
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>{{ site.title | xmlEscape }}</title>
    <link>{{ homeUrl | xmlEscape }}</link>
    <description>{{ (site.tagline or site.title) | xmlEscape }}</description>
    <generator>Basepage</generator>
    <atom:link href="{{ feedUrl | xmlEscape }}" rel="self" type="application/rss+xml"/>
  {%- if collections.posts | length %}
    <lastBuildDate>{{ collections.posts | getNewestCollectionItemDate | basepageDateToRfc822 }}</lastBuildDate>
  {%- endif %}
  {%- for post in collections.posts %}
    {%- set postUrl = origin + (post.url | basepageUrl) %}
    <item>
      <title>{{ post.data.title | xmlEscape }}</title>
      <link>{{ postUrl | xmlEscape }}</link>
      <guid isPermaLink="true">{{ postUrl | xmlEscape }}</guid>
      <pubDate>{{ post.date | basepageDateToRfc822 }}</pubDate>
      <description>{{ post.templateContent | cdata | safe }}</description>
    </item>
  {%- endfor %}
  </channel>
</rss>`;

const JSON_FEED_TEMPLATE = `{%- set origin = ("https://" + site.domain) if site.domain else "" -%}
{%- set homeUrl = origin + ('/' | basepageUrl) -%}
{%- set feedUrl = origin + ('/feed.json' | basepageUrl) -%}
{
  "version": "https://jsonfeed.org/version/1.1",
  "title": {{ site.title | jsonStringify | safe }},
  {%- if site.tagline %}
  "description": {{ site.tagline | jsonStringify | safe }},
  {%- endif %}
  "home_page_url": {{ homeUrl | jsonStringify | safe }},
  "feed_url": {{ feedUrl | jsonStringify | safe }},
  "items": [
    {%- for post in collections.posts %}
    {%- set postUrl = origin + (post.url | basepageUrl) %}
    {
      "id": {{ postUrl | jsonStringify | safe }},
      "url": {{ postUrl | jsonStringify | safe }},
      "title": {{ post.data.title | jsonStringify | safe }},
      "content_html": {{ post.templateContent | jsonStringify | safe }},
      "date_published": {{ (post.date | dateToRfc3339) | jsonStringify | safe }}
    }{{ "," if not loop.last }}
    {%- endfor %}
  ]
}`;

function xmlEscape(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function cdata(value: unknown): string {
  return `<![CDATA[${String(value ?? "").replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

function dateToRfc822(value: Date | string | number): string {
  return new Date(value).toUTCString();
}
