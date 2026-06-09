/** GitHub Pages' apex A-record IPs. */
export const GITHUB_PAGES_IPS = [
  "185.199.108.153",
  "185.199.109.153",
  "185.199.110.153",
  "185.199.111.153",
];

export interface DnsRecord {
  type: "A" | "CNAME";
  /** Host/name field as the registrar expects it (`@` for apex). */
  host: string;
  value: string;
}

export interface PublishPlan {
  /** Repository to publish into (never the user's `<login>.github.io`). */
  repo: string;
  /** Eleventy `pathPrefix` for this deploy (`/` with a domain, `/<repo>/` without). */
  pathPrefix: string;
  /** The URL the site will be served from. */
  url: string;
  /** Branch GitHub Pages serves from. */
  branch: string;
  /** Custom domain, written to a CNAME file when set. */
  cname?: string;
  /** Registrar DNS records to print when a custom domain is used. */
  dns?: DnsRecord[];
}

/** Reduce a string to a valid GitHub repo name (alphanumerics, `.`, `_`, `-`). */
export function sanitizeRepoName(input: string): string {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return cleaned || "site";
}

function hostOf(domain: string): string {
  return domain
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase();
}

/** Apex (e.g. `ada.dev`) vs subdomain (`www.ada.dev`). Two-label hosts are apex. */
export function isApexDomain(domain: string): boolean {
  const host = hostOf(domain);
  if (host.startsWith("www.")) return false;
  return host.split(".").length <= 2;
}

export function planPublish(opts: { login: string; folderName: string; domain?: string }): PublishPlan {
  const branch = "gh-pages";
  const login = opts.login.toLowerCase();

  if (opts.domain && hostOf(opts.domain)) {
    const host = hostOf(opts.domain);
    const dns: DnsRecord[] = isApexDomain(host)
      ? GITHUB_PAGES_IPS.map((value) => ({ type: "A", host: "@", value }))
      : [{ type: "CNAME", host: host.split(".")[0], value: `${login}.github.io` }];
    return {
      repo: sanitizeRepoName(host),
      pathPrefix: "/",
      url: `https://${host}`,
      branch,
      cname: host,
      dns,
    };
  }

  let repo = sanitizeRepoName(opts.folderName);
  // Guard the headline gotcha: a project repo must never be <login>.github.io,
  // which would create/overwrite the user's primary site.
  if (repo === `${login}.github.io`) repo = `${repo}-site`;

  return {
    repo,
    pathPrefix: `/${repo}/`,
    url: `https://${login}.github.io/${repo}/`,
    branch,
  };
}
