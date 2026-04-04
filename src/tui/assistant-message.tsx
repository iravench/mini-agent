import type { AssistantBlock } from "./types.js";

export function AssistantMessage({ block }: { block: AssistantBlock }) {
  return (
    <box padding={1} paddingTop={0} paddingBottom={0} flexDirection="column">
      <text>
        <span fg="#7EE787">
          <b>Agent</b>
        </span>
      </text>
      <text>{block.text}</text>
    </box>
  );
}
