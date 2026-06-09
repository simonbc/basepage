import { rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export interface PushOptions {
  /** Directory whose contents become the branch root (e.g. the build output). */
  dir: string;
  owner: string;
  repo: string;
  branch: string;
  token: string;
  message: string;
  authorName: string;
  authorEmail: string;
}

/**
 * Force-push a directory's contents to a branch as a single fresh commit.
 * Uses a throwaway git repo inside `dir`; the token only ever appears in the
 * push remote URL (never logged).
 */
export function pushDirToBranch(opts: PushOptions): void {
  // Start clean so re-publishes don't accumulate history or stale config.
  rmSync(join(opts.dir, ".git"), { recursive: true, force: true });

  run(opts.dir, ["init", "-q"]);
  run(opts.dir, ["add", "-A"]);
  run(opts.dir, [
    "-c",
    `user.name=${opts.authorName}`,
    "-c",
    `user.email=${opts.authorEmail}`,
    "commit",
    "-q",
    "-m",
    opts.message,
  ]);

  const remote = `https://x-access-token:${opts.token}@github.com/${opts.owner}/${opts.repo}.git`;
  const res = spawnSync("git", ["-C", opts.dir, "push", "-q", "--force", remote, `HEAD:${opts.branch}`], {
    encoding: "utf8",
  });
  if (res.status !== 0) {
    // Redact the token from any error surface.
    const err = (res.stderr || res.stdout || "").replaceAll(opts.token, "***");
    throw new Error(`git push failed: ${err.trim() || "unknown error"}`);
  }

  // Drop the temporary repo so it doesn't pollute the output dir.
  rmSync(join(opts.dir, ".git"), { recursive: true, force: true });
}

function run(dir: string, args: string[]): void {
  const res = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(`git ${args[0]} failed: ${(res.stderr || res.stdout || "").trim()}`);
  }
}
