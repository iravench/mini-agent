export interface CommandContext {
  closePalette: () => void;
}

export interface SlashCommand {
  id: string;
  title: string;
  description: string;
  category?: string;
  keybind?: string;
  handler: (ctx: CommandContext) => void | Promise<void>;
}
