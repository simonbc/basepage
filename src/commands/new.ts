import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readManifest } from "../lib/manifest.ts";

export type NewType = "page" | "post" | "note";

export interface NewOptions {
  siteDir: string;
  type: NewType;
  name: string;
  title?: string;
  /** Post date; defaults to today. */
  date?: Date;
}

export interface NewResult {
  path: string;
  type: NewType;
}

/** "About Me" → "about-me". */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleize(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Scaffold a new page or post with correct front matter and path. */
export function newContent(opts: NewOptions): NewResult {
  const dir = resolve(opts.siteDir);
  readManifest(dir); // ensures this is a Basepage project (throws with guidance otherwise)

  const slug = slugify(opts.name);
  if (!slug) throw new Error(`Provide a name, e.g. \`basepage new ${opts.type} about\`.`);
  const title = opts.title ?? titleize(slug);

  if (opts.type === "page") {
    const file = join(dir, "src", `${slug}.md`);
    if (existsSync(file)) throw new Error(`Already exists: src/${slug}.md`);
    writeFileSync(file, pageScaffold(title));
    return { path: file, type: "page" };
  }

  if (opts.type === "post") {
    const postsDir = join(dir, "src", "posts");
    if (!existsSync(join(postsDir, "posts.json"))) {
      throw new Error("This site isn't a blog yet. Run `basepage add blog` first.");
    }
    const stamp = (opts.date ?? new Date()).toISOString().slice(0, 10);
    const file = join(postsDir, `${stamp}-${slug}.md`);
    if (existsSync(file)) throw new Error(`Already exists: src/posts/${stamp}-${slug}.md`);
    writeFileSync(file, postScaffold(title, stamp));
    return { path: file, type: "post" };
  }

  if (opts.type === "note") {
    const notesDir = join(dir, "src", "notes");
    if (!existsSync(join(notesDir, "notes.json"))) {
      throw new Error("This site isn't a wiki yet. Run `basepage add wiki` first.");
    }
    const file = join(notesDir, `${slug}.md`);
    if (existsSync(file)) throw new Error(`Already exists: src/notes/${slug}.md`);
    writeFileSync(file, noteScaffold(title));
    return { path: file, type: "note" };
  }

  throw new Error(`Unknown type "${opts.type}". Use "page", "post", or "note".`);
}

function pageScaffold(title: string): string {
  return `---
layout: base.njk
title: ${title}
---

# ${title}

Write this page.
`;
}

function postScaffold(title: string, date: string): string {
  return `---
title: ${title}
date: ${date}
---

Write your post.
`;
}

function noteScaffold(title: string): string {
  return `---
title: ${title}
---

Write your note. Link other notes with [[Note title]].
`;
}
