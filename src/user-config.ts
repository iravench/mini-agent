import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "./config.js";

export interface UserConfig {
  /** Default provider name (e.g. "openai", "anthropic", "moonshot") */
  defaultProvider?: string;
  /** Default model ID (e.g. "gpt-4o", "claude-sonnet-4-20250514") */
  defaultModel?: string;
  /** Context window threshold (0-1). Fraction of context window to use before pruning. Default: 0.8 */
  contextThreshold?: number;
  /** Custom system prompt appended to the default prompt */
  customInstructions?: string;
  /** Retry settings for transient API errors */
  retry?: {
    enabled?: boolean;
    maxRetries?: number;
    baseDelayMs?: number;
  };
}

const CONFIG_FILE = "config.json";

function getConfigPath(): string {
  return join(getAgentDir(), CONFIG_FILE);
}

/** Load user config from ~/.mini-agent/config.json. Returns empty object if missing/invalid. */
export function loadConfig(): UserConfig {
  const path = getConfigPath();
  if (!existsSync(path)) return {};

  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as UserConfig;
  } catch {
    return {};
  }
}

/** Save user config to ~/.mini-agent/config.json. */
export function saveConfig(config: UserConfig): void {
  const path = getConfigPath();
  const dir = getAgentDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

/** Get effective provider name: CLI arg > config > env var. */
export function resolveProvider(cliProvider?: string, config?: UserConfig): string | undefined {
  return cliProvider ?? config?.defaultProvider ?? process.env.AI_PROVIDER;
}

/** Get effective model ID: CLI arg > config > env var. */
export function resolveModelId(cliModel?: string, config?: UserConfig): string | undefined {
  return cliModel ?? config?.defaultModel ?? process.env.AI_MODEL;
}
