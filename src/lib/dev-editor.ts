import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { newContent, slugify, type NewType } from "../commands/new.ts";
import { readManifest } from "./manifest.ts";

const MAX_SAVE_BYTES = 1024 * 1024;
const EDITABLE_EXTENSIONS = new Set([".md"]);

export interface EditableSource {
  file: string;
  title: string;
  body: string;
  draft: boolean;
  path: string;
}

export interface CreatedSource extends EditableSource {
  url: string;
}

interface FrontMatterParts {
  yaml: string;
  body: string;
}

/** Return a `src/`-relative edit path for an Eleventy input path, or null. */
export function editFileParamForInputPath(siteDir: string, inputPath: string | undefined): string | null {
  if (!inputPath) return null;
  const abs = isAbsolute(inputPath) ? resolve(inputPath) : resolve(siteDir, stripDotSlash(inputPath));
  const srcDir = resolve(siteDir, "src");
  if (!isInside(abs, srcDir)) return null;
  if (!EDITABLE_EXTENSIONS.has(extname(abs))) return null;
  return relative(srcDir, abs).split(sep).join("/");
}

/** Resolve and validate a browser-supplied edit path. Only files below `src/` pass. */
export function resolveEditableSourcePath(siteDir: string, file: string): string {
  if (!file || file.includes("\0") || isAbsolute(file)) {
    throw new Error("Invalid source path.");
  }

  const srcDir = resolve(siteDir, "src");
  const target = resolve(srcDir, file);
  if (!isInside(target, srcDir)) {
    throw new Error("Source path must stay inside src/.");
  }
  if (!EDITABLE_EXTENSIONS.has(extname(target))) {
    throw new Error("Only .md source files are editable.");
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    throw new Error("Source file not found.");
  }
  return target;
}

export function readEditableSource(siteDir: string, file: string): EditableSource {
  const path = resolveEditableSourcePath(siteDir, file);
  const raw = readFileSync(path, "utf8");
  const parts = splitFrontMatter(raw);
  const title = readTitle(parts.yaml);
  return {
    file,
    path,
    title,
    draft: readDraft(parts.yaml),
    body: isStandalonePageFile(file) ? stripLeadingPageTitle(parts.body, title) : parts.body,
  };
}

/** Update title + body while preserving all other front matter lines. */
export function writeEditableSource(
  siteDir: string,
  file: string,
  title: string,
  body: string,
  draft = false,
): EditableSource {
  const path = resolveEditableSourcePath(siteDir, file);
  const raw = readFileSync(path, "utf8");
  const nextBody = isStandalonePageFile(file) ? withPageTitle(title, body) : body;
  const next = replaceSource(raw, title, nextBody, draft);
  writeFileSync(path, next);
  return readEditableSource(siteDir, file);
}

export function createEditableSource(siteDir: string, input: {
  type: string;
  title: string;
  slug?: string;
  body: string;
  date?: string;
  draft?: boolean;
}): CreatedSource {
  const type = normalizeNewType(siteDir, input.type);
  const title = input.title.trim();
  if (!title) throw new Error("Title is required.");

  const slug = slugify(input.slug?.trim() || title);
  if (!slug) throw new Error("Slug is required.");

  const date = type === "post" ? parsePostDate(input.date) : undefined;
  const result = newContent({
    siteDir,
    type,
    name: slug,
    title,
    body: input.body,
    date,
    draft: input.draft !== false,
  });
  const file = editFileParamForInputPath(siteDir, result.path);
  if (!file) throw new Error("Created file was not editable.");
  return { ...readEditableSource(siteDir, file), url: renderedUrlForFile(file) };
}

