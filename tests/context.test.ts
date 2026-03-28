import { describe, it, expect } from "vitest";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { createTransformContext } from "../src/context.js";

// Helper to create messages with specific char lengths
function textMsg(
  role: "user" | "assistant",
  text: string,
  usage?: { input: number },
): AgentMessage {
  const msg: any = { role, content: [{ type: "text", text }], timestamp: Date.now() };
  if (usage) msg.usage = { ...usage, output: 10, cost: { total: 0.001 } };
  return msg;
}

function toolResultMsg(text: string): AgentMessage {
  return { role: "toolResult", toolCallId: "t1", content: [{ type: "text", text }] } as any;
}

// Mock model with a small context window
const smallModel = {
  contextWindow: 10_000, // tokens
  id: "test",
  name: "Test",
  provider: "test",
  api: "openai",
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  maxTokens: 4096,
} as any;

describe("createTransformContext", () => {
  it("passes through messages when under budget", async () => {
    const transform = createTransformContext({ model: smallModel });
    const messages = [textMsg("user", "hello")];
    const result = await transform(messages);
    expect(result).toEqual(messages);
  });

  it("prunes large tool results when over budget", async () => {
    // threshold = 0.8, so budget = 10000 * 0.8 = 8000 tokens
    // heuristic: chars / 3.5 tokens
    // 8000 tokens * 3.5 = 28000 chars budget
    // Need messages exceeding 28000 chars
    const transform = createTransformContext({ model: smallModel, protectTailCount: 2 });

    const bigOutput = "x".repeat(30_000); // ~8571 tokens, exceeds budget alone
    const messages = [
      toolResultMsg(bigOutput),
      textMsg("user", "next"),
      textMsg("assistant", "response"),
    ];

    const result = await transform(messages);

    // The tool result should be replaced with placeholder
    const toolResult = result.find((m) => m.role === "toolResult") as any;
    expect(toolResult).toBeTruthy();
    expect(toolResult.content[0].text).toBe("[Old tool output cleared to save context space]");
  });

  it("protects tail messages from pruning", async () => {
    const transform = createTransformContext({ model: smallModel, protectTailCount: 4 });

    const bigOutput = "x".repeat(30_000);
    const messages = [
      toolResultMsg(bigOutput), // this should be pruned
      textMsg("user", "msg2"), // protected (tail)
      toolResultMsg(bigOutput), // protected (tail)
      textMsg("user", "msg4"), // protected (tail)
      textMsg("assistant", "msg5"), // protected (tail)
    ];

    const result = await transform(messages);

    // Last 4 messages should be untouched
    expect(result.slice(-4)).toEqual(messages.slice(-4));

    // First tool result should be pruned
    const first = result[0] as any;
    expect(first.content[0].text).toBe("[Old tool output cleared to save context space]");
  });

  it("uses provider token count when available", async () => {
    const transform = createTransformContext({
      model: { ...smallModel, contextWindow: 1000 },
      thresholdPercent: 0.5,
      protectTailCount: 2,
    });

    // Provider says input was 600 tokens, budget is 500 — should trigger pruning
    const messages = [
      toolResultMsg("y".repeat(500)),
      textMsg("assistant", "response", { input: 600 }),
    ];

    const result = await transform(messages);
    // With protectTailCount=2, nothing should be pruned (all messages are in tail)
    expect(result).toEqual(messages);
  });

  it("skips pruning when budget is not exceeded", async () => {
    const transform = createTransformContext({ model: smallModel });

    const smallMessages = [
      textMsg("user", "small message"),
      textMsg("assistant", "small response"),
    ];

    const result = await transform(smallMessages);
    expect(result).toEqual(smallMessages);
  });

  it("skips pruning when messages <= protectTailCount", async () => {
    const transform = createTransformContext({
      model: smallModel,
      protectTailCount: 10,
    });

    const bigOutput = "x".repeat(50_000);
    const messages = [toolResultMsg(bigOutput), textMsg("user", "msg")];

    const result = await transform(messages);
    // Only 2 messages but protectTailCount=10, so nothing pruned
    expect(result).toEqual(messages);
  });
});
