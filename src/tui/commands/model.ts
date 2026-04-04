import { register } from "./registry.js";
import type { SlashCommand } from "./types.js";

export const modelCommand: SlashCommand = {
  id: "model",
  title: "Model",
  description: "Switch AI model or provider",
  category: "Settings",
  handler: (_ctx) => {
    // Handler wired via app.tsx state
  },
};

register(modelCommand);
