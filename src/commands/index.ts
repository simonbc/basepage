import { mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { collectDocuments, toSearchResult, type SearchDocument, type SearchResult } from "./search.ts";
import { basepageHome } from "../lib/basepage-home.ts";
import { createEmbeddingProvider, type EmbeddingProvider } from "../lib/embeddings.ts";

export interface IndexOptions {
  site: string;
  siteDir: string;
  home?: string;
  provider?: EmbeddingProvider;
}

export interface IndexResult {
  db: string;
  site: string;
  model: string;
  files: number;
  chunks: number;
}

export interface SemanticIndexSearchOptions {
  site: string;
  query: string;
  home?: string;
  provider?: EmbeddingProvider;
  limit?: number;
}

interface Chunk {
  path: string;
  title: string;
  url: string;
  text: string;
  index: number;
  hash: string;
}

interface Row {
  path: string;
  title: string;
  url: string;
  text: string;
  score: number;
}

export async function indexSite(opts: IndexOptions): Promise<IndexResult> {
  const provider = opts.provider ?? createEmbeddingProvider();
  const docs = collectDocuments(opts.siteDir);
  const chunks = docs.flatMap(chunkDocument);
  const vectors = await embedBatches(provider, chunks.map((chunk) => chunk.text));
  const dbPath = semanticDbPath(opts.home);
  const db = await openSemanticDb(opts.home);
  const now = new Date().toISOString();

  try {
    await db.transaction(async (tx) => {
      await tx.query("delete from chunks where site = $1 and model = $2", [opts.site, provider.model]);
      for (const [index, chunk] of chunks.entries()) {
        const embedding = vectors[index] ?? [];
        await tx.query(
          `
          insert into chunks (
            site, path, title, url, chunk_index, content_hash, text,
            model, embedding_dimensions, embedding, updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector, $11)
          `,
          [
            opts.site,
            chunk.path,
            chunk.title,
            chunk.url,
            chunk.index,
            chunk.hash,
            chunk.text,
            provider.model,
            embedding.length,
            vectorLiteral(embedding),
            now,
          ],
        );
      }
    });
  } finally {
    await db.close();
  }

  return { db: dbPath, site: opts.site, model: provider.model, files: docs.length, chunks: chunks.length };
}

export async function searchSemanticIndex(opts: SemanticIndexSearchOptions): Promise<SearchResult[]> {
  const provider = opts.provider ?? createEmbeddingProvider();
  const db = await openSemanticDb(opts.home);

  try {
    const [queryVector] = await provider.embed([opts.query]);
    const rows = (await db.query<Row>(
      `
      with ranked as (
        select
          path,
          title,
          url,
          text,
          1 - (embedding <=> $1::vector) as score
        from chunks
        where site = $2
          and model = $3
          and embedding_dimensions = $4
      ),
      best_per_page as (
        select distinct on (path)
          path,
          title,
          url,
          text,
          score
        from ranked
        where score > 0
        order by path asc, score desc
      )
      select path, title, url, text, score
      from best_per_page
      order by score desc, path asc
      limit $5
      `,
      [
        vectorLiteral(queryVector),
        opts.site,
        provider.model,
        queryVector.length,
        opts.limit ?? 10,
      ],
    )).rows;

    const terms = opts.query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    return rows.map((row) => toSearchResult(rowToDocument(row), row.score, terms));
  } finally {
    await db.close();
  }
}

export function semanticDbPath(home = basepageHome()): string {
  return join(home, "basepage.pglite");
}

async function openSemanticDb(home = basepageHome()): Promise<PGlite> {
  mkdirSync(home, { recursive: true });
  const db = await PGlite.create(semanticDbPath(home), { extensions: { vector } });
  await db.exec(`
    create extension if not exists vector;
    create table if not exists chunks (
      site text not null,
      path text not null,
      title text not null,
      url text not null,
      chunk_index integer not null,
      content_hash text not null,
      text text not null,
      model text not null,
      embedding_dimensions integer not null,
      embedding vector not null,
      updated_at text not null,
      primary key (site, path, chunk_index, model)
    );
    create index if not exists chunks_site_model on chunks (site, model);
    create index if not exists chunks_site_model_dims on chunks (site, model, embedding_dimensions);
  `);
  return db;
}

function chunkDocument(doc: SearchDocument): Chunk[] {
  const blocks = doc.body.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const chunks: Chunk[] = [];
  let current = "";

  const flush = () => {
    const text = normalizeChunk(`${doc.title}\n${current || doc.body}`);
    if (!text) return;
    chunks.push({
      path: doc.file,
      title: doc.title,
      url: doc.url,
      text,
      index: chunks.length,
      hash: sha256(text),
    });
    current = "";
  };

  for (const block of blocks) {
    if ((current + "\n\n" + block).length > 1400) flush();
    current = current ? `${current}\n\n${block}` : block;
  }
  flush();
  return chunks;
}

async function embedBatches(provider: EmbeddingProvider, texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += 64) {
    vectors.push(...await provider.embed(texts.slice(i, i + 64)));
  }
  return vectors;
}

function rowToDocument(row: Row): SearchDocument {
  return {
    file: row.path,
    title: row.title,
    url: row.url,
    body: row.text,
    text: `${row.title}\n${row.path}\n${row.text}`,
  };
}

function normalizeChunk(text: string): string {
  return text.replace(/^---[\s\S]*?---/, "").replace(/\s+/g, " ").trim();
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function vectorLiteral(values: number[]): string {
  if (!values.length) throw new Error("Embedding provider returned an empty vector.");
  return `[${values.map((value) => {
    if (!Number.isFinite(value)) throw new Error("Embedding provider returned a non-finite vector value.");
    return value;
  }).join(",")}]`;
}
