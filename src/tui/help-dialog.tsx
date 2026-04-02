interface HelpDialogProps {
  onClose: () => void;
}

const SHORTCUTS: [string, string][] = [
  ["Enter", "Submit message"],
  ["Ctrl+C", "Abort generation / Exit"],
  ["Ctrl+K", "Session list"],
  ["Ctrl+/", "Toggle help"],
  ["Page Up/Down", "Scroll history"],
];

export function HelpDialog({ onClose: _onClose }: HelpDialogProps) {
  return (
    <box
      width={50}
      height={SHORTCUTS.length + 5}
      borderStyle="rounded"
      borderColor="#58A6FF"
      backgroundColor="#0D1117"
      padding={1}
      flexDirection="column"
    >
      <text fg="#58A6FF">
        <b>Keyboard Shortcuts</b>
      </text>
      {SHORTCUTS.map(([key, desc]) => (
        <text key={key}>
          <b fg="#D2A8FF">{key}</b>
          <span fg="#8B949E"> - {desc}</span>
        </text>
      ))}
      <text fg="#484F58">Press Esc to close</text>
    </box>
  );
}
