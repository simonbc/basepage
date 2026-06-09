import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { manifestPath, readManifest } from "../lib/manifest.ts";

/** Features `basepage add` can enable. */
export const KNOWN_FEATURES = ["blog", "rss", "wikilinks", "backlinks", "syntax-highlight"];

export interface AddResult {
  feature: string;
  /** Features actually enabled (some bundle, e.g. blog → blog + rss). */
  added: string[];
  /** Scaffold files created (paths relative to the site dir). */
  createdFiles: string[];
}

/**
 * Enable a feature: flip the manifest flag(s) and drop in any presentation files
 * the feature needs. Build-time logic (collections, filters, plugins, feeds) is
 * injected by Basepage from the manifest — see lib/eleventy.ts.
 */
export function addFeature(siteDir: string, feature: string): AddResult {
  const dir = resolve(siteDir);
  readManifest(dir); // validate it's a Basepage project

  if (!KNOWN_FEATURES.includes(feature)) {
    throw new Error(`Unknown feature "${feature}". Known: ${KNOWN_FEATURES.join(", ")}`);
  }

  // Read the raw manifest so we preserve any keys we don't model.
  const file = manifestPath(dir);
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const features = new Set<string>(Array.isArray(raw.features) ? raw.features : []);

  const added = feature === "blog" ? ["blog", "rss"] : [feature];
  for (const f of added) features.add(f);

  const createdFiles: string[] = [];
  if (feature === "blog") createdFiles.push(...ensureBlogScaffold(dir));

  raw.features = [...features];
  writeFileSync(file, JSON.stringify(raw, null, 2) + "\n");

  return { feature, added, createdFiles };
}

/** Create the blog's presentation files if they're missing. Non-destructive. */
function ensureBlogScaffold(dir: string): string[] {
  const created: string[] = [];
  const write = (rel: string, content: string) => {
    const abs = join(dir, rel);
    if (existsSync(abs)) return;
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
    created.push(relative(dir, abs));
  };

  write("src/posts/posts.json", `{\n  "layout": "post.njk",\n  "tags": "post"\n}\n`);
  write("src/_includes/post.njk", POST_LAYOUT);
  write("src/blog.njk", BLOG_INDEX);
  return created;
}

const POST_LAYOUT = `---
layout: base.njk
---
<article class="post">
  <h1>{{ title }}</h1>
  <p class="post-meta"><time datetime="{{ page.date | isoDate }}">{{ page.date | readableDate }}</time></p>
  {{ content | safe }}
  <p class="post-back"><a href="{{ '/blog/' | url }}">← All posts</a></p>
</article>
`;

const BLOG_INDEX = `---
layout: base.njk
title: Blog
permalink: /blog/
---
<h1>Writing</h1>
{% if collections.posts | length %}
<ul class="post-list">
  {% for post in collections.posts %}
  <li>
    <a href="{{ post.url | url }}">{{ post.data.title }}</a>
    <time datetime="{{ post.date | isoDate }}">{{ post.date | readableDate }}</time>
  </li>
  {% endfor %}
</ul>
{% else %}
<p>No posts yet. Run <code>basepage new post &lt;slug&gt;</code> to write one.</p>
{% endif %}
`;
