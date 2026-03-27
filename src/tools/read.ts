import { readFile, stat } from "node:fs/promises";
import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";

const MAX_LINES = 2000;
const MAX_BYTES = 51_200;

export const readTool: AgentTool = {
  name: "read_file",
  label: "Read File",
  description:
    "Read the contents of a file. Returns lines with line number prefixes.",
  parameters: Type.Object({
    path: Type.String({ description: "File path to read" }),
    offset: Type.Optional(
      Type.Number({ description: "Start line number (1-indexed, default 1)" }),
    ),
    limit: Type.Optional(
      Type.Number({
        description: `Max lines to return (default 200, max ${MAX_LINES})`,
      }),
    ),
  }),
  execute: async (_toolCallId, params) => {
    const {
      path,
      offset = 1,
      limit = 200,
    } = params as {
      path: string;
      offset?: number;
      limit?: number;
    };

    const s = await stat(path).catch(() => null);
    if (!s) throw new Error(`File not found: ${path}`);
    if (!s.isFile()) throw new Error(`Not a file: ${path}`);
    if (s.size > MAX_BYTES) {
      throw new Error(
        `File too large (${s.size} bytes). Use offset/limit to read in chunks.`,
      );
    }

    const content = await readFile(path, "utf-8");
    const lines = content.split("\n");
    const totalLines = lines.length;

    const clampedLimit = Math.min(limit, MAX_LINES);
    const start = Math.max(0, offset - 1);
    const end = Math.min(totalLines, start + clampedLimit);
    const slice = lines.slice(start, end);

    const numbered = slice
      .map((line, i) => `${String(start + i + 1).padStart(4)}| ${line}`)
      .join("\n");

    let result = numbered;
    if (end < totalLines) {
      result += `\n\n[Showing lines ${start + 1}-${end} of ${totalLines}. Use offset=${end + 1} to continue.]`;
    }

    return {
      content: [{ type: "text" as const, text: result }],
      details: { path, linesShown: end - start, totalLines },
    };
  },
};
