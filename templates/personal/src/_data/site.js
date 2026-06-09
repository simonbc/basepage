// Single source of truth for site metadata: the project manifest. Read with a
// builtin only (no node_modules) and resolved relative to this file so it works
// regardless of the working directory.
import { readFileSync } from "node:fs";

// Exported as a function (not a static value) so Eleventy re-reads it on every
// build — edits to basepage.json live-reload into the preview.
export default () =>
  JSON.parse(readFileSync(new URL("../../basepage.json", import.meta.url), "utf8"));
