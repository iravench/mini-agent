import type { AgentMessage } from "@mariozechner/pi-agent-core";

export type ToolCallStatus = "pending" | "running" | "completed" | "error";

export interface UserBlock {
  kind: "user";
  message: AgentMessage;
  text: string;
}

export interface AssistantBlock {
  kind: "assistant";
  message: AgentMessage;
  text: string;
  isStreaming: boolean;
}

export interface ThinkingBlock {
  kind: "thinking";
  message: AgentMessage;
  text: string;
  isStreaming: boolean;
}

export interface ToolCallBlock {
  kind: "tool-call";
  toolCallId: string;
  toolName: string;
  args: string;
  status: ToolCallStatus;
  result?: string;
  isError?: boolean;
}

export interface UsageInfo {
  input: number;
  output: number;
  totalTokens: number;
  cost: number;
}

export interface ErrorBlock {
  kind: "error";
  message: string;
}

export type MessageBlock = UserBlock | AssistantBlock | ThinkingBlock | ToolCallBlock | ErrorBlock;

export interface TUIState {
  blocks: MessageBlock[];
  usage: UsageInfo | null;
  isGenerating: boolean;
  sessionId: string | null;
  providerName: string;
  modelName: string;
  error: string | null;
}
