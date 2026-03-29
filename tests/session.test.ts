import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { SessionManager } from "../src/session.js";

// Helper to create a minimal user message
function userMsg(text: string): AgentMessage {
  return { role: "user", content: [{ type: "text", text }], timestamp: Date.now() } as any;
}

function assistantMsg(text: string): AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    timestamp: Date.now(),
    usage: { input: 100, output: 50, cost: { total: 0.001 } },
  } as any;
}

// Extract text from a message for comparison (ignores timestamps)
function msgText(msg: AgentMessage): string {
  return (msg as any).content?.[0]?.text ?? "";
}

describe("SessionManager", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "session-test-"));
    process.env.MINI_AGENT_HOME = tmpDir;
  });

  afterEach(() => {
    delete process.env.MINI_AGENT_HOME;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates a new session", () => {
    const session = SessionManager.create("/test/project");
    expect(session.getSessionId()).toBeTruthy();
    expect(session.getEntries()).toHaveLength(0);
    expect(session.getLeafId()).toBeNull();
  });

  it("appends messages and builds context", () => {
    const session = SessionManager.create("/test/project");

    const id1 = session.appendMessage(userMsg("hello"));
    const id2 = session.appendMessage(assistantMsg("hi there"));
    const id3 = session.appendMessage(userMsg("how are you"));

    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id3).toBeTruthy();

    const context = session.buildSessionContext();
    expect(context).toHaveLength(3);
    // Compare by content text, not deep equality (timestamps differ by ms)
    expect(msgText(context[0])).toBe("hello");
    expect(msgText(context[1])).toBe("hi there");
    expect(msgText(context[2])).toBe("how are you");
  });

  it("branches from an earlier entry", () => {
    const session = SessionManager.create("/test/project");

    const id1 = session.appendMessage(userMsg("first"));
    session.appendMessage(assistantMsg("second"));
    session.appendMessage(userMsg("third"));

    // Branch back to id1
    session.branch(id1);
    expect(session.getLeafId()).toBe(id1);

    // Append creates a new child of id1
    session.appendMessage(assistantMsg("alternative second"));

    const context = session.buildSessionContext();
    // Path is now: first -> alternative second (2 entries, not 3)
    expect(context).toHaveLength(2);
    expect(msgText(context[0])).toBe("first");
    expect(msgText(context[1])).toBe("alternative second");
    // The original "second" and "third" should not be in this branch
    expect(context.find((m: any) => msgText(m) === "second")).toBeUndefined();
    expect(context.find((m: any) => msgText(m) === "third")).toBeUndefined();
  });

  it("resets leaf to root", () => {
    const session = SessionManager.create("/test/project");

    session.appendMessage(userMsg("first"));
    session.appendMessage(assistantMsg("second"));

    session.resetLeaf();
    expect(session.getLeafId()).toBeNull();

    // After reset, buildSessionContext should be empty
    const context = session.buildSessionContext();
    expect(context).toHaveLength(0);
  });

  it("persists and loads session from file", async () => {
    const session = SessionManager.create("/test/project");
    session.appendMessage(userMsg("persisted message"));
    session.appendMessage(assistantMsg("persisted response"));

    const filePath = session.getSessionFile();
    expect(filePath).toBeTruthy();

    // Open from file
    const loaded = await SessionManager.open(filePath!);
    const context = loaded.buildSessionContext();
    expect(context).toHaveLength(2);
    expect(msgText(context[0])).toBe("persisted message");
    expect(msgText(context[1])).toBe("persisted response");
  });

  it("lists sessions for a cwd", async () => {
    // Session with assistant message persists (deferred flush triggers)
    const s1 = SessionManager.create("/test/project");
    s1.appendMessage(userMsg("session 1 msg"));
    s1.appendMessage(assistantMsg("session 1 response"));

    const s2 = SessionManager.create("/test/project");
    s2.appendMessage(userMsg("session 2 msg"));
    s2.appendMessage(assistantMsg("session 2 response"));

    const sessions = await SessionManager.list("/test/project");
    expect(sessions.length).toBe(2);
    // Newest first
    expect(sessions[0].modified.getTime()).toBeGreaterThanOrEqual(sessions[1].modified.getTime());
  });

  it("finds session by ID prefix", async () => {
    const session = SessionManager.create("/test/project");
    session.appendMessage(userMsg("msg"));
    session.appendMessage(assistantMsg("response"));

    const fullId = session.getSessionId();
    const prefix = fullId.slice(0, 4);

    const found = await SessionManager.findById(prefix, "/test/project");
    expect(found).toBeTruthy();
  });

  it("returns null for non-existent ID", async () => {
    const found = await SessionManager.findById("nonexistent", "/test/project");
    expect(found).toBeNull();
  });

  it("handles corrupted session file gracefully", async () => {
    const session = SessionManager.create("/test/project");
    session.appendMessage(userMsg("ok"));
    session.appendMessage(assistantMsg("ok"));

    // Overwrite file with garbage
    const filePath = session.getSessionFile();
    writeFileSync(filePath!, "not valid jsonl\n");

    const loaded = await SessionManager.open(filePath!);
    // Should not throw, should have empty context
    expect(loaded.buildSessionContext()).toHaveLength(0);
  });

  it("tree traversal preserves parent chain", () => {
    const session = SessionManager.create("/test/project");

    const id1 = session.appendMessage(userMsg("A"));
    session.appendMessage(assistantMsg("B"));
    session.branch(id1);
    const id3 = session.appendMessage(assistantMsg("C"));

    // Branch C should have path: A -> C (not A -> B -> C)
    const branch = session.getBranch(id3);
    expect(branch).toHaveLength(2);
    expect(msgText(branch[0].message)).toBe("A");
    expect(msgText(branch[1].message)).toBe("C");
  });

  it("getEntry retrieves specific entries", () => {
    const session = SessionManager.create("/test/project");
    const id = session.appendMessage(userMsg("findable"));

    const entry = session.getEntry(id);
    expect(entry).toBeTruthy();
    expect(msgText(entry!.message)).toBe("findable");
  });

  it("getEntries returns all non-header entries", () => {
    const session = SessionManager.create("/test/project");
    session.appendMessage(userMsg("a"));
    session.appendMessage(assistantMsg("b"));
    session.appendMessage(userMsg("c"));

    const entries = session.getEntries();
    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.type === "message")).toBe(true);
  });
});
