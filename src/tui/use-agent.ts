import { useState, useCallback, useRef, useEffect } from "react";
import type { Agent, AgentEvent, AgentMessage } from "@mariozechner/pi-agent-core";
import type { MessageBlock, TUIState, AssistantBlock, ThinkingBlock, UsageInfo } from "./types.js";

function extractText(message: any): string {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join(" ");
  }
  return "";
}

/** Convert existing agent messages to initial MessageBlocks for session restore. */
function messagesToBlocks(messages: AgentMessage[]): {
  blocks: MessageBlock[];
  lastUsage: UsageInfo | null;
} {
  const blocks: MessageBlock[] = [];
  let lastUsage: UsageInfo | null = null;

  for (const msg of messages) {
    if (msg.role === "user") {
      blocks.push({ kind: "user", message: msg, text: extractText(msg) });
    } else if (msg.role === "assistant") {
      const content = (msg as any).content;
      if (Array.isArray(content)) {
        for (const part of content) {
          if (part.type === "text" && part.text) {
            blocks.push({ kind: "assistant", message: msg, text: part.text, isStreaming: false });
          } else if (part.type === "toolCall") {
            const argsStr = JSON.stringify(part.arguments);
            blocks.push({
              kind: "tool-call",
              toolCallId: part.id,
              toolName: part.name,
              args: argsStr.length > 200 ? argsStr.slice(0, 200) + "..." : argsStr,
              status: "completed",
            });
          }
        }
      }
      if ((msg as any).usage) {
        const usage = (msg as any).usage;
        lastUsage = {
          input: usage.input,
          output: usage.output,
          totalTokens: usage.totalTokens,
          cost: usage.cost?.total ?? 0,
        };
      }
    }
  }
  return { blocks, lastUsage };
}

interface UseAgentOptions {
  agent: Agent;
  sessionId: string;
  providerName: string;
  modelName: string;
}

export function useAgent(options: UseAgentOptions) {
  const { agent, sessionId, providerName, modelName } = options;

  // Initialize blocks from existing agent messages (session restore)
  const [state, setState] = useState<TUIState>(() => {
    const { blocks, lastUsage } = messagesToBlocks(agent.state.messages);
    return {
      blocks,
      usage: lastUsage,
      isGenerating: false,
      sessionId,
      providerName,
      modelName,
      error: null,
    };
  });

  const agentRef = useRef(agent);
  agentRef.current = agent;

  useEffect(() => {
    const unsubscribe = agent.subscribe((event: AgentEvent) => {
      switch (event.type) {
        case "agent_start":
          setState((s) => ({ ...s, isGenerating: true, error: null }));
          break;

        case "message_update": {
          const e = event.assistantMessageEvent;
          if (e.type === "text_delta") {
            setState((s) => {
              const blocks = [...s.blocks];
              const last = blocks[blocks.length - 1];
              if (last?.kind === "assistant" && last.isStreaming) {
                blocks[blocks.length - 1] = {
                  ...last,
                  text: last.text + e.delta,
                } as AssistantBlock;
              } else {
                blocks.push({
                  kind: "assistant",
                  message: e.partial,
                  text: e.delta,
                  isStreaming: true,
                });
              }
              return { ...s, blocks };
            });
          } else if (e.type === "thinking_delta") {
            setState((s) => {
              const blocks = [...s.blocks];
              const last = blocks[blocks.length - 1];
              if (last?.kind === "thinking" && last.isStreaming) {
                blocks[blocks.length - 1] = {
                  ...last,
                  text: last.text + e.delta,
                } as ThinkingBlock;
              } else {
                blocks.push({
                  kind: "thinking",
                  message: e.partial,
                  text: e.delta,
                  isStreaming: true,
                });
              }
              return { ...s, blocks };
            });
          } else if (e.type === "thinking_end") {
            // Finalize thinking block -- replace with final content, stop streaming indicator
            setState((s) => {
              const blocks = s.blocks.map((b) =>
                b.kind === "thinking" && b.isStreaming
                  ? ({ ...b, text: e.content, isStreaming: false } as ThinkingBlock)
                  : b,
              );
              return { ...s, blocks };
            });
          }
          break;
        }

        case "tool_execution_start": {
          const argsStr = JSON.stringify(event.args);
          const truncated = argsStr.length > 200 ? argsStr.slice(0, 200) + "..." : argsStr;
          setState((s) => ({
            ...s,
            blocks: [
              ...s.blocks,
              {
                kind: "tool-call",
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                args: truncated,
                status: "running",
              },
            ],
          }));
          break;
        }

        case "tool_execution_end": {
          const firstContent = event.result?.content?.[0];
          const resultText = firstContent?.type === "text" ? firstContent.text : "";
          const firstLine = resultText.split("\n")[0];
          setState((s) => {
            const blocks = s.blocks.map((b) =>
              b.kind === "tool-call" && b.toolCallId === event.toolCallId
                ? {
                    ...b,
                    status: event.isError ? ("error" as const) : ("completed" as const),
                    result: firstLine,
                    isError: event.isError,
                  }
                : b,
            );
            return { ...s, blocks };
          });
          break;
        }

        case "message_end": {
          setState((s) => {
            const blocks = s.blocks.map((b) =>
              b.kind === "assistant" && b.isStreaming
                ? ({ ...b, isStreaming: false } as AssistantBlock)
                : b.kind === "thinking" && b.isStreaming
                  ? ({ ...b, isStreaming: false } as ThinkingBlock)
                  : b,
            );
            // Track usage separately, not as a visible block
            let usage = s.usage;
            const msg = event.message;
            if (msg.role === "assistant" && msg.usage) {
              usage = {
                input: msg.usage.input,
                output: msg.usage.output,
                totalTokens: msg.usage.totalTokens,
                cost: msg.usage.cost.total,
              };
            }
            // Surface API errors as visible blocks
            let error = s.error;
            if (msg.role === "assistant" && msg.stopReason === "error" && msg.errorMessage) {
              error = msg.errorMessage;
              blocks.push({ kind: "error", message: msg.errorMessage });
            }
            return { ...s, blocks, usage, error };
          });
          break;
        }

        case "agent_end":
          setState((s) => ({ ...s, isGenerating: false }));
          break;
      }
    });

    return unsubscribe;
  }, [agent]);

  const sendPrompt = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setState((s) => ({
      ...s,
      blocks: [
        ...s.blocks,
        {
          kind: "user",
          message: { role: "user", content: text, timestamp: Date.now() },
          text,
        },
      ],
    }));
    await agentRef.current.prompt(text);
  }, []);

  const abort = useCallback(() => {
    agentRef.current.abort();
  }, []);

  return { state, sendPrompt, abort };
}
