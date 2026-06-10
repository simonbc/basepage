import { test, expect } from "bun:test";
import { createEmbeddingProvider } from "../src/lib/embeddings.ts";

test("embedding provider selection is Basepage/provider scoped, not agent scoped", () => {
  expect(createEmbeddingProvider({ BASEPAGE_EMBEDDING_PROVIDER: "local", BASEPAGE_LOCAL_EMBEDDING_DIMS: "16" }).model).toBe("local:16");
  expect(createEmbeddingProvider({ BASEPAGE_OPENAI_API_KEY: "test" }).model).toBe("openai:text-embedding-3-small");
  expect(() => createEmbeddingProvider({ GSTACK_OPENAI_API_KEY: "test" })).toThrow("No embedding provider configured");
});
