import { describe, it, expect } from "vitest";
import { enhanceToolErrors, isRetryableError, backoffDelay } from "../src/errors.js";

describe("enhanceToolErrors", () => {
  it("adds hint for edit_file errors", async () => {
    const result = await enhanceToolErrors({
      toolCall: { name: "edit_file", id: "t1" } as any,
      args: { path: "src/foo.ts" },
      result: {
        content: [{ type: "text", text: "String not found in src/foo.ts" }],
        details: undefined,
      },
      isError: true,
      assistantMessage: {} as any,
      context: {} as any,
    });

    expect(result).toBeTruthy();
    expect((result!.content![0] as any).text).toContain("Re-read the file");
    expect((result!.content![0] as any).text).toContain("String not found");
  });

  it("adds hint for read_file errors", async () => {
    const result = await enhanceToolErrors({
      toolCall: { name: "read_file", id: "t1" } as any,
      args: { path: "missing.txt" },
      result: {
        content: [{ type: "text", text: "File not found: missing.txt" }],
        details: undefined,
      },
      isError: true,
      assistantMessage: {} as any,
      context: {} as any,
    });

    expect(result).toBeTruthy();
    expect((result!.content![0] as any).text).toContain("Check that the path exists");
  });

  it("adds hint for bash errors", async () => {
    const result = await enhanceToolErrors({
      toolCall: { name: "bash", id: "t1" } as any,
      args: { command: "npm test" },
      result: { content: [{ type: "text", text: "Command failed (exit 1)" }], details: undefined },
      isError: true,
      assistantMessage: {} as any,
      context: {} as any,
    });

    expect(result).toBeTruthy();
    expect((result!.content![0] as any).text).toContain("Read the error output");
  });

  it("returns undefined for successful tool calls", async () => {
    const result = await enhanceToolErrors({
      toolCall: { name: "edit_file", id: "t1" } as any,
      args: {},
      result: { content: [{ type: "text", text: "Replaced 1 occurrence" }], details: undefined },
      isError: false,
      assistantMessage: {} as any,
      context: {} as any,
    });

    expect(result).toBeUndefined();
  });

  it("returns undefined for unknown tool names", async () => {
    const result = await enhanceToolErrors({
      toolCall: { name: "unknown_tool", id: "t1" } as any,
      args: {},
      result: { content: [{ type: "text", text: "error" }], details: undefined },
      isError: true,
      assistantMessage: {} as any,
      context: {} as any,
    });

    expect(result).toBeUndefined();
  });

  it("adds hint for grep errors", async () => {
    const result = await enhanceToolErrors({
      toolCall: { name: "grep", id: "t1" } as any,
      args: { pattern: "foo" },
      result: { content: [{ type: "text", text: "No matches found" }], details: undefined },
      isError: true,
      assistantMessage: {} as any,
      context: {} as any,
    });

    expect(result).toBeTruthy();
    expect((result!.content![0] as any).text).toContain("No matches found");
    expect((result!.content![0] as any).text).toContain("Hint");
  });

  it("adds hint for grep regex errors", async () => {
    const result = await enhanceToolErrors({
      toolCall: { name: "grep", id: "t1" } as any,
      args: { pattern: "[invalid" },
      result: { content: [{ type: "text", text: "regex error" }], details: undefined },
      isError: true,
      assistantMessage: {} as any,
      context: {} as any,
    });

    expect(result).toBeTruthy();
    expect((result!.content![0] as any).text).toContain("literal:true");
  });

  it("adds hint for find_files errors", async () => {
    const result = await enhanceToolErrors({
      toolCall: { name: "find_files", id: "t1" } as any,
      args: { pattern: "*.xyz" },
      result: { content: [{ type: "text", text: "No files found" }], details: undefined },
      isError: true,
      assistantMessage: {} as any,
      context: {} as any,
    });

    expect(result).toBeTruthy();
    expect((result!.content![0] as any).text).toContain("broader glob");
  });

  it("adds hint for ls errors", async () => {
    const result = await enhanceToolErrors({
      toolCall: { name: "ls", id: "t1" } as any,
      args: { path: "/nonexistent" },
      result: { content: [{ type: "text", text: "Path not found" }], details: undefined },
      isError: true,
      assistantMessage: {} as any,
      context: {} as any,
    });

    expect(result).toBeTruthy();
    expect((result!.content![0] as any).text).toContain("exists and is a directory");
  });
});

describe("isRetryableError", () => {
  it("matches rate limit errors", () => {
    expect(isRetryableError("rate limit exceeded")).toBe(true);
    expect(isRetryableError("Too many requests")).toBe(true);
    expect(isRetryableError("429 Too Many Requests")).toBe(true);
  });

  it("matches server errors", () => {
    expect(isRetryableError("500 Internal Server Error")).toBe(true);
    expect(isRetryableError("502 Bad Gateway")).toBe(true);
    expect(isRetryableError("503 Service Unavailable")).toBe(true);
    expect(isRetryableError("504 Gateway Timeout")).toBe(true);
  });

  it("matches overload errors", () => {
    expect(isRetryableError("overloaded")).toBe(true);
    expect(isRetryableError("model overloaded")).toBe(true);
  });

  it("matches network errors", () => {
    expect(isRetryableError("network error")).toBe(true);
    expect(isRetryableError("connection refused")).toBe(true);
    expect(isRetryableError("timeout")).toBe(true);
  });

  it("does not match non-retryable errors", () => {
    expect(isRetryableError("invalid api key")).toBe(false);
    expect(isRetryableError("model not found")).toBe(false);
    expect(isRetryableError("bad request")).toBe(false);
  });
});

describe("backoffDelay", () => {
  it("doubles with each attempt", () => {
    expect(backoffDelay(1)).toBe(2000);
    expect(backoffDelay(2)).toBe(4000);
    expect(backoffDelay(3)).toBe(8000);
  });

  it("caps at maxDelayMs", () => {
    expect(backoffDelay(10)).toBeLessThanOrEqual(30000);
  });

  it("respects custom config", () => {
    const config = { maxRetries: 5, baseDelayMs: 1000, maxDelayMs: 10000 };
    expect(backoffDelay(1, config)).toBe(1000);
    expect(backoffDelay(2, config)).toBe(2000);
    expect(backoffDelay(4, config)).toBe(8000);
    expect(backoffDelay(5, config)).toBe(10000); // capped
  });
});
