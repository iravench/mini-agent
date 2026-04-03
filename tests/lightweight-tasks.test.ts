import { describe, it, expect } from "vitest";
import { generateSessionTitle } from "../src/lightweight-tasks.js";
import { vi } from "vitest";

vi.mock("@mariozechner/pi-ai", () => ({
  completeSimple: vi.fn().mockResolvedValue({
    content: [{ type: "text", text: "Test Title" }],
  }),
  getEnvApiKey: vi.fn().mockReturnValue("fake-api-key"),
}));

vi.mock("@mariozechner/pi-agent-core", () => ({
  streamProxy: vi.fn(),
}));

vi.mock("../src/config.js", () => ({
  env: vi.fn().mockReturnValue(undefined),
}));

vi.mock("../src/provider.js", () => ({
  resolveModel: vi.fn().mockReturnValue({
    id: "moonshot-v1-8k",
    provider: "moonshot",
    api: "openai-completions",
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8192,
    maxTokens: 1024,
  }),
}));

describe("generateSessionTitle", () => {
  it("sets title when generation succeeds", async () => {
    vi.useFakeTimers();
    const session = { setTitle: vi.fn() };

    generateSessionTitle("hello world", "Hi there!", session as any);

    await vi.advanceTimersByTimeAsync(200);
    await vi.waitFor(() => expect(session.setTitle).toHaveBeenCalledWith("Test Title"), {
      timeout: 500,
    });
    vi.useRealTimers();
  });
});
