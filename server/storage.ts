/**
 * server/storage.ts
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  CAMADA DE ACESSO AO BANCO DE DADOS — Repository Pattern            ║
 * ║                                                                      ║
 * ║  Toda operação de banco DEVE passar por este arquivo.               ║
 * ║  Nunca use db.prepare() diretamente em server/index.ts.             ║
 * ║                                                                      ║
 * ║  Para migrar para PostgreSQL no futuro, reescreva apenas este       ║
 * ║  arquivo e server/db.ts — index.ts e os serviços não mudam.        ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

import db from "./db.js";
import { v4 as uuidv4 } from "uuid";

// ─── Types (espelham shared/schema.ts) ────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  username: string;
  password: string;
}

export interface Setting {
  id: string;
  key: string;
  value: string;
}

export interface Session {
  id: string;
  startTime: string;
  endTime?: string | null;
  status: string;
  clientName?: string | null;
  clientPhone?: string | null;
  capturedData?: string | null;
  archived: string;
  annotation?: string | null;
  assignedOperatorName?: string | null;
  contactId?: string | null;
}

export interface Message {
  id: string;
  sessionId: string;
  timestamp: string;
  sender: string;
  content: string;
}

export interface Log {
  id: string;
  sessionId?: string | null;
  timestamp: string;
  level: string;
  message: string;
  source: string;
}

export interface Folder {
  id: string;
  name: string;
  parentId?: string | null;
  createdAt: string;
}

export interface Document {
  id: string;
  name: string;
  type: string;
  mimeType: string;
  content?: string | null;
  embedding?: string | null;
  filePath: string;
  folderId?: string | null;
  paused: string;
  createdAt: string;
}

export interface ApiCost {
  id: string;
  service: string;
  operation: string;
  cost: number;
  currency: string;
  tokens?: number | null;
  notes?: string | null;
  createdAt: string;
}

export interface VtexLog {
  id: string;
  timestamp: string;
  type: string;
  description: string;
  product?: string | null;
  autonomous: number;
}

export interface VtexFailure {
  id: string;
  query: string;
  reason: string;
  createdAt: string;
  resolved: number;
}

export interface VtexSynonym {
  id: string;
  term: string;
  canonical: string;
  createdAt: string;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export const storage = {

  // Users
  getUserByEmail(email: string): User | null {
    return (db.prepare("SELECT * FROM users WHERE email = ?").get(email) as User) ?? null;
  },

  getUserById(id: string): User | null {
    return (db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User) ?? null;
  },

  getUserSafeById(id: string): Omit<User, "password"> | null {
    return (db.prepare("SELECT id, name, email, username FROM users WHERE id = ?").get(id) as Omit<User, "password">) ?? null;
  },

  listUsers(): Omit<User, "password">[] {
    return db.prepare("SELECT id, name, email, username FROM users").all() as Omit<User, "password">[];
  },

  createUser(data: { name: string; email: string; username: string; password: string }): Omit<User, "password"> {
    const id = uuidv4();
    db.prepare(
      "INSERT INTO users (id, name, email, username, password) VALUES (?, ?, ?, ?, ?)"
    ).run(id, data.name, data.email, data.username, data.password);
    return db.prepare("SELECT id, name, email, username FROM users WHERE id = ?").get(id) as Omit<User, "password">;
  },

  updateUser(id: string, data: Partial<Pick<User, "name" | "email" | "username" | "password">>): Omit<User, "password"> | null {
    const user = storage.getUserById(id);
    if (!user) return null;
    db.prepare(
      "UPDATE users SET name = ?, email = ?, username = ?, password = ? WHERE id = ?"
    ).run(
      data.name ?? user.name,
      data.email ?? user.email,
      data.username ?? user.username,
      data.password ?? user.password,
      id
    );
    return storage.getUserSafeById(id);
  },

  deleteUser(id: string): boolean {
    const result = db.prepare("DELETE FROM users WHERE id = ?").run(id);
    return result.changes > 0;
  },

  userExistsByEmailOrUsername(email: string, username: string): boolean {
    const row = db.prepare("SELECT id FROM users WHERE email = ? OR username = ?").get(email, username);
    return !!row;
  },

  // ─── Settings ───────────────────────────────────────────────────────────────

  getSetting(key: string): string | null {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  },

  getSettingParsed<T = any>(key: string): T | null {
    const raw = storage.getSetting(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  },

  setSetting(key: string, value: any): void {
    const strValue = typeof value === "string" ? value : JSON.stringify(value);
    const existing = db.prepare("SELECT id FROM settings WHERE key = ?").get(key);
    if (existing) {
      db.prepare("UPDATE settings SET value = ? WHERE key = ?").run(strValue, key);
    } else {
      db.prepare("INSERT INTO settings (id, key, value) VALUES (?, ?, ?)").run(uuidv4(), key, strValue);
    }
  },

  // ─── Sessions ────────────────────────────────────────────────────────────────

  listSessions(archived: "true" | "false"): Session[] {
    return db.prepare(
      "SELECT * FROM sessions WHERE archived = ? ORDER BY startTime DESC"
    ).all(archived) as Session[];
  },

  getSessionById(id: string): Session | null {
    return (db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Session) ?? null;
  },

  archiveSession(id: string): void {
    db.prepare("UPDATE sessions SET archived = 'true', status = 'COMPLETED' WHERE id = ?").run(id);
  },

  deleteArchivedSessions(): void {
    db.prepare("DELETE FROM messages WHERE sessionId IN (SELECT id FROM sessions WHERE archived = 'true')").run();
    db.prepare("DELETE FROM sessions WHERE archived = 'true'").run();
  },

  // ─── Messages ────────────────────────────────────────────────────────────────

  listMessagesBySession(sessionId: string): Message[] {
    return db.prepare(
      "SELECT * FROM messages WHERE sessionId = ? ORDER BY timestamp ASC"
    ).all(sessionId) as Message[];
  },

  // ─── Logs ────────────────────────────────────────────────────────────────────

  listLogsBySession(sessionId: string): Log[] {
    return db.prepare(
      "SELECT * FROM logs WHERE sessionId = ? ORDER BY timestamp ASC"
    ).all(sessionId) as Log[];
  },

  // ─── Dashboard ───────────────────────────────────────────────────────────────

  getDashboardStats(): { total: number; active: number; archived: number; leads: number } {
    const total    = (db.prepare("SELECT COUNT(*) as c FROM sessions").get() as any).c;
    const active   = (db.prepare("SELECT COUNT(*) as c FROM sessions WHERE status='RUNNING'").get() as any).c;
    const archived = (db.prepare("SELECT COUNT(*) as c FROM sessions WHERE archived='true'").get() as any).c;
    return { total, active, archived, leads: total };
  },

  getLeadsByDay(): { day: string; count: number }[] {
    return db.prepare(`
      SELECT date(startTime) as day, COUNT(*) as count
      FROM sessions
      GROUP BY date(startTime)
      ORDER BY day DESC
      LIMIT 30
    `).all() as { day: string; count: number }[];
  },

  getLeadsByOperator(): { name: string; count: number }[] {
    return db.prepare(`
      SELECT assignedOperatorName as name, COUNT(*) as count
      FROM sessions
      WHERE assignedOperatorName IS NOT NULL
      GROUP BY assignedOperatorName
      ORDER BY count DESC
    `).all() as { name: string; count: number }[];
  },

  // ─── Documents ───────────────────────────────────────────────────────────────

  listDocuments(): Document[] {
    return db.prepare("SELECT * FROM documents ORDER BY createdAt DESC").all() as Document[];
  },

  getDocumentById(id: string): Document | null {
    return (db.prepare("SELECT * FROM documents WHERE id = ?").get(id) as Document) ?? null;
  },

  createDocument(data: {
    name: string;
    type: string;
    mimeType: string;
    filePath: string;
    folderId?: string | null;
  }): Document {
    const id = uuidv4();
    db.prepare(
      "INSERT INTO documents (id, name, type, mimeType, filePath, folderId) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, data.name, data.type, data.mimeType, data.filePath, data.folderId ?? null);
    return storage.getDocumentById(id)!;
  },

  updateDocument(id: string, data: Partial<Pick<Document, "name" | "paused" | "folderId">>): Document | null {
    const doc = storage.getDocumentById(id);
    if (!doc) return null;
    db.prepare("UPDATE documents SET name = ?, paused = ?, folderId = ? WHERE id = ?").run(
      data.name ?? doc.name,
      data.paused ?? doc.paused,
      data.folderId !== undefined ? data.folderId : doc.folderId,
      id
    );
    return storage.getDocumentById(id);
  },

  deleteDocument(id: string): boolean {
    const result = db.prepare("DELETE FROM documents WHERE id = ?").run(id);
    return result.changes > 0;
  },

  bulkDeleteDocuments(ids: string[]): void {
    const stmt = db.prepare("DELETE FROM documents WHERE id = ?");
    for (const id of ids) stmt.run(id);
  },

  bulkMoveDocuments(ids: string[], folderId: string | null): void {
    const stmt = db.prepare("UPDATE documents SET folderId = ? WHERE id = ?");
    for (const id of ids) stmt.run(folderId, id);
  },

  bulkTogglePausedDocuments(ids: string[]): void {
    const getStmt = db.prepare("SELECT paused FROM documents WHERE id = ?");
    const setStmt = db.prepare("UPDATE documents SET paused = ? WHERE id = ?");
    for (const id of ids) {
      const doc = getStmt.get(id) as { paused: string } | undefined;
      if (doc) setStmt.run(doc.paused === "true" ? "false" : "true", id);
    }
  },

  listActiveDocumentsForRag(limit = 50): { id: string; name: string; filePath: string }[] {
    return db.prepare(
      "SELECT id, name, filePath FROM documents WHERE paused != 'true' ORDER BY createdAt DESC LIMIT ?"
    ).all(limit) as { id: string; name: string; filePath: string }[];
  },

  // ─── Folders ─────────────────────────────────────────────────────────────────

  listFolders(): Folder[] {
    return db.prepare("SELECT * FROM folders ORDER BY name ASC").all() as Folder[];
  },

  getFolderById(id: string): Folder | null {
    return (db.prepare("SELECT * FROM folders WHERE id = ?").get(id) as Folder) ?? null;
  },

  createFolder(data: { name: string; parentId?: string | null }): Folder {
    const id = uuidv4();
    db.prepare("INSERT INTO folders (id, name, parentId) VALUES (?, ?, ?)").run(id, data.name, data.parentId ?? null);
    return storage.getFolderById(id)!;
  },

  updateFolder(id: string, name: string): Folder | null {
    db.prepare("UPDATE folders SET name = ? WHERE id = ?").run(name, id);
    return storage.getFolderById(id);
  },

  deleteFolder(id: string): void {
    db.prepare("UPDATE documents SET folderId = NULL WHERE folderId = ?").run(id);
    db.prepare("DELETE FROM folders WHERE id = ?").run(id);
  },

  // ─── API Costs ───────────────────────────────────────────────────────────────

  listCosts(filters: { service?: string; period?: "day" | "week" | "month" | "all" }): ApiCost[] {
    let query = "SELECT * FROM api_costs WHERE 1=1";
    const params: any[] = [];

    if (filters.service && filters.service !== "all") {
      query += " AND service = ?";
      params.push(filters.service);
    }

    if (filters.period === "day") {
      query += " AND date(createdAt) = date('now')";
    } else if (filters.period === "week") {
      query += " AND createdAt >= datetime('now', '-7 days')";
    } else if (filters.period === "month") {
      query += " AND createdAt >= datetime('now', '-30 days')";
    }

    query += " ORDER BY createdAt DESC";
    return db.prepare(query).all(...params) as ApiCost[];
  },

  getCostsSummary(): {
    byService: { service: string; total: number; count: number; totalTokens: number }[];
    overall: { total: number; count: number };
  } {
    const byService = db.prepare(`
      SELECT service, SUM(cost) as total, COUNT(*) as count, SUM(tokens) as totalTokens
      FROM api_costs
      GROUP BY service
      ORDER BY total DESC
    `).all() as { service: string; total: number; count: number; totalTokens: number }[];

    const overall = db.prepare(
      "SELECT SUM(cost) as total, COUNT(*) as count FROM api_costs"
    ).get() as { total: number; count: number };

    return { byService, overall };
  },

  createCost(data: {
    service: string;
    operation: string;
    cost: number;
    tokens?: number | null;
    notes?: string | null;
  }): ApiCost {
    const id = uuidv4();
    db.prepare(
      "INSERT INTO api_costs (id, service, operation, cost, tokens, notes) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, data.service, data.operation, data.cost, data.tokens ?? null, data.notes ?? null);
    return db.prepare("SELECT * FROM api_costs WHERE id = ?").get(id) as ApiCost;
  },

  deleteCost(id: string): boolean {
    const result = db.prepare("DELETE FROM api_costs WHERE id = ?").run(id);
    return result.changes > 0;
  },

  // ─── VTEX Settings ───────────────────────────────────────────────────────────

  getVtexSettings(): any | null {
    const row = db.prepare("SELECT value FROM vtex_settings WHERE key = 'main'").get() as { value: string } | undefined;
    if (!row) return null;
    try { return JSON.parse(row.value); } catch { return null; }
  },

  setVtexSettings(data: any): void {
    db.prepare("INSERT OR REPLACE INTO vtex_settings (key, value) VALUES ('main', ?)").run(JSON.stringify(data));
  },

  // ─── VTEX Logs ───────────────────────────────────────────────────────────────

  listVtexLogs(limit = 50): VtexLog[] {
    return db.prepare("SELECT * FROM vtex_logs ORDER BY timestamp DESC LIMIT ?").all(limit) as VtexLog[];
  },

  createVtexLog(data: { type: string; description: string; product?: string | null; autonomous?: boolean }): { id: string } {
    const id = uuidv4();
    db.prepare(
      "INSERT INTO vtex_logs (id, type, description, product, autonomous) VALUES (?, ?, ?, ?, ?)"
    ).run(id, data.type, data.description, data.product ?? null, data.autonomous !== false ? 1 : 0);
    return { id };
  },

  // ─── VTEX Stats ──────────────────────────────────────────────────────────────

  getVtexStats(): {
    searchesToday: number;
    hitRate: number;
    linksSent: number;
    failures: number;
    conversions: number;
    searchesByHour: { hour: number; count: number }[];
  } {
    const today = new Date().toISOString().slice(0, 10);

    const searchesToday = (db.prepare(
      "SELECT COUNT(*) as c FROM vtex_logs WHERE type = 'search' AND date(timestamp) = ?"
    ).get(today) as any).c;

    const foundsToday = (db.prepare(
      "SELECT COUNT(*) as c FROM vtex_logs WHERE type = 'found' AND date(timestamp) = ?"
    ).get(today) as any).c;

    const linksSent = (db.prepare(
      "SELECT COUNT(*) as c FROM vtex_logs WHERE type = 'link_sent' AND date(timestamp) = ?"
    ).get(today) as any).c;

    const failures = (db.prepare(
      "SELECT COUNT(*) as c FROM vtex_failures WHERE resolved = 0"
    ).get() as any).c;

    const hitRate = searchesToday > 0 ? Math.round((foundsToday / searchesToday) * 100) : 0;

    const byHour = db.prepare(`
      SELECT CAST(strftime('%H', timestamp) AS INTEGER) as hour, COUNT(*) as count
      FROM vtex_logs
      WHERE type = 'search' AND date(timestamp) = ?
      GROUP BY hour
    `).all(today) as { hour: number; count: number }[];

    const searchesByHour = Array.from({ length: 24 }, (_, h) => {
      const found = byHour.find((r) => r.hour === h);
      return { hour: h, count: found ? found.count : 0 };
    });

    return { searchesToday, hitRate, linksSent, failures, conversions: 0, searchesByHour };
  },

  // ─── VTEX Failures ───────────────────────────────────────────────────────────

  listVtexFailures(): VtexFailure[] {
    return db.prepare(
      "SELECT * FROM vtex_failures WHERE resolved = 0 ORDER BY createdAt DESC"
    ).all() as VtexFailure[];
  },

  resolveVtexFailure(id: string): boolean {
    const result = db.prepare("UPDATE vtex_failures SET resolved = 1 WHERE id = ?").run(id);
    return result.changes > 0;
  },

  // ─── VTEX Synonyms ───────────────────────────────────────────────────────────

  listVtexSynonyms(): VtexSynonym[] {
    return db.prepare("SELECT * FROM vtex_synonyms ORDER BY createdAt DESC").all() as VtexSynonym[];
  },

  createVtexSynonym(data: { term: string; canonical: string }): VtexSynonym {
    const id = uuidv4();
    db.prepare("INSERT INTO vtex_synonyms (id, term, canonical) VALUES (?, ?, ?)").run(id, data.term, data.canonical);
    return db.prepare("SELECT * FROM vtex_synonyms WHERE id = ?").get(id) as VtexSynonym;
  },

  deleteVtexSynonym(id: string): boolean {
    const result = db.prepare("DELETE FROM vtex_synonyms WHERE id = ?").run(id);
    return result.changes > 0;
  },

  // ─── Prompt History ─────────────────────────────────────────────────────────

  addPromptHistory(value: string, changedBy: string): void {
    db.prepare(
      "INSERT INTO prompt_history (id, timestamp, value, changedBy) VALUES (?, datetime('now'), ?, ?)"
    ).run(uuidv4(), value, changedBy);
  },

  listPromptHistory(limit = 20): { id: string; timestamp: string; value: string; changedBy: string }[] {
    return db.prepare(
      "SELECT id, timestamp, value, changedBy FROM prompt_history ORDER BY timestamp DESC LIMIT ?"
    ).all(limit) as { id: string; timestamp: string; value: string; changedBy: string }[];
  },

  // ─── Session / Message creation (para simulação no monitor) ──────────────────

  upsertSession(data: {
    id: string;
    startTime: string;
    status: string;
    clientName?: string | null;
    clientPhone?: string | null;
    contactId?: string | null;
  }): void {
    const existing = db.prepare("SELECT id FROM sessions WHERE id = ?").get(data.id);
    if (existing) {
      db.prepare(
        "UPDATE sessions SET status = ?, clientName = ?, clientPhone = ?, contactId = ? WHERE id = ?"
      ).run(data.status, data.clientName ?? null, data.clientPhone ?? null, data.contactId ?? null, data.id);
    } else {
      db.prepare(
        "INSERT INTO sessions (id, startTime, status, clientName, clientPhone, contactId) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(data.id, data.startTime, data.status, data.clientName ?? null, data.clientPhone ?? null, data.contactId ?? null);
    }
  },

  createMessage(data: { sessionId: string; sender: string; content: string }): string {
    const id = uuidv4();
    db.prepare(
      "INSERT INTO messages (id, sessionId, timestamp, sender, content) VALUES (?, ?, datetime('now'), ?, ?)"
    ).run(id, data.sessionId, data.sender, data.content);
    return id;
  },

};

export default storage;
