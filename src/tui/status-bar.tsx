interface StatusBarProps {
  providerName: string;
  modelName: string;
  sessionId: string | null;
  isGenerating: boolean;
  totalTokens?: number;
  cost?: number;
  width: number;
}

export function StatusBar({
  providerName,
  modelName,
  sessionId,
  isGenerating,
  totalTokens,
  cost,
  width,
}: StatusBarProps) {
  const shortId = sessionId ? sessionId.slice(0, 8) : "new";
  const statusText = isGenerating ? "Generating..." : "Ready";
  const statusColor = isGenerating ? "#D29922" : "#7EE787";
  const usageText = totalTokens != null ? `${totalTokens} tokens / $${(cost ?? 0).toFixed(4)}` : "";

  return (
    <box width={width} height={1} flexDirection="row" backgroundColor="#161B22">
      <text fg={statusColor}> {statusText} </text>
      <text fg="#8B949E"> | </text>
      <text fg="#58A6FF">{modelName}</text>
      <text fg="#8B949E">@{providerName}</text>
      <text fg="#8B949E"> | </text>
      <text fg="#484F58">session:{shortId}</text>
      {usageText && (
        <>
          <text fg="#8B949E"> | </text>
          <text fg="#484F58">{usageText}</text>
        </>
      )}
    </box>
  );
}
