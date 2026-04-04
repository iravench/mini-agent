import { useMemo, useState, useRef, useEffect } from "react";
import fuzzysort from "fuzzysort";
import { useKeyboard } from "@opentui/react";
import type { Model, Api } from "@mariozechner/pi-ai";

interface ModelSelectorProps {
  models: Model<Api>[];
  currentModelId: string;
  currentProvider: string;
  onSelect: (model: Model<Api>) => void;
  onCancel: () => void;
}

interface DisplayModel {
  model: Model<Api>;
  label: string;
  provider: string;
  searchTarget: string;
}

function buildDisplayModels(models: Model<Api>[]): DisplayModel[] {
  return models.map((m) => {
    const label = m.name || m.id;
    const provider = m.provider;
    return {
      model: m,
      label,
      provider,
      searchTarget: `${label} ${provider} ${m.id}`,
    };
  });
}

export function ModelSelector({
  models,
  currentModelId,
  currentProvider,
  onSelect,
  onCancel,
}: ModelSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;
  const filteredRef = useRef<DisplayModel[]>([]);

  const displayModels = useMemo(() => buildDisplayModels(models), [models]);

  const filtered = useMemo((): DisplayModel[] => {
    if (!searchQuery.trim()) return displayModels;
    const results = fuzzysort.go(searchQuery, displayModels, {
      key: "searchTarget",
      all: true,
    });
    return results.map((r) => r.obj);
  }, [displayModels, searchQuery]);

  useEffect(() => {
    filteredRef.current = filtered;
    setSelectedIndex(0);
  }, [filtered]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      const currentIdx = filtered.findIndex(
        (m) => m.model.id === currentModelId && m.provider === currentProvider,
      );
      if (currentIdx >= 0) setSelectedIndex(currentIdx);
    }
  }, [filtered, currentModelId, currentProvider, searchQuery]);

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
        onSelect(filteredRef.current[idx].model);
      }
      return;
    }
    if (key.name && key.name.length === 1) {
      setSearchQuery((q) => q + key.name);
      return;
    }
    if (key.name === "backspace") {
      setSearchQuery((q) => q.slice(0, -1));
      return;
    }
  });

  return (
    <box
      position="absolute"
      left="15%"
      top="15%"
      width="70%"
      height="60%"
      zIndex={200}
      borderStyle="rounded"
      borderColor="#58A6FF"
      backgroundColor="#0D1117"
      padding={1}
      flexDirection="column"
    >
      <text fg="#58A6FF">
        <b>Switch Model</b>
      </text>
      <text fg="#8B949E">
        Current: {currentProvider}/{currentModelId}
      </text>

      <box marginTop={1} marginBottom={1} borderStyle="single" borderColor="#30363D">
        <text fg="#E6EDF3">{searchQuery || "type to filter..."}</text>
      </box>

      <box flexGrow={1} flexDirection="column" overflow="scroll">
        {filtered.length > 0 ? (
          filtered.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            const isCurrent = item.model.id === currentModelId && item.provider === currentProvider;
            const bgColor = isSelected ? "#1A3A5C" : "transparent";
            const titleFg = isCurrent ? "#7EE787" : isSelected ? "#58A6FF" : "#E6EDF3";

            return (
              <box
                key={`${item.provider}:${item.model.id}`}
                backgroundColor={bgColor}
                paddingX={1}
                flexDirection="row"
                justifyContent="space-between"
              >
                <text fg={titleFg} flexGrow={1}>
                  {isCurrent && !isSelected ? "● " : ""}
                  {item.label}
                </text>
                <text fg="#8B949E">{item.provider}</text>
              </box>
            );
          })
        ) : (
          <box flexGrow={1} justifyContent="center" alignItems="center">
            <text fg="#8B949E">No models match &quot;{searchQuery}&quot;</text>
          </box>
        )}
      </box>

      <text fg="#8B949E" marginTop={1}>
        Arrows to navigate, Enter to switch, Esc to cancel.
      </text>
    </box>
  );
}
