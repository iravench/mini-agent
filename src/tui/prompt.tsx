import { useRef, useCallback } from "react";
import type { TextareaRenderable } from "@opentui/core";

interface PromptProps {
  width: number;
  height: number;
  onSubmit: (text: string) => void;
  onAbort: () => void;
  isGenerating: boolean;
  focused: boolean;
}

export function Prompt({ width, height, onSubmit, onAbort, isGenerating, focused }: PromptProps) {
  const textareaRef = useRef<TextareaRenderable>(null);

  const handleSubmit = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    if (isGenerating) {
      onAbort();
      return;
    }

    const text = textarea.plainText;
    if (text.trim()) {
      textarea.clear();
      onSubmit(text);
    }
  }, [isGenerating, onSubmit, onAbort]);

  const borderColor = isGenerating ? "#D29922" : "#30363D";
  const placeholder = isGenerating
    ? "Generating... (Enter to abort)"
    : "Type your message... (Enter to submit)";

  return (
    <box
      width={width}
      height={height}
      borderStyle="single"
      borderColor={borderColor}
      flexDirection="column"
    >
      <textarea
        ref={textareaRef}
        id="prompt-input"
        width="100%"
        height="100%"
        placeholder={placeholder}
        placeholderColor="#484F58"
        backgroundColor="#0D1117"
        focusedBackgroundColor="#161B22"
        textColor="#E6EDF3"
        cursorColor="#58A6FF"
        wrapMode="word"
        focused={focused}
        keyBindings={[{ name: "return", action: "submit" }]}
        onSubmit={handleSubmit}
      />
    </box>
  );
}
