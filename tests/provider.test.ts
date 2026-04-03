import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveModel } from "../src/provider.js";

describe("resolveModel", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("throws when no provider is configured", () => {
    delete process.env.AI_PROVIDER;
    delete process.env.AI_MODEL;

    expect(() => resolveModel()).toThrow(/No AI provider configured/);
  });

  it("throws for unknown provider with actionable hint", () => {
    expect(() => resolveModel("nonexistent-provider", "some-model")).toThrow(
      /Failed to resolve AI model/,
    );
  });

  it("resolves custom moonshot models", () => {
    const model = resolveModel("moonshot", "kimi-k2-0905-preview");
    expect(model.id).toBe("kimi-k2-0905-preview");
    expect(model.provider).toBe("moonshot");
    expect(model.name).toBe("Kimi K2");
  });

  it("resolves custom kimi-k2.5 model with image input", () => {
    const model = resolveModel("moonshot", "kimi-k2.5");
    expect(model.id).toBe("kimi-k2.5");
    expect(model.input).toContain("image");
  });

  it("resolves custom moonshot-v1-8k model", () => {
    const model = resolveModel("moonshot", "moonshot-v1-8k");
    expect(model.id).toBe("moonshot-v1-8k");
    expect(model.reasoning).toBe(false);
    expect(model.maxTokens).toBe(8192);
  });

  it("throws for unknown model in known custom provider", () => {
    expect(() => resolveModel("moonshot", "nonexistent-model")).toThrow(
      /Failed to resolve AI model/,
    );
  });

  it("resolves provider from AI_PROVIDER env var", () => {
    process.env.AI_PROVIDER = "moonshot";
    process.env.AI_MODEL = "kimi-k2-0905-preview";

    const model = resolveModel();
    expect(model.id).toBe("kimi-k2-0905-preview");
  });

  it("CLI args override env vars", () => {
    process.env.AI_PROVIDER = "moonshot";
    process.env.AI_MODEL = "kimi-k2.5";

    const model = resolveModel("moonshot", "moonshot-v1-8k");
    expect(model.id).toBe("moonshot-v1-8k");
  });
});
