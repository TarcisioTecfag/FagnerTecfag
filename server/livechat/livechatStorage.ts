/**
 * server/livechat/livechatStorage.ts
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  LIVE CHAT — Camada de dados (Repository Pattern)                   ║
 * ║  Totalmente isolado do storage.ts do Fagner.                        ║
 * ║  Usa Drizzle ORM + PostgreSQL — todas funções são async.            ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

import { eq, desc, asc, and, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import db from "../db.js";
import {
  lcVisitors,
  lcPageviews,
  lcChats,
  lcMessages,
  lcSettings,
  type LcVisitor,
  type LcPageview,
  type LcChat,
  type LcMessage,
} from "../../shared/schema.js";

// ─── Visitors ─────────────────────────────────────────────────────────────────

export const lcStorage = {

  // ── Visitors ─────────────────────────────────────────────────────────

  async getVisitorByCookie(cookieId: string): Promise<LcVisitor | null> {
    const rows = await db.select().from(lcVisitors).where(eq(lcVisitors.cookieId, cookieId)).limit(1);
    return rows[0] ?? null;
  },

  async getVisitorById(id: string): Promise<LcVisitor | null> {
    const rows = await db.select().from(lcVisitors).where(eq(lcVisitors.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async createVisitor(data: {
    cookieId: string;
    ip?: string;
    city?: string;
    country?: string;
    browser?: string;
    userAgent?: string;
    currentPage?: string;
    currentPageTitle?: string;
    source?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    referrer?: string;
  }): Promise<LcVisitor> {
    const id = uuidv4();
    await db.insert(lcVisitors).values({
      id,
      cookieId: data.cookieId,
      ip: data.ip ?? null,
      city: data.city ?? null,
      country: data.country ?? null,
      browser: data.browser ?? null,
      userAgent: data.userAgent ?? null,
      currentPage: data.currentPage ?? null,
      currentPageTitle: data.currentPageTitle ?? null,
      source: data.source ?? null,
      utmSource: data.utmSource ?? null,
      utmMedium: data.utmMedium ?? null,
      utmCampaign: data.utmCampaign ?? null,
      referrer: data.referrer ?? null,
    });
    return (await this.getVisitorById(id))!;
  },

  async updateVisitor(id: string, data: Partial<LcVisitor>): Promise<LcVisitor | null> {
    const existing = await this.getVisitorById(id);
    if (!existing) return null;

    await db.update(lcVisitors)
      .set({
        ip: data.ip ?? existing.ip,
        city: data.city ?? existing.city,
        country: data.country ?? existing.country,
        browser: data.browser ?? existing.browser,
        currentPage: data.currentPage ?? existing.currentPage,
        currentPageTitle: data.currentPageTitle ?? existing.currentPageTitle,
        totalVisits: data.totalVisits ?? existing.totalVisits,
        totalPages: data.totalPages ?? existing.totalPages,
        totalChats: data.totalChats ?? existing.totalChats,
        category: data.category ?? existing.category,
        engagementScore: data.engagementScore ?? existing.engagementScore,
        isOnline: data.isOnline ?? existing.isOnline,
        pipelineStage: (data as any).pipelineStage ?? existing.pipelineStage,
        lastSeenAt: new Date().toISOString(),
      })
      .where(eq(lcVisitors.id, id));

    return this.getVisitorById(id);
  },

  async listOnlineVisitors(): Promise<LcVisitor[]> {
    return db.select().from(lcVisitors)
      .where(eq(lcVisitors.isOnline, "true"))
      .orderBy(desc(lcVisitors.lastSeenAt));
  },

  async listAllVisitors(limit = 100): Promise<LcVisitor[]> {
    return db.select().from(lcVisitors)
      .orderBy(desc(lcVisitors.lastSeenAt))
      .limit(limit);
  },

  async setVisitorOffline(id: string): Promise<void> {
    await db.update(lcVisitors)
      .set({ isOnline: "false", lastSeenAt: new Date().toISOString() })
      .where(eq(lcVisitors.id, id));
  },

  // ── Pipeline CRM ────────────────────────────────────────────────────

  async updateVisitorPipeline(id: string, stage: string): Promise<LcVisitor | null> {
    const existing = await this.getVisitorById(id);
    if (!existing) return null;
    await db.update(lcVisitors)
      .set({ pipelineStage: stage, lastSeenAt: new Date().toISOString() })
      .where(eq(lcVisitors.id, id));
    return this.getVisitorById(id);
  },

  async listVisitorsByPipeline(stage: string, limit = 200): Promise<LcVisitor[]> {
    return db.select().from(lcVisitors)
      .where(eq(lcVisitors.pipelineStage, stage))
      .orderBy(desc(lcVisitors.lastSeenAt))
      .limit(limit);
  },

  async getPipelineStats(): Promise<Record<string, number>> {
    const stages = ['novo_atendimento', 'em_atendimento', 'finalizado_com_venda', 'finalizado_sem_venda', 'sem_resposta'];
    const result: Record<string, number> = {};
    for (const stage of stages) {
      const [row] = await db.select({ c: sql<number>`count(*)` })
        .from(lcVisitors)
        .where(eq(lcVisitors.pipelineStage, stage));
      result[stage] = Number(row?.c ?? 0);
    }
    return result;
  },

  async incrementVisitorPages(id: string): Promise<void> {
    await db.update(lcVisitors)
      .set({
        totalPages: sql`"totalPages" + 1`,
        lastSeenAt: new Date().toISOString(),
      } as any)
      .where(eq(lcVisitors.id, id));
  },

  async incrementVisitorVisits(id: string): Promise<void> {
    await db.update(lcVisitors)
      .set({
        totalVisits: sql`"totalVisits" + 1`,
        isOnline: "true",
        lastSeenAt: new Date().toISOString(),
      } as any)
      .where(eq(lcVisitors.id, id));
  },

  // ── Pageviews ────────────────────────────────────────────────────────

  async createPageview(data: {
    visitorId: string;
    url: string;
    pageTitle?: string;
  }): Promise<LcPageview> {
    const id = uuidv4();
    await db.insert(lcPageviews).values({
      id,
      visitorId: data.visitorId,
      url: data.url,
      pageTitle: data.pageTitle ?? null,
    });
    const rows = await db.select().from(lcPageviews).where(eq(lcPageviews.id, id)).limit(1);
    return rows[0]!;
  },

  async updatePageview(id: string, data: { scrollDepth?: number; timeSpent?: number }): Promise<void> {
    await db.update(lcPageviews)
      .set({
        scrollDepth: data.scrollDepth ?? undefined,
        timeSpent: data.timeSpent ?? undefined,
      })
      .where(eq(lcPageviews.id, id));
  },

  async listPageviewsByVisitor(visitorId: string, limit = 50): Promise<LcPageview[]> {
    return db.select().from(lcPageviews)
      .where(eq(lcPageviews.visitorId, visitorId))
      .orderBy(desc(lcPageviews.visitedAt))
      .limit(limit);
  },

  // ── Chats ────────────────────────────────────────────────────────────

  async getChatById(id: string): Promise<LcChat | null> {
    const rows = await db.select().from(lcChats).where(eq(lcChats.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async getActiveChatByVisitor(visitorId: string): Promise<LcChat | null> {
    const rows = await db.select().from(lcChats)
      .where(and(
        eq(lcChats.visitorId, visitorId),
        sql`status != 'closed'`
      ))
      .orderBy(desc(lcChats.startedAt))
      .limit(1);
    return rows[0] ?? null;
  },

  async createChat(data: {
    visitorId: string;
    source?: string;
    proactiveApproach?: boolean;
    visitorName?: string;
  }): Promise<LcChat> {
    const id = uuidv4();
    await db.insert(lcChats).values({
      id,
      visitorId: data.visitorId,
      status: "ai_active",
      source: data.source ?? "widget",
      proactiveApproach: data.proactiveApproach ? "true" : "false",
      visitorName: data.visitorName ?? null,
    });

    // Increment visitor chat count
    await db.update(lcVisitors)
      .set({ totalChats: sql`"totalChats" + 1` } as any)
      .where(eq(lcVisitors.id, data.visitorId));

    return (await this.getChatById(id))!;
  },

  async updateChat(id: string, data: Partial<Pick<LcChat, "status" | "agentId" | "endedAt" | "needsHuman" | "mood" | "visitorName" | "visitorEmail">>): Promise<LcChat | null> {
    const existing = await this.getChatById(id);
    if (!existing) return null;

    await db.update(lcChats)
      .set({
        status: data.status ?? existing.status,
        agentId: data.agentId ?? existing.agentId,
        endedAt: data.endedAt ?? existing.endedAt,
        needsHuman: data.needsHuman ?? existing.needsHuman,
        mood: data.mood ?? existing.mood,
        visitorName: data.visitorName ?? existing.visitorName,
        visitorEmail: data.visitorEmail ?? existing.visitorEmail,
      })
      .where(eq(lcChats.id, id));

    return this.getChatById(id);
  },

  async closeChat(id: string): Promise<void> {
    await db.update(lcChats)
      .set({ status: "closed", endedAt: new Date().toISOString() })
      .where(eq(lcChats.id, id));
  },

  async listChats(status?: string, limit = 50): Promise<LcChat[]> {
    if (status) {
      return db.select().from(lcChats)
        .where(eq(lcChats.status, status))
        .orderBy(desc(lcChats.startedAt))
        .limit(limit);
    }
    return db.select().from(lcChats)
      .orderBy(desc(lcChats.startedAt))
      .limit(limit);
  },

  async listNeedsHumanChats(): Promise<LcChat[]> {
    return db.select().from(lcChats)
      .where(and(
        eq(lcChats.needsHuman, "true"),
        sql`status != 'closed'`
      ))
      .orderBy(desc(lcChats.startedAt));
  },

  // ── Messages ─────────────────────────────────────────────────────────

  async createMessage(data: {
    chatId: string;
    sender: "visitor" | "ai" | "agent";
    content: string;
  }): Promise<LcMessage> {
    const id = uuidv4();
    await db.insert(lcMessages).values({
      id,
      chatId: data.chatId,
      sender: data.sender,
      content: data.content,
    });
    const rows = await db.select().from(lcMessages).where(eq(lcMessages.id, id)).limit(1);
    return rows[0]!;
  },

  async listMessagesByChat(chatId: string): Promise<LcMessage[]> {
    return db.select().from(lcMessages)
      .where(eq(lcMessages.chatId, chatId))
      .orderBy(asc(lcMessages.sentAt));
  },

  async markMessagesRead(chatId: string): Promise<void> {
    await db.update(lcMessages)
      .set({ read: "true" })
      .where(and(
        eq(lcMessages.chatId, chatId),
        eq(lcMessages.read, "false"),
      ));
  },

  // ── Settings ─────────────────────────────────────────────────────────

  async getSetting(key: string): Promise<string | null> {
    const rows = await db.select().from(lcSettings).where(eq(lcSettings.key, key)).limit(1);
    return rows[0]?.value ?? null;
  },

  async getSettingParsed<T = any>(key: string): Promise<T | null> {
    const raw = await this.getSetting(key);
    if (raw === null) return null;
    try { return JSON.parse(raw) as T; } catch { return raw as unknown as T; }
  },

  async setSetting(key: string, value: any): Promise<void> {
    const strValue = typeof value === "string" ? value : JSON.stringify(value);
    const existing = await db.select().from(lcSettings).where(eq(lcSettings.key, key)).limit(1);
    if (existing.length > 0) {
      await db.update(lcSettings).set({ value: strValue }).where(eq(lcSettings.key, key));
    } else {
      await db.insert(lcSettings).values({ key, value: strValue });
    }
  },

  // ── Stats (para dashboard/BI futuro) ─────────────────────────────────

  async getStats(): Promise<{
    onlineVisitors: number;
    activeChats: number;
    needsHuman: number;
    totalChatsToday: number;
    totalVisitorsToday: number;
  }> {
    const today = new Date().toISOString().slice(0, 10);

    const [online] = await db.select({ c: sql<number>`count(*)` }).from(lcVisitors).where(eq(lcVisitors.isOnline, "true"));
    const [active] = await db.select({ c: sql<number>`count(*)` }).from(lcChats).where(sql`status != 'closed'`);
    const [needs]  = await db.select({ c: sql<number>`count(*)` }).from(lcChats).where(and(eq(lcChats.needsHuman, "true"), sql`status != 'closed'`));
    const [chatsToday] = await db.select({ c: sql<number>`count(*)` }).from(lcChats).where(sql`"startedAt"::date = ${today}::date`);
    const [visitorsToday] = await db.select({ c: sql<number>`count(*)` }).from(lcVisitors).where(sql`"firstSeenAt"::date = ${today}::date`);

    return {
      onlineVisitors: Number(online?.c ?? 0),
      activeChats: Number(active?.c ?? 0),
      needsHuman: Number(needs?.c ?? 0),
      totalChatsToday: Number(chatsToday?.c ?? 0),
      totalVisitorsToday: Number(visitorsToday?.c ?? 0),
    };
  },
};

export default lcStorage;
