import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { streamSimple, getEnvApiKey } from "@mariozechner/pi-ai";
import type {
  AssistantMessageEvent,
  Model,
  Api,
  Context,
  SimpleStreamOptions,
} from "@mariozechner/pi-ai";

// ── CLI args ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}
const port = Number(getArg("--port")) || 9821;
const tokenFile = getArg("--token-file");
const bindAddr = getArg("--bind") || "127.0.0.1";

if (!tokenFile) {
  console.error("Usage: llm-proxy --port <num> --token-file <path>");
  process.exit(1);
}

// ── Auth token (re-read from file per request) ─────────────────────────

function readAuthToken(): string | null {
  try {
    const content = readFileSync(tokenFile!, "utf-8");
    const match = content.match(/^LLM_PROXY_TOKEN=(.+)$/m);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

// ── API key resolution (re-reads process.env per request) ──────────────

function resolveApiKey(provider: string): string | undefined {
  return getEnvApiKey(provider) ?? process.env.AI_API_KEY;
}

// ── SSE helpers ────────────────────────────────────────────────────────

function writeSse(res: ServerResponse, data: unknown): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ── Convert AssistantMessageEvent → ProxyAssistantMessageEvent ─────────

function toProxyEvent(event: AssistantMessageEvent): Record<string, unknown> {
  switch (event.type) {
    case "start":
      return { type: "start" };
    case "text_start":
      return { type: "text_start", contentIndex: event.contentIndex };
    case "text_delta":
      return { type: "text_delta", contentIndex: event.contentIndex, delta: event.delta };
    case "text_end":
      return { type: "text_end", contentIndex: event.contentIndex };
    case "thinking_start":
      return { type: "thinking_start", contentIndex: event.contentIndex };
    case "thinking_delta":
      return { type: "thinking_delta", contentIndex: event.contentIndex, delta: event.delta };
    case "thinking_end":
      return { type: "thinking_end", contentIndex: event.contentIndex };
    case "toolcall_start": {
      const tc = event.partial.content[event.contentIndex];
      return {
        type: "toolcall_start",
        contentIndex: event.contentIndex,
        id: tc?.type === "toolCall" ? tc.id : "",
        toolName: tc?.type === "toolCall" ? tc.name : "",
      };
    }
    case "toolcall_delta":
      return { type: "toolcall_delta", contentIndex: event.contentIndex, delta: event.delta };
    case "toolcall_end":
      return { type: "toolcall_end", contentIndex: event.contentIndex };
    case "done":
      return { type: "done", reason: event.reason, usage: event.message.usage };
    case "error":
      return {
        type: "error",
        reason: event.reason,
        errorMessage: event.error.errorMessage,
        usage: event.error.usage,
      };
  }
}

// ── Request handler ────────────────────────────────────────────────────

async function handleStream(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Auth check
  const authHeader = req.headers.authorization;
  const token = readAuthToken();
  if (!token || authHeader !== `Bearer ${token}`) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  // Read body
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString()) as {
    model: Model<Api>;
    context: Context;
    options?: SimpleStreamOptions;
  };

  // Resolve API key from host env (fresh per request)
  const apiKey = resolveApiKey(body.model.provider);
  if (!apiKey) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: `No API key for provider "${body.model.provider}". Set ${body.model.provider.toUpperCase().replace(/-/g, "_")}_API_KEY or AI_API_KEY.`,
      }),
    );
    return;
  }

  // Stream response
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  try {
    const stream = streamSimple(body.model, body.context, { ...body.options, apiKey });
    for await (const event of stream) {
      writeSse(res, toProxyEvent(event));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeSse(res, {
      type: "error",
      reason: "error",
      errorMessage: message,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    });
  }

  res.end();
}

// ── Server ─────────────────────────────────────────────────────────────

const requestHandler = async (req: IncomingMessage, res: ServerResponse) => {
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200);
    res.end("ok");
    return;
  }

  if (req.url === "/api/stream" && req.method === "POST") {
    try {
      await handleStream(req, res);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
      }
      res.end(JSON.stringify({ error: message }));
    }
    return;
  }

  res.writeHead(404);
  res.end("Not found");
};

const server = createServer(requestHandler);

server.listen(port, bindAddr, () => {
  console.log(`  LLM proxy listening on ${bindAddr}:${port}`);
});

process.on("SIGTERM", () => {
  server.close();
  process.exit(0);
});
