import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getAgentDir } from "./config.js";
import { env } from "./config.js";

const configSchema = z
  .object({
    defaultProvider: z.string().optional(),
    defaultModel: z.string().optional(),
    contextThreshold: z.number().min(0.1).max(1.0).optional(),
    customInstructions: z.string().optional(),
    retry: z
      .object({
        enabled: z.boolean().optional(),
        maxRetries: z.number().int().min(0).max(10).optional(),
        baseDelayMs: z.number().int().min(100).optional(),
      })
      .optional(),
  })
  .passthrough();

export type UserConfig = z.infer<typeof configSchema>;

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
    const parsed: unknown = JSON.parse(raw);
    const result = configSchema.safeParse(parsed);
    return result.success ? result.data : {};
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
  return cliProvider ?? config?.defaultProvider ?? env("AI_PROVIDER");
}

/** Get effective model ID: CLI arg > config > env var. */
export function resolveModelId(cliModel?: string, config?: UserConfig): string | undefined {
  return cliModel ?? config?.defaultModel ?? env("AI_MODEL");
}
