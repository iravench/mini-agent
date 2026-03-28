import { createInterface } from "node:readline";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";

const DEFAULT_LIMIT = 100;
const MAX_BYTES = 51_200;
const MAX_LINE_LENGTH = 500;

function truncateLine(text: string): { text: string; wasTruncated: boolean } {
  if (text.length <= MAX_LINE_LENGTH) return { text, wasTruncated: false };
  return { text: text.slice(0, MAX_LINE_LENGTH) + "...", wasTruncated: true };
}

function truncateBytes(text: string, max: number): { content: string; truncated: boolean } {
  const bytes = Buffer.byteLength(text, "utf-8");
  if (bytes <= max) return { content: text, truncated: false };
  // Rough char-based truncation, then re-check
  let slice = text.slice(0, max);
  while (Buffer.byteLength(slice, "utf-8") > max && slice.length > 0) {
    slice = slice.slice(0, -100);
  }
  return {
    content: slice + "\n\n[Output truncated. Use a more specific pattern or reduce limit.]",
    truncated: true,
  };
}

export const grepTool: AgentTool = {
  name: "grep",
  label: "Grep",
  description:
    `Search file contents using ripgrep. Returns matching lines with file paths and line numbers. ` +
    `Respects .gitignore. Output truncated to ${DEFAULT_LIMIT} matches or ${MAX_BYTES / 1024}KB.`,
  parameters: Type.Object({
    pattern: Type.String({ description: "Search pattern (regex or literal string)" }),
    path: Type.Optional(
      Type.String({ description: "Directory or file to search (default: current directory)" }),
    ),
    glob: Type.Optional(
      Type.String({ description: "Filter files by glob pattern, e.g. '*.ts' or '**/*.spec.ts'" }),
    ),
    ignoreCase: Type.Optional(
      Type.Boolean({ description: "Case-insensitive search (default: false)" }),
    ),
    literal: Type.Optional(
      Type.Boolean({
        description: "Treat pattern as literal string instead of regex (default: false)",
      }),
    ),
    context: Type.Optional(
      Type.Number({ description: "Lines to show before and after each match (default: 0)" }),
    ),
    limit: Type.Optional(
      Type.Number({ description: `Maximum number of matches (default: ${DEFAULT_LIMIT})` }),
    ),
  }),
  execute: async (_toolCallId, params, signal) => {
    const {
      pattern,
      path: searchDir = ".",
      glob,
      ignoreCase,
      literal,
      context = 0,
      limit = DEFAULT_LIMIT,
    } = params as {
      pattern: string;
      path?: string;
      glob?: string;
      ignoreCase?: boolean;
      literal?: boolean;
      context?: number;
      limit?: number;
    };

    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("Aborted"));
        return;
      }

      const args: string[] = ["--json", "--line-number", "--color=never", "--hidden"];
      if (ignoreCase) args.push("--ignore-case");
      if (literal) args.push("--fixed-strings");
      if (glob) args.push("--glob", glob);
      args.push(pattern, searchDir);

      const child = spawn("rg", args, { stdio: ["ignore", "pipe", "pipe"] });
      const rl = createInterface({ input: child.stdout });
      let stderr = "";
      let matchCount = 0;
      let matchLimitReached = false;
      let linesTruncated = false;
      const outputLines: string[] = [];

      // File cache for context lines
      const fileCache = new Map<string, string[]>();
      const getFileLines = (filePath: string): string[] => {
        let lines = fileCache.get(filePath);
        if (!lines) {
          try {
            const content = readFileSync(filePath, "utf-8");
            lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
          } catch {
            lines = [];
          }
          fileCache.set(filePath, lines);
        }
        return lines;
      };

      const cleanup = () => {
        rl.close();
        signal?.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        child.kill();
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      rl.on("line", (line) => {
        if (!line.trim() || matchCount >= limit) return;
        let event: {
          type: string;
          data?: { path?: { text?: string }; line_number?: number; lines?: { text?: string } };
        };
        try {
          event = JSON.parse(line);
        } catch {
          return;
        }

        if (event.type === "match") {
          matchCount++;
          const filePath = event.data?.path?.text ?? "?";
          const lineNumber = event.data?.line_number ?? 0;
          const matchLine = event.data?.lines?.text?.replace(/\r?\n$/, "") ?? "";

          if (context > 0) {
            const lines = getFileLines(filePath);
            const start = Math.max(1, lineNumber - context);
            const end = Math.min(lines.length, lineNumber + context);
            for (let i = start; i <= end; i++) {
              const lineText = (i === lineNumber ? matchLine : (lines[i - 1] ?? "")).replace(
                /\r/g,
                "",
              );
              const { text, wasTruncated } = truncateLine(lineText);
              if (wasTruncated) linesTruncated = true;
              const prefix = i === lineNumber ? ":" : "-";
              outputLines.push(`${filePath}${prefix}${i}${prefix} ${text}`);
            }
          } else {
            const { text, wasTruncated } = truncateLine(matchLine);
            if (wasTruncated) linesTruncated = true;
            outputLines.push(`${filePath}:${lineNumber}: ${text}`);
          }

          if (matchCount >= limit) {
            matchLimitReached = true;
            child.kill();
          }
        }
      });

      child.on("error", (error) => {
        cleanup();
        reject(new Error(`Failed to run ripgrep: ${error.message}`));
      });

      child.on("close", (code, _signalName) => {
        cleanup();
        if (signal?.aborted) {
          reject(new Error("Aborted"));
          return;
        }

        // rg exits 1 when no matches, which is not an error.
        // code is null when process was killed by signal (e.g. we killed it after hitting the limit).
        if (code !== null && code !== 0 && code !== 1) {
          const msg = stderr.trim() || `ripgrep exited with code ${code}`;
          reject(new Error(msg));
          return;
        }

        if (outputLines.length === 0) {
          resolve({
            content: [{ type: "text" as const, text: "No matches found" }],
            details: undefined,
          });
          return;
        }

        let output = outputLines.join("\n");
        const notices: string[] = [];
        if (matchLimitReached) {
          notices.push(
            `${limit} matches limit reached. Use limit=${limit * 2} for more, or refine pattern`,
          );
        }
        if (linesTruncated) {
          notices.push(
            `Some lines truncated to ${MAX_LINE_LENGTH} chars. Use read_file to see full lines`,
          );
        }
        const { content, truncated } = truncateBytes(output, MAX_BYTES);
        if (truncated) notices.push(`${MAX_BYTES / 1024}KB output limit reached`);
        if (notices.length > 0) output = content + `\n\n[${notices.join(". ")}]`;
        else output = content;

        resolve({ content: [{ type: "text" as const, text: output }], details: undefined });
      });
    });
  },
};
