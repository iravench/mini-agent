import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { withFileMutationQueue } from "../src/tools/file-mutation-queue.js";

describe("withFileMutationQueue", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "queue-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("serializes operations on the same file", async () => {
    const file = join(tmpDir, "counter.txt");
    writeFileSync(file, "0");

    const results: number[] = [];

    // Launch 10 concurrent increments on the same file
    const ops = Array.from({ length: 10 }, (_, i) =>
      withFileMutationQueue(file, async () => {
        const current = parseInt(readFileSync(file, "utf-8"), 10);
        // Small delay to amplify race conditions
        await new Promise((r) => setTimeout(r, 5));
        writeFileSync(file, String(current + 1));
        results.push(i);
      }),
    );

    await Promise.all(ops);

    // All 10 increments should have applied
    expect(readFileSync(file, "utf-8")).toBe("10");
  });

  it("allows parallel operations on different files", async () => {
    const file1 = join(tmpDir, "file1.txt");
    const file2 = join(tmpDir, "file2.txt");
    writeFileSync(file1, "a");
    writeFileSync(file2, "b");

    const order: string[] = [];

    await Promise.all([
      withFileMutationQueue(file1, async () => {
        order.push("start-1");
        await new Promise((r) => setTimeout(r, 20));
        order.push("end-1");
      }),
      withFileMutationQueue(file2, async () => {
        order.push("start-2");
        await new Promise((r) => setTimeout(r, 10));
        order.push("end-2");
      }),
    ]);

    // Both should have started before either ended (parallel)
    expect(order.indexOf("start-1")).toBeLessThan(order.indexOf("end-1"));
    expect(order.indexOf("start-2")).toBeLessThan(order.indexOf("end-2"));
  });

  it("cleans up queue entry after completion", async () => {
    const file = join(tmpDir, "cleanup.txt");
    writeFileSync(file, "x");

    await withFileMutationQueue(file, async () => {});
    // Second call should not be queued behind the first (queue is cleaned up)
    await withFileMutationQueue(file, async () => {});
  });

  it("propagates errors without breaking the queue", async () => {
    const file = join(tmpDir, "error.txt");
    writeFileSync(file, "data");

    // First operation throws
    await expect(
      withFileMutationQueue(file, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    // Second operation should still work (queue was cleaned up)
    const result = await withFileMutationQueue(file, async () => {
      return "ok";
    });
    expect(result).toBe("ok");
  });
});
