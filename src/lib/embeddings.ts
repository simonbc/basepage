export interface EmbeddingProvider {
  model: string;
  embed(texts: string[]): Promise<number[][]>;
}

export function createEmbeddingProvider(env: Record<string, string | undefined> = process.env): EmbeddingProvider {
  const requested = (env.BASEPAGE_EMBEDDING_PROVIDER || "auto").toLowerCase();
  if (requested === "voyage" || (requested === "auto" && (env.BASEPAGE_VOYAGE_API_KEY || env.VOYAGE_API_KEY))) {
    return createVoyageEmbeddingProvider(env);
  }
  if (requested === "openai" || (requested === "auto" && (env.BASEPAGE_OPENAI_API_KEY || env.OPENAI_API_KEY))) {
    return createOpenAIEmbeddingProvider(env);
  }
  if (requested === "ollama" || (requested === "auto" && (env.BASEPAGE_OLLAMA_HOST || env.OLLAMA_HOST))) {
    return createOllamaEmbeddingProvider(env);
  }
  if (requested === "local") return createLocalEmbeddingProvider(env);

  throw new Error(
    "No embedding provider configured. Set VOYAGE_API_KEY, OPENAI_API_KEY, BASEPAGE_EMBEDDING_PROVIDER=ollama, or BASEPAGE_EMBEDDING_PROVIDER=local, then run `basepage index <site>`.",
  );
}

export function createOpenAIEmbeddingProvider(env: Record<string, string | undefined> = process.env): EmbeddingProvider {
  const apiKey = env.BASEPAGE_OPENAI_API_KEY || env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY or BASEPAGE_OPENAI_API_KEY is required for the OpenAI embedding provider.");

  const model = env.BASEPAGE_EMBEDDING_MODEL || "text-embedding-3-small";
  const baseUrl = env.BASEPAGE_EMBEDDING_BASE_URL || env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  return {
    model: `openai:${model}`,
    async embed(texts: string[]) {
      if (!texts.length) return [];
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/embeddings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, input: texts }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Embedding request failed (${response.status}): ${body}`);
      }

      const payload = await response.json() as { data?: Array<{ embedding?: number[] }> };
      const vectors = payload.data?.map((item) => item.embedding).filter((item): item is number[] => Array.isArray(item)) ?? [];
      if (vectors.length !== texts.length) throw new Error("Embedding response did not match request size.");
      return vectors;
    },
  };
}

export function createVoyageEmbeddingProvider(env: Record<string, string | undefined> = process.env): EmbeddingProvider {
  const apiKey = env.BASEPAGE_VOYAGE_API_KEY || env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY or BASEPAGE_VOYAGE_API_KEY is required for the Voyage embedding provider.");

  const model = env.BASEPAGE_EMBEDDING_MODEL || "voyage-3.5";
  const baseUrl = env.BASEPAGE_EMBEDDING_BASE_URL || env.VOYAGE_BASE_URL || "https://api.voyageai.com/v1";
  return {
    model: `voyage:${model}`,
    async embed(texts: string[]) {
      if (!texts.length) return [];
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/embeddings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, input: texts }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Voyage embedding request failed (${response.status}): ${body}`);
      }

      const payload = await response.json() as { data?: Array<{ embedding?: number[] }> };
      const vectors = payload.data?.map((item) => item.embedding).filter((item): item is number[] => Array.isArray(item)) ?? [];
      if (vectors.length !== texts.length) throw new Error("Voyage embedding response did not match request size.");
      return vectors;
    },
  };
}

export function createOllamaEmbeddingProvider(env: Record<string, string | undefined> = process.env): EmbeddingProvider {
  const model = env.BASEPAGE_EMBEDDING_MODEL || "nomic-embed-text";
  const host = env.BASEPAGE_OLLAMA_HOST || env.OLLAMA_HOST || "http://localhost:11434";
  return {
    model: `ollama:${model}`,
    async embed(texts: string[]) {
      if (!texts.length) return [];
      const response = await fetch(`${host.replace(/\/$/, "")}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: texts }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Ollama embedding request failed (${response.status}): ${body}`);
      }

      const payload = await response.json() as { embeddings?: number[][] };
      const vectors = payload.embeddings ?? [];
      if (vectors.length !== texts.length) throw new Error("Ollama embedding response did not match request size.");
      return vectors;
    },
  };
}

export function createLocalEmbeddingProvider(env: Record<string, string | undefined> = process.env): EmbeddingProvider {
  const dimensions = Number(env.BASEPAGE_LOCAL_EMBEDDING_DIMS || 128);
  return {
    model: `local:${dimensions}`,
    async embed(texts: string[]) {
      return texts.map((text) => localVector(text, dimensions));
    },
  };
}

function localVector(text: string, dimensions: number): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (const token of tokens) {
    let hash = 2166136261;
    for (const char of token) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    vector[Math.abs(hash) % dimensions] += 1;
  }
  const mag = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return mag ? vector.map((value) => value / mag) : vector;
}
