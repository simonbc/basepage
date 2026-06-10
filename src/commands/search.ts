import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

export interface SearchOptions {
  semantic?: boolean;
  limit?: number;
}

export interface SearchResult {
  file: string;
  title: string;
  url: string;
  excerpt: string;
  score: number;
}

interface Document {
  file: string;
  title: string;
  body: string;
  text: string;
  url: string;
}

export function searchSite(siteDir: string, query: string, opts: SearchOptions = {}): SearchResult[] {
  const q = query.trim();
  if (!q) throw new Error("Search query is required.");

  const docs = collectDocuments(siteDir);
  const results = opts.semantic ? semanticSearch(docs, q) : textSearch(docs, q);
  return results.slice(0, opts.limit ?? 10);
}

function collectDocuments(siteDir: string): Document[] {
  const srcDir = resolve(siteDir, "src");
  if (!existsSync(srcDir)) throw new Error(`No src/ directory in ${siteDir}.`);

  const files = listMarkdown(srcDir);
  return files.map((file) => {
    const raw = readFileSync(file, "utf8");
    const { yaml, body } = splitFrontMatter(raw);
    const rel = relative(srcDir, file).split(sep).join("/");
    const title = readTitle(yaml) || titleFromFile(rel);
    return {
      file: rel,
      title,
      body,
      text: `${title}\n${rel}\n${body}`,
      url: renderedUrlForFile(rel),
    };
  });
}

function textSearch(docs: Document[], query: string): SearchResult[] {
  const needle = normalizeText(query);
  const terms = tokens(query);
  return docs
    .map((doc) => {
      const haystack = normalizeText(doc.text);
      const exact = haystack.includes(needle);
      const termHits = terms.filter((term) => haystack.includes(term)).length;
      const titleHits = terms.filter((term) => normalizeText(doc.title).includes(term)).length;
      const score = (exact ? 10 : 0) + termHits + titleHits * 3;
      return { doc, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.doc.file.localeCompare(b.doc.file))
    .map(({ doc, score }) => toResult(doc, score, terms));
}

function semanticSearch(docs: Document[], query: string): SearchResult[] {
  const queryVector = vectorize(query);
  return docs
    .map((doc) => {
      const docVector = vectorize(`${doc.title}\n${doc.title}\n${doc.file}\n${doc.body}`);
      const score = cosine(queryVector, docVector);
      return { doc, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.doc.file.localeCompare(b.doc.file))
    .map(({ doc, score }) => toResult(doc, score, tokens(query)));
}

function listMarkdown(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) continue;
    const abs = join(dir, entry);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      if (entry === "_site" || entry === "node_modules") continue;
      files.push(...listMarkdown(abs));
    } else if (entry.endsWith(".md")) {
      files.push(abs);
    }
  }
  return files.sort();
}

function splitFrontMatter(raw: string): { yaml: string; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) return { yaml: "", body: raw };
  return { yaml: match[1], body: raw.slice(match[0].length) };
}

function readTitle(yaml: string): string {
  const match = yaml.match(/^title\s*:\s*(.*)$/m);
  if (!match) return "";
  const value = match[1].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
}

function titleFromFile(file: string): string {
  return file
    .replace(/\.md$/, "")
    .split("/")
    .pop()!
    .replace(/^\d{4}-\d{2}-\d{2}-/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function renderedUrlForFile(file: string): string {
  return `/${file.replace(/\.md$/, "").replace(/\/index$/, "")}/`.replace(/\/+/g, "/");
}

function toResult(doc: Document, score: number, terms: string[]): SearchResult {
  return {
    file: doc.file,
    title: doc.title,
    url: doc.url,
    excerpt: excerpt(doc.body, terms),
    score,
  };
}

function excerpt(body: string, terms: string[]): string {
  const text = normalizeWhitespace(body.replace(/^#+\s+/gm, ""));
  const lower = text.toLowerCase();
  const index = terms.map((term) => lower.indexOf(term)).filter((item) => item >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, index - 70);
  const slice = text.slice(start, start + 180).trim();
  return `${start > 0 ? "... " : ""}${slice}${start + 180 < text.length ? " ..." : ""}`;
}

function vectorize(text: string): Map<string, number> {
  const vector = new Map<string, number>();
  const words = tokens(text);
  for (const word of words) addWeight(vector, stem(word), 1);
  for (let i = 0; i < words.length - 1; i++) addWeight(vector, `${stem(words[i])}_${stem(words[i + 1])}`, 1.6);
  for (const gram of charGrams(words.join(" "))) addWeight(vector, gram, 0.25);
  return vector;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (const value of a.values()) aMag += value * value;
  for (const value of b.values()) bMag += value * value;
  for (const [key, value] of a) dot += value * (b.get(key) ?? 0);
  return aMag && bMag ? dot / Math.sqrt(aMag * bMag) : 0;
}

function addWeight(vector: Map<string, number>, key: string, weight: number): void {
  if (!key) return;
  vector.set(key, (vector.get(key) ?? 0) + weight);
}

function tokens(text: string): string[] {
  return normalizeText(text).split(/\s+/).filter((term) => term.length > 1 && !STOP_WORDS.has(term));
}

function stem(word: string): string {
  return word.replace(/(?:ing|ed|ly|es|s)$/i, "");
}

function charGrams(text: string): string[] {
  const compact = text.replace(/\s+/g, " ");
  const grams: string[] = [];
  for (let i = 0; i <= compact.length - 4; i++) grams.push(compact.slice(i, i + 4));
  return grams;
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "you",
  "with",
  "that",
  "this",
  "from",
  "are",
  "was",
  "were",
  "but",
  "not",
  "your",
  "have",
  "has",
  "had",
  "into",
  "about",
]);
