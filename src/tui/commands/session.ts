import { register } from "./registry.js";
import type { SlashCommand } from "./types.js";

export const sessionCommand: SlashCommand = {
  id: "session",
  title: "Sessions",
  description: "Browse and switch sessions",
  category: "Session",
  handler: (_ctx) => {
    // Handler wired via app.tsx state
  },
};

register(sessionCommand);
