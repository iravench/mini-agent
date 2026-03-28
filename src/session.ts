import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { getSessionDir } from "./config.js";

// ── Types ────────────────────────────────────────────────────────────

export interface SessionHeader {
  type: "session";
  id: string;
  timestamp: string;
  cwd: string;
}

export interface SessionMessageEntry {
  type: "message";
  id: string;
  parentId: string | null;
  timestamp: string;
  message: AgentMessage;
}

export type FileEntry = SessionHeader | SessionMessageEntry;
export type SessionEntry = SessionMessageEntry;

export interface SessionInfo {
  path: string;
  id: string;
  cwd: string;
  created: Date;
  modified: Date;
  messageCount: number;
  firstMessage: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Generate a unique short ID (8 hex chars, collision-checked) */
function generateId(byId: { has(id: string): boolean }): string {
  for (let i = 0; i < 100; i++) {
    const id = randomUUID().slice(0, 8);
    if (!byId.has(id)) return id;
  }
  return randomUUID();
}

/** Parse a JSONL file into entries. Skips malformed lines. */
function parseEntries(content: string): FileEntry[] {
  const entries: FileEntry[] = [];
  for (const line of content.trim().split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as FileEntry);
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

function isSessionFile(filePath: string): boolean {
  try {
    const content = readFileSync(filePath, "utf-8");
    const firstLine = content.trim().split("\n")[0];
    if (!firstLine) return false;
    const header = JSON.parse(firstLine);
    return header.type === "session" && typeof header.id === "string";
  } catch {
    return false;
  }
}

function extractText(message: AgentMessage): string {
  if (!("content" in message) || !message.content) return "";
  const content = message.content;
  if (typeof content === "string") return content;
  return content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join(" ");
}

function findMostRecentSession(sessionDir: string): string | null {
  try {
    const files = readdirSync(sessionDir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => join(sessionDir, f))
      .filter(isSessionFile)
      .map((path) => ({ path, mtime: statSync(path).mtime }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    return files[0]?.path ?? null;
  } catch {
    return null;
  }
}

// ── SessionManager ───────────────────────────────────────────────────

/**
 * Manages conversation sessions as append-only JSONL files.
 *
 * Each session entry has id + parentId forming a tree structure. The leaf
 * pointer tracks the current head. Appending creates a child of the leaf.
 * Branching moves the leaf to an earlier entry, creating a fork.
 *
 * Use buildSessionContext() to get the resolved message list for the LLM,
 * which follows the path from root to the current leaf.
 */
export class SessionManager {
  private sessionId: string = "";
  private sessionFile: string | undefined;
  private sessionDir: string;
  private cwd: string;
  private persist: boolean;
  private flushed: boolean = false;
  private fileEntries: FileEntry[] = [];
  private byId: Map<string, SessionEntry> = new Map();
  private leafId: string | null = null;

  private constructor(
    cwd: string,
    sessionDir: string,
    sessionFile: string | undefined,
    persist: boolean,
  ) {
    this.cwd = cwd;
    this.sessionDir = sessionDir;
    this.persist = persist;
    if (persist && sessionDir && !existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true });
    }

    if (sessionFile) {
      this.setSessionFile(sessionFile);
    } else {
      this.newSession();
    }
  }

  // ── Factory methods ──────────────────────────────────────────────

  /** Create a new session for the given cwd. */
  static create(cwd: string): SessionManager {
    const dir = getSessionDir(cwd);
    return new SessionManager(cwd, dir, undefined, true);
  }

  /** Open a specific session file. */
  static open(path: string): SessionManager {
    const entries = loadEntriesFromFile(path);
    const header = entries.find(
      (e): e is SessionHeader => e.type === "session",
    );
    const cwd = header?.cwd ?? process.cwd();
    const dir = resolve(path, "..");
    return new SessionManager(cwd, dir, path, true);
  }

  /** Continue the most recent session for the given cwd, or create new. */
  static continueRecent(cwd: string): SessionManager {
    const dir = getSessionDir(cwd);
    const mostRecent = findMostRecentSession(dir);
    if (mostRecent) {
      return new SessionManager(cwd, dir, mostRecent, true);
    }
    return new SessionManager(cwd, dir, undefined, true);
  }

  /** List all sessions for a given cwd, newest first. */
  static list(cwd: string): SessionInfo[] {
    const dir = getSessionDir(cwd);
    const sessions: SessionInfo[] = [];
    if (!existsSync(dir)) return sessions;

    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => join(dir, f))
      .filter(isSessionFile);

    for (const filePath of files) {
      const info = buildSessionInfo(filePath);
      if (info) sessions.push(info);
    }

    sessions.sort((a, b) => b.modified.getTime() - a.modified.getTime());
    return sessions;
  }

  /**
   * Find a session file by full or partial ID (prefix match).
   * Returns the file path, or null if not found.
   */
  static findById(idOrPrefix: string, cwd: string): string | null {
    const dir = getSessionDir(cwd);
    if (!existsSync(dir)) return null;

    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => join(dir, f));

    for (const filePath of files) {
      const entries = loadEntriesFromFile(filePath);
      const header = entries.find(
        (e): e is SessionHeader => e.type === "session",
      );
      if (header && header.id.startsWith(idOrPrefix)) {
        return filePath;
      }
    }
    return null;
  }

