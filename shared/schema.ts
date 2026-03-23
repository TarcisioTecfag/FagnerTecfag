import { sql } from "drizzle-orm";
import { pgTable, text, real, integer } from "drizzle-orm/pg-core";

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
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
});

// ─── Sessions ─────────────────────────────────────────────────────────────────
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  startTime: text("startTime").notNull(),
  endTime: text("endTime"),
  status: text("status").notNull(),
  clientName: text("clientName"),
  clientPhone: text("clientPhone"),
  capturedData: text("capturedData"),
  archived: text("archived").notNull().default("false"),
  annotation: text("annotation"),
  assignedOperatorName: text("assignedOperatorName"),
  contactId: text("contactId"),
});

// ─── Messages ─────────────────────────────────────────────────────────────────
export const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("sessionId").notNull(),
  timestamp: text("timestamp").notNull().default(sql`now()`),
  sender: text("sender").notNull(),
  content: text("content").notNull(),
});

// ─── Logs ─────────────────────────────────────────────────────────────────────
export const logs = pgTable("logs", {
  id: text("id").primaryKey(),
  sessionId: text("sessionId"),
  timestamp: text("timestamp").notNull().default(sql`now()`),
  level: text("level").notNull(),
  message: text("message").notNull(),
  source: text("source").notNull().default("bot"),
});

// ─── Knowledge Base ───────────────────────────────────────────────────────────
export const folders = pgTable("folders", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  parentId: text("parentId"),
  createdAt: text("createdAt").notNull().default(sql`now()`),
});

export const documents = pgTable("documents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  mimeType: text("mimeType").notNull(),
  content: text("content"),
  embedding: text("embedding"),
  filePath: text("filePath").notNull(),
  folderId: text("folderId"),
  paused: text("paused").notNull().default("false"),
  createdAt: text("createdAt").notNull().default(sql`now()`),
});

// ─── API Costs ────────────────────────────────────────────────────────────────
export const apiCosts = pgTable("api_costs", {
  id: text("id").primaryKey(),
  service: text("service").notNull(),
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
  type: text("type").notNull(),
  description: text("description").notNull(),
  product: text("product"),
  autonomous: integer("autonomous").notNull().default(1),
});

export const vtexFailures = pgTable("vtex_failures", {
  id: text("id").primaryKey(),
  query: text("query").notNull(),
  reason: text("reason").notNull(),
  createdAt: text("createdAt").notNull().default(sql`now()`),
  resolved: integer("resolved").notNull().default(0),
});

export const vtexSynonyms = pgTable("vtex_synonyms", {
  id: text("id").primaryKey(),
  term: text("term").notNull(),
  canonical: text("canonical").notNull(),
  createdAt: text("createdAt").notNull().default(sql`now()`),
});

// ─── Types ────────────────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Log = typeof logs.$inferSelect;
export type Folder = typeof folders.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type ApiCost = typeof apiCosts.$inferSelect;
export type VtexSettings = typeof vtexSettings.$inferSelect;
export type VtexLog = typeof vtexLogs.$inferSelect;
export type VtexFailure = typeof vtexFailures.$inferSelect;
export type VtexSynonym = typeof vtexSynonyms.$inferSelect;

