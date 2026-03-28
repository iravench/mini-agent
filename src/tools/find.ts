import { spawnSync } from "node:child_process";
import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";

const DEFAULT_LIMIT = 1000;
const MAX_BYTES = 51_200;

function truncateBytes(text: string, max: number): { content: string; truncated: boolean } {
  const bytes = Buffer.byteLength(text, "utf-8");
  if (bytes <= max) return { content: text, truncated: false };
  let slice = text.slice(0, max);
  while (Buffer.byteLength(slice, "utf-8") > max && slice.length > 0) {
    slice = slice.slice(0, -100);
  }
  return {
    content: slice + "\n\n[Output truncated. Use a more specific pattern or reduce limit.]",
    truncated: true,
  };
}

export const findTool: AgentTool = {
  name: "find_files",
  label: "Find",
  description:
    `Find files by glob pattern using fd. Returns file paths relative to the search directory. ` +
    `Respects .gitignore. Output truncated to ${DEFAULT_LIMIT} results or ${MAX_BYTES / 1024}KB.`,
  parameters: Type.Object({
    pattern: Type.String({
      description: "Glob pattern to match files, e.g. '*.ts', '**/*.json', 'src/**/*.spec.ts'",
    }),
    path: Type.Optional(
      Type.String({ description: "Directory to search in (default: current directory)" }),
    ),
    limit: Type.Optional(
      Type.Number({ description: `Maximum number of results (default: ${DEFAULT_LIMIT})` }),
    ),
  }),
  execute: async (_toolCallId, params, signal) => {
    if (signal?.aborted) throw new Error("Aborted");

    const {
      pattern,
      path: searchDir = ".",
      limit = DEFAULT_LIMIT,
    } = params as {
      pattern: string;
      path?: string;
      limit?: number;
    };

    const args: string[] = [
      "--glob",
      "--color=never",
      "--hidden",
      "--max-results",
      String(limit),
      pattern,
      searchDir,
    ];

    const result = spawnSync("fd", args, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30_000,
    });

    if (result.error) {
      throw new Error(`Failed to run fd: ${result.error.message}`);
    }

    if (result.status !== 0 && !result.stdout?.trim()) {
      const msg = result.stderr?.trim() || `fd exited with code ${result.status}`;
      throw new Error(msg);
    }

    const output = result.stdout?.trim();
    if (!output) {
      return {
        content: [{ type: "text" as const, text: "No files found matching pattern" }],
        details: undefined,
      };
    }

    const lines = output.split("\n");
    const notices: string[] = [];
    if (lines.length >= limit) {
      notices.push(
        `${limit} results limit reached. Use limit=${limit * 2} for more, or refine pattern`,
      );
    }

    let text = output;
    const { content, truncated } = truncateBytes(text, MAX_BYTES);
    if (truncated) notices.push(`${MAX_BYTES / 1024}KB output limit reached`);
    if (notices.length > 0) text = content + `\n\n[${notices.join(". ")}]`;
    else text = content;

    return { content: [{ type: "text" as const, text }], details: undefined };
  },
};