  // ── Session lifecycle ────────────────────────────────────────────

  /** Switch to a different session file (used for resume). */
  setSessionFile(sessionFile: string): void {
    this.sessionFile = resolve(sessionFile);
    if (existsSync(this.sessionFile)) {
      this.fileEntries = loadEntriesFromFile(this.sessionFile);

      // Corrupted file — start fresh at that path
      if (this.fileEntries.length === 0) {
        const explicitPath = this.sessionFile;
        this.newSession();
        this.sessionFile = explicitPath;
        this._rewriteFile();
        this.flushed = true;
        return;
      }

      const header = this.fileEntries.find(
        (e): e is SessionHeader => e.type === "session",
      );
      this.sessionId = header?.id ?? randomUUID();
      this._buildIndex();
      this.flushed = true;
    } else {
      const explicitPath = this.sessionFile;
      this.newSession();
      this.sessionFile = explicitPath;
    }
  }

  /** Start a new session. Returns the session file path. */
  newSession(): string | undefined {
    this.sessionId = randomUUID();
    const timestamp = new Date().toISOString();
    const header: SessionHeader = {
      type: "session",
      id: this.sessionId,
      timestamp,
      cwd: this.cwd,
    };
    this.fileEntries = [header];
    this.byId.clear();
    this.leafId = null;
    this.flushed = false;

    if (this.persist) {
      const fileTimestamp = timestamp.replace(/[:.]/g, "-");
      this.sessionFile = join(
        this.sessionDir,
        `${fileTimestamp}_${this.sessionId}.jsonl`,
      );
    }
    return this.sessionFile;
  }

  // ── Entry management ─────────────────────────────────────────────

  /** Append a message as child of current leaf, then advance leaf. */
  appendMessage(message: AgentMessage): string {
    const entry: SessionMessageEntry = {
      type: "message",
      id: generateId(this.byId),
      parentId: this.leafId,
      timestamp: new Date().toISOString(),
      message,
    };
    this._appendEntry(entry);
    return entry.id;
  }

  // ── Tree traversal ───────────────────────────────────────────────

