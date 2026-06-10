import { test, expect } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addFeature } from "../src/commands/add.ts";
import { indexSite, searchSemanticIndex } from "../src/commands/index.ts";
import { initSite } from "../src/commands/init.ts";
import { newContent } from "../src/commands/new.ts";
import type { EmbeddingProvider } from "../src/lib/embeddings.ts";

const provider: EmbeddingProvider = {
  model: "test:keywords",
  async embed(texts: string[]) {
    return texts.map((text) => {
      const lower = text.toLowerCase();
      return [
        lower.includes("git") || lower.includes("revision") || lower.includes("history") ? 1 : 0,
        lower.includes("pasta") || lower.includes("flour") || lower.includes("eggs") ? 1 : 0,
      ];
    });
  },
};

test("indexes markdown chunks and searches them with persisted embeddings", async () => {
  const root = mkdtempSync(join(tmpdir(), "bp-index-"));
  const home = join(root, "home");
  const dir = join(root, "site");
  initSite({ dir, template: "blank", title: "Index" });
  addFeature(dir, "wikilinks");
  newContent({
    siteDir: dir,
    type: "note",
    name: "publishing-history",
    title: "Publishing History",
    body: "Git commits make revision history easy to inspect and restore.",
  });
  newContent({
    siteDir: dir,
    type: "note",
    name: "cooking",
    title: "Cooking",
    body: "Pasta dough needs flour and eggs.",
  });

  const indexed = await indexSite({ site: "notes", siteDir: dir, home, provider });
  expect(indexed.files).toBeGreaterThanOrEqual(2);
  expect(indexed.chunks).toBeGreaterThanOrEqual(2);
  expect(indexed.model).toBe("test:keywords");
  expect(existsSync(join(home, "basepage.pglite", "PG_VERSION"))).toBe(true);

  const results = await searchSemanticIndex({ site: "notes", query: "git revision history", home, provider });
  expect(results[0].title).toBe("Publishing History");
  expect(results[0].file).toBe("notes/publishing-history.md");
});
