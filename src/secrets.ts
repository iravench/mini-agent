import { existsSync, readFileSync } from "node:fs";

const SECRETS_FILE = "/run/secrets/.env";

let cached: Record<string, string> | null | undefined;

function loadSecrets(): Record<string, string> | null {
  if (cached !== undefined) return cached;
  cached = null;

  if (!existsSync(SECRETS_FILE)) return null;

  try {
    const content = readFileSync(SECRETS_FILE, "utf-8");
    const secrets: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const idx = line.indexOf("=");
      if (idx > 0) {
        secrets[line.slice(0, idx)] = line.slice(idx + 1);
      }
    }
    cached = secrets;
  } catch {
    // File exists but isn't readable — fall back to env vars
  }

  return cached;
}

/** Read a single key from the secrets file. Returns undefined if not found. */
function readSecret(key: string): string | undefined {
  const secrets = loadSecrets();
  return secrets?.[key];
}

/**
 * Resolve an env var by checking the secrets file first, then process.env.
 * Outside the sandbox (no /run/secrets/.env) this is identical to process.env[key].
 */
export function env(key: string): string | undefined {
  return readSecret(key) ?? process.env[key];
}
