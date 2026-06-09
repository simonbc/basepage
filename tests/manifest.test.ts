import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readManifest } from "../src/lib/manifest.ts";

function tmp() {
  return mkdtempSync(join(tmpdir(), "bp-manifest-"));
}

test("reads a valid manifest with features defaulted to an array", () => {
  const dir = tmp();
  writeFileSync(join(dir, "basepage.json"), JSON.stringify({ kind: "site" }));
  const m = readManifest(dir);
  expect(m.kind).toBe("site");
  expect(m.features).toEqual([]);
});

test("parses declared features and metadata", () => {
  const dir = tmp();
  writeFileSync(
    join(dir, "basepage.json"),
    JSON.stringify({ kind: "wiki", features: ["wikilinks", "backlinks"], title: "Notes" }),
  );
  const m = readManifest(dir);
  expect(m.features).toEqual(["wikilinks", "backlinks"]);
  expect(m.title).toBe("Notes");
});

test("throws a helpful error when the manifest is missing", () => {
  const dir = tmp();
  expect(() => readManifest(dir)).toThrow(/basepage init/);
});

test("throws when kind is absent", () => {
  const dir = tmp();
  writeFileSync(join(dir, "basepage.json"), JSON.stringify({ features: [] }));
  expect(() => readManifest(dir)).toThrow(/kind/);
});
