import { Agent, streamProxy } from "@mariozechner/pi-agent-core";
import { getEnvApiKey } from "@mariozechner/pi-ai";
import type { Api, Model } from "@mariozechner/pi-ai";

import { readTool } from "./tools/read.js";
import { writeTool } from "./tools/write.js";
import { editTool } from "./tools/edit.js";
import { bashTool } from "./tools/bash.js";
import { grepTool } from "./tools/grep.js";
import { findTool } from "./tools/find.js";
import { lsTool } from "./tools/ls.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { createTransformContext } from "./context.js";
import { enhanceToolErrors } from "./errors.js";
import { env } from "./config.js";
import type { UserConfig } from "./user-config.js";
import type { SessionManager } from "./session.js";

export interface CreateAgentOptions {
  model: Model<Api>;
  session?: SessionManager;
  config?: UserConfig;
}

export function createAgent(options: CreateAgentOptions): Agent {
  const { model, session, config } = options;
  const tools = [readTool, writeTool, editTool, bashTool, grepTool, findTool, lsTool];

  let systemPrompt = buildSystemPrompt(tools);
  if (config?.customInstructions) {
    systemPrompt += `\n\n## User Instructions\n${config.customInstructions}`;
  }

  const proxyUrl = env("LLM_PROXY_URL");

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      tools,
    },
    streamFn: proxyUrl
      ? (_model, ctx, opts) =>
          streamProxy(_model, ctx, {
            ...opts,
            proxyUrl,
            authToken: env("LLM_PROXY_TOKEN") ?? "",
          })
      : undefined,
    toolExecution: "sequential",
    transformContext: createTransformContext({
      model,
      thresholdPercent: config?.contextThreshold,
    }),
    getApiKey: async () => {
      // When proxying, the host resolves the API key
      if (proxyUrl) return undefined;
      const key = getEnvApiKey(model.provider) ?? env("AI_API_KEY");
      if (!key) {
        throw new Error(
          `No API key found for provider "${model.provider}".\n` +
            `Set ${model.provider.toUpperCase().replace(/-/g, "_")}_API_KEY or AI_API_KEY env var.`,
        );
      }
      return key;
    },
    afterToolCall: enhanceToolErrors,
  });

  // Restore session context if resuming
  if (session) {
    const messages = session.buildSessionContext();
    if (messages.length > 0) {
      agent.replaceMessages(messages);
    }
  }

  return agent;
}
