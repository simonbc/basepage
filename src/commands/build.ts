import { resolve } from "node:path";
import { createEleventy, type EleventyOptions } from "../lib/eleventy.ts";

/** One-shot build to the output directory. Restores the cwd afterwards. */
export async function build(siteDir: string, opts: Omit<EleventyOptions, "runMode" | "port"> = {}) {
  const prevCwd = process.cwd();
  const out = opts.output ?? "_site";
  try {
    const { elev, manifest } = await createEleventy(siteDir, { ...opts, runMode: "build" });
    await elev.write();
    return { output: resolve(siteDir, out), manifest };
  } finally {
    process.chdir(prevCwd);
  }
}
