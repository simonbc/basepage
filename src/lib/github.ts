import { ghHeaders } from "./github-auth.ts";

/** Thin GitHub REST client for the bits publish needs. */
export class GitHub {
  constructor(private token: string) {}

  private async api(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`https://api.github.com${path}`, {
      ...init,
      headers: { ...ghHeaders(this.token), ...(init.headers as Record<string, string>) },
    });
  }

  private async json<T>(res: Response, action: string): Promise<T> {
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`GitHub ${action} failed (${res.status}): ${trimDetail(detail)}`);
    }
    return res.json() as Promise<T>;
  }

  async getRepo(owner: string, repo: string): Promise<{ full_name: string } | null> {
    const res = await this.api(`/repos/${owner}/${repo}`);
    if (res.status === 404) return null;
    return this.json(res, "repo lookup");
  }

  async createRepo(name: string): Promise<{ full_name: string }> {
    const res = await this.api("/user/repos", {
      method: "POST",
      body: JSON.stringify({
        name,
        description: "Published with Basepage",
        private: false,
        has_issues: false,
        has_wiki: false,
        // Seed a `main` default branch so the pushed `gh-pages` content branch
        // stays deletable (you can't delete a repo's default branch).
        auto_init: true,
      }),
    });
    return this.json(res, "repo create");
  }

  async ensureRepo(owner: string, repo: string): Promise<{ created: boolean }> {
    const existing = await this.getRepo(owner, repo);
    if (existing) return { created: false };
    await this.createRepo(repo);
    return { created: true };
  }

  async getPages(owner: string, repo: string): Promise<{ html_url: string } | null> {
    const res = await this.api(`/repos/${owner}/${repo}/pages`);
    if (res.status === 404) return null;
    return this.json(res, "pages lookup");
  }

  /** Create or update the Pages site to serve `branch` at root, optional custom domain. */
  async configurePages(owner: string, repo: string, branch: string, cname?: string): Promise<void> {
    const source = { branch, path: "/" };
    const exists = await this.getPages(owner, repo);

    if (!exists) {
      const res = await this.api(`/repos/${owner}/${repo}/pages`, {
        method: "POST",
        body: JSON.stringify({ build_type: "legacy", source, ...(cname ? { cname } : {}) }),
      });
      // GitHub occasionally returns 500 right after the first push even though the
      // site is created — verify by polling before declaring failure.
      if (!res.ok && res.status !== 409) {
        if (!(await this.waitForPages(owner, repo))) {
          const detail = await res.text().catch(() => "");
          throw new Error(`GitHub pages enable failed (${res.status}): ${trimDetail(detail)}`);
        }
      }
    }

    if (exists || cname) {
      const res = await this.api(`/repos/${owner}/${repo}/pages`, {
        method: "PUT",
        body: JSON.stringify({ source, ...(cname ? { cname } : {}) }),
      });
      // 204 on success; tolerate 400 when nothing changed.
      if (!res.ok && res.status !== 400) {
        const detail = await res.text().catch(() => "");
        throw new Error(`GitHub pages update failed (${res.status}): ${trimDetail(detail)}`);
      }
    }
  }

  /** Poll a few times for a Pages site to exist (handles the post-push 500 race). */
  private async waitForPages(owner: string, repo: string, attempts = 5): Promise<boolean> {
    for (let i = 0; i < attempts; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      if (await this.getPages(owner, repo)) return true;
    }
    return false;
  }

  /**
   * Delete a branch. Used to take a published site offline — GitHub no longer
   * allows deactivating Pages via the API (422), so we remove its content source.
   * Returns false if the branch was already gone.
   */
  async deleteBranch(owner: string, repo: string, branch: string): Promise<boolean> {
    const res = await this.api(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      method: "DELETE",
    });
    if (res.status === 404 || res.status === 422) return false;
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`GitHub branch delete failed (${res.status}): ${trimDetail(detail)}`);
    }
    return true;
  }
}

function trimDetail(detail: string): string {
  try {
    const parsed = JSON.parse(detail);
    return parsed.message ?? detail.slice(0, 200);
  } catch {
    return detail.slice(0, 200);
  }
}
