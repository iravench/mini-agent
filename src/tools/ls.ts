import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";

const DEFAULT_LIMIT = 500;

export const lsTool: AgentTool = {
  name: "ls",
  label: "List",
  description:
    `List directory contents. Shows files and directories (with / suffix). ` +
    `Sorted alphabetically. Includes dotfiles. Truncated to ${DEFAULT_LIMIT} entries.`,
  parameters: Type.Object({
    path: Type.Optional(
      Type.String({ description: "Directory to list (default: current directory)" }),
    ),
    limit: Type.Optional(
      Type.Number({ description: `Maximum entries to return (default: ${DEFAULT_LIMIT})` }),
    ),
  }),
  execute: async (_toolCallId, params) => {
    const { path: dirPath = ".", limit = DEFAULT_LIMIT } = params as {
      path?: string;
      limit?: number;
    };

    let entries: string[];
    try {
      entries = readdirSync(dirPath);
    } catch (err) {
      throw new Error(`Cannot read directory: ${dirPath}`, { cause: err });
    }

    // Sort case-insensitive
    entries.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    const results: string[] = [];
    let entryLimitReached = false;

    for (const entry of entries) {
      if (results.length >= limit) {
        entryLimitReached = true;
        break;
      }
      const fullPath = join(dirPath, entry);
      try {
        const stat = statSync(fullPath);
        results.push(stat.isDirectory() ? `${entry}/` : entry);
      } catch {
        results.push(entry);
      }
    }

    if (results.length === 0) {
      return {
        content: [{ type: "text" as const, text: "(empty directory)" }],
        details: undefined,
      };
    }

    let output = results.join("\n");
    if (entryLimitReached) {
      output += `\n\n[${limit} entries limit reached. Use limit=${limit * 2} for more.]`;
    }

    return { content: [{ type: "text" as const, text: output }], details: undefined };
  },
};
