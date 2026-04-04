import { register } from "./registry.js";
import type { SlashCommand } from "./types.js";

export const quitCommand: SlashCommand = {
  id: "quit",
  title: "Quit",
  description: "Exit the TUI",
  category: "General",
  handler: (_ctx) => {
    // Handler wired via app.tsx state
  },
};

register(quitCommand);
