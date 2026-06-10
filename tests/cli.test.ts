import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");

test("init on an existing Basepage site remembers it without scaffolding again", async () => {
  const root = mkdtempSync(join(tmpdir(), "bp-cli-"));
  const home = join(root, "home");
  const site = join(root, "notes");

  const first = Bun.spawnSync({
    cmd: ["bun", "run", CLI, "init", site, "--template", "wiki", "--title", "Notes", "--yes"],
    env: { ...process.env, BASEPAGE_HOME: home },
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(first.exitCode).toBe(0);

  const second = Bun.spawnSync({
    cmd: ["bun", "run", CLI, "init", site, "--yes"],
    env: { ...process.env, BASEPAGE_HOME: home },
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = second.stdout.toString();
  expect(second.exitCode).toBe(0);
  expect(stdout).toContain("Already a Basepage site");
  expect(stdout).toContain('Remembered as "notes"');
});
