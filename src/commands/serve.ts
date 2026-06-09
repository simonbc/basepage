import { createEleventy, type EleventyOptions } from "../lib/eleventy.ts";

/**
 * Start the bundled Eleventy dev server with live reload, applying the manifest's
 * plugins. Returns once watching begins; the process stays alive serving.
 */
export async function serve(siteDir: string, opts: { port?: number } = {}) {
  const port = opts.port ?? 8080;
  const options: EleventyOptions = { runMode: "serve", port };
  const { elev, manifest } = await createEleventy(siteDir, options);
  await elev.init();
  await elev.watch();
  elev.serve(port);
  return { elev, manifest, port };
}
