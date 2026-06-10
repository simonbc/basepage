import { Socket } from "node:net";
import { createEleventy, type EleventyOptions } from "../lib/eleventy.ts";

/**
 * Start the bundled Eleventy dev server with live reload, applying the manifest's
 * plugins. Returns once watching begins; the process stays alive serving.
 */
export async function serve(siteDir: string, opts: { port?: number } = {}) {
  const port = opts.port ?? (await findAvailablePort(8080));
  if (opts.port && !(await isPortAvailable(opts.port))) {
    throw new Error(`Port ${opts.port} is already in use. Choose another port with --port.`);
  }
  const options: EleventyOptions = { runMode: "serve", port };
  const { elev, manifest } = await createEleventy(siteDir, options);
  await elev.init();
  await elev.watch();
  await elev.serve(port);
  return { elev, manifest, port };
}

export async function findAvailablePort(start: number): Promise<number> {
  for (let port = start; port < start + 100; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found from ${start} to ${start + 99}.`);
}

async function isPortAvailable(port: number): Promise<boolean> {
  const ipv4Busy = await canConnect(port, "127.0.0.1");
  const ipv6Busy = await canConnect(port, "::1");
  return !ipv4Busy && !ipv6Busy;
}

function canConnect(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    const done = (busy: boolean) => {
      socket.destroy();
      resolve(busy);
    };
    socket.setTimeout(150);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}
