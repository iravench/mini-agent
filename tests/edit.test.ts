import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { editTool } from "../src/tools/edit.js";

describe("editTool", () => {
  let tmpDir: string;
  let testFile: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "edit-test-"));
    testFile = join(tmpDir, "test.txt");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("replaces a unique string", async () => {
    writeFileSync(testFile, "hello world\nfoo bar\n");

    const result = await editTool.execute("t1", {
      path: testFile,
      old_string: "hello world",
      new_string: "goodbye world",
    });

    const content = await readFile(testFile, "utf-8");
    expect(content).toBe("goodbye world\nfoo bar\n");

    const text = (result.content[0] as any).text;
    expect(text).toContain("Replaced 1 occurrence");
  });

  it("throws on missing file", async () => {
    await expect(
      editTool.execute("t1", {
        path: join(tmpDir, "nonexistent.txt"),
        old_string: "a",
        new_string: "b",
      }),
    ).rejects.toThrow("File not found");
  });

  it("throws when string not found", async () => {
    writeFileSync(testFile, "hello world\n");

    await expect(
      editTool.execute("t1", {
        path: testFile,
        old_string: "not found",
        new_string: "replacement",
      }),
    ).rejects.toThrow("String not found");
  });

  it("throws when string matches multiple times", async () => {
    writeFileSync(testFile, "aaa bbb aaa\n");

    await expect(
      editTool.execute("t1", {
        path: testFile,
        old_string: "aaa",
        new_string: "ccc",
      }),
    ).rejects.toThrow("String found 2 times");
  });

  it("handles multiline replacement", async () => {
    writeFileSync(testFile, "line1\nline2\nline3\n");

    await editTool.execute("t1", {
      path: testFile,
      old_string: "line1\nline2",
      new_string: "replaced1\nreplaced2",
    });

    const content = await readFile(testFile, "utf-8");
    expect(content).toBe("replaced1\nreplaced2\nline3\n");
  });

  it("reports line counts in result", async () => {
    writeFileSync(testFile, "a\nb\nc\nd\n");

    const result = await editTool.execute("t1", {
      path: testFile,
      old_string: "a\nb\nc",
      new_string: "x\ny",
    });

    const text = (result.content[0] as any).text;
    expect(text).toContain("3 lines → 2 lines");
  });
});
