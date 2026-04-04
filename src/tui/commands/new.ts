import { register } from "./registry.js";
import type { SlashCommand } from "./types.js";

export const newCommand: SlashCommand = {
  id: "new",
  title: "New Session",
  description: "Start a fresh conversation",
  category: "Session",
  handler: (_ctx) => {
    // Handler wired via app.tsx state
  },
};

register(newCommand);
