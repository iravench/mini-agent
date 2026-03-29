/**
 * Truncate a string to a maximum number of bytes (UTF-8).
 * Returns the (possibly truncated) content and a flag indicating truncation.
 */
export function truncateBytes(
  text: string,
  max: number,
  suffix = "\n\n[Output truncated. Use a more specific pattern or reduce limit.]",
): { content: string; truncated: boolean } {
  const bytes = Buffer.byteLength(text, "utf-8");
  if (bytes <= max) return { content: text, truncated: false };
  let slice = text.slice(0, max);
  while (Buffer.byteLength(slice, "utf-8") > max && slice.length > 0) {
    slice = slice.slice(0, -100);
  }
  return { content: slice + suffix, truncated: true };
}
