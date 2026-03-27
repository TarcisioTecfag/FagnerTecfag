/**
 * server/storage.ts
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  CAMADA DE ACESSO AO BANCO DE DADOS — Repository Pattern            ║
 * ║                                                                      ║
 * ║  Toda operação de banco DEVE passar por este arquivo.               ║
 * ║  Nunca use queries SQL diretamente em server/index.ts.              ║
 * ║                                                                      ║
 * ║  100% PostgreSQL via Drizzle ORM — todas funções são async.         ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

import { eq, and, sql, desc, asc, gte, lte } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import db from "./db.js";
import {
  users,
  settings,
  sessions,
  messages,
  logs,
  folders,
  documents,
  apiCosts,
  vtexSettings,
  vtexLogs,
  vtexFailures,
  vtexSynonyms,
  vtexCategories,
} from "../shared/schema.js";
import { pool } from "./db.js";

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

export interface VtexCategory {
  id: string;
  name: string;
  tags: string[];
  expanded: string;
  createdAt: string;
}

// ─── Helper: raw query via pool (para queries dinâmicas complexas) ────────────

async function rawQuery<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

async function rawQueryOne<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const rows = await rawQuery<T>(text, params);
  return rows[0] ?? null;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export const storage = {

  // Users
  async getUserByEmail(email: string): Promise<User | null> {
    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return (rows[0] as User) ?? null;
  },

  async getUserById(id: string): Promise<User | null> {
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return (rows[0] as User) ?? null;
  },

  async getUserSafeById(id: string): Promise<Omit<User, "password"> | null> {
    const rows = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      username: users.username,
    }).from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async listUsers(): Promise<Omit<User, "password">[]> {
    return await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      username: users.username,
    }).from(users);
  },

  async createUser(data: { name: string; email: string; username: string; password: string }): Promise<Omit<User, "password">> {
    const id = uuidv4();
    await db.insert(users).values({ id, ...data });
    const result = await storage.getUserSafeById(id);
    return result!;
  },

  async updateUser(id: string, data: Partial<Pick<User, "name" | "email" | "username" | "password">>): Promise<Omit<User, "password"> | null> {
    const user = await storage.getUserById(id);
    if (!user) return null;
    await db.update(users).set({
      name: data.name ?? user.name,
      email: data.email ?? user.email,
      username: data.username ?? user.username,
      password: data.password ?? user.password,
    }).where(eq(users.id, id));
    return storage.getUserSafeById(id);
  },

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id));
    return (result as any).rowCount > 0;
  },

  async userExistsByEmailOrUsername(email: string, username: string): Promise<boolean> {
    const row = await rawQueryOne(
      "SELECT id FROM users WHERE email = $1 OR username = $2",
      [email, username]
    );
    return !!row;
  },

  // ─── Settings ───────────────────────────────────────────────────────────────

  async getSetting(key: string): Promise<string | null> {
    const rows = await db.select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, key))
      .limit(1);
    return rows[0]?.value ?? null;
  },

  async getSettingParsed<T = any>(key: string): Promise<T | null> {
    const raw = await storage.getSetting(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  },

  async setSetting(key: string, value: any): Promise<void> {
    const strValue = typeof value === "string" ? value : JSON.stringify(value);
    const existing = await rawQueryOne("SELECT id FROM settings WHERE key = $1", [key]);
    if (existing) {
      await db.update(settings).set({ value: strValue }).where(eq(settings.key, key));
    } else {
      await db.insert(settings).values({ id: uuidv4(), key, value: strValue });
    }
  },

  // ─── Sessions ────────────────────────────────────────────────────────────────

  async listSessions(archived: "true" | "false"): Promise<Session[]> {
    return await db.select().from(sessions)
      .where(eq(sessions.archived, archived))
      .orderBy(desc(sessions.startTime)) as Session[];
  },

  async getSessionById(id: string): Promise<Session | null> {
    const rows = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    return (rows[0] as Session) ?? null;
  },

  async archiveSession(id: string): Promise<void> {
    await db.update(sessions).set({ archived: "true", status: "COMPLETED" }).where(eq(sessions.id, id));
  },

  async deleteArchivedSessions(): Promise<void> {
    // Delete messages first, then sessions
    await rawQuery(
      "DELETE FROM messages WHERE \"sessionId\" IN (SELECT id FROM sessions WHERE archived = 'true')"
    );
    await db.delete(sessions).where(eq(sessions.archived, "true"));
  },

  // ─── Messages ────────────────────────────────────────────────────────────────

  async listMessagesBySession(sessionId: string): Promise<Message[]> {
    return await db.select().from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.timestamp)) as Message[];
  },

  // ─── Logs ────────────────────────────────────────────────────────────────────

  async listLogsBySession(sessionId: string): Promise<Log[]> {
    const rows = await db.select().from(logs)
      .where(eq(logs.sessionId, sessionId))
      .orderBy(asc(logs.timestamp));
    return rows as Log[];
  },

  // ─── Dashboard ───────────────────────────────────────────────────────────────

  async getDashboardStats(): Promise<{ total: number; active: number; archived: number; leads: number }> {
    const totalR = await rawQueryOne<{ c: string }>("SELECT COUNT(*) as c FROM sessions");
    const activeR = await rawQueryOne<{ c: string }>("SELECT COUNT(*) as c FROM sessions WHERE status='RUNNING'");
    const archivedR = await rawQueryOne<{ c: string }>("SELECT COUNT(*) as c FROM sessions WHERE archived='true'");
    const total = parseInt(totalR?.c ?? "0", 10);
    const active = parseInt(activeR?.c ?? "0", 10);
    const archived = parseInt(archivedR?.c ?? "0", 10);
    return { total, active, archived, leads: total };
  },

  async getLeadsByDay(): Promise<{ day: string; count: number }[]> {
    return await rawQuery<{ day: string; count: number }>(
      `SELECT DATE("startTime") as day, COUNT(*) as count
       FROM sessions
       GROUP BY DATE("startTime")
       ORDER BY day DESC
       LIMIT 30`
    );
  },

  async getLeadsByOperator(): Promise<{ name: string; count: number }[]> {
    return await rawQuery<{ name: string; count: number }>(
      `SELECT "assignedOperatorName" as name, COUNT(*) as count
       FROM sessions
       WHERE "assignedOperatorName" IS NOT NULL
       GROUP BY "assignedOperatorName"
       ORDER BY count DESC`
    );
  },

  // ─── Documents ───────────────────────────────────────────────────────────────

  async listDocuments(): Promise<Document[]> {
    return await db.select().from(documents).orderBy(desc(documents.createdAt)) as Document[];
  },

  async getDocumentById(id: string): Promise<Document | null> {
    const rows = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
    return (rows[0] as Document) ?? null;
  },

  async createDocument(data: {
    name: string;
    type: string;
    mimeType: string;
    filePath: string;
    folderId?: string | null;
  }): Promise<Document> {
    const id = uuidv4();
    await db.insert(documents).values({
      id,
      name: data.name,
      type: data.type,
      mimeType: data.mimeType,
      filePath: data.filePath,
      folderId: data.folderId ?? null,
    });
    return (await storage.getDocumentById(id))!;
  },

  async updateDocument(id: string, data: Partial<Pick<Document, "name" | "paused" | "folderId">>): Promise<Document | null> {
    const doc = await storage.getDocumentById(id);
    if (!doc) return null;
    await db.update(documents).set({
      name: data.name ?? doc.name,
      paused: data.paused ?? doc.paused,
      folderId: data.folderId !== undefined ? data.folderId : doc.folderId,
    }).where(eq(documents.id, id));
    return storage.getDocumentById(id);
  },

  async deleteDocument(id: string): Promise<boolean> {
    const result = await db.delete(documents).where(eq(documents.id, id));
    return (result as any).rowCount > 0;
  },

  async bulkDeleteDocuments(ids: string[]): Promise<void> {
    for (const id of ids) {
      await db.delete(documents).where(eq(documents.id, id));
    }
  },

  async bulkMoveDocuments(ids: string[], folderId: string | null): Promise<void> {
    for (const id of ids) {
      await db.update(documents).set({ folderId }).where(eq(documents.id, id));
    }
  },

  async bulkTogglePausedDocuments(ids: string[]): Promise<void> {
    for (const id of ids) {
      const doc = await storage.getDocumentById(id);
      if (doc) {
        await db.update(documents).set({
          paused: doc.paused === "true" ? "false" : "true",
        }).where(eq(documents.id, id));
      }
    }
  },

  async listActiveDocumentsForRag(limit = 50): Promise<{ id: string; name: string; filePath: string }[]> {
    return await rawQuery<{ id: string; name: string; filePath: string }>(
      `SELECT id, name, "filePath" FROM documents WHERE paused != 'true' ORDER BY "createdAt" DESC LIMIT $1`,
      [limit]
    );
  },

  // ─── Folders ─────────────────────────────────────────────────────────────────

  async listFolders(): Promise<Folder[]> {
    return await db.select().from(folders).orderBy(asc(folders.name)) as Folder[];
  },

  async getFolderById(id: string): Promise<Folder | null> {
    const rows = await db.select().from(folders).where(eq(folders.id, id)).limit(1);
    return (rows[0] as Folder) ?? null;
  },

  async createFolder(data: { name: string; parentId?: string | null }): Promise<Folder> {
    const id = uuidv4();
    await db.insert(folders).values({ id, name: data.name, parentId: data.parentId ?? null });
    return (await storage.getFolderById(id))!;
  },

  async updateFolder(id: string, name: string): Promise<Folder | null> {
    await db.update(folders).set({ name }).where(eq(folders.id, id));
    return storage.getFolderById(id);
  },

  async deleteFolder(id: string): Promise<void> {
    await db.update(documents).set({ folderId: null }).where(eq(documents.folderId, id));
    await db.delete(folders).where(eq(folders.id, id));
  },

  // ─── API Costs ───────────────────────────────────────────────────────────────

  async listCosts(filters: { service?: string; period?: "day" | "week" | "month" | "all" }): Promise<ApiCost[]> {
    let query = `SELECT * FROM api_costs WHERE 1=1`;
    const params: any[] = [];
    let paramIdx = 1;

    if (filters.service && filters.service !== "all") {
      query += ` AND service = $${paramIdx++}`;
      params.push(filters.service);
    }

    if (filters.period === "day") {
      query += ` AND DATE("createdAt") = CURRENT_DATE`;
    } else if (filters.period === "week") {
      query += ` AND "createdAt" >= (now() - interval '7 days')::text`;
    } else if (filters.period === "month") {
      query += ` AND "createdAt" >= (now() - interval '30 days')::text`;
    }

    query += ` ORDER BY "createdAt" DESC`;
    return await rawQuery<ApiCost>(query, params);
  },

  async getCostsSummary(): Promise<{
    byService: { service: string; total: number; count: number; totalTokens: number }[];
    overall: { total: number; count: number };
  }> {
    const byService = await rawQuery<{ service: string; total: number; count: number; totalTokens: number }>(
      `SELECT service, SUM(cost) as total, COUNT(*) as count, COALESCE(SUM(tokens), 0) as "totalTokens"
       FROM api_costs
       GROUP BY service
       ORDER BY total DESC`
    );

    const overall = await rawQueryOne<{ total: number; count: number }>(
      "SELECT COALESCE(SUM(cost), 0) as total, COUNT(*) as count FROM api_costs"
    );

    return { byService, overall: overall ?? { total: 0, count: 0 } };
  },

  async createCost(data: {
    service: string;
    operation: string;
    cost: number;
    tokens?: number | null;
    notes?: string | null;
  }): Promise<ApiCost> {
    const id = uuidv4();
    await db.insert(apiCosts).values({
      id,
      service: data.service,
      operation: data.operation,
      cost: data.cost,
      tokens: data.tokens ?? null,
      notes: data.notes ?? null,
    });
    const rows = await db.select().from(apiCosts).where(eq(apiCosts.id, id)).limit(1);
    return rows[0] as ApiCost;
  },

  async deleteCost(id: string): Promise<boolean> {
    const result = await db.delete(apiCosts).where(eq(apiCosts.id, id));
    return (result as any).rowCount > 0;
  },

  // ─── VTEX Settings ───────────────────────────────────────────────────────────

  async getVtexSettings(): Promise<any | null> {
    const row = await rawQueryOne<{ value: string }>(
      "SELECT value FROM vtex_settings WHERE key = 'main'"
    );
    if (!row) return null;
    try { return JSON.parse(row.value); } catch { return null; }
  },

  async setVtexSettings(data: any): Promise<void> {
    const val = JSON.stringify(data);
    await rawQuery(
      `INSERT INTO vtex_settings (key, value) VALUES ('main', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [val]
    );
  },

  // ─── VTEX Logs ───────────────────────────────────────────────────────────────

  async listVtexLogs(limit = 50): Promise<VtexLog[]> {
    return await rawQuery<VtexLog>(
      `SELECT * FROM vtex_logs ORDER BY timestamp DESC LIMIT $1`,
      [limit]
    );
  },

  async createVtexLog(data: { type: string; description: string; product?: string | null; autonomous?: boolean }): Promise<{ id: string }> {
    const id = uuidv4();
    await db.insert(vtexLogs).values({
      id,
      type: data.type,
      description: data.description,
      product: data.product ?? null,
      autonomous: data.autonomous !== false ? 1 : 0,
    });
    return { id };
  },

  // ─── VTEX Stats ──────────────────────────────────────────────────────────────

  async getVtexStats(): Promise<{
    searchesToday: number;
    hitRate: number;
    linksSent: number;
    failures: number;
    conversions: number;
    searchesByHour: { hour: number; count: number }[];
  }> {
    const today = new Date().toISOString().slice(0, 10);

    const searchesTodayR = await rawQueryOne<{ c: string }>(
      "SELECT COUNT(*) as c FROM vtex_logs WHERE type = 'search' AND DATE(timestamp) = $1",
      [today]
    );
    const searchesToday = parseInt(searchesTodayR?.c ?? "0", 10);

    const foundsTodayR = await rawQueryOne<{ c: string }>(
      "SELECT COUNT(*) as c FROM vtex_logs WHERE type = 'found' AND DATE(timestamp) = $1",
      [today]
    );
    const foundsToday = parseInt(foundsTodayR?.c ?? "0", 10);

    const linksSentR = await rawQueryOne<{ c: string }>(
      "SELECT COUNT(*) as c FROM vtex_logs WHERE type = 'link_sent' AND DATE(timestamp) = $1",
      [today]
    );
    const linksSent = parseInt(linksSentR?.c ?? "0", 10);

    const failuresR = await rawQueryOne<{ c: string }>(
      "SELECT COUNT(*) as c FROM vtex_failures WHERE resolved = 0"
    );
    const failures = parseInt(failuresR?.c ?? "0", 10);

    const hitRate = searchesToday > 0 ? Math.round((foundsToday / searchesToday) * 100) : 0;

    const byHour = await rawQuery<{ hour: number; count: number }>(
      `SELECT EXTRACT(HOUR FROM timestamp::timestamp)::integer as hour, COUNT(*)::integer as count
       FROM vtex_logs
       WHERE type = 'search' AND DATE(timestamp) = $1
       GROUP BY hour`,
      [today]
    );

    const searchesByHour = Array.from({ length: 24 }, (_, h) => {
      const found = byHour.find((r) => r.hour === h);
      return { hour: h, count: found ? found.count : 0 };
    });

    return { searchesToday, hitRate, linksSent, failures, conversions: 0, searchesByHour };
  },

  // ─── VTEX Failures ───────────────────────────────────────────────────────────

  async listVtexFailures(): Promise<VtexFailure[]> {
    return await db.select().from(vtexFailures)
      .where(eq(vtexFailures.resolved, 0))
      .orderBy(desc(vtexFailures.createdAt)) as VtexFailure[];
  },

  async resolveVtexFailure(id: string): Promise<boolean> {
    const result = await db.update(vtexFailures).set({ resolved: 1 }).where(eq(vtexFailures.id, id));
    return (result as any).rowCount > 0;
  },

  // ─── VTEX Synonyms ───────────────────────────────────────────────────────────

  async listVtexSynonyms(): Promise<VtexSynonym[]> {
    return await db.select().from(vtexSynonyms).orderBy(desc(vtexSynonyms.createdAt)) as VtexSynonym[];
  },

  async createVtexSynonym(data: { term: string; canonical: string }): Promise<VtexSynonym> {
    const id = uuidv4();
    await db.insert(vtexSynonyms).values({ id, term: data.term, canonical: data.canonical });
    const rows = await db.select().from(vtexSynonyms).where(eq(vtexSynonyms.id, id)).limit(1);
    return rows[0] as VtexSynonym;
  },

  async deleteVtexSynonym(id: string): Promise<boolean> {
    const result = await db.delete(vtexSynonyms).where(eq(vtexSynonyms.id, id));
    return (result as any).rowCount > 0;
  },

  // ─── VTEX Categories ─────────────────────────────────────────────────────────

  async listVtexCategories(): Promise<VtexCategory[]> {
    return await db.select().from(vtexCategories).orderBy(asc(vtexCategories.name)) as VtexCategory[];
  },

  async getVtexCategoryById(id: string): Promise<VtexCategory | null> {
    const rows = await db.select().from(vtexCategories).where(eq(vtexCategories.id, id)).limit(1);
    return (rows[0] as VtexCategory) ?? null;
  },

  async createVtexCategory(data: { name: string; tags: string[] }): Promise<VtexCategory> {
    const id = uuidv4();
    await db.insert(vtexCategories).values({ id, name: data.name, tags: data.tags });
    const rows = await db.select().from(vtexCategories).where(eq(vtexCategories.id, id)).limit(1);
    return rows[0] as VtexCategory;
  },

  async updateVtexCategory(id: string, data: Partial<{ name: string; tags: string[]; expanded: boolean }>): Promise<VtexCategory | null> {
    const cat = await storage.getVtexCategoryById(id);
    if (!cat) return null;
    await db.update(vtexCategories).set({
      name: data.name ?? cat.name,
      tags: data.tags ?? cat.tags,
      expanded: data.expanded !== undefined ? (data.expanded ? "true" : "false") : cat.expanded,
    }).where(eq(vtexCategories.id, id));
    return storage.getVtexCategoryById(id);
  },

  async deleteVtexCategory(id: string): Promise<boolean> {
    const result = await db.delete(vtexCategories).where(eq(vtexCategories.id, id));
    return (result as any).rowCount > 0;
  },

  // ─── Prompt History ─────────────────────────────────────────────────────────

  async addPromptHistory(value: string, changedBy: string): Promise<void> {
    await rawQuery(
      `INSERT INTO prompt_history (id, timestamp, value, "changedBy") VALUES ($1, now()::text, $2, $3)`,
      [uuidv4(), value, changedBy]
    );
  },

  async listPromptHistory(limit = 20): Promise<{ id: string; timestamp: string; value: string; changedBy: string }[]> {
    return await rawQuery<{ id: string; timestamp: string; value: string; changedBy: string }>(
      `SELECT id, timestamp, value, "changedBy" FROM prompt_history ORDER BY timestamp DESC LIMIT $1`,
      [limit]
    );
  },

  // ─── Session / Message creation (para simulação no monitor) ──────────────────

  async upsertSession(data: {
    id: string;
    startTime: string;
    status: string;
    clientName?: string | null;
    clientPhone?: string | null;
    contactId?: string | null;
  }): Promise<void> {
    const existing = await rawQueryOne("SELECT id FROM sessions WHERE id = $1", [data.id]);
    if (existing) {
      await rawQuery(
        `UPDATE sessions SET status = $1, "clientName" = $2, "clientPhone" = $3, "contactId" = $4 WHERE id = $5`,
        [data.status, data.clientName ?? null, data.clientPhone ?? null, data.contactId ?? null, data.id]
      );
    } else {
      await rawQuery(
        `INSERT INTO sessions (id, "startTime", status, "clientName", "clientPhone", "contactId") VALUES ($1, $2, $3, $4, $5, $6)`,
        [data.id, data.startTime, data.status, data.clientName ?? null, data.clientPhone ?? null, data.contactId ?? null]
      );
    }
  },

  async createMessage(data: { sessionId: string; sender: string; content: string }): Promise<string> {
    const id = uuidv4();
    await rawQuery(
      `INSERT INTO messages (id, "sessionId", timestamp, sender, content) VALUES ($1, $2, now()::text, $3, $4)`,
      [id, data.sessionId, data.sender, data.content]
    );
    return id;
  },

  // ─── Log creation (para reportService) ──────────────────────────────────────

  async createLog(data: { sessionId: string; level: string; message: string }): Promise<void> {
    await rawQuery(
      `INSERT INTO logs (id, "sessionId", level, message, timestamp) VALUES ($1, $2, $3, $4, now()::text)`,
      [uuidv4(), data.sessionId, data.level, data.message]
    );
  },

  // ─── VTEX Failures creation (para fagnerOrchestrator) ───────────────────────

  async createVtexFailure(data: { query: string; reason: string }): Promise<void> {
    await rawQuery(
      `INSERT INTO vtex_failures (id, query, reason, resolved) VALUES ($1, $2, $3, 0)
       ON CONFLICT DO NOTHING`,
      [uuidv4(), data.query, data.reason]
    );
  },

};

export default storage;
