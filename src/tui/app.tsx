import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useState, useCallback, useRef } from "react";
import type { Agent } from "@mariozechner/pi-agent-core";
import { SessionManager } from "../session.js";
import type { SessionInfo } from "../session.js";

import { useAgent } from "./use-agent.js";
import { MessageList } from "./message-list.js";
import { Prompt } from "./prompt.js";
import { StatusBar } from "./status-bar.js";
import { HelpDialog } from "./help-dialog.js";
import { SessionListDialog } from "./dialogs/session-list.js";

export interface SwitchResult {
  agent: Agent;
  session: SessionManager;
}

interface TUIAppProps {
  agent: Agent;
  session: SessionManager;
  providerName: string;
  modelName: string;
  onExit: () => void;
  onSessionSwitch: (sessionPath: string) => Promise<SwitchResult>;
}

function TUIApp({
  agent: initialAgent,
  session: initialSession,
  providerName,
  modelName,
  onExit,
  onSessionSwitch,
}: TUIAppProps) {
  const { width, height } = useTerminalDimensions();

  // Agent + session state (swappable via F2)
  const [agent, setAgent] = useState(initialAgent);
  const [session, setSession] = useState(initialSession);

  const { state, sendPrompt, abort } = useAgent({
    agent,
    sessionId: session.getSessionId(),
    providerName,
    modelName,
  });

  const [showHelp, setShowHelp] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);

  const promptFocused = !showHelp && !showSessions;

  // Layout: status bar (1) + prompt (5) + messages (rest)
  const statusBarHeight = 1;
  const promptHeight = 5;
  const messageHeight = Math.max(1, height - statusBarHeight - promptHeight);

  const handleSessionSelect = useCallback(
    async (sessionPath: string) => {
      setShowSessions(false);
      try {
        const result = await onSessionSwitch(sessionPath);
        setAgent(result.agent);
        setSession(result.session);
      } catch {
        // Session switch failed -- stay on current session
      }
    },
    [onSessionSwitch],
  );

  const handleSessionCancel = useCallback(() => {
    setShowSessions(false);
  }, []);

  const toggleSessions = useCallback(() => {
    if (showSessions) {
      setShowSessions(false);
    } else {
      SessionManager.list(session.getCwd()).then(
        (s) => {
          setSessions(s);
          setShowSessions(true);
        },
        () => {
          setSessions([]);
          setShowSessions(true);
        },
      );
    }
  }, [showSessions, session]);

  // All keyboard shortcuts in one place
  const toggleSessionsRef = useRef(toggleSessions);
  toggleSessionsRef.current = toggleSessions;

  useKeyboard((key) => {
    // Ctrl+C: abort if generating, else exit
    if (key.name === "c" && key.ctrl) {
      key.preventDefault();
      key.stopPropagation();
      if (state.isGenerating) {
        abort();
      } else {
        onExit();
      }
      return;
    }

    // F1: toggle help
    if (key.name === "f1") {
      key.preventDefault();
      key.stopPropagation();
      setShowHelp((h) => !h);
      return;
    }

    // F2: toggle session list
    if (key.name === "f2") {
      key.preventDefault();
      key.stopPropagation();
      toggleSessionsRef.current();
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
        focused={promptFocused}
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
  onSessionSwitch: (sessionPath: string) => Promise<SwitchResult>;
}

export async function startTUI(options: StartTUIOptions) {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    targetFps: 30,
    useMouse: true,
    screenMode: "alternate-screen",
    consoleMode: "disabled",
  });

  const exit = () => {
    if (!renderer.isDestroyed) {
      renderer.destroy();
    }
  };

  const root = createRoot(renderer);
  root.render(
    <TUIApp
      agent={options.agent}
      session={options.session}
      providerName={options.providerName}
      modelName={options.modelName}
      onExit={exit}
      onSessionSwitch={options.onSessionSwitch}
    />,
  );

  // Ensure clean shutdown
  process.on("exit", exit);
  process.on("SIGTERM", () => {
    exit();
    process.exit(0);
  });
}
