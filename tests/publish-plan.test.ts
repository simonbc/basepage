import { test, expect } from "bun:test";
import { planPublish, sanitizeRepoName, isApexDomain } from "../src/lib/publish-plan.ts";

test("no-domain → project repo named after the folder, served on a sub-path", () => {
  const plan = planPublish({ login: "Ada", folderName: "My Site" });
  expect(plan.repo).toBe("my-site");
  expect(plan.pathPrefix).toBe("/my-site/");
  expect(plan.url).toBe("https://ada.github.io/my-site/");
  expect(plan.branch).toBe("gh-pages");
  expect(plan.cname).toBeUndefined();
  expect(plan.dns).toBeUndefined();
});

test("never targets the user's primary <login>.github.io repo", () => {
  const plan = planPublish({ login: "ada", folderName: "ada.github.io" });
  expect(plan.repo).not.toBe("ada.github.io");
  expect(plan.pathPrefix).not.toBe("/");
});

test("apex domain → repo named after the domain, root path, 4 A records", () => {
  const plan = planPublish({ login: "ada", folderName: "site", domain: "ada.dev" });
  expect(plan.repo).toBe("ada.dev");
  expect(plan.pathPrefix).toBe("/");
  expect(plan.url).toBe("https://ada.dev");
  expect(plan.cname).toBe("ada.dev");
  expect(plan.dns?.filter((r) => r.type === "A").map((r) => r.value)).toEqual([
    "185.199.108.153",
    "185.199.109.153",
    "185.199.110.153",
    "185.199.111.153",
  ]);
  expect(plan.dns?.every((r) => r.host === "@")).toBe(true);
});

test("multi-part public suffix apex domains use A records", () => {
  const plan = planPublish({ login: "ada", folderName: "site", domain: "example.co.uk" });
  expect(plan.cname).toBe("example.co.uk");
  expect(plan.dns?.filter((r) => r.type === "A")).toHaveLength(4);
  expect(plan.dns?.every((r) => r.host === "@")).toBe(true);
});

test("subdomain → single CNAME record to <login>.github.io", () => {
  const plan = planPublish({ login: "ada", folderName: "site", domain: "www.ada.dev" });
  expect(plan.repo).toBe("www.ada.dev");
  expect(plan.pathPrefix).toBe("/");
  expect(plan.dns).toEqual([{ type: "CNAME", host: "www", value: "ada.github.io" }]);
});

test("nested subdomains preserve the full registrar host", () => {
  const plan = planPublish({ login: "ada", folderName: "site", domain: "blog.docs.example.co.uk" });
  expect(plan.dns).toEqual([{ type: "CNAME", host: "blog.docs", value: "ada.github.io" }]);
});

test("strips scheme/path and lowercases the domain", () => {
  const plan = planPublish({ login: "ada", folderName: "site", domain: "https://Ada.DEV/blog" });
  expect(plan.repo).toBe("ada.dev");
  expect(plan.cname).toBe("ada.dev");
});

test("sanitizeRepoName keeps dots, collapses junk, trims dashes", () => {
  expect(sanitizeRepoName("Hello World!")).toBe("hello-world");
  expect(sanitizeRepoName("ada.dev")).toBe("ada.dev");
  expect(sanitizeRepoName("--weird__name--")).toBe("weird__name");
  expect(sanitizeRepoName("")).toBe("site");
});

test("isApexDomain distinguishes apex from subdomains", () => {
  expect(isApexDomain("ada.dev")).toBe(true);
  expect(isApexDomain("example.co.uk")).toBe(true);
  expect(isApexDomain("www.ada.dev")).toBe(false);
  expect(isApexDomain("blog.ada.dev")).toBe(false);
});
