import { test, expect } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initSite } from "../src/commands/init.ts";
import { checkDomain, setDomain, type DnsResolver } from "../src/commands/domain.ts";
import { GITHUB_PAGES_A_RECORDS, GITHUB_PAGES_AAAA_RECORDS } from "../src/lib/publish-plan.ts";

function tmp() {
  return join(mkdtempSync(join(tmpdir(), "bp-domain-")), "site");
}

function resolver(records: Partial<Record<"A" | "AAAA" | "CNAME", string[]>>): DnsResolver {
  return {
    async resolve4() {
      return records.A || [];
    },
    async resolve6() {
      return records.AAAA || [];
    },
    async resolveCname() {
      return records.CNAME || [];
    },
  };
}

test("sets a normalized custom domain in basepage.json", () => {
  const dir = tmp();
  initSite({ dir, template: "blank", title: "Ada" });

  const result = setDomain(dir, "https://Ada.DEV/blog");

  expect(result.domain).toBe("ada.dev");
  expect(JSON.parse(readFileSync(join(dir, "basepage.json"), "utf8")).domain).toBe("ada.dev");
});

test("checks apex domains against GitHub Pages A and AAAA records", async () => {
  const dir = tmp();
  initSite({ dir, template: "blank", title: "Ada", domain: "ada.dev" });

  const result = await checkDomain(dir, {
    resolver: resolver({ A: GITHUB_PAGES_A_RECORDS, AAAA: GITHUB_PAGES_AAAA_RECORDS }),
  });

  expect(result.ok).toBe(true);
  expect(result.checks.map((check) => check.type)).toEqual(["A", "AAAA"]);
});

test("reports DNS mismatches and the records to add", async () => {
  const dir = tmp();
  initSite({ dir, template: "blank", title: "Ada", domain: "ada.dev" });

  const result = await checkDomain(dir, {
    resolver: resolver({ A: ["213.188.199.7"], AAAA: [] }),
  });

  expect(result.ok).toBe(false);
  expect(result.instructions.filter((record) => record.type === "A")).toHaveLength(4);
  expect(result.instructions.filter((record) => record.type === "AAAA")).toHaveLength(4);
});

test("checks subdomain CNAMEs when a GitHub login is supplied", async () => {
  const dir = tmp();
  initSite({ dir, template: "blank", title: "Ada", domain: "www.ada.dev" });

  const result = await checkDomain(dir, {
    login: "ada",
    resolver: resolver({ CNAME: ["ada.github.io."] }),
  });

  expect(result.ok).toBe(true);
  expect(result.instructions).toEqual([{ type: "CNAME", host: "www", value: "ada.github.io" }]);
});
