import * as readline from "node:readline";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { createAgent } from "./agent.js";
import { resolveModel } from "./provider.js";
import { SessionManager } from "./session.js";
import { loadConfig } from "./user-config.js";
import chalk from "chalk";

import type { Api, Model } from "@mariozechner/pi-ai";
import type { SessionManager as SessionManagerType } from "./session.js";
import type { UserConfig } from "./user-config.js";

// ── Version ───────────────────────────────────────────────────────────
const require = createRequire(import.meta.url);
const VERSION: string = require("../package.json").version;

// ── Banner ────────────────────────────────────────────────────────────
function printBanner(providerName: string, modelName: string) {
  const label = `${modelName} · ${providerName}`;
  // Pad to fit the box width (inner width = 36 chars)
  const padded = label.length > 34 ? label.slice(0, 33) + "…" : label;
  const padding = " ".repeat(36 - padded.length);
  const versionStr = `v${VERSION}`;
  const versionPad = " ".repeat(Math.max(0, 36 - 12 - versionStr.length));

  console.log(chalk.cyan("  ╔══════════════════════════════════════╗"));
  console.log(
    chalk.cyan("  ║") +
      chalk.bold("  mini-agent  ") +
      chalk.dim(versionStr) +
      chalk.dim(`${versionPad}║`),
  );
  console.log(chalk.cyan("  ║") + chalk.dim(`  ${padded}${padding}║`));
  console.log(chalk.cyan("  ╚══════════════════════════════════════╝"));
  console.log();
  console.log(chalk.dim("  Type your message. Ctrl+C to abort. Ctrl+C twice to exit."));
  console.log();
}

// ── Print mode (single-shot) ──────────────────────────────────────────
async function printMode(
  message: string,
  model: Model<Api>,
  session?: SessionManagerType,
  config?: UserConfig,
) {
  const agent = createAgent({ model, session, config });
  try {
    await agent.prompt(message);
    console.log();
  } catch (err) {
    console.error(chalk.red(`Error: ${(err as Error).message}`));
    process.exit(1);
  }
}

// ── REPL ──────────────────────────────────────────────────────────────
async function replMode(model: Model<Api>, session?: SessionManagerType, config?: UserConfig) {
  const agent = createAgent({ model, session, config });

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

// ── List sessions ─────────────────────────────────────────────────────
async function printSessions(cwd: string) {
  const sessions = await SessionManager.list(cwd);
  if (sessions.length === 0) {
    console.log(chalk.dim("  No sessions found."));
    return;
  }
  console.log();
  for (const s of sessions) {
    const id = chalk.cyan(s.id.slice(0, 8));
    const msgs = chalk.dim(`${s.messageCount} msgs`);
    const modified = chalk.dim(
      s.modified.toLocaleDateString() + " " + s.modified.toLocaleTimeString(),
    );
    const preview = s.firstMessage.length > 60 ? s.firstMessage.slice(0, 57) + "…" : s.firstMessage;
    console.log(`  ${id}  ${msgs}  ${modified}  ${preview}`);
  }
  console.log();
  console.log(chalk.dim(`  Use --session <id> to resume by ID, or --session <path> for a file.`));
  console.log();
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  // --list doesn't need a model
  if (args.includes("--list")) {
    await printSessions(process.cwd());
    return;
  }

  // Load user config
  const config = loadConfig();

  // Resolve provider/model: CLI flags > config > env vars
  const providerFlag = getArgValue(args, "--provider");
  const modelFlag = getArgValue(args, "--model");
  const model = resolveModel(
    providerFlag ?? config.defaultProvider,
    modelFlag ?? config.defaultModel,
  );
  const cwd = process.cwd();

  // Parse session flags
  let session: SessionManagerType | undefined;

  const continueIdx = args.indexOf("--continue");
  const sessionIdx = args.indexOf("--session");

  if (continueIdx !== -1) {
    session = await SessionManager.continueRecent(cwd);
    const entries = session.getEntries();
    const sessionId = session.getSessionId().slice(0, 8);
    console.log(chalk.dim(`  Resumed session ${sessionId} (${entries.length} entries)`));
  } else if (sessionIdx !== -1) {
    const sessionArg = args[sessionIdx + 1];
    if (!sessionArg) {
      console.error(chalk.red("Error: --session requires a session ID or file path."));
      process.exit(1);
    }
    // Resolve: try as file path first, then as session ID prefix
    let sessionPath: string;
    if (existsSync(sessionArg)) {
      sessionPath = sessionArg;
    } else {
      const found = await SessionManager.findById(sessionArg, cwd);
      if (!found) {
        console.error(
          chalk.red(`Error: No session found matching "${sessionArg}".`) +
            chalk.dim("\n  Use --list to see available sessions."),
        );
        process.exit(1);
      }
      sessionPath = found;
    }
    session = await SessionManager.open(sessionPath);
    const entries = session.getEntries();
    const sessionId = session.getSessionId().slice(0, 8);
    console.log(chalk.dim(`  Opened session ${sessionId} (${entries.length} entries)`));
  } else {
    session = SessionManager.create(cwd);
  }

  console.log(chalk.dim(`  Using ${model.provider}/${model.id}`));

  const printArg = process.argv.indexOf("--print");
  if (printArg !== -1) {
    const message = process.argv.slice(printArg + 1).join(" ");
    if (!message) {
      console.error(chalk.red("Error: --print requires a message argument."));
      process.exit(1);
    }
    await printMode(message, model, session, config);
  } else {
    printBanner(model.provider, model.name);
    await replMode(model, session, config);
  }
}

/** Extract a --flag value from argv. */
function getArgValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

main().catch((err) => {
  console.error(chalk.red(`Fatal: ${err.message}`));
  process.exit(1);
});
