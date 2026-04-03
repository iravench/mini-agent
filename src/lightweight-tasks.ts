import { completeSimple, getEnvApiKey } from "@mariozechner/pi-ai";
import { streamProxy } from "@mariozechner/pi-agent-core";
import type { Api, Model, UserMessage, Context, AssistantMessage } from "@mariozechner/pi-ai";
import { resolveModel } from "./provider.js";
import type { SessionManager } from "./session.js";
import { env } from "./config.js";

const LIGHTWEIGHT_MODEL_KEY = "moonshot:moonshot-v1-8k";

function getLightweightModel(): Model<Api> | null {
  try {
    return resolveModel("moonshot", "moonshot-v1-8k");
  } catch {
    return null;
  }
}

function extractText(content: string | any[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join(" ");
}

/** Non-streaming proxy call: wraps streamProxy + .result() */
async function completeProxy(
  model: Model<any>,
  context: Context,
  proxyUrl: string,
  authToken: string,
): Promise<AssistantMessage> {
  const stream = streamProxy(model, context, {
    proxyUrl,
    authToken,
    maxTokens: 1024,
  });
  return stream.result();
}

async function callLightweightModel(
  systemPrompt: string,
  userMessage: string,
): Promise<string | null> {
  const model = getLightweightModel();
  if (!model) return null;

  const proxyUrl = env("LLM_PROXY_URL");

  const msg: UserMessage = {
    role: "user",
    content: userMessage,
    timestamp: Date.now(),
  };

  const context: Context = {
    systemPrompt,
    messages: [msg],
  };

  let result: AssistantMessage;

  if (proxyUrl) {
    result = await completeProxy(model, context, proxyUrl, env("LLM_PROXY_TOKEN") ?? "");
  } else {
    const apiKey = getEnvApiKey(model.provider) ?? env("AI_API_KEY");
    if (!apiKey) return null;

    result = await completeSimple(model, context, {
      maxTokens: 1024,
      apiKey,
    });
  }

  return extractText(result.content).trim();
}

export function generateSessionTitle(
  userMessage: string,
  assistantMessage: string,
  session: SessionManager,
): void {
  void (async () => {
    try {
      const title = await callLightweightModel(
        "Generate a concise title (3-8 words) for this conversation. Return ONLY the title, nothing else. Do not use quotes.",
        `User: ${userMessage}\nAssistant: ${assistantMessage}`,
      );

      if (title && title.length > 0) {
        session.setTitle(title);
      }
    } catch (err) {
      process.stderr.write(
        `[lightweight-tasks] title generation failed: ${(err as Error).message}\n`,
      );
    }
  })();
}
