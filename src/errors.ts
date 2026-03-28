import type { AfterToolCallContext, AfterToolCallResult } from "@mariozechner/pi-agent-core";

const ERROR_HINTS: Record<string, (ctx: AfterToolCallContext) => string> = {
  edit_file: (ctx) => {
    const args = ctx.args as { path?: string };
    const path = args?.path ?? "the file";
    return `\n\nHint: The edit failed on ${path}. Re-read the file with read_file to see its current contents, then retry with the exact text from the file.`;
  },
  read_file: (_ctx) => {
    return `\n\nHint: Check that the path exists and is a file (not a directory). Use ls to explore the directory, or find_files to locate the file.`;
  },
  write_file: (_ctx) => {
    return `\n\nHint: Verify the parent directory exists. Use bash with mkdir -p to create it if needed.`;
  },
  bash: () =>
    `\n\nHint: Read the error output above. Check for typos, missing dependencies, or permission issues.`,
  grep: (ctx) => {
    const args = ctx.args as { pattern?: string; literal?: boolean };
    if (!args?.literal) {
      return `\n\nHint: The search failed. Try using literal:true to treat the pattern as a plain string, or check for regex syntax errors.`;
    }
    return `\n\nHint: No matches found. Try a different pattern, use ignoreCase:true, or check the search path with ls.`;
  },
  find_files: (_ctx) => {
    return `\n\nHint: No files matched. Try a broader glob pattern (e.g. '**/*.ext'), or use ls to explore the directory structure first.`;
  },
  ls: (_ctx) => {
    return `\n\nHint: Check that the path exists and is a directory. Use find_files to locate files by pattern.`;
  },
};

/**
 * afterToolCall hook that appends recovery hints to tool error results.
 * This gives the LLM actionable guidance instead of raw error messages.
 */
export async function enhanceToolErrors(
  ctx: AfterToolCallContext,
): Promise<AfterToolCallResult | undefined> {
  if (!ctx.isError) return undefined;

  const hintFn = ERROR_HINTS[ctx.toolCall.name];
  if (!hintFn) return undefined;

  const hint = hintFn(ctx);
  const firstBlock = ctx.result.content?.[0];
  if (firstBlock?.type !== "text") return undefined;

  return {
    content: [{ type: "text", text: firstBlock.text + hint }],
  };
}

// ── API Retry Logic ─────────────────────────────────────────────────

const RETRYABLE_PATTERNS =
  /overloaded|rate.?limit|too many requests|429|500|502|503|504|service.?unavailable|server.?error|network.?error|connection.?error|connection.?refused|timeout|timed? out/i;

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 2000,
  maxDelayMs: 30000,
};

/**
 * Check if an error message from the LLM provider is retryable.
 */
export function isRetryableError(errorMessage: string): boolean {
  return RETRYABLE_PATTERNS.test(errorMessage);
}

/**
 * Sleep for a given duration, respecting an abort signal.
 */
export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Aborted"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("Aborted"));
      },
      { once: true },
    );
  });
}

/**
 * Calculate exponential backoff delay.
 */
export function backoffDelay(attempt: number, config: RetryConfig = DEFAULT_RETRY): number {
  const delay = config.baseDelayMs * 2 ** (attempt - 1);
  return Math.min(delay, config.maxDelayMs);
}
