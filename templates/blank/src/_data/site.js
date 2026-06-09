import { readFileSync } from "node:fs";

// Exported as a function so Eleventy re-reads it on every build — edits to
// basepage.json live-reload into the preview.
export default () =>
  JSON.parse(readFileSync(new URL("../../basepage.json", import.meta.url), "utf8"));
