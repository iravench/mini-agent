import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, saveConfig, type UserConfig } from "../src/user-config.js";

describe("user-config", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "config-test-"));
    process.env.MINI_AGENT_HOME = tmpDir;
  });

  afterEach(() => {
    delete process.env.MINI_AGENT_HOME;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty config when file does not exist", () => {
    const config = loadConfig();
    expect(config).toEqual({});
  });

  it("saves and loads config", () => {
    const cfg: UserConfig = {
      defaultProvider: "anthropic",
      defaultModel: "claude-sonnet-4-20250514",
      contextThreshold: 0.85,
      customInstructions: "Use TypeScript strict mode",
    };

    saveConfig(cfg);
    const loaded = loadConfig();

    expect(loaded.defaultProvider).toBe("anthropic");
    expect(loaded.defaultModel).toBe("claude-sonnet-4-20250514");
    expect(loaded.contextThreshold).toBe(0.85);
    expect(loaded.customInstructions).toBe("Use TypeScript strict mode");
  });

  it("returns empty config for invalid JSON", () => {
    const configPath = join(tmpDir, "config.json");
    writeFileSync(configPath, "not json {{{");
    const config = loadConfig();
    expect(config).toEqual({});
  });

  it("returns empty config for non-object JSON", () => {
    const configPath = join(tmpDir, "config.json");
    writeFileSync(configPath, '"just a string"');
    const config = loadConfig();
    expect(config).toEqual({});
  });

  it("writes config file with proper formatting", () => {
    saveConfig({ defaultProvider: "openai" });
    const configPath = join(tmpDir, "config.json");
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.defaultProvider).toBe("openai");
    // Should have trailing newline
    expect(raw.endsWith("\n")).toBe(true);
  });
});
