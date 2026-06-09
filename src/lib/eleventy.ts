import Eleventy from "@11ty/eleventy";
import { resolve } from "node:path";
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
    pathPrefix: opts.pathPrefix,
    async config(cfg: any) {
      if (opts.port) cfg.setServerOptions({ port: opts.port });
      await applyFeatures(cfg, manifest);
    },
  });

  if (opts.runMode) elev.setRunMode(opts.runMode);
  return { elev, manifest };
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
    // A virtual feed template — kept out of the scaffold so the site stays
    // dependency-free; only present when the feature is on.
    cfg.addTemplate("basepage-feed.njk", FEED_TEMPLATE, {
      permalink: "/feed.xml",
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
 * Atom feed rendered by Basepage when `rss` is enabled. Reads `site` (from the
 * scaffold's `_data/site.js`) and `collections.posts`. Absolute URLs are formed
 * from `site.domain` when present; otherwise links are root-relative.
 */
const FEED_TEMPLATE = `<?xml version="1.0" encoding="utf-8"?>
{%- set origin = ("https://" + site.domain) if site.domain else "" -%}
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>{{ site.title }}</title>
  {%- if site.tagline %}<subtitle>{{ site.tagline }}</subtitle>{% endif %}
  <link href="{{ origin }}{{ '/feed.xml' | url }}" rel="self"/>
  <link href="{{ origin }}{{ '/' | url }}"/>
  <id>{{ origin }}{{ '/' | url }}</id>
  {%- if collections.posts | length %}
  <updated>{{ collections.posts | getNewestCollectionItemDate | dateToRfc3339 }}</updated>
  {%- endif %}
  {%- for post in collections.posts %}
  <entry>
    <title>{{ post.data.title }}</title>
    <link href="{{ origin }}{{ post.url | url }}"/>
    <updated>{{ post.date | dateToRfc3339 }}</updated>
    <id>{{ origin }}{{ post.url | url }}</id>
    <content type="html">{{ post.templateContent | safe }}</content>
  </entry>
  {%- endfor %}
</feed>`;
