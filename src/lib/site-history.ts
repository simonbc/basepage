import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_AUTHOR_NAME = "Basepage";
const DEFAULT_AUTHOR_EMAIL = "basepage@localhost";
const GITIGNORE_LINES = ["_site/", ".basepage/", ".DS_Store"];

export interface CommitResult {
  committed: boolean;
  hash?: string;
}

export interface Revision {
  hash: string;
  shortHash: string;
  subject: string;
  date: string;
}

export interface ChangedFile {
  status: string;
  file: string;
}

export function ensureSiteHistory(siteDir: string, message = "Initial Basepage site"): CommitResult {
  const dir = resolve(siteDir);
  if (!existsSync(join(dir, ".git"))) {
    git(dir, ["init", "-q"]);
    git(dir, ["branch", "-M", "main"], { allowFailure: true });
  }
  ensureGitignore(dir);
  return commitSiteChanges(dir, message);
}

export function commitSiteChanges(siteDir: string, message: string): CommitResult {
  const dir = resolve(siteDir);
  if (!existsSync(join(dir, ".git"))) ensureSiteHistory(dir, message);
  ensureGitignore(dir);
  git(dir, ["add", "-A"]);
  const diff = git(dir, ["diff", "--cached", "--quiet"], { allowFailure: true });
  if (diff.status === 0) return { committed: false };
  git(dir, [
    "-c",
    `user.name=${DEFAULT_AUTHOR_NAME}`,
    "-c",
    `user.email=${DEFAULT_AUTHOR_EMAIL}`,
    "commit",
    "-q",
    "-m",
    message,
  ]);
  return { committed: true, hash: currentRevision(dir) };
}

export function pushSourceRepo(opts: {
  siteDir: string;
  owner: string;
  repo: string;
  branch?: string;
  token: string;
}): void {
  const dir = resolve(opts.siteDir);
  ensureSiteHistory(dir);
  const branch = opts.branch || "main";
  const remote = `https://x-access-token:${opts.token}@github.com/${opts.owner}/${opts.repo}.git`;
  const res = spawnSync("git", ["-C", dir, "push", "-q", remote, `HEAD:${branch}`], {
    encoding: "utf8",
  });
  if (res.status !== 0) {
    const err = (res.stderr || res.stdout || "").replaceAll(opts.token, "***");
    throw new Error(`git push source failed: ${err.trim() || "unknown error"}`);
  }
}

export function listRevisions(siteDir: string, limit = 50): Revision[] {
  const dir = resolve(siteDir);
  if (!existsSync(join(dir, ".git"))) return [];
  const format = "%H%x1f%h%x1f%cI%x1f%s";
  const res = git(dir, ["log", `--max-count=${limit}`, `--format=${format}`], { allowFailure: true });
  if (res.status !== 0 || !res.stdout.trim()) return [];
  return res.stdout.trim().split("\n").map((line) => {
    const [hash, shortHash, date, subject] = line.split("\x1f");
    return { hash, shortHash, date, subject };
  });
}

export function listFileRevisions(siteDir: string, file: string, limit = 50): Revision[] {
  const dir = resolve(siteDir);
  if (!existsSync(join(dir, ".git"))) return [];
  const safeFile = validateRepoPath(file);
  const format = "%H%x1f%h%x1f%cI%x1f%s";
  const res = git(dir, ["log", "--follow", `--max-count=${limit}`, `--format=${format}`, "--", safeFile], {
    allowFailure: true,
  });
  if (res.status !== 0 || !res.stdout.trim()) return [];
  return res.stdout.trim().split("\n").map((line) => {
    const [hash, shortHash, date, subject] = line.split("\x1f");
    return { hash, shortHash, date, subject };
  });
}

export function changedFiles(siteDir: string, from: string, to: string): ChangedFile[] {
  const dir = resolve(siteDir);
  const res = git(dir, ["diff", "--name-status", from, to], { allowFailure: true });
  if (res.status !== 0 || !res.stdout.trim()) return [];
  return res.stdout.trim().split("\n").map((line) => {
    const [status, ...fileParts] = line.split(/\s+/);
    return { status, file: fileParts.join(" ") };
  });
}

export function diffRevisions(siteDir: string, from: string, to: string, file?: string): string {
  const dir = resolve(siteDir);
  const args = ["diff", "--no-ext-diff", "--src-prefix=a/", "--dst-prefix=b/", from, to];
  if (file) args.push("--", validateRepoPath(file));
  const res = git(dir, args, { allowFailure: true });
  return res.stdout || res.stderr || "";
}

export function diffFileRevision(siteDir: string, revision: string, file: string): string {
  const dir = resolve(siteDir);
  const safeFile = validateRepoPath(file);
  const parent = git(dir, ["rev-parse", `${revision}^`], { allowFailure: true });
  const args = parent.status === 0
    ? ["diff", "--no-ext-diff", "--src-prefix=a/", "--dst-prefix=b/", parent.stdout.trim(), revision, "--", safeFile]
    : ["show", "--format=", "--no-ext-diff", "--src-prefix=a/", "--dst-prefix=b/", revision, "--", safeFile];
  const res = git(dir, args, { allowFailure: true });
  return res.stdout || res.stderr || "";
}

export function fileAtRevision(siteDir: string, revision: string, file: string): string {
  const dir = resolve(siteDir);
  const safeFile = validateRepoPath(file);
  const res = git(dir, ["show", `${revision}:${safeFile}`], { allowFailure: true });
  if (res.status !== 0) throw new Error("File does not exist at that revision.");
  return res.stdout;
}

export function currentRevision(siteDir: string): string | undefined {
  const res = git(resolve(siteDir), ["rev-parse", "HEAD"], { allowFailure: true });
  return res.status === 0 ? res.stdout.trim() : undefined;
}

function ensureGitignore(dir: string): void {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, ".gitignore");
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const lines = new Set(existing.split(/\r?\n/).filter(Boolean));
  let changed = false;
  for (const line of GITIGNORE_LINES) {
    if (!lines.has(line)) {
      lines.add(line);
      changed = true;
    }
  }
  if (changed || !existsSync(path)) writeFileSync(path, `${[...lines].join("\n")}\n`);
}

function validateRepoPath(file: string): string {
  const parts = file.split(/[\\/]+/);
  if (!file || file.includes("\0") || file.startsWith("/") || parts.includes("..")) {
    throw new Error("Invalid revision file path.");
  }
  return file.split(sep).join("/");
}

function git(dir: string, args: string[], opts: { allowFailure?: boolean } = {}): { status: number; stdout: string; stderr: string } {
  const res = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  const status = res.status ?? 1;
  if (status !== 0 && !opts.allowFailure) {
    throw new Error(`git ${args[0]} failed: ${(res.stderr || res.stdout || "").trim()}`);
  }
  return { status, stdout: res.stdout || "", stderr: res.stderr || "" };
}
