import type { UserBlock } from "./types.js";

export function UserMessage({ block }: { block: UserBlock }) {
  return (
    <box padding={1} paddingTop={0} paddingBottom={0} flexDirection="column">
      <text>
        <span fg="#58A6FF">
          <b>You</b>
        </span>
      </text>
      <text>{block.text}</text>
    </box>
  );
}
