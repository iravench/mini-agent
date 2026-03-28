import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { grepTool } from "../src/tools/grep.js";
import { findTool } from "../src/tools/find.js";
import { lsTool } from "../src/tools/ls.js";

describe("grepTool", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "grep-test-"));
    writeFileSync(join(tmpDir, "a.ts"), "export const foo = 1;\nexport let bar = 2;\n");
    writeFileSync(join(tmpDir, "b.ts"), "const baz = 3;\n");
    mkdirSync(join(tmpDir, "sub"));
    writeFileSync(join(tmpDir, "sub", "c.ts"), "export default 4;\n");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds matches across files", async () => {
    const result = await grepTool.execute("t1", {
      pattern: "export",
      path: tmpDir,
    });
    const text = (result.content[0] as any).text;
    expect(text).toContain("a.ts");
    expect(text).toContain("sub/c.ts");
  });

  it("respects limit", async () => {
    const result = await grepTool.execute("t1", {
      pattern: "export",
      path: tmpDir,
      limit: 1,
    });
    const text = (result.content[0] as any).text;
    expect(text).toContain("limit reached");
  });

  it("supports glob filtering", async () => {
    const result = await grepTool.execute("t1", {
      pattern: "export",
      path: tmpDir,
      glob: "*.ts",
    });
    const text = (result.content[0] as any).text;
    expect(text).toContain("a.ts");
  });

  it("supports case-insensitive search", async () => {
    writeFileSync(join(tmpDir, "case.txt"), "HELLO world\n");
    const result = await grepTool.execute("t1", {
      pattern: "hello",
      path: tmpDir,
      ignoreCase: true,
      glob: "case.txt",
    });
    const text = (result.content[0] as any).text;
    expect(text).toContain("HELLO world");
  });

  it("supports literal string search", async () => {
    writeFileSync(join(tmpDir, "lit.txt"), "foo.bar\n");
    const result = await grepTool.execute("t1", {
      pattern: "foo.bar",
      path: tmpDir,
      literal: true,
      glob: "lit.txt",
    });
    const text = (result.content[0] as any).text;
    expect(text).toContain("foo.bar");
  });

  it("returns no matches message for empty results", async () => {
    const result = await grepTool.execute("t1", {
      pattern: "zzzznotfoundzzzz",
      path: tmpDir,
    });
    const text = (result.content[0] as any).text;
    expect(text).toBe("No matches found");
  });

  it("includes context lines when requested", async () => {
    writeFileSync(join(tmpDir, "ctx.txt"), "line1\nline2\nTARGET\nline4\nline5\n");
    const result = await grepTool.execute("t1", {
      pattern: "TARGET",
      path: tmpDir,
      glob: "ctx.txt",
      context: 1,
    });
    const text = (result.content[0] as any).text;
    expect(text).toContain("line2");
    expect(text).toContain("TARGET");
    expect(text).toContain("line4");
  });

  it("throws for invalid regex pattern", async () => {
    await expect(
      grepTool.execute("t1", {
        pattern: "[invalid",
        path: tmpDir,
      }),
    ).rejects.toThrow();
  });
});

describe("findTool", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "find-test-"));
    writeFileSync(join(tmpDir, "a.ts"), "");
    writeFileSync(join(tmpDir, "b.ts"), "");
    writeFileSync(join(tmpDir, "c.js"), "");
    mkdirSync(join(tmpDir, "sub"));
    writeFileSync(join(tmpDir, "sub", "d.ts"), "");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds files by glob pattern", async () => {
    const result = await findTool.execute("t1", {
      pattern: "*.ts",
      path: tmpDir,
    });
    const text = (result.content[0] as any).text;
    expect(text).toContain("a.ts");
    expect(text).toContain("b.ts");
    expect(text).not.toContain("c.js");
  });

  it("finds nested files with recursive glob", async () => {
    const result = await findTool.execute("t1", {
      pattern: "**/*.ts",
      path: tmpDir,
    });
    const text = (result.content[0] as any).text;
    expect(text).toContain("a.ts");
    expect(text).toContain("sub/d.ts");
  });

  it("respects limit", async () => {
    const result = await findTool.execute("t1", {
      pattern: "*.ts",
      path: tmpDir,
      limit: 1,
    });
    const text = (result.content[0] as any).text;
    expect(text).toContain("limit reached");
  });

  it("returns no files message for empty results", async () => {
    const result = await findTool.execute("t1", {
      pattern: "*.xyz",
      path: tmpDir,
    });
    const text = (result.content[0] as any).text;
    expect(text).toBe("No files found matching pattern");
  });

  it("throws for non-existent path", async () => {
    await expect(
      findTool.execute("t1", {
        pattern: "*.ts",
        path: join(tmpDir, "nonexistent"),
      }),
    ).rejects.toThrow();
  });
});

describe("lsTool", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ls-test-"));
    writeFileSync(join(tmpDir, "file1.txt"), "");
    writeFileSync(join(tmpDir, "file2.txt"), "");
    mkdirSync(join(tmpDir, "subdir"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("lists directory contents with directory markers", async () => {
    const result = await lsTool.execute("t1", { path: tmpDir });
    const text = (result.content[0] as any).text;
    expect(text).toContain("file1.txt");
    expect(text).toContain("file2.txt");
    expect(text).toContain("subdir/");
  });

  it("sorts entries alphabetically", async () => {
    const result = await lsTool.execute("t1", { path: tmpDir });
    const text = (result.content[0] as any).text;
    const lines = text.split("\n");
    expect(lines[0]).toBe("file1.txt");
    expect(lines[1]).toBe("file2.txt");
    expect(lines[2]).toBe("subdir/");
  });

  it("respects limit", async () => {
    const result = await lsTool.execute("t1", { path: tmpDir, limit: 1 });
    const text = (result.content[0] as any).text;
    expect(text).toContain("limit reached");
  });

  it("returns empty directory message for empty dirs", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "ls-empty-"));
    const result = await lsTool.execute("t1", { path: emptyDir });
    const text = (result.content[0] as any).text;
    expect(text).toBe("(empty directory)");
    rmSync(emptyDir, { recursive: true });
  });

  it("throws for non-existent path", async () => {
    await expect(lsTool.execute("t1", { path: join(tmpDir, "nonexistent") })).rejects.toThrow();
  });

  it("throws for non-directory path", async () => {
    const file = join(tmpDir, "file1.txt");
    await expect(lsTool.execute("t1", { path: file })).rejects.toThrow();
  });
});