  getLeafId(): string | null {
    return this.leafId;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getSessionFile(): string | undefined {
    return this.sessionFile;
  }

  getCwd(): string {
    return this.cwd;
  }

  /** Get all session entries (excludes header). Returns a shallow copy. */
  getEntries(): SessionEntry[] {
    return this.fileEntries.filter(
      (e): e is SessionEntry => e.type !== "session",
    );
  }

  /** Get entry by ID. */
  getEntry(id: string): SessionEntry | undefined {
    return this.byId.get(id);
  }

  /**
   * Walk from leaf (or fromId) to root, returning all entries in path order.
   */
  getBranch(fromId?: string): SessionEntry[] {
    const path: SessionEntry[] = [];
    const startId = fromId ?? this.leafId;
    let current = startId ? this.byId.get(startId) : undefined;
    while (current) {
      path.unshift(current);
      current = current.parentId ? this.byId.get(current.parentId) : undefined;
    }
    return path;
  }

  /**
   * Build the resolved message list from root to current leaf.
   * This is what gets sent to the LLM.
   */
  buildSessionContext(): AgentMessage[] {
    return this.getBranch().map((entry) => entry.message);
  }

  /**
   * Start a new branch from an earlier entry.
   * Moves the leaf pointer. Next append creates a child of that entry.
   */
  branch(branchFromId: string): void {
    if (!this.byId.has(branchFromId)) {
      throw new Error(`Entry ${branchFromId} not found`);
    }
    this.leafId = branchFromId;
  }

  /**
   * Reset the leaf pointer to null (before any entries).
   */
  resetLeaf(): void {
    this.leafId = null;
  }

  // ── Internal ─────────────────────────────────────────────────────

  private _buildIndex(): void {
    this.byId.clear();
    this.leafId = null;
    for (const entry of this.fileEntries) {
      if (entry.type === "session") continue;
      this.byId.set(entry.id, entry);
      this.leafId = entry.id;
    }
  }

  private _rewriteFile(): void {
    if (!this.persist || !this.sessionFile) return;
    const content =
      this.fileEntries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    writeFileSync(this.sessionFile, content);
  }

  /**
   * Persist an entry to disk.
   * Deferred flush: buffers in memory until first assistant message appears,
   * then flushes all entries and switches to incremental append.
   */
  private _persist(entry: SessionEntry): void {
    if (!this.persist || !this.sessionFile) return;

    const hasAssistant = this.fileEntries.some(
      (e) => e.type === "message" && (e.message as any).role === "assistant",
    );
    if (!hasAssistant) {
      this.flushed = false;
      return;
    }

    if (!this.flushed) {
      for (const e of this.fileEntries) {
        appendFileSync(this.sessionFile, `${JSON.stringify(e)}\n`);
      }
      this.flushed = true;
    } else {
      appendFileSync(this.sessionFile, `${JSON.stringify(entry)}\n`);
    }
  }

  private _appendEntry(entry: SessionEntry): void {
    this.fileEntries.push(entry);
    this.byId.set(entry.id, entry);
    this.leafId = entry.id;
    this._persist(entry);
  }
}

// ── Standalone helpers ────────────────────────────────────────────────

/** Load entries from a session file. Returns empty array if invalid. */
export function loadEntriesFromFile(filePath: string): FileEntry[] {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, "utf-8");
  const entries = parseEntries(content);

  if (entries.length === 0) return entries;
  const header = entries[0];
  if (header.type !== "session" || typeof (header as any).id !== "string") {
    return [];
  }
  return entries;
}

/** Build session info for listing. */
function buildSessionInfo(filePath: string): SessionInfo | null {
  try {
    const entries = loadEntriesFromFile(filePath);
    if (entries.length === 0) return null;
    const header = entries[0];
    if (header.type !== "session") return null;

    const stats = statSync(filePath);
    let messageCount = 0;
    let firstMessage = "";

    for (const entry of entries) {
      if (entry.type !== "message") continue;
      messageCount++;
      if (!firstMessage && (entry.message as any).role === "user") {
        firstMessage = extractText(entry.message);
      }
    }

    const sessionHeader = header as SessionHeader;
    return {
      path: filePath,
      id: sessionHeader.id,
      cwd: sessionHeader.cwd,
      created: new Date(sessionHeader.timestamp),
      modified: stats.mtime,
      messageCount,
      firstMessage: firstMessage || "(no messages)",
    };
  } catch {
    return null;
  }
}