export function injectEditLink(siteDir: string, content: string, page: { inputPath?: string; url?: string }): string {
  const file = editFileParamForInputPath(siteDir, page.inputPath);
  if (!looksLikeHtml(content)) return content;

  const links = [renderNewLink(siteDir, page.url ?? "/")];
  if (file) {
    const params = new URLSearchParams({ file });
    if (page.url) params.set("return", page.url);
    links.unshift(`<a href="/__edit?${escapeAttr(params.toString())}">Edit</a>`);
  }
  const widget = `<style>
.basepage-dev-links{position:fixed;inset-block-start:.75rem;inset-inline-end:1.5rem;z-index:2147483647;display:flex;gap:.4rem;font:500 13px/1.2 var(--font-sans,var(--font,ui-sans-serif,system-ui,sans-serif))}
.basepage-dev-links a,.basepage-dev-links summary{padding:.35rem .6rem;border:1px solid color-mix(in srgb,var(--border,#d8d8d8) 80%,transparent);border-radius:999px;background:color-mix(in srgb,var(--bg,Canvas) 88%,transparent);color:var(--muted,var(--text,CanvasText));text-decoration:none;box-shadow:0 1px 6px rgb(0 0 0/.08);backdrop-filter:blur(8px);cursor:pointer}
.basepage-dev-links a:hover,.basepage-dev-links summary:hover{color:var(--accent,LinkText);border-color:var(--accent,LinkText)}
.basepage-dev-new{position:relative}
.basepage-dev-new summary{list-style:none}
.basepage-dev-new summary::-webkit-details-marker{display:none}
.basepage-dev-new-menu{position:absolute;inset-block-start:calc(100% + .35rem);inset-inline-end:0;display:grid;gap:.25rem;min-width:7.5rem;padding:.35rem;border:1px solid color-mix(in srgb,var(--border,#d8d8d8) 80%,transparent);border-radius:.6rem;background:var(--bg,Canvas);box-shadow:0 8px 24px rgb(0 0 0/.12)}
.basepage-dev-new:not([open]) .basepage-dev-new-menu{display:none}
.basepage-dev-new-menu a{box-shadow:none;border:0;border-radius:.35rem;background:transparent;backdrop-filter:none}
.basepage-dev-new-menu a:hover{background:color-mix(in srgb,var(--accent,LinkText) 10%,transparent)}
</style><nav class="basepage-dev-links" aria-label="Basepage local tools">${links.join("")}</nav>`;

  if (content.includes("</body>")) return content.replace("</body>", `${widget}</body>`);
  return content + widget;
}

export function createDevEditorMiddleware(siteDir: string) {
  return async function basepageDevEditor(req: IncomingMessage, res: ServerResponse, next: () => void) {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (req.method === "GET" && url.pathname === "/__edit") {
        const file = url.searchParams.get("file") ?? "";
        const returnTo = safeReturnPath(url.searchParams.get("return"));
        const source = readEditableSource(siteDir, file);
        sendHtml(res, renderEditor(source, returnTo));
        return;
      }

      if (req.method === "GET" && url.pathname === "/__new") {
        const returnTo = safeReturnPath(url.searchParams.get("return"));
        sendHtml(res, renderNew(siteDir, returnTo, url.searchParams.get("type")));
        return;
      }

      if (req.method === "POST" && url.pathname === "/__save") {
        const form = new URLSearchParams(await readRequestBody(req));
        const file = form.get("file") ?? "";
        const title = form.get("title") ?? "";
        const body = form.get("body") ?? "";
        const draft = form.get("draft") === "true";
        const returnTo = safeReturnPath(form.get("return"));
        writeEditableSource(siteDir, file, title, body, draft);
        res.statusCode = 303;
        res.setHeader("Location", returnTo);
        res.end();
        return;
      }

      if (req.method === "POST" && url.pathname === "/__create") {
        const form = new URLSearchParams(await readRequestBody(req));
        const created = createEditableSource(siteDir, {
          type: form.get("type") ?? "",
          title: form.get("title") ?? "",
          slug: form.get("slug") ?? "",
          body: form.get("body") ?? "",
          date: form.get("date") ?? "",
          draft: form.get("draft") === "true",
        });
        const params = new URLSearchParams({ file: created.file, return: created.url });
        res.statusCode = 303;
        res.setHeader("Location", `/__edit?${params.toString()}`);
        res.end();
        return;
      }
    } catch (err) {
      sendError(res, err instanceof Error ? err.message : String(err));
      return;
    }

    next();
  };
}

function splitFrontMatter(raw: string): FrontMatterParts {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) return { yaml: "", body: raw };
  return { yaml: match[1], body: raw.slice(match[0].length) };
}

function replaceSource(raw: string, title: string, body: string, draft: boolean): string {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  const yaml = match ? match[1] : "";
  const updatedYaml = replaceDraft(replaceTitle(yaml, title), draft);
  const normalizedBody = body.endsWith("\n") ? body : `${body}\n`;
  return `---\n${updatedYaml.trimEnd()}\n---\n\n${normalizedBody}`;
}

function isStandalonePageFile(file: string): boolean {
  return !file.startsWith("posts/") && !file.startsWith("notes/");
}

