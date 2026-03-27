import { Agent } from "@mariozechner/pi-agent-core";
import type { Model } from "@mariozechner/pi-ai";

import { readTool } from "./tools/read.js";
import { writeTool } from "./tools/write.js";
import { editTool } from "./tools/edit.js";
import { bashTool } from "./tools/bash.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";

import chalk from "chalk";

export function createAgent(model: Model<any>): Agent {
  const agent = new Agent({
    initialState: {
      systemPrompt: SYSTEM_PROMPT,
      model,
      tools: [readTool, writeTool, editTool, bashTool],
    },
    toolExecution: "sequential",
    getApiKey: async () => process.env.MOONSHOT_API_KEY,
  });

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
        process.stdout.write(
          chalk.dim(`\n  ⚡ ${event.toolName}(${truncated})\n`),
        );
        break;
      }
      case "tool_execution_end": {
        if (event.isError) {
          const firstContent = event.result.content?.[0];
          const resultText =
            firstContent?.type === "text" ? firstContent.text : "error";
          process.stdout.write(
            chalk.red(`  ✗ ${event.toolName}: ${resultText}\n`),
          );
        } else {
          process.stdout.write(chalk.dim("  ✓ done\n"));
        }
        break;
      }
      case "agent_end": {
        const last = event.messages.at(-1);
        if (last?.role === "assistant" && last.usage) {
          const { input, output, cost } = last.usage;
          process.stdout.write(
            chalk.dim(
              `\n  [${input} in / ${output} out / $${cost.total.toFixed(4)}]\n`,
            ),
          );
        }
        break;
      }
    }
  });

  return agent;
}
