import type { ErrorBlock } from "./types.js";

export function ErrorMessage({ block }: { block: ErrorBlock }) {
  return (
    <box
      padding={1}
      paddingTop={0}
      paddingBottom={0}
      flexDirection="column"
      borderStyle="single"
      borderColor="#F85149"
    >
      <text>
        <b fg="#F85149">Error</b>
      </text>
      <text fg="#F85149">{block.message}</text>
    </box>
  );
}
