import { Agent } from "@mariozechner/pi-agent-core";
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
import { enhanceToolErrors, isRetryableError, abortableSleep, backoffDelay } from "./errors.js";
import { env } from "./secrets.js";
import type { UserConfig } from "./user-config.js";
import type { SessionManager } from "./session.js";

import chalk from "chalk";

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

  const retryEnabled = config?.retry?.enabled !== false;
  const maxRetries = config?.retry?.maxRetries ?? 3;

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      tools,
    },
    toolExecution: "sequential",
    transformContext: createTransformContext({
      model,
      thresholdPercent: config?.contextThreshold,
    }),
    getApiKey: async () => {
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

  // Track retry state across prompt calls
  let retryAttempt = 0;

  agent.subscribe((event) => {
    switch (event.type) {
      case "message_update": {
        const e = event.assistantMessageEvent;
        if (e.type === "text_delta") {
          process.stdout.write(chalk.white(e.delta));
        }
        break;
      }
      case "tool_execution_start": {
        const args = JSON.stringify(event.args);
        const truncated = args.length > 120 ? args.slice(0, 120) + "..." : args;
        process.stdout.write(chalk.dim(`\n  ⚡ ${event.toolName}(${truncated})\n`));
        break;
      }
      case "tool_execution_end": {
        if (event.isError) {
          const firstContent = event.result.content?.[0];
          const resultText = firstContent?.type === "text" ? firstContent.text : "error";
          // Show first line only in terminal (hints are long)
          const firstLine = resultText.split("\n")[0];
          process.stdout.write(chalk.red(`  ✗ ${event.toolName}: ${firstLine}\n`));
        } else {
          process.stdout.write(chalk.dim("  ✓ done\n"));
        }
        break;
      }
      case "message_end": {
        session?.appendMessage(event.message);

        // Check for retryable API errors
        const msg = event.message;
        if (
          retryEnabled &&
          msg.role === "assistant" &&
          msg.stopReason === "error" &&
          msg.errorMessage &&
          isRetryableError(msg.errorMessage)
        ) {
          retryAttempt++;
          if (retryAttempt <= maxRetries) {
            const delay = backoffDelay(retryAttempt);
            process.stdout.write(
              chalk.yellow(
                `\n  ⚠ API error, retrying in ${delay / 1000}s (attempt ${retryAttempt}/${maxRetries})...\n`,
              ),
            );
            abortableSleep(delay)
              .then(() => agent.continue())
              .catch(() => {
                /* aborted */
              });
            return;
          }
        }
        retryAttempt = 0;
        break;
      }
      case "agent_end": {
        retryAttempt = 0;
        const last = event.messages.at(-1);
        if (last?.role === "assistant" && last.usage) {
          const { input, output, totalTokens, cost } = last.usage;
          process.stdout.write(
            chalk.dim(
              `\n  [${input} in / ${output} out / ${totalTokens} total / $${cost.total.toFixed(4)}]\n`,
            ),
          );
        }
        break;
      }
    }
  });

  return agent;
}
