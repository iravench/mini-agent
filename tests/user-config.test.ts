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
      defaultProvider: "moonshot",
      defaultModel: "kimi-k2.5",
      contextThreshold: 0.85,
      customInstructions: "Use TypeScript strict mode",
    };

    saveConfig(cfg);
    const loaded = loadConfig();

    expect(loaded.defaultProvider).toBe("moonshot");
    expect(loaded.defaultModel).toBe("kimi-k2.5");
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

  it("rejects out-of-range contextThreshold", () => {
    const configPath = join(tmpDir, "config.json");
    writeFileSync(configPath, JSON.stringify({ contextThreshold: 5.0 }));
    const config = loadConfig();
    // Zod rejects — entire config falls back to empty
    expect(config).toEqual({});
  });

  it("rejects wrong types", () => {
    const configPath = join(tmpDir, "config.json");
    writeFileSync(configPath, JSON.stringify({ defaultProvider: 42 }));
    const config = loadConfig();
    expect(config).toEqual({});
  });

  it("loads valid retry config", () => {
    const cfg: UserConfig = {
      retry: { enabled: true, maxRetries: 5, baseDelayMs: 1000 },
    };
    saveConfig(cfg);
    const loaded = loadConfig();
    expect(loaded.retry).toEqual({ enabled: true, maxRetries: 5, baseDelayMs: 1000 });
  });

  it("rejects invalid retry.maxRetries", () => {
    const configPath = join(tmpDir, "config.json");
    writeFileSync(configPath, JSON.stringify({ retry: { maxRetries: -1 } }));
    const config = loadConfig();
    expect(config).toEqual({});
  });
});
