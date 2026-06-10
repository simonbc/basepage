import { test, expect } from "bun:test";
import { createServer } from "node:net";
import { findAvailablePort } from "../src/commands/serve.ts";

test("findAvailablePort skips a port already occupied on localhost", async () => {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected an assigned port.");
    const port = await findAvailablePort(address.port);
    expect(port).toBeGreaterThan(address.port);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
