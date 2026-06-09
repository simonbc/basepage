import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const CONFIG_DIR = join(homedir(), ".basepage");
const TOKEN_FILE = join(CONFIG_DIR, "token");

// GitHub CLI's own public OAuth client id — the device-flow fallback reuses it so
// `basepage publish` needs no API keys. Override with BASEPAGE_GITHUB_CLIENT_ID.
const DEFAULT_CLIENT_ID = "178c6fc778ccc68e1d6a";

export interface TokenResult {
  token: string;
  /** Where the token came from, for honest messaging. */
  source: "cache" | "env" | "gh" | "device";
  login: string;
}

/**
 * Resolve a GitHub token with no API-key setup, trying the least-friction source
 * first. Browser OAuth (device flow) is the fallback when nothing else is present.
 */
export async function ensureToken(opts: { interactive?: boolean } = {}): Promise<TokenResult> {
  const cached = readCachedToken();
  if (cached) {
    const login = await validate(cached);
    if (login) return { token: cached, source: "cache", login };
  }

  const env = process.env.BASEPAGE_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  if (env) {
    const login = await validate(env);
    if (login) return { token: env, source: "env", login };
  }

  const gh = ghToken();
  if (gh) {
    const login = await validate(gh);
    if (login) return { token: gh, source: "gh", login };
  }

  if (opts.interactive === false) {
    throw new Error(
      "Not authenticated with GitHub. Run `gh auth login`, or run `basepage publish` interactively to sign in via your browser.",
    );
  }

  const token = await deviceFlow();
  const login = await validate(token);
  if (!login) throw new Error("GitHub sign-in succeeded but the token was rejected. Try again.");
  cacheToken(token);
  return { token, source: "device", login };
}

/** Forget the cached token. */
export function clearToken(): void {
  if (existsSync(TOKEN_FILE)) writeFileSync(TOKEN_FILE, "");
}

function readCachedToken(): string | null {
  try {
    const t = readFileSync(TOKEN_FILE, "utf8").trim();
    return t || null;
  } catch {
    return null;
  }
}

function cacheToken(token: string): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(TOKEN_FILE, token + "\n");
  chmodSync(TOKEN_FILE, 0o600);
}

function ghToken(): string | null {
  try {
    const res = spawnSync("gh", ["auth", "token"], { encoding: "utf8" });
    if (res.status === 0) {
      const t = res.stdout.trim();
      return t || null;
    }
  } catch {
    /* gh not installed */
  }
  return null;
}

/** GET /user — returns the login on success, null on failure. */
async function validate(token: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: ghHeaders(token),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { login?: string };
    return body.login ?? null;
  } catch {
    return null;
  }
}

export function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "basepage",
  };
}

/** GitHub OAuth device flow: opens the browser, polls for the token. */
async function deviceFlow(): Promise<string> {
  const clientId = process.env.BASEPAGE_GITHUB_CLIENT_ID || DEFAULT_CLIENT_ID;

  const codeRes = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, scope: "public_repo" }),
  });
  if (!codeRes.ok) {
    throw new Error(`Couldn't start GitHub sign-in (${codeRes.status}). Try \`gh auth login\` instead.`);
  }
  const code = (await codeRes.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete?: string;
    interval: number;
    expires_in: number;
  };

  console.log(`\n  Sign in to GitHub to publish.`);
  console.log(`  Opening your browser — enter this code if asked: \x1b[1m${code.user_code}\x1b[0m`);
  console.log(`  ${code.verification_uri}\n`);
  openBrowser(code.verification_uri_complete ?? code.verification_uri);

  const deadline = Date.now() + code.expires_in * 1000;
  let interval = (code.interval || 5) * 1000;

  while (Date.now() < deadline) {
    await sleep(interval);
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        device_code: code.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });
    const data = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
    };

    if (data.access_token) return data.access_token;
    if (data.error === "authorization_pending") continue;
    if (data.error === "slow_down") {
      interval += 5000;
      continue;
    }
    if (data.error === "expired_token") break;
    if (data.error === "access_denied") throw new Error("GitHub sign-in was cancelled.");
    if (data.error) throw new Error(`GitHub sign-in failed: ${data.error}`);
  }
  throw new Error("GitHub sign-in timed out. Run `basepage publish` again to retry.");
}

function openBrowser(url: string): void {
  const cmd = platform() === "darwin" ? "open" : platform() === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true, shell: platform() === "win32" }).unref();
  } catch {
    /* user can open the URL manually */
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