function stripLeadingPageTitle(body: string, title: string): string {
  const match = body.match(/^(\s*)#\s+(.+?)[ \t]*#*[ \t]*(?:\r?\n|$)/);
  if (!match) return body;

  const heading = match[2].trim();
  if (title.trim() && heading !== title.trim()) return body;
  return body.slice(match[0].length).replace(/^(?:[ \t]*\r?\n)+/, "");
}

function withPageTitle(title: string, body: string): string {
  const cleanTitle = title.trim();
  if (!cleanTitle) return body;
  const cleanBody = body.replace(/^\s*#\s+.+?[ \t]*#*[ \t]*(?:\r?\n|$)/, "").replace(/^(?:[ \t]*\r?\n)+/, "");
  return `# ${cleanTitle}\n\n${cleanBody}`;
}

function replaceTitle(yaml: string, title: string): string {
  const line = `title: ${formatYamlScalar(title.trim())}`;
  if (!yaml.trim()) return line;

  const lines = yaml.split(/\r?\n/);
  const index = lines.findIndex((item) => /^title\s*:/.test(item));
  if (index === -1) return [line, ...lines].join("\n");
  lines[index] = line;
  return lines.join("\n");
}

function readTitle(yaml: string): string {
  const match = yaml.match(/^title\s*:\s*(.*)$/m);
  if (!match) return "";
  return parseYamlScalar(match[1].trim());
}

function readDraft(yaml: string): boolean {
  return /^draft\s*:\s*true\s*$/im.test(yaml);
}

function replaceDraft(yaml: string, draft: boolean): string {
  const lines = yaml.split(/\r?\n/);
  const index = lines.findIndex((item) => /^draft\s*:/.test(item));
  if (draft) {
    if (index === -1) return [...lines, "draft: true"].filter((line) => line.length > 0).join("\n");
    lines[index] = "draft: true";
    return lines.join("\n");
  }
  if (index !== -1) lines[index] = "draft: false";
  return lines.join("\n");
}

function parseYamlScalar(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
}

function formatYamlScalar(value: string): string {
  return JSON.stringify(value);
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_SAVE_BYTES) {
        reject(new Error("Saved content is too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolveBody(body));
    req.on("error", reject);
  });
}

function renderEditor(source: EditableSource, returnTo: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Edit ${escapeHtml(source.title || source.file)}</title>
    <link rel="stylesheet" href="/css/style.css" />
    <style>
      :root{color-scheme:light dark;--editor-bar:color-mix(in srgb,var(--bg,Canvas) 96%,var(--text,CanvasText));--editor-faint:color-mix(in srgb,var(--text,CanvasText) 23%,transparent)}
      *{box-sizing:border-box}
      body{margin:0;background:var(--bg,Canvas);color:var(--text,CanvasText);font-family:var(--font-sans,var(--font,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif));line-height:1.55;overflow:hidden}
      .editor-form{min-height:100vh}
      .editor-stage{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);height:calc(100vh - 5.25rem)}
      .editor-pane{min-width:0;padding:clamp(2rem,5vw,4.6rem) clamp(1.5rem,5vw,5rem);overflow:auto}
      .editor-write{border-inline-end:1px solid var(--border,#e6e6e6)}
      .title-row{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:.55rem;margin-bottom:2.3rem;color:var(--editor-faint);font-family:var(--font-mono,ui-monospace,"SF Mono",Menlo,Consolas,monospace);font-size:clamp(1.9rem,4vw,2.6rem);font-weight:700;line-height:1.15}
      .title-row span{user-select:none}
      input,textarea{display:block;width:100%;border:0;background:transparent;color:var(--text,CanvasText);font:inherit;outline:none}
      input::placeholder,textarea::placeholder{color:var(--editor-faint);opacity:1}
      #title{min-width:0;padding:0;font-family:inherit;font-size:inherit;font-weight:inherit;line-height:inherit}
      #body{height:calc(100vh - 21rem);min-height:18rem;resize:none;padding:0;font-family:var(--font-mono,ui-monospace,"SF Mono",Menlo,Consolas,monospace);font-size:clamp(1.05rem,1.7vw,1.45rem);line-height:1.65}
      .editor-preview{font-family:var(--font-serif,ui-serif,Georgia,Cambria,"Times New Roman",serif)}
      .editor-preview h1{font-family:var(--font-sans,var(--font,ui-sans-serif,system-ui,sans-serif));font-size:clamp(2.4rem,5vw,4rem);line-height:1.05;margin:0 0 2.5rem;letter-spacing:0;font-weight:750}
      .editor-preview h2{font-family:var(--font-sans,var(--font,ui-sans-serif,system-ui,sans-serif));font-size:clamp(1.5rem,3vw,2.1rem);line-height:1.15;margin:2rem 0 1rem;letter-spacing:0}
      .editor-preview p{font-size:clamp(1.15rem,2vw,1.55rem);line-height:1.62;margin:0 0 1.2rem;max-width:40rem}
      .editor-preview strong{font-weight:700}
      .editor-preview em{font-style:italic}
      .editor-preview code{font-family:var(--font-mono,ui-monospace,"SF Mono",Menlo,Consolas,monospace);font-size:.85em;color:var(--muted,#777)}
      .editor-preview a{color:var(--accent,LinkText);text-decoration-thickness:1px;text-underline-offset:3px}
      .editor-preview.is-empty{color:var(--editor-faint);font-family:var(--font-mono,ui-monospace,"SF Mono",Menlo,Consolas,monospace);font-size:1.4rem}
      .editor-bar{position:fixed;inset-inline:0;inset-block-end:0;height:5.25rem;border-top:1px solid var(--border,#e6e6e6);background:var(--editor-bar);display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:1rem;padding:0 clamp(1.5rem,5vw,5rem)}
      .editor-mode{color:var(--muted,#888);font-size:1rem}
      .editor-file{justify-self:center;max-width:min(26rem,38vw);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:1px solid var(--border,#e6e6e6);border-radius:999px;color:var(--muted,#888);padding:.45rem .9rem;font-family:var(--font-mono,ui-monospace,"SF Mono",Menlo,Consolas,monospace);background:var(--bg,Canvas)}
      .editor-actions{justify-self:end;display:flex;align-items:center;gap:.75rem}
      .editor-draft{display:flex;align-items:center;gap:.45rem;color:var(--muted,#888);white-space:nowrap}
      .editor-draft input{width:1rem;height:1rem;accent-color:var(--accent,#198754)}
      button,.button{border:1px solid var(--border,#e6e6e6);border-radius:999px;background:var(--bg,Canvas);color:var(--text,CanvasText);padding:.78rem 1.45rem;font:inherit;text-decoration:none;cursor:pointer;line-height:1.1}
      button{border-color:var(--accent,#198754);background:var(--accent,#198754);color:var(--bg,Canvas);min-width:5.8rem}
      button:hover,.button:hover{filter:brightness(.97)}
      @media (prefers-color-scheme: dark){:root{--editor-faint:color-mix(in srgb,var(--text,CanvasText) 30%,transparent)}button:hover,.button:hover{filter:brightness(1.12)}}
      @media (max-width:760px){body{overflow:auto}.editor-stage{display:block;height:auto;padding-bottom:5.25rem}.editor-pane{padding:1.5rem}.editor-write{border-inline-end:0;border-bottom:1px solid var(--border,#e6e6e6)}#body{height:38vh}.editor-preview{display:none}.editor-bar{grid-template-columns:1fr auto;padding-inline:1rem}.editor-file{display:none}.editor-mode{font-size:.95rem}}
    </style>
  </head>
  <body>
    <form class="editor-form" method="post" action="/__save">
      <main class="editor-stage">
        <section class="editor-pane editor-write" aria-label="Markdown editor">
        <input type="hidden" name="file" value="${escapeAttr(source.file)}" />
        <input type="hidden" name="return" value="${escapeAttr(returnTo)}" />
          <label class="title-row" for="title"><span>#</span><input id="title" name="title" value="${escapeAttr(source.title)}" placeholder="Title" autocomplete="off" /></label>
          <textarea id="body" name="body" spellcheck="true" placeholder="Write something...">${escapeHtml(source.body)}</textarea>
        </section>
        <section class="editor-pane editor-preview" id="preview" aria-label="Preview"></section>
      </main>
      <footer class="editor-bar">
        <div class="editor-mode">Markdown &nbsp; <strong>**bold**</strong> &nbsp; <em>*italic*</em> &nbsp; <code>[[wikilink]]</code></div>
        <div class="editor-file">/${escapeHtml(source.file.replace(/\.[^.]+$/, ""))}</div>
        <div class="editor-actions">
          <label class="editor-draft"><input type="checkbox" name="draft" value="true"${source.draft ? " checked" : ""} /> Draft</label>
          <a class="button" href="${escapeAttr(returnTo)}">Cancel</a>
          <button type="submit">Save</button>
        </div>
      </footer>
    </form>
    <script>
      const title = document.getElementById("title");
      const body = document.getElementById("body");
      const preview = document.getElementById("preview");
      const escapeHtml = (value) => value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
      const inline = (value) => escapeHtml(value)
        .replace(/\\[\\[([^\\]|]+)(?:\\|([^\\]]+))?\\]\\]/g, (_m, target, label) => '<a href="#">' + escapeHtml(label || target) + '</a>')
        .replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>")
        .replace(/\\*([^*]+)\\*/g, "<em>$1</em>")
        .replace(/\\\`([^\\\`]+)\\\`/g, "<code>$1</code>");
      const render = () => {
        const blocks = body.value.split(/\\n{2,}/).map((block) => block.trim()).filter(Boolean);
        let html = "";
        const titleText = title.value.trim();
        if (titleText) html += "<h1>" + escapeHtml(titleText) + "</h1>";
        for (const block of blocks) {
          if (block.startsWith("## ")) html += "<h2>" + inline(block.slice(3)) + "</h2>";
          else if (block.startsWith("# ")) html += "<h2>" + inline(block.slice(2)) + "</h2>";
          else html += "<p>" + inline(block).replaceAll("\\n", "<br>") + "</p>";
        }
        preview.classList.toggle("is-empty", !html);
        preview.innerHTML = html || "Preview";
      };
      title.addEventListener("input", render);
      body.addEventListener("input", render);
      render();
    </script>
  </body>
</html>`;
}

function renderNew(siteDir: string, returnTo: string, requestedType: string | null): string {
  const types = availableNewTypes(siteDir);
  const type = requestedType && types.includes(requestedType as NewType) ? requestedType as NewType : types[0];
  const today = new Date().toISOString().slice(0, 10);
  const heading = `New ${typeLabel(type)}`;
  const pathPrefix = type === "post" ? `posts/${today}-` : type === "note" ? "notes/" : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(heading)}</title>
    <link rel="stylesheet" href="/css/style.css" />
    <style>
      :root{color-scheme:light dark;--editor-bar:color-mix(in srgb,var(--bg,Canvas) 96%,var(--text,CanvasText));--editor-faint:color-mix(in srgb,var(--text,CanvasText) 23%,transparent)}
      *{box-sizing:border-box}
      body{margin:0;background:var(--bg,Canvas);color:var(--text,CanvasText);font-family:var(--font-sans,var(--font,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif));line-height:1.55;overflow:hidden}
      .editor-form{min-height:100vh}
      .editor-stage{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);height:calc(100vh - 5.25rem)}
      .editor-pane{min-width:0;padding:clamp(2rem,5vw,4.6rem) clamp(1.5rem,5vw,5rem);overflow:auto}
      .editor-write{border-inline-end:1px solid var(--border,#e6e6e6)}
      .title-row{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:.55rem;margin-bottom:2.3rem;color:var(--editor-faint);font-family:var(--font-mono,ui-monospace,"SF Mono",Menlo,Consolas,monospace);font-size:clamp(1.9rem,4vw,2.6rem);font-weight:700;line-height:1.15}
      .title-row span{user-select:none}
      input,textarea{display:block;width:100%;border:0;background:transparent;color:var(--text,CanvasText);font:inherit;outline:none}
      input::placeholder,textarea::placeholder{color:var(--editor-faint);opacity:1}
      #title{min-width:0;padding:0;font-family:inherit;font-size:inherit;font-weight:inherit;line-height:inherit}
      #body{height:calc(100vh - 24rem);min-height:18rem;resize:none;padding:0;font-family:var(--font-mono,ui-monospace,"SF Mono",Menlo,Consolas,monospace);font-size:clamp(1.05rem,1.7vw,1.45rem);line-height:1.65}
      .editor-preview{font-family:var(--font-serif,ui-serif,Georgia,Cambria,"Times New Roman",serif)}
      .editor-preview h1{font-family:var(--font-sans,var(--font,ui-sans-serif,system-ui,sans-serif));font-size:clamp(2.4rem,5vw,4rem);line-height:1.05;margin:0 0 2.5rem;letter-spacing:0;font-weight:750}
      .editor-preview h2{font-family:var(--font-sans,var(--font,ui-sans-serif,system-ui,sans-serif));font-size:clamp(1.5rem,3vw,2.1rem);line-height:1.15;margin:2rem 0 1rem;letter-spacing:0}
      .editor-preview p{font-size:clamp(1.15rem,2vw,1.55rem);line-height:1.62;margin:0 0 1.2rem;max-width:40rem}
      .editor-preview strong{font-weight:700}
      .editor-preview em{font-style:italic}
      .editor-preview code{font-family:var(--font-mono,ui-monospace,"SF Mono",Menlo,Consolas,monospace);font-size:.85em;color:var(--muted,#777)}
      .editor-preview a{color:var(--accent,LinkText);text-decoration-thickness:1px;text-underline-offset:3px}
      .editor-preview.is-empty{color:var(--editor-faint);font-family:var(--font-mono,ui-monospace,"SF Mono",Menlo,Consolas,monospace);font-size:1.4rem}
      .editor-bar{position:fixed;inset-inline:0;inset-block-end:0;height:5.25rem;border-top:1px solid var(--border,#e6e6e6);background:var(--editor-bar);display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:1rem;padding:0 clamp(1.5rem,5vw,5rem)}
      .editor-mode{color:var(--muted,#888);font-size:1rem}
      .editor-file{justify-self:center;max-width:min(26rem,38vw);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:1px solid var(--border,#e6e6e6);border-radius:999px;color:var(--muted,#888);padding:.45rem .9rem;font-family:var(--font-mono,ui-monospace,"SF Mono",Menlo,Consolas,monospace);background:var(--bg,Canvas)}
      .editor-actions{justify-self:end;display:flex;align-items:center;gap:.75rem}
      .editor-draft{display:flex;align-items:center;gap:.45rem;color:var(--muted,#888);white-space:nowrap}
      .editor-draft input{width:1rem;height:1rem;accent-color:var(--accent,#198754)}
      button,.button{border:1px solid var(--border,#e6e6e6);border-radius:999px;background:var(--bg,Canvas);color:var(--text,CanvasText);padding:.78rem 1.45rem;font:inherit;text-decoration:none;cursor:pointer;line-height:1.1}
      button{border-color:var(--accent,#198754);background:var(--accent,#198754);color:var(--bg,Canvas);min-width:5.8rem}
      button:hover,.button:hover{filter:brightness(.97)}
      @media (prefers-color-scheme: dark){:root{--editor-faint:color-mix(in srgb,var(--text,CanvasText) 30%,transparent)}button:hover,.button:hover{filter:brightness(1.12)}}
      @media (max-width:760px){body{overflow:auto}.editor-stage{display:block;height:auto;padding-bottom:5.25rem}.editor-pane{padding:1.5rem}.editor-write{border-inline-end:0;border-bottom:1px solid var(--border,#e6e6e6)}#body{height:38vh}.editor-preview{display:none}.editor-bar{grid-template-columns:1fr auto;padding-inline:1rem}.editor-file{display:none}.editor-mode{font-size:.95rem}}
    </style>
  </head>
  <body>
    <form class="editor-form" method="post" action="/__create">
      <main class="editor-stage">
        <section class="editor-pane editor-write" aria-label="Markdown editor">
          <input type="hidden" name="type" value="${type}" />
          <input type="hidden" id="slug" name="slug" value="" />
          <input type="hidden" name="date" value="${today}" />
          <label class="title-row" for="title"><span>#</span><input id="title" name="title" placeholder="Title" autocomplete="off" autofocus /></label>
          <textarea id="body" name="body" spellcheck="true" placeholder="Write something..."></textarea>
        </section>
        <section class="editor-pane editor-preview" id="preview" aria-label="Preview"></section>
      </main>
      <footer class="editor-bar">
        <div class="editor-mode">Markdown &nbsp; <strong>**bold**</strong> &nbsp; <em>*italic*</em> &nbsp; <code>[[wikilink]]</code></div>
        <div class="editor-file" id="file-preview">/${escapeHtml(pathPrefix)}untitled</div>
        <div class="editor-actions">
        <label class="editor-draft"><input type="checkbox" name="draft" value="true" checked /> Draft</label>
        <a class="button" href="${escapeAttr(returnTo)}">Cancel</a>
        <button type="submit">Create</button>
        </div>
      </footer>
    </form>
    <script>
      const title = document.getElementById("title");
      const body = document.getElementById("body");
      const preview = document.getElementById("preview");
      const slugInput = document.getElementById("slug");
      const filePreview = document.getElementById("file-preview");
      const pathPrefix = ${JSON.stringify(pathPrefix)};
      const slugify = (value) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const escapeHtml = (value) => value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
      const inline = (value) => escapeHtml(value)
        .replace(/\\[\\[([^\\]|]+)(?:\\|([^\\]]+))?\\]\\]/g, (_m, target, label) => '<a href="#">' + escapeHtml(label || target) + '</a>')
        .replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>")
        .replace(/\\*([^*]+)\\*/g, "<em>$1</em>")
        .replace(/\\\`([^\\\`]+)\\\`/g, "<code>$1</code>");
      const render = () => {
        const slug = slugify(title.value) || "untitled";
        slugInput.value = slug;
        filePreview.textContent = "/" + pathPrefix + slug;
        const blocks = body.value.split(/\\n{2,}/).map((block) => block.trim()).filter(Boolean);
        let html = "";
        const titleText = title.value.trim();
        if (titleText) html += "<h1>" + escapeHtml(titleText) + "</h1>";
        for (const block of blocks) {
          if (block.startsWith("## ")) html += "<h2>" + inline(block.slice(3)) + "</h2>";
          else if (block.startsWith("# ")) html += "<h2>" + inline(block.slice(2)) + "</h2>";
          else html += "<p>" + inline(block).replaceAll("\\n", "<br>") + "</p>";
        }
        preview.classList.toggle("is-empty", !html);
        preview.innerHTML = html || "Preview";
      };
      title.addEventListener("input", render);
      body.addEventListener("input", render);
      render();
    </script>
  </body>
</html>`;
}

function renderNewLink(siteDir: string, returnTo: string): string {
  const types = availableNewTypes(siteDir);
  const paramsFor = (type: NewType) => {
    const params = new URLSearchParams({ type, return: returnTo });
    return escapeAttr(params.toString());
  };
  if (types.length === 1) {
    return `<a href="/__new?${paramsFor(types[0])}">+ New</a>`;
  }

  const items = types
    .map((type) => `<a href="/__new?${paramsFor(type)}">New ${typeLabel(type)}</a>`)
    .join("");
  return `<details class="basepage-dev-new"><summary>+ New</summary><div class="basepage-dev-new-menu">${items}</div></details>`;
}

function sendHtml(res: ServerResponse, html: string): void {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
}

function sendError(res: ServerResponse, message: string): void {
  res.statusCode = 400;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(message);
}

function availableNewTypes(siteDir: string): NewType[] {
  const types: NewType[] = [];
  const features = new Set(readManifest(siteDir).features);
  if (features.has("blog") && existsSync(resolve(siteDir, "src", "posts", "posts.json"))) types.push("post");
  if (
    (features.has("wikilinks") || features.has("backlinks")) &&
    existsSync(resolve(siteDir, "src", "notes", "notes.json"))
  ) {
    types.push("note");
  }
  types.push("page");
  return types;
}

function normalizeNewType(siteDir: string, value: string): NewType {
  if (value !== "page" && value !== "post" && value !== "note") {
    throw new Error('Choose "page", "post", or "note".');
  }
  if (!availableNewTypes(siteDir).includes(value)) {
    if (value === "post") throw new Error("This site isn't a blog yet. Run `basepage add blog` first.");
    if (value === "note") throw new Error("This site isn't a wiki yet. Run `basepage add wikilinks` first.");
  }
  return value;
}

function parsePostDate(value: string | undefined): Date {
  if (!value) return new Date();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Post date must be YYYY-MM-DD.");
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error("Post date is invalid.");
  return date;
}

function typeLabel(type: NewType): string {
  if (type === "post") return "Post";
  if (type === "note") return "Note";
  return "Page";
}

function renderedUrlForFile(file: string): string {
  return `/${file.replace(/\.md$/, "").replace(/\/index$/, "")}/`.replace(/\/+/g, "/");
}

function safeReturnPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function looksLikeHtml(content: string): boolean {
  return /<\/(?:body|html)>/i.test(content) || /^\s*<!doctype html/i.test(content);
}

function isInside(target: string, root: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function stripDotSlash(path: string): string {
  return path.replace(/^\.\//, "");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
