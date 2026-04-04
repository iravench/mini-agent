import type { SlashCommand } from "./types.js";

const commands: SlashCommand[] = [];

export function register(cmd: SlashCommand): void {
  const idx = commands.findIndex((c) => c.id === cmd.id);
  if (idx >= 0) commands[idx] = cmd;
  else commands.push(cmd);
}

export function unregister(id: string): void {
  const idx = commands.findIndex((c) => c.id === id);
  if (idx >= 0) commands.splice(idx, 1);
}

export function list(): SlashCommand[] {
  return [...commands];
}
