import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { withFileMutationQueue } from "./file-mutation-queue.js";

export const writeTool: AgentTool = {
  name: "write_file",
  label: "Write File",
  description:
    "Write content to a file. Creates parent directories if needed. Overwrites existing files.",
  parameters: Type.Object({
    path: Type.String({ description: "File path to write" }),
    content: Type.String({ description: "File content to write" }),
  }),
  execute: async (_toolCallId, params) => {
    const { path, content } = params as { path: string; content: string };

    return withFileMutationQueue(path, async () => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf-8");

      const byteCount = Buffer.byteLength(content, "utf-8");
      return {
        content: [{ type: "text" as const, text: `Wrote ${byteCount} bytes to ${path}` }],
        details: { path, bytes: byteCount },
      };
    });
  },
};
