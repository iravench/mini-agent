import type { ToolCallBlock as ToolCallBlockType } from "./types.js";

const STATUS_LABELS: Record<string, string> = {
  pending: "[..]",
  running: "[>>]",
  completed: "[OK]",
  error: "[!!]",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#8B949E",
  running: "#D29922",
  completed: "#7EE787",
  error: "#F85149",
};

export function ToolCallBlock({ block }: { block: ToolCallBlockType }) {
  const label = STATUS_LABELS[block.status];
  const color = STATUS_COLORS[block.status];

  return (
    <box padding={1} paddingTop={0} paddingBottom={0} flexDirection="column">
      <text>
        <span fg={color}>{label} </span>
        <b fg="#D2A8FF">{block.toolName}</b>
        <span fg="#8B949E">({block.args})</span>
      </text>
      {block.result && <text fg={block.isError ? "#F85149" : "#8B949E"}>{block.result}</text>}
    </box>
  );
}
