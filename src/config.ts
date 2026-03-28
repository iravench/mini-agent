import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

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
