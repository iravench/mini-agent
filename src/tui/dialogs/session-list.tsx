import { useCallback } from "react";
import type { SessionInfo } from "../../session.js";

interface SessionListDialogProps {
  sessions: SessionInfo[];
  onSelect: (sessionPath: string) => void;
  onCancel: () => void;
}

export function SessionListDialog({
  sessions,
  onSelect,
  onCancel: _onCancel,
}: SessionListDialogProps) {
  const options = sessions.map((s) => ({
    name: `${s.id.slice(0, 8)}  ${s.messageCount} msgs`,
    description: s.firstMessage.length > 60 ? s.firstMessage.slice(0, 57) + "..." : s.firstMessage,
    value: s.path,
  }));

  const handleSelect = useCallback(
    (_index: number, option: any | null) => {
      if (option?.value) {
        onSelect(option.value);
      }
    },
    [onSelect],
  );

  return (
    <box
      width="80%"
      height="60%"
      borderStyle="rounded"
      borderColor="#58A6FF"
      backgroundColor="#0D1117"
      padding={1}
      flexDirection="column"
    >
      <text fg="#58A6FF">
        <b>Sessions</b>
      </text>
      <text fg="#8B949E">Select a session to resume (Esc to cancel).</text>
      <select options={options} onSelect={handleSelect} focused={true} />
    </box>
  );
}
