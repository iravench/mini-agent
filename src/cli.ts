import * as readline from "node:readline";
import { createAgent } from "./agent.js";
import { resolveModel } from "./provider.js";
import chalk from "chalk";

import type { Api, Model } from "@mariozechner/pi-ai";

// ── Banner ────────────────────────────────────────────────────────────
function printBanner(providerName: string, modelName: string) {
  const label = `${modelName} · ${providerName}`;
  // Pad to fit the box width (inner width = 36 chars)
  const padded = label.length > 34 ? label.slice(0, 33) + "…" : label;
  const padding = " ".repeat(36 - padded.length);

  console.log(chalk.cyan("  ╔══════════════════════════════════════╗"));
  console.log(
    chalk.cyan("  ║") +
      chalk.bold("  mini-agent  ") +
      chalk.dim("v0.1.0") +
      chalk.dim("                ║"),
  );
  console.log(chalk.cyan("  ║") + chalk.dim(`  ${padded}${padding}║`));
  console.log(chalk.cyan("  ╚══════════════════════════════════════╝"));
  console.log();
  console.log(
    chalk.dim("  Type your message. Ctrl+C to abort. Ctrl+C twice to exit."),
  );
  console.log();
}

// ── Print mode (single-shot) ──────────────────────────────────────────
async function printMode(message: string, model: Model<Api>) {
  const agent = createAgent(model);
  try {
    await agent.prompt(message);
    console.log();
  } catch (err) {
    console.error(chalk.red(`Error: ${(err as Error).message}`));
    process.exit(1);
  }
}

// ── REPL ──────────────────────────────────────────────────────────────
async function replMode(model: Model<Api>) {
  const agent = createAgent(model);

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
  const model = resolveModel();

  console.log(chalk.dim(`  Using ${model.provider}/${model.id}`));

  const printArg = process.argv.indexOf("--print");
  if (printArg !== -1) {
    const message = process.argv.slice(printArg + 1).join(" ");
    if (!message) {
      console.error(chalk.red("Error: --print requires a message argument."));
      process.exit(1);
    }
    await printMode(message, model);
  } else {
    printBanner(model.provider, model.name);
    await replMode(model);
  }
}

main().catch((err) => {
  console.error(chalk.red(`Fatal: ${err.message}`));
  process.exit(1);
});
