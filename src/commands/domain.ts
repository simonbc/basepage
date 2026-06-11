import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import * as dns from "node:dns/promises";
import { parse } from "tldts";
import { manifestPath, readManifest } from "../lib/manifest.ts";
import { hostOf, isApexDomain, planPublish, type DnsRecord } from "../lib/publish-plan.ts";
import { commitSiteChanges } from "../lib/site-history.ts";

export interface DnsResolver {
  resolve4(host: string): Promise<string[]>;
  resolve6(host: string): Promise<string[]>;
  resolveCname(host: string): Promise<string[]>;
}

export interface DomainCheck {
  type: DnsRecord["type"];
  host: string;
  expected: string[];
  actual: string[];
  ok: boolean;
}

export interface DomainCheckResult {
  domain: string;
  isApex: boolean;
  ok: boolean;
  checks: DomainCheck[];
  instructions: DnsRecord[];
}

export function normalizeDomain(input: string): string {
  const host = hostOf(input);
  const parsed = parse(host, { allowPrivateDomains: true });
  if (!host || host.includes(" ") || !parsed.domain) {
    throw new Error(`Invalid domain: ${input}`);
  }
  return host;
}

export function setDomain(siteDir: string, domain: string): { domain: string; path: string } {
  const dir = resolve(siteDir);
  readManifest(dir);
  const path = manifestPath(dir);
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const normalized = normalizeDomain(domain);
  raw.domain = normalized;
  writeFileSync(path, `${JSON.stringify(raw, null, 2)}\n`);
  commitSiteChanges(dir, `Set domain: ${normalized}`);
  return { domain: normalized, path };
}

export async function checkDomain(
  siteDir: string,
  opts: { domain?: string; login?: string; resolver?: DnsResolver } = {},
): Promise<DomainCheckResult> {
  const dir = resolve(siteDir);
  const manifest = readManifest(dir);
  const configuredDomain = opts.domain || manifest.domain;
  if (!configuredDomain) {
    throw new Error("No custom domain set. Run `basepage domain set <domain>` first.");
  }

  const domain = normalizeDomain(configuredDomain);
  const login = opts.login || "USER";
  const resolver = opts.resolver || dns;
  const plan = planPublish({ login, folderName: basename(dir), domain });
  const instructions = (plan.dns || []).map((record) =>
    !opts.login && record.type === "CNAME" ? { ...record, value: "YOUR-GITHUB-USER.github.io" } : record,
  );
  const apex = isApexDomain(domain);

  const checks: DomainCheck[] = apex
    ? [
        await checkValues(resolver, domain, "A", instructions.filter((r) => r.type === "A").map((r) => r.value)),
        await checkValues(resolver, domain, "AAAA", instructions.filter((r) => r.type === "AAAA").map((r) => r.value)),
      ]
    : [
        await checkValues(
          resolver,
          domain,
          "CNAME",
          opts.login ? instructions.filter((r) => r.type === "CNAME").map((r) => r.value) : [],
        ),
      ];

  return {
    domain,
    isApex: apex,
    ok: checks.every((check) => check.ok),
    checks,
    instructions,
  };
}

async function checkValues(
  resolver: DnsResolver,
  domain: string,
  type: DnsRecord["type"],
  expected: string[],
): Promise<DomainCheck> {
  const actual = await resolveRecord(resolver, domain, type);
  const ok = expected.length
    ? sameValues(actual, expected)
    : type === "CNAME" && actual.some((value) => value.endsWith(".github.io"));
  return {
    type,
    host: type === "CNAME" ? domain : "@",
    expected,
    actual,
    ok,
  };
}

async function resolveRecord(
  resolver: DnsResolver,
  domain: string,
  type: DnsRecord["type"],
): Promise<string[]> {
  try {
    const values =
      type === "A"
        ? await resolver.resolve4(domain)
        : type === "AAAA"
          ? await resolver.resolve6(domain)
          : await resolver.resolveCname(domain);
    return values.map(normalizeDnsValue).sort();
  } catch {
    return [];
  }
}

function normalizeDnsValue(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function sameValues(actual: string[], expected: string[]): boolean {
  const a = actual.map(normalizeDnsValue).sort();
  const e = expected.map(normalizeDnsValue).sort();
  return a.length === e.length && a.every((value, index) => value === e[index]);
}
