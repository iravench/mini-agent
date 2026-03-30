import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ── Secrets-aware env resolution ────────────────────────────────────────────

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

/**
 * Resolve an env var by checking the secrets file first, then process.env.
 * Outside the sandbox (no /run/secrets/.env) this is identical to process.env[key].
 */
export function env(key: string): string | undefined {
  const secrets = loadSecrets();
  return secrets?.[key] ?? process.env[key];
}

// ── Paths ───────────────────────────────────────────────────────────────────

/** Base directory for all mini-agent data. Overridable via MINI_AGENT_HOME env var. */
export function getAgentDir(): string {
  const dir = process.env.MINI_AGENT_HOME ?? join(homedir(), ".mini-agent");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** Directory where session JSONL files are stored (per-project subdirectories). */
export function getSessionsDir(): string {
  const dir = join(getAgentDir(), "sessions");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Compute the session directory for a given working directory.
 * Encodes cwd into a safe directory name under ~/.mini-agent/sessions/.
 *
 *   /home/user/project → ~/.mini-agent/sessions/--home-user-project--/
 */
export function getSessionDir(cwd: string): string {
  const safePath = `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
  const dir = join(getSessionsDir(), safePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}
