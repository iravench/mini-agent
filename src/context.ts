import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { Api, Model } from "@mariozechner/pi-ai";

const PLACEHOLDER = "[Old tool output cleared to save context space]";

function estimateTokens(messages: AgentMessage[]): number {
  let chars = 0;
  for (const msg of messages) {
    if (!("content" in msg) || !Array.isArray(msg.content)) continue;
    for (const block of msg.content) {
      if (block.type === "text") chars += block.text.length;
      else if (block.type === "thinking") chars += block.thinking.length;
    }
  }
  return Math.ceil(chars / 3.5);
}

function getLastInputTokens(messages: AgentMessage[]): number | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "assistant" && msg.usage?.input > 0) {
      return msg.usage.input;
    }
  }
  return null;
}

export interface TransformContextOptions {
  model: Model<Api>;
  thresholdPercent?: number;
  protectTailCount?: number;
  maxToolResultChars?: number;
}

export function createTransformContext(
  options: TransformContextOptions,
): (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]> {
  const {
    model,
    thresholdPercent = parseFloat(process.env.AI_CONTEXT_THRESHOLD ?? "0.8"),
    protectTailCount = 8,
    maxToolResultChars = 200,
  } = options;

  const tokenBudget = model.contextWindow * thresholdPercent;

  return async (
    messages: AgentMessage[],
    _signal?: AbortSignal,
  ): Promise<AgentMessage[]> => {
    // Prefer real provider token count; fall back to heuristic on first turn
    const total = getLastInputTokens(messages) ?? estimateTokens(messages);
    if (total < tokenBudget) return messages;

    if (messages.length <= protectTailCount) return messages;

    const tail = messages.slice(-protectTailCount);
    const head = messages.slice(0, -protectTailCount);

    let modified = false;
    const pruned = head.map((msg) => {
      if (msg.role !== "toolResult") return msg;

      const dominated = msg.content.some(
        (block) =>
          block.type === "text" && block.text.length > maxToolResultChars,
      );
      if (!dominated) return msg;

      modified = true;
      return {
        ...msg,
        content: [{ type: "text" as const, text: PLACEHOLDER }],
      };
    });

    if (!modified) return messages;

    return [...pruned, ...tail];
  };
}
