import { test, expect } from "bun:test";
import { describeTemplates, resolveTemplateChoice, listTemplates } from "../src/lib/scaffold.ts";

test("describeTemplates exposes a label + blurb for each kind, default first", () => {
  const infos = describeTemplates();
  const names = infos.map((i) => i.name);
  expect(names[0]).toBe("default");
  expect(names).toContain("minimal");
  for (const info of infos) {
    expect(info.label.length).toBeGreaterThan(0);
    expect(info.blurb.length).toBeGreaterThan(0);
  }
});

test("resolveTemplateChoice handles numbers, names, empty, and junk", () => {
  const names = listTemplates();
  expect(resolveTemplateChoice("1", names)).toEqual({ name: names[0] });
  expect(resolveTemplateChoice("minimal", names)).toEqual({ name: "minimal" });
  expect(resolveTemplateChoice("MINIMAL", names)).toEqual({ name: "minimal" });
  expect(resolveTemplateChoice("", names)).toBe("empty");
  expect(resolveTemplateChoice("   ", names)).toBe("empty");
  expect(resolveTemplateChoice("99", names)).toBe("invalid");
  expect(resolveTemplateChoice("nope", names)).toBe("invalid");
});
