import { readFile, writeFile } from "node:fs/promises";
import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { withFileMutationQueue } from "./file-mutation-queue.js";

export const editTool: AgentTool = {
  name: "edit_file",
  label: "Edit File",
  description:
    "Edit a file by replacing old_string with new_string. The old_string must appear exactly once in the file.",
  parameters: Type.Object({
    path: Type.String({ description: "File path to edit" }),
    old_string: Type.String({
      description: "Exact string to find and replace",
    }),
    new_string: Type.String({ description: "Replacement string" }),
  }),
  execute: async (_toolCallId, params) => {
    const { path, old_string, new_string } = params as {
      path: string;
      old_string: string;
      new_string: string;
    };

    return withFileMutationQueue(path, async () => {
      const content = await readFile(path, "utf-8").catch(() => {
        throw new Error(`File not found: ${path}`);
      });

      const occurrences = content.split(old_string).length - 1;
      if (occurrences === 0) {
        throw new Error(`String not found in ${path}`);
      }
      if (occurrences > 1) {
        throw new Error(
          `String found ${occurrences} times in ${path}. Provide more context to make the match unique.`,
        );
      }

      const updated = content.replace(old_string, new_string);
      await writeFile(path, updated, "utf-8");

      const oldLines = old_string.split("\n").length;
      const newLines = new_string.split("\n").length;

      return {
        content: [
          {
            type: "text" as const,
            text: `Replaced 1 occurrence in ${path} (${oldLines} lines → ${newLines} lines)`,
          },
        ],
        details: { path, oldLines, newLines },
      };
    });
  },
};
