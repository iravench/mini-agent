import type { MessageBlock } from "./types.js";
import { UserMessage } from "./user-message.js";
import { AssistantMessage } from "./assistant-message.js";
import { ThinkingMessage } from "./thinking-message.js";
import { ToolCallBlock } from "./tool-call.js";
import { ErrorMessage } from "./error-message.js";

interface MessageListProps {
  blocks: MessageBlock[];
  width: number;
  height: number;
}

function renderBlock(block: MessageBlock, index: number) {
  switch (block.kind) {
    case "user":
      return <UserMessage key={index} block={block} />;
    case "assistant":
      return <AssistantMessage key={index} block={block} />;
    case "thinking":
      return <ThinkingMessage key={index} block={block} />;
    case "tool-call":
      return <ToolCallBlock key={index} block={block} />;
    case "error":
      return <ErrorMessage key={index} block={block} />;
    default:
      return null;
  }
}

export function MessageList({ blocks, width, height }: MessageListProps) {
  const children = blocks.map(renderBlock);

  return (
    <scrollbox
      width={width}
      height={height}
      stickyScroll={true}
      stickyStart="bottom"
      viewportCulling={true}
    >
      {children}
    </scrollbox>
  );
}
