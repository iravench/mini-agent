import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useState, useCallback, useRef, useEffect } from "react";
import type { Agent } from "@mariozechner/pi-agent-core";
import type { Model, Api } from "@mariozechner/pi-ai";
import { SessionManager } from "../session.js";
import type { SessionInfo } from "../session.js";
import { list as listCommands } from "./commands/registry.js";
import type { SlashCommand } from "./commands/types.js";
import "./commands/session.js";
import "./commands/model.js";
import "./commands/new.js";
import "./commands/quit.js";

import { useAgent } from "./use-agent.js";
import { MessageList } from "./message-list.js";
import { Prompt } from "./prompt.js";
import { StatusBar } from "./status-bar.js";
import { SessionListDialog } from "./dialogs/session-list.js";
import { CommandPalette } from "./command-palette.js";
import { ModelSelector } from "./dialogs/model-selector.js";

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
  availableModels: Model<Api>[];
  onModelSwitch: (model: Model<Api>) => Promise<SwitchResult>;
}

function TUIApp({
  agent: initialAgent,
  session: initialSession,
  providerName,
  modelName,
  onExit,
  onSessionSwitch,
  availableModels,
  onModelSwitch,
}: TUIAppProps) {
  const { width, height } = useTerminalDimensions();

  const [agent, setAgent] = useState(initialAgent);
  const [session, setSession] = useState(initialSession);
  const [currentProvider, setCurrentProvider] = useState(providerName);
  const [currentModel, setCurrentModel] = useState(modelName);

  const { state, sendPrompt, abort } = useAgent({
    agent,
    sessionId: session.getSessionId(),
    providerName: currentProvider,
    modelName: currentModel,
  });

  // Dialog states
  const [showSessions, setShowSessions] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [showModelSelector, setShowModelSelector] = useState(false);

  const promptFocused = !showSessions && !showCommandPalette && !showModelSelector;

  const statusBarHeight = 1;
  const promptHeight = 5;
  const messageHeight = Math.max(1, height - statusBarHeight - promptHeight);

  // ── Session list ────────────────────────────────────────────────
  const handleSessionSelect = useCallback(
    async (sessionPath: string) => {
      setShowSessions(false);
      try {
        const result = await onSessionSwitch(sessionPath);
        setAgent(result.agent);
        setSession(result.session);
      } catch {
        // Stay on current session
      }
    },
    [onSessionSwitch],
  );

  const handleSessionCancel = useCallback(() => {
    setShowSessions(false);
  }, []);

  const openSessions = useCallback(() => {
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
  }, [session]);

  // ── Command palette ─────────────────────────────────────────────
  const closePalette = useCallback(() => {
    setShowCommandPalette(false);
    setPaletteQuery("");
  }, []);

  const handleCommandSelect = useCallback(
    (cmd: SlashCommand) => {
      closePalette();
      cmd.handler({ closePalette });
    },
    [closePalette],
  );

  // ── Model selector ──────────────────────────────────────────────
  const handleModelSelect = useCallback(
    async (model: Model<Api>) => {
      setShowModelSelector(false);
      try {
        const result = await onModelSwitch(model);
        setAgent(result.agent);
        setSession(result.session);
        setCurrentProvider(model.provider);
        setCurrentModel(model.name || model.id);
      } catch {
        // Stay on current model
      }
    },
    [onModelSwitch],
  );

  const handleModelCancel = useCallback(() => {
    setShowModelSelector(false);
  }, []);

  // ── Register command handlers ───────────────────────────────────
  const openSessionsRef = useRef(openSessions);
  openSessionsRef.current = openSessions;

  const setShowModelSelectorRef = useRef(setShowModelSelector);
  setShowModelSelectorRef.current = setShowModelSelector;

  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  useEffect(() => {
    const commands = listCommands();
    for (const cmd of commands) {
      const originalHandler = cmd.handler;
      cmd.handler = (ctx) => {
        switch (cmd.id) {
          case "session":
            openSessionsRef.current();
            break;
          case "model":
            setShowModelSelectorRef.current(true);
            break;
          case "new":
            session.newSession();
            setAgent(initialAgent);
            setSession(session);
            break;
          case "quit":
            onExitRef.current();
            break;
          default:
            originalHandler(ctx);
        }
      };
    }
  }, [session, initialAgent]);

  // ── Global keyboard shortcuts ───────────────────────────────────
  useKeyboard((key) => {
    // Ctrl+C: abort if generating, else exit
    if (key.name === "c" && key.ctrl) {
      if (state.isGenerating) {
        abort();
      } else {
        onExit();
      }
      return;
    }

    // Ctrl+P: toggle command palette
    if (key.name === "p" && key.ctrl) {
      if (showCommandPalette) {
        closePalette();
      } else {
        setPaletteQuery("");
        setShowCommandPalette(true);
      }
      return;
    }

    // Esc: close any open dialog
    if (key.name === "escape") {
      if (showSessions) setShowSessions(false);
      if (showCommandPalette) closePalette();
      if (showModelSelector) setShowModelSelector(false);
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

      {showSessions && (
        <SessionListDialog
          sessions={sessions}
          onSelect={handleSessionSelect}
          onCancel={handleSessionCancel}
        />
      )}
      {showCommandPalette && (
        <CommandPalette
          initialQuery={paletteQuery}
          commands={listCommands()}
          onSelect={handleCommandSelect}
          onCancel={closePalette}
        />
      )}
      {showModelSelector && (
        <ModelSelector
          models={availableModels}
          currentModelId={currentModel}
          currentProvider={currentProvider}
          onSelect={handleModelSelect}
          onCancel={handleModelCancel}
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
  onExit: () => void;
  onSessionSwitch: (sessionPath: string) => Promise<SwitchResult>;
  availableModels: Model<Api>[];
  onModelSwitch: (model: Model<Api>) => Promise<SwitchResult>;
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
      availableModels={options.availableModels}
      onModelSwitch={options.onModelSwitch}
    />,
  );
}
