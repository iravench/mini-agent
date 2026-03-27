import * as readline from "node:readline";
import { getModel } from "@mariozechner/pi-ai";
import type { Model } from "@mariozechner/pi-ai";
import { createAgent } from "./agent.js";
import chalk from "chalk";

// ── Moonshot AI custom model ──────────────────────────────────────────
// Uses OpenAI-completions API at api.moonshot.cn
// Set MOONSHOT_API_KEY env var (from https://platform.moonshot.ai)
const moonshotModel: Model<"openai-completions"> = {
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
};

// ── Banner ────────────────────────────────────────────────────────────
function printBanner() {
  console.log(chalk.cyan("  ╔══════════════════════════════════════╗"));
  console.log(
    chalk.cyan("  ║") +
      chalk.bold("  mini-agent  ") +
      chalk.dim("v0.1.0") +
      chalk.dim("                ║"),
  );
  console.log(
    chalk.cyan("  ║") + chalk.dim("  Kimi K2 · Moonshot AI              ║"),
  );
  console.log(chalk.cyan("  ╚══════════════════════════════════════╝"));
  console.log();
  console.log(
    chalk.dim("  Type your message. Ctrl+C to abort. Ctrl+C twice to exit."),
  );
  console.log();
}

// ── Print mode (single-shot) ──────────────────────────────────────────
async function printMode(message: string) {
  const agent = createAgent(moonshotModel);
  try {
    await agent.prompt(message);
    console.log();
  } catch (err) {
    console.error(chalk.red(`Error: ${(err as Error).message}`));
    process.exit(1);
  }
}

// ── REPL ──────────────────────────────────────────────────────────────
async function replMode() {
  const agent = createAgent(moonshotModel);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan("> "),
  });

  let isRunning = false;

  rl.on("SIGINT", () => {
    if (isRunning) {
      agent.abort();
      console.log(chalk.yellow("\n  ⏹ Aborted."));
      isRunning = false;
      rl.prompt();
    } else {
      console.log(chalk.dim("\n  Bye."));
      rl.close();
    }
  });

  rl.prompt();

  rl.on("line", async (input) => {
    const trimmed = input.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    isRunning = true;
    try {
      await agent.prompt(trimmed);
      console.log();
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        console.log(chalk.yellow("\n  ⏹ Aborted."));
      } else {
        console.error(chalk.red(`\n  Error: ${(err as Error).message}`));
      }
    }
    isRunning = false;
    rl.prompt();
  });

  rl.on("close", () => {
    process.exit(0);
  });
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const apiKey = process.env.MOONSHOT_API_KEY;
  if (!apiKey) {
    console.error(
      chalk.red("Error: MOONSHOT_API_KEY environment variable not set."),
    );
    console.error(chalk.dim("Get your key at https://platform.moonshot.ai"));
    process.exit(1);
  }

  const printArg = process.argv.indexOf("--print");
  if (printArg !== -1) {
    const message = process.argv.slice(printArg + 1).join(" ");
    if (!message) {
      console.error(chalk.red("Error: --print requires a message argument."));
      process.exit(1);
    }
    await printMode(message);
  } else {
    printBanner();
    await replMode();
  }
}

main().catch((err) => {
  console.error(chalk.red(`Fatal: ${err.message}`));
  process.exit(1);
});
