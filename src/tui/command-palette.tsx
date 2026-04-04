import { useMemo, useState, useRef, useEffect } from "react";
import fuzzysort from "fuzzysort";
import { useKeyboard } from "@opentui/react";
import type { SlashCommand } from "./commands/types.js";

interface CommandPaletteProps {
  initialQuery: string;
  commands: SlashCommand[];
  onSelect: (cmd: SlashCommand) => void;
  onCancel: () => void;
}

interface FilteredCommand {
  cmd: SlashCommand;
  score: number;
  highlighted: React.ReactNode;
  descHighlighted: React.ReactNode;
}

function renderHighlighted(text: string, indices: number[] | null): React.ReactNode {
  if (!indices || indices.length === 0) return text;
  const sorted = [...indices].sort((a, b) => a - b);
  const children: React.ReactNode[] = [];
  let lastIdx = 0;
  for (let i = 0; i < sorted.length; i++) {
    const idx = sorted[i];
    if (idx > lastIdx) {
      children.push(text.slice(lastIdx, idx));
    }
    let end = idx + 1;
    while (i + 1 < sorted.length && sorted[i + 1] === end) {
      i++;
      end++;
    }
    children.push(
      <span key={`hl-${idx}`} fg="#D2A8FF">
        {text.slice(idx, end)}
      </span>,
    );
    lastIdx = end;
  }
  if (lastIdx < text.length) {
    children.push(text.slice(lastIdx));
  }
  return children;
}

export function CommandPalette({
  initialQuery,
  commands,
  onSelect,
  onCancel,
}: CommandPaletteProps) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;
  const filteredRef = useRef<FilteredCommand[]>([]);

  const filtered = useMemo((): FilteredCommand[] => {
    if (!query.trim()) {
      return commands.map((cmd) => ({
        cmd,
        score: 0,
        highlighted: cmd.title,
        descHighlighted: cmd.description,
      }));
    }

    const targets = commands.map((cmd) => ({
      cmd,
      searchTarget: `${cmd.title} ${cmd.description}`,
    }));

    const results = fuzzysort.go(query, targets, {
      key: "searchTarget",
      all: true,
    });

    return results.map((r) => {
      const titleIndices = fuzzysort.single(query, r.obj.cmd.title)?.indexes ?? null;
      const descIndices = fuzzysort.single(query, r.obj.cmd.description)?.indexes ?? null;
      return {
        cmd: r.obj.cmd,
        score: r.score,
        highlighted: renderHighlighted(r.obj.cmd.title, titleIndices ? [...titleIndices] : null),
        descHighlighted: descIndices
          ? renderHighlighted(r.obj.cmd.description, [...descIndices])
          : r.obj.cmd.description,
      };
    });
  }, [commands, query]);

  useEffect(() => {
    filteredRef.current = filtered;
    setSelectedIndex(0);
  }, [filtered]);

  useKeyboard((key) => {
    if (key.name === "escape") {
      onCancel();
      return;
    }
    if (key.name === "up") {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.name === "down") {
      setSelectedIndex((prev) => Math.min(filteredRef.current.length - 1, prev + 1));
      return;
    }
    if (key.name === "return" || key.name === "enter") {
      const idx = selectedIndexRef.current;
      if (idx >= 0 && idx < filteredRef.current.length) {
        onSelect(filteredRef.current[idx].cmd);
      }
      return;
    }
    if (key.name && key.name.length === 1) {
      setQuery((q) => q + key.name);
      return;
    }
    if (key.name === "backspace") {
      setQuery((q) => q.slice(0, -1));
      return;
    }
  });

  const grouped = useMemo(() => {
    const groups: Map<string, FilteredCommand[]> = new Map();
    for (const item of filtered) {
      const cat = item.cmd.category ?? "Other";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(item);
    }
    return groups;
  }, [filtered]);

  return (
    <box
      position="absolute"
      left="20%"
      top="15%"
      width="60%"
      height="50%"
      zIndex={200}
      borderStyle="rounded"
      borderColor="#58A6FF"
      backgroundColor="#0D1117"
      padding={1}
      flexDirection="column"
    >
      <text fg="#58A6FF">
        <b>Command Palette</b>
      </text>

      <box marginTop={1} marginBottom={1} borderStyle="single" borderColor="#30363D">
        <text fg="#E6EDF3">{query || "type to filter..."}</text>
      </box>

      <box flexGrow={1} flexDirection="column" overflow="scroll">
        {grouped.size > 0 ? (
          Array.from(grouped.entries()).flatMap(([category, items]) => [
            <box key={`cat-${category}`} flexDirection="row">
              <text fg="#8B949E">
                <b>{category}</b>
              </text>
            </box>,
            ...items.map((item) => {
              const globalIdx = filtered.findIndex((f) => f.cmd.id === item.cmd.id);
              const isSelected = globalIdx === selectedIndex;
              const bgColor = isSelected ? "#1A3A5C" : "transparent";
              const titleFg = isSelected ? "#58A6FF" : "#E6EDF3";

              return (
                <box
                  key={item.cmd.id}
                  backgroundColor={bgColor}
                  paddingX={1}
                  flexDirection="row"
                  justifyContent="space-between"
                >
                  <text fg={titleFg} flexGrow={1}>
                    {item.highlighted}
                  </text>
                  <text fg="#8B949E">{item.descHighlighted}</text>
                </box>
              );
            }),
          ])
        ) : (
          <box flexGrow={1} justifyContent="center" alignItems="center">
            <text fg="#8B949E">No commands match &quot;{query}&quot;</text>
          </box>
        )}
      </box>

      <text fg="#8B949E" marginTop={1}>
        {query.trim()
          ? "Arrows to navigate, Enter to execute, Esc to cancel."
          : "Type to filter commands (Esc to cancel)."}
      </text>
    </box>
  );
}
