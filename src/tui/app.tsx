import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useState, useCallback } from "react";
import type { Agent } from "@mariozechner/pi-agent-core";
import { SessionManager } from "../session.js";
import type { SessionInfo } from "../session.js";

import { useAgent } from "./use-agent.js";
import { MessageList } from "./message-list.js";
import { Prompt } from "./prompt.js";
import { StatusBar } from "./status-bar.js";
import { HelpDialog } from "./help-dialog.js";
import { SessionListDialog } from "./dialogs/session-list.js";

interface TUIAppProps {
  agent: Agent;
  session: SessionManager;
  providerName: string;
  modelName: string;
}

function TUIApp({ agent, session, providerName, modelName }: TUIAppProps) {
  const { width, height } = useTerminalDimensions();
  const { state, sendPrompt, abort } = useAgent({
    agent,
    sessionId: session.getSessionId(),
    providerName,
    modelName,
  });

  const [showHelp, setShowHelp] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);

  // Layout: status bar (1) + prompt (5) + messages (rest)
  const statusBarHeight = 1;
  const promptHeight = 5;
  const messageHeight = Math.max(1, height - statusBarHeight - promptHeight);

  useKeyboard((key) => {
    // Ctrl+C: abort if generating, else exit
    if (key.name === "c" && key.ctrl) {
      key.preventDefault();
      key.stopPropagation();
      if (state.isGenerating) {
        abort();
      } else {
        process.exit(0);
      }
      return;
    }

    // Ctrl+K: toggle session list
    if (key.name === "k" && key.ctrl) {
      key.preventDefault();
      key.stopPropagation();
      if (showSessions) {
        setShowSessions(false);
      } else {
        SessionManager.list(session.getCwd()).then((s) => {
          setSessions(s);
          setShowSessions(true);
        });
      }
      return;
    }

    // Ctrl+/: toggle help
    if (key.name === "/") {
      key.preventDefault();
      key.stopPropagation();
      setShowHelp((h) => !h);
      return;
    }

    // Esc: close any open dialog
    if (key.name === "escape") {
      key.preventDefault();
      key.stopPropagation();
      if (showHelp) setShowHelp(false);
      if (showSessions) setShowSessions(false);
      return;
    }
  });

  const handleSessionSelect = useCallback((_sessionPath: string) => {
    setShowSessions(false);
    // For now, just close the dialog. Full session switching
    // would require recreating the agent with a new session.
  }, []);

  const handleSessionCancel = useCallback(() => {
    setShowSessions(false);
  }, []);

  return (
    <box width={width} height={height} flexDirection="column">
      <MessageList blocks={state.blocks} width={width} height={messageHeight} />
      <StatusBar
        providerName={state.providerName}
        modelName={state.modelName}
        sessionId={state.sessionId}
        isGenerating={state.isGenerating}
        totalTokens={state.usage?.totalTokens}
        cost={state.usage?.cost}
        width={width}
      />
      <Prompt
        width={width}
        height={promptHeight}
        onSubmit={sendPrompt}
        onAbort={abort}
        isGenerating={state.isGenerating}
      />
      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
      {showSessions && (
        <SessionListDialog
          sessions={sessions}
          onSelect={handleSessionSelect}
          onCancel={handleSessionCancel}
        />
      )}
    </box>
  );
}

export interface StartTUIOptions {
  agent: Agent;
  session: SessionManager;
  providerName: string;
  modelName: string;
}

export async function startTUI(options: StartTUIOptions) {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    targetFps: 30,
    useMouse: true,
    screenMode: "alternate-screen",
    consoleMode: "disabled",
  });

  const root = createRoot(renderer);
  root.render(
    <TUIApp
      agent={options.agent}
      session={options.session}
      providerName={options.providerName}
      modelName={options.modelName}
    />,
  );

  // Ensure clean shutdown
  const cleanup = () => {
    if (!renderer.isDestroyed) {
      renderer.destroy();
    }
  };
  process.on("exit", cleanup);
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
}
