import type { ThinkingBlock } from "./types.js";

export function ThinkingMessage({ block }: { block: ThinkingBlock }) {
  return (
    <box padding={1} paddingTop={0} paddingBottom={0} flexDirection="column">
      <text fg="#8B949E">
        <i>Thinking</i>
        {block.isStreaming && <i>...</i>}
      </text>
      <text fg="#484F58">
        <i>{block.text}</i>
      </text>
    </box>
  );
}
