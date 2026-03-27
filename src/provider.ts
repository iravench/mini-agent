import { getModels, getProviders } from "@mariozechner/pi-ai";
import type { Api, KnownProvider, Model } from "@mariozechner/pi-ai";

// ── Custom model definitions for providers not in the built-in registry ──
// Extend this map to add OpenAI-compatible providers that pi-ai doesn't ship.

const CUSTOM_MODELS: Record<string, Model<any>> = {
  "moonshot:kimi-k2-0905-preview": {
    id: "kimi-k2-0905-preview",
    name: "Kimi K2 (Moonshot)",
    api: "openai-completions",
    provider: "moonshot",
    baseUrl: "https://api.moonshot.ai/v1",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131_072,
    maxTokens: 16_384,
    compat: {
      supportsDeveloperRole: false,
      supportsStore: false,
    },
  },
};

// ── Provider/model resolution ──────────────────────────────────────────

export function resolveModel(
  providerName?: string,
  modelId?: string,
): Model<Api> {
  const provider = providerName ?? process.env.AI_PROVIDER;
  const model = modelId ?? process.env.AI_MODEL;

  if (!provider) {
    throw new Error(
      "No AI provider configured. Set AI_PROVIDER env var (e.g. openai, anthropic, google, kimi-coding).\n" +
        `Available built-in providers: ${getProviders().join(", ")}`,
    );
  }

  // 1. Try the built-in model registry
  const knownProviders = getProviders();
  if (knownProviders.includes(provider as KnownProvider)) {
    const available = getModels(provider as KnownProvider);
    if (model) {
      const match = available.find((m) => m.id === model);
      if (match) return match;
    } else if (available.length > 0) {
      return available[0];
    }
  }

  // 2. Try custom model definitions (for providers not in the registry)
  if (model) {
    const customKey = `${provider}:${model}`;
    if (CUSTOM_MODELS[customKey]) return CUSTOM_MODELS[customKey];
  }

  // 3. Nothing matched — provide actionable guidance
  const isKnown = knownProviders.includes(provider as KnownProvider);
  const hint = isKnown
    ? `Provider "${provider}" is known but model "${model ?? ""}" was not found.\n` +
      `Available models: ${getModels(provider as KnownProvider)
        .map((m) => m.id)
        .join(", ")}`
    : `Unknown provider "${provider}".\n` +
      `Built-in providers: ${getProviders().join(", ")}` +
      (Object.keys(CUSTOM_MODELS).length > 0
        ? `\nCustom models: ${Object.keys(CUSTOM_MODELS).join(", ")}`
        : "");

  throw new Error(`Failed to resolve AI model.\n${hint}`);
}
