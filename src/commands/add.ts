import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { manifestPath, readManifest } from "../lib/manifest.ts";

/** Individual features `basepage add` can enable. */
export const KNOWN_FEATURES = ["blog", "rss", "wikilinks", "backlinks", "syntax-highlight"];

// `add` enables a capability or section onto the current site — never a whole-site
// kind (that's `init --template` or `restructure`). `wikilinks` is the capability
// that makes a site a wiki: interlinking + backlinks + a notes section.
const BUNDLES: Record<string, string[]> = {
  blog: ["blog", "rss"],
  wikilinks: ["wikilinks", "backlinks"],
};

/** Everything you can pass to `basepage add`, for help/error text. */
export const ADD_TARGETS = ["blog", "wikilinks", "rss", "syntax-highlight"];

export interface AddResult {
  target: string;
  /** Features actually enabled (a bundle expands, e.g. blog → blog + rss). */
  added: string[];
  /** Scaffold files created (paths relative to the site dir). */
  createdFiles: string[];
}

/**
 * Enable a feature or bundle: flip the manifest flag(s) and drop in any
 * presentation files needed. Build-time logic (collections, filters, plugins,
 * feeds) is injected by Basepage from the manifest — see lib/eleventy.ts.
 */
export function addFeature(siteDir: string, target: string): AddResult {
  const dir = resolve(siteDir);
  readManifest(dir); // validate it's a Basepage project

  const isBundle = target in BUNDLES;
  if (!isBundle && !KNOWN_FEATURES.includes(target)) {
    throw new Error(`Unknown target "${target}". Try: ${ADD_TARGETS.join(", ")}`);
  }

  // Read the raw manifest so we preserve any keys we don't model.
  const file = manifestPath(dir);
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const features = new Set<string>(Array.isArray(raw.features) ? raw.features : []);

  const added = BUNDLES[target] ?? [target];
  for (const f of added) features.add(f);

  const createdFiles: string[] = [];
  if (target === "blog") createdFiles.push(...ensureBlogScaffold(dir));
  // Enabling wikilinks brings the notes section so the capability is usable.
  if (target === "wikilinks" || target === "backlinks") createdFiles.push(...ensureWikiScaffold(dir));

  raw.features = [...features];
  writeFileSync(file, JSON.stringify(raw, null, 2) + "\n");

  return { target, added, createdFiles };
}

/** Create the blog's presentation files if they're missing. Non-destructive. */
export function ensureBlogScaffold(dir: string): string[] {
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

/** Create the wiki's presentation files if they're missing. Non-destructive. */
export function ensureWikiScaffold(dir: string): string[] {
  const created: string[] = [];
  const write = (rel: string, content: string) => {
    const abs = join(dir, rel);
    if (existsSync(abs)) return;
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
    created.push(relative(dir, abs));
  };

  write("src/notes/notes.json", `{\n  "layout": "note.njk",\n  "tags": "note"\n}\n`);
  write("src/_includes/note.njk", NOTE_LAYOUT);
  write("src/notes.njk", NOTES_INDEX);
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

const NOTE_LAYOUT = `---
layout: base.njk
---
<article class="note">
  <h1>{{ title }}</h1>
  {{ content | safe }}

  {% if backlinks.length %}
  <nav class="backlinks">
    <h2>Linking here</h2>
    <ul>
      {% for link in backlinks %}
      <li><a href="{{ link.url | url }}">{{ link.title }}</a></li>
      {% endfor %}
    </ul>
  </nav>
  {% endif %}
</article>
`;

const NOTES_INDEX = `---
layout: base.njk
title: Notes
permalink: /notes/
---
<h1>Notes</h1>
{% if collections.notes | length %}
<ul class="note-list">
  {% for note in collections.notes %}
  <li><a href="{{ note.url | url }}">{{ note.data.title }}</a></li>
  {% endfor %}
</ul>
{% else %}
<p>No notes yet. Run <code>basepage new note &lt;slug&gt;</code> to write one.</p>
{% endif %}
`;
