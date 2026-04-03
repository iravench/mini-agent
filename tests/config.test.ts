import { describe, it, expect } from "vitest";
import { getSessionDir } from "../src/config.js";
import { existsSync } from "node:fs";

describe("getSessionDir", () => {
  it("encodes cwd into safe directory name", () => {
    const cwd = "/home/user/project";
    const dir = getSessionDir(cwd);
    expect(dir).toContain("--home-user-project--");
    expect(existsSync(dir)).toBe(true);
  });

  it("creates directory if it doesn't exist", () => {
    const cwd = "/tmp/test-session-dir";
    const dir = getSessionDir(cwd);
    expect(existsSync(dir)).toBe(true);
  });
});
