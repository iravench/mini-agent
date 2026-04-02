import type { UserBlock } from "./types.js";

export function UserMessage({ block }: { block: UserBlock }) {
  return (
    <box padding={1} paddingTop={0} paddingBottom={0} flexDirection="column">
      <text>
        <b fg="#58A6FF">You</b>
      </text>
      <text>{block.text}</text>
    </box>
  );
}
