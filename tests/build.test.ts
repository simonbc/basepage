import { test, expect, afterEach } from "bun:test";
import { mkdtempSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initSite } from "../src/commands/init.ts";
import { build } from "../src/commands/build.ts";

const cwd = process.cwd();
afterEach(() => process.chdir(cwd));

function tmp() {
  return mkdtempSync(join(tmpdir(), "bp-buildpolish-"));
}

test("writes a .nojekyll file and reports a file count", async () => {
  const dir = join(tmp(), "site");
  initSite({ dir, template: "blog", title: "Ada" });
  const result = await build(dir);
  expect(existsSync(join(dir, "_site", ".nojekyll"))).toBe(true);
  expect(result.fileCount).toBeGreaterThan(0);
});

test("cleans stale files from the output dir before building", async () => {
  const dir = join(tmp(), "site");
  initSite({ dir, template: "blank", title: "Card" });

  const out = join(dir, "_site");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "stale.html"), "old");

  await build(dir);
  expect(existsSync(join(out, "stale.html"))).toBe(false);
  expect(existsSync(join(out, "index.html"))).toBe(true);
});
