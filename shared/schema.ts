/**
 * shared/schema.ts
 *
 * Schema completo do banco de dados usando Drizzle ORM.
 * Usa sintaxe PostgreSQL (pgTable) — compatível com Railway.
 *
 * Para desenvolvimento local (SQLite), as queries são feitas via
 * server/storage.ts que abstrai o banco — não referencie este schema
 * diretamente no servidor local.
 */

import { sql } from "drizzle-orm";
import { pgTable, text, real, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

// ─── Settings ─────────────────────────────────────────────────────────────────
export const settings = pgTable("settings", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(), // 'system_prompt', 'crm_config', 'schedule', 'ai_paused', etc.
  value: text("value").notNull(),      // JSON stringified
});

// ─── Sessions ─────────────────────────────────────────────────────────────────
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  startTime: text("startTime").notNull(),
  endTime: text("endTime"),
  status: text("status").notNull(), // RUNNING, COMPLETED, FAILED, ABANDONED
  clientName: text("clientName"),
  clientPhone: text("clientPhone"),
  capturedData: text("capturedData"),       // JSON stringified
  archived: text("archived").notNull().default("false"), // 'true' | 'false'
  annotation: text("annotation"),           // Relatório gerado pela IA para CRM
  assignedOperatorName: text("assignedOperatorName"),
  contactId: text("contactId"),             // Identificador único do contato
});

// ─── Messages ─────────────────────────────────────────────────────────────────
export const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("sessionId").notNull(),
  timestamp: text("timestamp").notNull().default(sql`now()`),
  sender: text("sender").notNull(), // 'user' | 'bot'
  content: text("content").notNull(),
});

// ─── Logs ─────────────────────────────────────────────────────────────────────
export const logs = pgTable("logs", {
  id: text("id").primaryKey(),
  sessionId: text("sessionId"),
  timestamp: text("timestamp").notNull().default(sql`now()`),
  level: text("level").notNull(),  // INFO, WARN, ERROR
  message: text("message").notNull(),
  source: text("source").notNull().default("bot"),
});

// ─── Knowledge Base ───────────────────────────────────────────────────────────
export const folders = pgTable("folders", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  parentId: text("parentId"), // nullable — pastas aninhadas
  createdAt: text("createdAt").notNull().default(sql`now()`),
});

export const documents = pgTable("documents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),      // 'knowledge' | 'media'
  mimeType: text("mimeType").notNull(),
  content: text("content"),          // Texto extraído para RAG
  embedding: text("embedding"),      // JSON float array
  filePath: text("filePath").notNull(),
  folderId: text("folderId"),        // nullable — FK para folders.id
  paused: text("paused").notNull().default("false"), // 'true' | 'false'
  createdAt: text("createdAt").notNull().default(sql`now()`),
});

// ─── API Costs ────────────────────────────────────────────────────────────────
export const apiCosts = pgTable("api_costs", {
  id: text("id").primaryKey(),
  service: text("service").notNull(),   // 'gemini', 'cnpj', etc.
  operation: text("operation").notNull(),
  cost: real("cost").notNull().default(0),
  currency: text("currency").notNull().default("BRL"),
  tokens: integer("tokens"),
  notes: text("notes"),
  createdAt: text("createdAt").notNull().default(sql`now()`),
});

// ─── VTEX Integration ─────────────────────────────────────────────────────────
export const vtexSettings = pgTable("vtex_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const vtexLogs = pgTable("vtex_logs", {
  id: text("id").primaryKey(),
  timestamp: text("timestamp").notNull().default(sql`now()`),
  type: text("type").notNull(),         // 'search', 'found', 'link_sent', etc.
  description: text("description").notNull(),
  product: text("product"),
  autonomous: integer("autonomous").notNull().default(1), // 1 = autônomo, 0 = manual
});

export const vtexFailures = pgTable("vtex_failures", {
  id: text("id").primaryKey(),
  query: text("query").notNull(),
  reason: text("reason").notNull(),
  createdAt: text("createdAt").notNull().default(sql`now()`),
  resolved: integer("resolved").notNull().default(0), // 0 = pendente, 1 = resolvido
});

export const vtexSynonyms = pgTable("vtex_synonyms", {
  id: text("id").primaryKey(),
  term: text("term").notNull(),
  canonical: text("canonical").notNull(),
  createdAt: text("createdAt").notNull().default(sql`now()`),
});

// ─── Zod Schemas (validação) ──────────────────────────────────────────────────
export const insertFolderSchema = createInsertSchema(folders).omit({ id: true });
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true });
export const insertUserSchema = createInsertSchema(users).pick({
  name: true,
  email: true,
  username: true,
  password: true,
});
export const insertSettingsSchema = createInsertSchema(settings).omit({ id: true });
export const insertLogSchema = createInsertSchema(logs).omit({ id: true });
export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true });
export const insertApiCostSchema = createInsertSchema(apiCosts).omit({ id: true });

// ─── Types ────────────────────────────────────────────────────────────────────
export type Folder = typeof folders.$inferSelect;
export type InsertFolder = z.infer<typeof insertFolderSchema>;

export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Settings = typeof settings.$inferSelect;
export type InsertSettings = z.infer<typeof insertSettingsSchema>;

export type Log = typeof logs.$inferSelect;
export type InsertLog = z.infer<typeof insertLogSchema>;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type Session = typeof sessions.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;

export type ApiCost = typeof apiCosts.$inferSelect;
export type InsertApiCost = z.infer<typeof insertApiCostSchema>;

export type VtexSettings = typeof vtexSettings.$inferSelect;
export type VtexLog = typeof vtexLogs.$inferSelect;
export type VtexFailure = typeof vtexFailures.$inferSelect;
export type VtexSynonym = typeof vtexSynonyms.$inferSelect;
