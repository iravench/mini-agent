import { realpathSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Map of per-file mutation queues. Each key is a resolved file path; the value
 * is a promise chain that serializes concurrent writes to that file.
 *
 * Lifecycle: entries are inserted when an operation starts and removed once the
 * operation completes (and no successor is queued). Resolved promises are not
 * retained — the Map only grows while operations are actively in-flight.
 */
const fileMutationQueues = new Map<string, Promise<void>>();

function getMutationQueueKey(filePath: string): string {
  const resolvedPath = resolve(filePath);
  try {
    return realpathSync.native(resolvedPath);
  } catch {
    return resolvedPath;
  }
}

/**
 * Serialize file mutation operations targeting the same file.
 * Operations for different files run in parallel.
 *
 * Usage:
 *   await withFileMutationQueue(path, () => writeFile(path, content))
 */
export async function withFileMutationQueue<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const key = getMutationQueueKey(filePath);
  const currentQueue = fileMutationQueues.get(key) ?? Promise.resolve();

  let releaseNext!: () => void;
  const nextQueue = new Promise<void>((resolveQueue) => {
    releaseNext = resolveQueue;
  });
  const chainedQueue = currentQueue.then(() => nextQueue);
  fileMutationQueues.set(key, chainedQueue);

  await currentQueue;
  try {
    return await fn();
  } finally {
    releaseNext();
    if (fileMutationQueues.get(key) === chainedQueue) {
      fileMutationQueues.delete(key);
    }
  }
}
