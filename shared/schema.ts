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

// ─── Live Chat — Módulo isolado ───────────────────────────────────────────────

export const lcVisitors = pgTable("lc_visitors", {
  id: text("id").primaryKey(),
  cookieId: text("cookieId").notNull(),
  ip: text("ip"),
  city: text("city"),
  country: text("country"),
  browser: text("browser"),
  userAgent: text("userAgent"),
  currentPage: text("currentPage"),
  currentPageTitle: text("currentPageTitle"),
  source: text("source"),                    // 'google_organic', 'google_ads', 'instagram', 'direct', etc.
  utmSource: text("utmSource"),
  utmMedium: text("utmMedium"),
  utmCampaign: text("utmCampaign"),
  referrer: text("referrer"),
  totalVisits: integer("totalVisits").notNull().default(1),
  totalPages: integer("totalPages").notNull().default(0),
  totalChats: integer("totalChats").notNull().default(0),
  category: text("category").notNull().default("visitor"),   // 'visitor', 'lead_warm', 'lead_hot', 'customer', 'returning'
  engagementScore: integer("engagementScore").notNull().default(0),
  isOnline: text("isOnline").notNull().default("true"),
  pipelineStage: text("pipelineStage").notNull().default("novo_atendimento"),
  // Valores: 'novo_atendimento', 'em_atendimento', 'finalizado_com_venda', 'finalizado_sem_venda', 'sem_resposta'
  firstSeenAt: text("firstSeenAt").notNull().default(sql`now()::text`),
  lastSeenAt: text("lastSeenAt").notNull().default(sql`now()::text`),
  name: text("name"),   // Nome fornecido pelo visitante via widget
});

export const lcPageviews = pgTable("lc_pageviews", {
  id: text("id").primaryKey(),
  visitorId: text("visitorId").notNull(),
  url: text("url").notNull(),
  pageTitle: text("pageTitle"),
  scrollDepth: integer("scrollDepth"),         // 0-100 %
  timeSpent: integer("timeSpent"),             // seconds
  visitedAt: text("visitedAt").notNull().default(sql`now()::text`),
});

export const lcChats = pgTable("lc_chats", {
  id: text("id").primaryKey(),
  visitorId: text("visitorId").notNull(),
  agentId: text("agentId"),                    // user id do painel (se humano assumir)
  status: text("status").notNull().default("waiting"),  // 'waiting', 'ai_active', 'human_active', 'closed'
  startedAt: text("startedAt").notNull().default(sql`now()::text`),
  endedAt: text("endedAt"),
  visitorName: text("visitorName"),
  visitorEmail: text("visitorEmail"),
  source: text("source").notNull().default("widget"),   // 'widget', 'proactive'
  aiHandled: text("aiHandled").notNull().default("true"),
  needsHuman: text("needsHuman").notNull().default("false"),   // flag de "não sei" → alerta no painel
  proactiveApproach: text("proactiveApproach").notNull().default("false"),
  mood: text("mood"),
});

export const lcMessages = pgTable("lc_messages", {
  id: text("id").primaryKey(),
  chatId: text("chatId").notNull(),
  sender: text("sender").notNull(),            // 'visitor', 'ai', 'agent'
  content: text("content").notNull(),
  read: text("read").notNull().default("false"),
  sentAt: text("sentAt").notNull().default(sql`now()::text`),
});

export const lcSettings = pgTable("lc_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// ─── Live Chat Types ──────────────────────────────────────────────────────────

export type LcVisitor = typeof lcVisitors.$inferSelect;
export type LcPageview = typeof lcPageviews.$inferSelect;
export type LcChat = typeof lcChats.$inferSelect;
export type LcMessage = typeof lcMessages.$inferSelect;
export type LcSetting = typeof lcSettings.$inferSelect;

