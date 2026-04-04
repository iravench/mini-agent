import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import fuzzysort from "fuzzysort";
import { useKeyboard } from "@opentui/react";
import type { SessionInfo } from "../../session.js";

type FuzzyResult = ReturnType<typeof fuzzysort.single>;

const HIGHLIGHT_OPEN = "\x00";
const HIGHLIGHT_CLOSE = "\x01";

function getDisplayTitle(s: SessionInfo): string {
  if (s.title) return s.title;
  const words = s.firstMessage.split(/\s+/).slice(0, 8).join(" ");
  return words.length > 60 ? words.slice(0, 57) + "..." : words || "(no messages)";
}

function relativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function buildSearchTarget(s: SessionInfo): string {
  const parts = [s.title ?? "", s.firstMessage, s.cwd];
  return parts.join(" ");
}

function renderHighlighted(text: string, result: FuzzyResult): React.ReactNode {
  if (!result) return text;

  const highlighted = result.highlight(HIGHLIGHT_OPEN, HIGHLIGHT_CLOSE);
  const segments = highlighted.split(HIGHLIGHT_OPEN);
  if (segments.length === 1) return text;

  const children: React.ReactNode[] = [];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const closeIdx = segment.indexOf(HIGHLIGHT_CLOSE);
    if (closeIdx === -1) {
      children.push(segment);
    } else {
      if (closeIdx > 0) children.push(segment.slice(0, closeIdx));
      children.push(
        <span key={`hl-${i}`} fg="#FFD700">
          {segment.slice(closeIdx + 1)}
        </span>,
      );
    }
  }
  return children;
}

interface FilteredSession {
  session: SessionInfo;
  titleResult: FuzzyResult;
  score: number;
}

interface SessionListDialogProps {
  sessions: SessionInfo[];
  onSelect: (sessionPath: string) => void;
  onCancel: () => void;
}

interface SearchTarget {
  session: SessionInfo;
  title: string;
  searchTarget: string;
}

export function SessionListDialog({ sessions, onSelect, onCancel }: SessionListDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;
  const filteredRef = useRef<FilteredSession[]>([]);

  const filtered = useMemo((): FilteredSession[] => {
    if (!searchQuery.trim()) {
      return sessions.map((s: SessionInfo) => ({
        session: s,
        titleResult: null,
        score: 0,
      }));
    }

    const targets: SearchTarget[] = sessions.map((s: SessionInfo) => ({
      session: s,
      title: getDisplayTitle(s),
      searchTarget: buildSearchTarget(s),
    }));

    const results = fuzzysort.go(searchQuery, targets, {
      key: "searchTarget",
      all: true,
    });

    return results.map((r) => {
      const obj = r.obj as SearchTarget;
      const titleResult = obj.title ? fuzzysort.single(searchQuery, obj.title) : null;
      return {
        session: obj.session,
        titleResult,
        score: r.score,
      };
    });
  }, [sessions, searchQuery]);

  useEffect(() => {
    filteredRef.current = filtered;
    setSelectedIndex(0);
  }, [filtered]);

  const handleSelect = useCallback(
    (index: number) => {
      if (index >= 0 && index < filteredRef.current.length) {
        onSelect(filteredRef.current[index].session.path);
      }
    },
    [onSelect],
  );

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
      handleSelect(selectedIndexRef.current);
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

  const visibleRows = filtered.length > 0 ? filtered : null;

  return (
    <box
      position="absolute"
      left="10%"
      top="15%"
      width="80%"
      height="65%"
      zIndex={100}
      borderStyle="rounded"
      borderColor="#58A6FF"
      backgroundColor="#0D1117"
      padding={1}
      flexDirection="column"
    >
      <text fg="#58A6FF">
        <b>Sessions</b>
      </text>
      <text fg="#8B949E">{sessions.length} total</text>

      <box marginTop={1} marginBottom={1} borderStyle="single" borderColor="#30363D">
        <text fg="#E6EDF3">{searchQuery || "type to filter..."}</text>
      </box>

      <box flexGrow={1} flexDirection="column" overflow="scroll">
        {visibleRows ? (
          visibleRows.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            const displayTitle = getDisplayTitle(item.session);
            const bgColor = isSelected ? "#1A3A5C" : "transparent";
            const titleFg = isSelected ? "#58A6FF" : "#E6EDF3";

            const highlightedTitle = item.titleResult
              ? renderHighlighted(displayTitle, item.titleResult)
              : displayTitle;

            return (
              <box
                key={item.session.path}
                backgroundColor={bgColor}
                paddingX={1}
                flexDirection="row"
                justifyContent="space-between"
              >
                <text fg={titleFg} flexGrow={1}>
                  {highlightedTitle}
                </text>
                <text fg="#8B949E">{item.session.messageCount} msgs</text>
                <text fg="#6E7681" marginLeft={2}>
                  {relativeTime(item.session.modified)}
                </text>
              </box>
            );
          })
        ) : searchQuery.trim() ? (
          <box flexGrow={1} justifyContent="center" alignItems="center">
            <text fg="#8B949E">No sessions match &quot;{searchQuery}&quot;</text>
          </box>
        ) : (
          <box flexGrow={1} justifyContent="center" alignItems="center">
            <text fg="#8B949E">No sessions found</text>
          </box>
        )}
      </box>

      <text fg="#8B949E" marginTop={1}>
        {searchQuery.trim()
          ? "Arrows to navigate, Enter to select, Esc to cancel."
          : "Arrows to navigate, Enter to select, Esc to cancel."}
      </text>
    </box>
  );
}
