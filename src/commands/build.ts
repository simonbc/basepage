import { readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createEleventy, type EleventyOptions } from "../lib/eleventy.ts";

export interface BuildOptions extends Omit<EleventyOptions, "runMode" | "port"> {
  /** Remove the output dir before building, so stale files don't linger. Default true. */
  clean?: boolean;
}

export interface BuildResult {
  output: string;
  fileCount: number;
  bytes: number;
}

/** One-shot build to the output directory. Restores the cwd afterwards. */
export async function build(siteDir: string, opts: BuildOptions = {}): Promise<BuildResult> {
  const prevCwd = process.cwd();
  const siteAbs = resolve(siteDir);
  const outName = opts.output ?? "_site";
  const outAbs = resolve(siteAbs, outName);

  try {
    // Guard: only ever clean a path inside the site directory.
    if (opts.clean !== false && outAbs.startsWith(siteAbs + "/")) {
      rmSync(outAbs, { recursive: true, force: true });
    }

    const { elev } = await createEleventy(siteDir, { ...opts, runMode: "build" });
    await elev.write();

    // Signal GitHub Pages to serve files as-is (no Jekyll processing).
    writeFileSync(join(outAbs, ".nojekyll"), "");

    const stats = countFiles(outAbs);
    return { output: outAbs, fileCount: stats.files, bytes: stats.bytes };
  } finally {
    process.chdir(prevCwd);
  }
}

function countFiles(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = countFiles(full);
      files += sub.files;
      bytes += sub.bytes;
    } else if (entry.isFile()) {
      files += 1;
      bytes += statSync(full).size;
    }
  }
  return { files, bytes };
}

/** Human-readable byte size for CLI output. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
