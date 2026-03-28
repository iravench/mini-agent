import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../src/system-prompt.js";

describe("buildSystemPrompt", () => {
  it("includes all registered tools", () => {
    const tools = [
      { name: "read_file", description: "Read files" },
      { name: "bash", description: "Run commands" },
      { name: "edit_file", description: "Edit files" },
      { name: "write_file", description: "Write files" },
      { name: "grep", description: "Search contents" },
      { name: "find_files", description: "Find files" },
      { name: "ls", description: "List directory" },
    ] as any[];

    const prompt = buildSystemPrompt(tools);

    expect(prompt).toContain("read_file");
    expect(prompt).toContain("bash");
    expect(prompt).toContain("edit_file");
    expect(prompt).toContain("write_file");
    expect(prompt).toContain("grep");
    expect(prompt).toContain("find_files");
    expect(prompt).toContain("ls");
  });

  it("uses snippet for known tools", () => {
    const tools = [{ name: "grep", description: "ignored" }] as any[];
    const prompt = buildSystemPrompt(tools);
    // Should use the snippet, not the raw description
    expect(prompt).toContain("ripgrep");
    expect(prompt).not.toContain("ignored");
  });

  it("falls back to description for unknown tools", () => {
    const tools = [{ name: "custom_tool", description: "My custom tool" }] as any[];
    const prompt = buildSystemPrompt(tools);
    expect(prompt).toContain("custom_tool");
    expect(prompt).toContain("My custom tool");
  });

  it("includes guidelines section", () => {
    const prompt = buildSystemPrompt([]);
    expect(prompt).toContain("Guidelines");
    expect(prompt).toContain("Tool selection");
    expect(prompt).toContain("Workflow");
    expect(prompt).toContain("Error recovery");
  });

  it("mentions dedicated search tools over bash", () => {
    const prompt = buildSystemPrompt([]);
    expect(prompt).toContain("grep to search file contents");
    expect(prompt).toContain("find_files to locate files");
  });
});
