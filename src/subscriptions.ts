import type { Agent, AgentEvent } from "@mariozechner/pi-agent-core";
import type { SessionManager } from "./session.js";
import type { UserConfig } from "./user-config.js";
import { isRetryableError, abortableSleep, backoffDelay } from "./errors.js";
import chalk from "chalk";

export interface SubscribeCoreOptions {
  agent: Agent;
  session: SessionManager;
  config?: UserConfig;
  /** Suppress retry status messages to stdout (use in TUI mode). */
  quiet?: boolean;
}

/**
 * Subscribe the agent to session persistence and retry logic.
 * This is the core subscription layer -- both print and TUI modes use it.
 */
export function subscribeCore(options: SubscribeCoreOptions): () => void {
  const { agent, session, config, quiet } = options;
  const retryEnabled = config?.retry?.enabled !== false;
  const maxRetries = config?.retry?.maxRetries ?? 3;
  let retryAttempt = 0;

  return agent.subscribe((event: AgentEvent) => {
    switch (event.type) {
      case "message_end": {
        session.appendMessage(event.message);

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
            if (!quiet) {
              process.stdout.write(
                chalk.yellow(
                  `\n  API error, retrying in ${delay / 1000}s (attempt ${retryAttempt}/${maxRetries})...\n`,
                ),
              );
            }
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
        break;
      }
    }
  });
}

/**
 * Subscribe the agent to stdout rendering for print (single-shot) mode.
 * Writes formatted text, tool calls, and usage stats to process.stdout.
 */
export function subscribeStdout(agent: Agent): () => void {
  return agent.subscribe((event: AgentEvent) => {
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
        process.stdout.write(chalk.dim(`\n  ${event.toolName}(${truncated})\n`));
        break;
      }
      case "tool_execution_end": {
        if (event.isError) {
          const firstContent = event.result.content?.[0];
          const resultText = firstContent?.type === "text" ? firstContent.text : "error";
          const firstLine = resultText.split("\n")[0];
          process.stdout.write(chalk.red(`  X ${event.toolName}: ${firstLine}\n`));
        } else {
          process.stdout.write(chalk.dim("  done\n"));
        }
        break;
      }
      case "agent_end": {
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
}
