import { test, expect } from "bun:test";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initSite } from "../src/commands/init.ts";
import { readManifest } from "../src/lib/manifest.ts";

function tmp() {
  return mkdtempSync(join(tmpdir(), "bp-init-"));
}

test("scaffolds the default template and merges metadata into the manifest", () => {
  const dir = join(tmp(), "site");
  initSite({ dir, template: "default", title: "Ada Lovelace", tagline: "Mathematician", domain: "ada.dev" });

  expect(existsSync(join(dir, "basepage.json"))).toBe(true);
  expect(existsSync(join(dir, "eleventy.config.mjs"))).toBe(true);
  expect(existsSync(join(dir, "AGENTS.md"))).toBe(true);
  expect(existsSync(join(dir, "src", "index.njk"))).toBe(true);
  expect(existsSync(join(dir, "src", "css", "style.css"))).toBe(true);

  const m = readManifest(dir);
  expect(m.kind).toBe("site");
  expect(m.features).toContain("rss");
  expect(m.title).toBe("Ada Lovelace");
  expect(m.tagline).toBe("Mathematician");
  expect(m.domain).toBe("ada.dev");
});

test("scaffolds the minimal template with no features", () => {
  const dir = join(tmp(), "card");
  initSite({ dir, template: "minimal", title: "Hi" });
  const m = readManifest(dir);
  expect(m.kind).toBe("site");
  expect(m.features).toEqual([]);
  expect(m.title).toBe("Hi");
});

test("omits unset metadata keys rather than writing undefined", () => {
  const dir = join(tmp(), "site");
  initSite({ dir, template: "default", title: "Just A Title" });
  const raw = JSON.parse(readFileSync(join(dir, "basepage.json"), "utf8"));
  expect("domain" in raw).toBe(false);
});

test("rejects an unknown template", () => {
  const dir = join(tmp(), "site");
  expect(() => initSite({ dir, template: "nope", title: "x" })).toThrow(/template/i);
});

test("refuses to scaffold into a non-empty directory", () => {
  const dir = join(tmp(), "site");
  initSite({ dir, template: "minimal", title: "first" });
  expect(() => initSite({ dir, template: "minimal", title: "second" })).toThrow(/not empty|exists/i);
});
