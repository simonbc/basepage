import { writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { readManifest } from "../lib/manifest.ts";
import { ensureToken } from "../lib/github-auth.ts";
import { GitHub } from "../lib/github.ts";
import { pushDirToBranch } from "../lib/git.ts";
import { planPublish, type PublishPlan } from "../lib/publish-plan.ts";
import { build } from "./build.ts";

export interface PublishResult {
  url: string;
  plan: PublishPlan;
  repoCreated: boolean;
  login: string;
}

export interface PublishDeps {
  authorName?: string;
  authorEmail?: string;
  interactive?: boolean;
  /** Print progress. Default true. */
  log?: (msg: string) => void;
}

/**
 * Build and deploy the site to GitHub Pages.
 *
 * No-domain  → a project repo named after the folder, served at
 *              `<login>.github.io/<repo>/` with `--pathprefix=/<repo>/`.
 * With domain → a repo named after the domain, a CNAME file, the Pages custom
 *              domain set, and the registrar DNS records printed.
 */
export async function publish(siteDir: string, deps: PublishDeps = {}): Promise<PublishResult> {
  const log = deps.log ?? ((m: string) => console.log(m));
  const dir = resolve(siteDir);
  const manifest = readManifest(dir);

  log("Authenticating with GitHub…");
  const { token, source, login } = await ensureToken({ interactive: deps.interactive });
  log(`  ✓ ${login}${source === "gh" ? " (via GitHub CLI)" : ""}`);

  const plan = planPublish({ login, folderName: basename(dir), domain: manifest.domain });

  log(`Building (${plan.pathPrefix})…`);
  const result = await build(dir, { pathPrefix: plan.pathPrefix, clean: true });
  log(`  ✓ ${result.fileCount} files`);

  // GitHub Pages reads the custom domain from a CNAME file at the site root.
  if (plan.cname) writeFileSync(join(result.output, "CNAME"), plan.cname + "\n");

  const gh = new GitHub(token);
  log(`Preparing repo ${login}/${plan.repo}…`);
  const { created } = await gh.ensureRepo(login, plan.repo);
  log(created ? "  ✓ created" : "  ✓ exists");

  log(`Pushing to ${plan.branch}…`);
  pushDirToBranch({
    dir: result.output,
    owner: login,
    repo: plan.repo,
    branch: plan.branch,
    token,
    message: "Publish with Basepage",
    authorName: deps.authorName || login,
    authorEmail: deps.authorEmail || `${login}@users.noreply.github.com`,
  });
  log("  ✓ pushed");

  log("Configuring GitHub Pages…");
  await gh.configurePages(login, plan.repo, plan.branch, plan.cname);
  log("  ✓ enabled");

  return { url: plan.url, plan, repoCreated: created, login };
}

/** Take a published site offline by disabling its Pages site. */
export async function unpublish(
  siteDir: string,
  deps: PublishDeps = {},
): Promise<{ repo: string; removed: boolean }> {
  const log = deps.log ?? ((m: string) => console.log(m));
  const dir = resolve(siteDir);
  const manifest = readManifest(dir);

  const { token, login } = await ensureToken({ interactive: deps.interactive });
  const plan = planPublish({ login, folderName: basename(dir), domain: manifest.domain });

  const gh = new GitHub(token);
  log(`Taking ${login}/${plan.repo} offline…`);
  // GitHub disallows deactivating Pages via the API, so remove its content source.
  const removed = await gh.deleteBranch(login, plan.repo, plan.branch);
  log(
    removed
      ? `  ✓ offline — removed the ${plan.branch} branch (the repo is untouched)`
      : `  • nothing to take offline (no ${plan.branch} branch)`,
  );
  return { repo: plan.repo, removed };
}
