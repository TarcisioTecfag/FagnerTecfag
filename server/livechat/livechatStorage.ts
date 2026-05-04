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
  lcReportLogs,
  type LcVisitor,
  type LcPageview,
  type LcChat,
  type LcMessage,
} from "../../shared/schema.js";

// ─── Visitors ─────────────────────────────────────────────────────────────────

export const lcStorage = {

  // ── Visitors ─────────────────────────────────────────────────────────

  async getVisitorByCookie(cookieId: string): Promise<LcVisitor | null> {
    const rows = await db.select()
      .from(lcVisitors)
      .where(eq(lcVisitors.cookieId, cookieId))
      .orderBy(desc(lcVisitors.lastSeenAt))
      .limit(1);
    
    if (rows.length === 0) return null;
    let visitor = rows[0];

    // Lógica da Sessão de 2 Horas: se a última atividade foi há mais de 2h, cria "nova" negociação.
    // O usuário requisitou que cards finalizados há tempo não fossem reabertos e misturados.
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
    const lastSeenTime = new Date(visitor.lastSeenAt).getTime();
    
    // ⚡ GUARDA ABSOLUTA: se o visitante tem um chat ATIVO (não fechado), NUNCA cria novo visitor.
    // Uma conversa em andamento é sempre a mesma sessão, independente do tempo decorrido.
    // Sem essa guarda, navegar de página no meio de uma coleta de pós-venda fragmenta o atendimento.
    const hasActiveChat = await db.select({ id: lcChats.id })
      .from(lcChats)
      .where(and(eq(lcChats.visitorId, visitor.id), sql`status != 'closed'`))
      .limit(1);

    // Se passar do tempo E não houver chat ativo, duplica os dados base mas cria um card NOVO
    if (Date.now() - lastSeenTime > TWO_HOURS_MS && hasActiveChat.length === 0) {
      const { v4: uuidv4 } = await import("uuid");
      const newId = uuidv4();

      // Finaliza o card anterior antes de criar novo (não deixa em atendimento/sem stage)
      if (visitor.pipelineStage === 'em_atendimento' || visitor.pipelineStage === 'pos_venda' || visitor.pipelineStage === 'novo_atendimento') {
        await db.update(lcVisitors)
          .set({ pipelineStage: 'finalizado_sem_venda' })
          .where(eq(lcVisitors.id, visitor.id));
      }

      await db.insert(lcVisitors).values({
        id: newId,
        cookieId: visitor.cookieId,
        ip: visitor.ip,
        city: visitor.city,
        country: visitor.country,
        browser: visitor.browser,
        userAgent: visitor.userAgent,
        source: visitor.source,
        utmSource: visitor.utmSource,
        utmMedium: visitor.utmMedium,
        utmCampaign: visitor.utmCampaign,
        name: visitor.name,
        // Propaga os dados de cadastro para o novo card — assim o Fagner confirma em vez de re-coletar.
        // O que NÃO é propagado: histórico de conversa (gerenciado pela sessão AI em memória por chatId).
        posVendaNome: visitor.posVendaNome,
        posVendaTelefone: visitor.posVendaTelefone,
        posVendaEmail: visitor.posVendaEmail,
        posVendaCnpjCpf: visitor.posVendaCnpjCpf,
        posVendaNotaPedido: visitor.posVendaNotaPedido,
        // posVendaProblema e posVendaCnpjData NÃO propagados pois são específicos de cada atendimento
        totalVisits: visitor.totalVisits + 1,
        pipelineStage: "novo_atendimento",
        isOnline: "true",
      });
      console.log(`[LiveChat Storage] Sessão expirada (>2h). Novo Visitante (deal) criado para o cookie ${cookieId}: ${newId}`);
      visitor = (await this.getVisitorById(newId))!;
    }

    return visitor;
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
      isOnline: "true",
      pipelineStage: "novo_atendimento",
    });
    return (await this.getVisitorById(id))!;
  },

  /** Localiza um visitante pelo telefone (compara apenas dígitos para tolerar máscaras) */
  async getVisitorByPhone(phone: string): Promise<LcVisitor | null> {
    const digitsOnly = phone.replace(/\D/g, "");
    if (!digitsOnly) return null;
    // Busca últimos 9 dígitos para tolerar DDI/DDD diferente
    const suffix = digitsOnly.slice(-9);
    const rows = await db.execute(
      sql.raw(`SELECT * FROM lc_visitors WHERE regexp_replace("posVendaTelefone", '[^0-9]', '', 'g') LIKE '%${suffix}' ORDER BY "lastSeenAt" DESC LIMIT 1`)
    ) as any;
    const data = rows?.rows ?? rows ?? [];
    return Array.isArray(data) && data.length > 0 ? (data[0] as LcVisitor) : null;
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
        name: (data as any).name ?? existing.name,
        lastSeenAt: new Date().toISOString(),
      })
      .where(eq(lcVisitors.id, id));

    return this.getVisitorById(id);
  },

  async setVisitorName(id: string, name: string): Promise<void> {
    await db.execute(sql`UPDATE lc_visitors SET "name" = ${name}, "lastSeenAt" = ${new Date().toISOString()} WHERE "id" = ${id}`);
  },

  async listOnlineVisitors(): Promise<LcVisitor[]> {
    // Primary: isOnline flag. Also include visitors seen in the last 3 minutes as fallback.
    // NOTA: sem limite artificial — o site recebe milhares de acessos diários.
    const cutoff = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    return db.select().from(lcVisitors)
      .where(
        sql`"isOnline" = 'true' OR "lastSeenAt" >= ${cutoff}`
      )
      .orderBy(desc(lcVisitors.lastSeenAt));
  },

  async listAllVisitors(limit = 100000): Promise<LcVisitor[]> {
    const rows = await db.select().from(lcVisitors)
      .orderBy(desc(lcVisitors.lastSeenAt))
      .limit(limit);
    const cutoff = Date.now() - 3 * 60 * 1000;
    return rows.map(r => ({ ...r, isOnline: (r.isOnline === "true" && new Date(r.lastSeenAt).getTime() >= cutoff) ? "true" : "false" }));
  },

  async setVisitorOnline(id: string): Promise<void> {
    await db.update(lcVisitors)
      .set({ isOnline: "true", lastSeenAt: new Date().toISOString() })
      .where(eq(lcVisitors.id, id));
  },

  async setVisitorOffline(id: string): Promise<void> {
    await db.update(lcVisitors)
      .set({ isOnline: "false", lastSeenAt: new Date().toISOString() })
      .where(eq(lcVisitors.id, id));
  },

  // ── Reset Completo ──────────────────────────────────────────────────────────────────

  async resetAllLiveChatData(): Promise<void> {
    // Deleta na ordem correta respeitando FK: mensagens > chats > pageviews > visitantes
    await db.execute(sql`DELETE FROM lc_messages`);
    await db.execute(sql`DELETE FROM lc_chats`);
    await db.execute(sql`DELETE FROM lc_pageviews`);
    await db.execute(sql`DELETE FROM lc_visitors`);
  },

  // ── Pipeline CRM ────────────────────────────────────────────────────

  async addVisitorNote(visitorId: string, stage: string, content: string) {
    const visitor = await this.getVisitorById(visitorId);
    if (!visitor) return;
    const currentNotes = Array.isArray(visitor.notes) ? visitor.notes : [];
    const newNote = {
      date: new Date().toISOString(),
      stage,
      content
    };
    await db.update(lcVisitors)
      .set({ notes: [...currentNotes, newNote] as any })
      .where(eq(lcVisitors.id, visitorId));
  },

  async updateVisitorPipeline(id: string, stage: string): Promise<LcVisitor | null> {
    const existing = await this.getVisitorById(id);
    if (!existing) return null;
    await db.update(lcVisitors)
      .set({ pipelineStage: stage, lastSeenAt: new Date().toISOString() })
      .where(eq(lcVisitors.id, id));
    return this.getVisitorById(id);
  },

  async listVisitorsByPipeline(stage: string, limit = 100000): Promise<LcVisitor[]> {
    return db.select().from(lcVisitors)
      .where(eq(lcVisitors.pipelineStage, stage))
      .orderBy(desc(lcVisitors.lastSeenAt))
      .limit(limit);
  },

  // Migração: define pipelineStage para visitantes que ficaram com null
  async migrateNullPipelineStages(): Promise<void> {
    await db.update(lcVisitors)
      .set({ pipelineStage: "novo_atendimento" })
      .where(sql`"pipelineStage" IS NULL`);
  },

  async getPipelineStats(): Promise<Record<string, number>> {
    const stages = ['novo_atendimento', 'em_atendimento', 'finalizado_com_venda', 'pos_venda', 'maquinas', 'pecas', 'sem_resposta', 'outros'];
    const result: Record<string, number> = {};
    for (const stage of stages) {
      const [row] = await db.select({ c: sql<number>`count(*)` })
        .from(lcVisitors)
        .where(eq(lcVisitors.pipelineStage, stage));
      result[stage] = Number(row?.c ?? 0);
    }
    return result;
  },

  // Varredura periódica: move visitantes offline sem resposta para 'sem_resposta'
  // Executar a cada 5 minutos. Garante que o estágio funcione mesmo após restarts.
  async sweepStaleVisitors(): Promise<number> {
    const STALE_THRESHOLD_MINUTES = 15;
    // ── FIX CRÍTICO: usar casting para timestamptz em vez de comparação TEXT ──
    // O campo lastSeenAt é TEXT e pode ter formato PG ('2026-04-08 12:00+00') ou JS ('2026-04-08T12:00Z').
    // Comparação TEXT pura quebra porque espaço (0x20) < T (0x54), causando match indevido.
    // 'maquinas' e 'pecas' são estágios de qualificação — nunca devem ser resetados para sem_resposta.
    const result = await db.execute(sql`
      UPDATE lc_visitors
      SET "pipelineStage" = 'sem_resposta',
          "lastSeenAt" = ${new Date().toISOString()}
      WHERE "isOnline" = 'false'
        AND "lastSeenAt"::timestamptz < (now() - interval '${sql.raw(String(STALE_THRESHOLD_MINUTES))} minutes')
        AND "pipelineStage" IN ('novo_atendimento', 'em_atendimento')
    `) as any;
    const count = result?.rowCount ?? 0;
    if (count > 0) {
      console.log(`[LiveChat Sweep] ${count} visitante(s) movidos para 'sem_resposta' (offline > ${STALE_THRESHOLD_MINUTES}min)`);
    }
    return count;
  },

  // ── Pós Venda — Dados coletados pelo Fagner (persistentes entre sessões) ──
  async updateVisitorPosVendaData(id: string, data: {
    nome?: string | null;
    telefone?: string | null;
    email?: string | null;
    cnpjCpf?: string | null;
    notaPedido?: string | null;
    problema?: string | null;
    cnpjData?: any | null;
  }): Promise<void> {
    const setClauses: string[] = [];
    if (data.nome      != null) setClauses.push(`"posVendaNome" = '${data.nome.replace(/'/g, "\'\'")}', "name" = '${data.nome.replace(/'/g, "\'\'")}'`);
    if (data.telefone  != null) setClauses.push(`"posVendaTelefone" = '${data.telefone.replace(/'/g, "\'\'")}'`);
    if (data.email     != null) setClauses.push(`"posVendaEmail" = '${data.email.replace(/'/g, "\'\'")}'`);
    if (data.cnpjCpf   != null) setClauses.push(`"posVendaCnpjCpf" = '${data.cnpjCpf.replace(/'/g, "\'\'")}'`);
    if (data.notaPedido != null) setClauses.push(`"posVendaNotaPedido" = '${data.notaPedido.replace(/'/g, "\'\'")}'`);
    if (data.problema  != null) setClauses.push(`"posVendaProblema" = '${data.problema.replace(/'/g, "\'\'")}'`);
    if (data.cnpjData  != null) setClauses.push(`"posVendaCnpjData" = '${JSON.stringify(data.cnpjData).replace(/'/g, "\'\'")}'`);
    if (setClauses.length === 0) return;
    await db.execute(sql.raw(
      `UPDATE lc_visitors SET ${setClauses.join(', ')}, "lastSeenAt" = '${new Date().toISOString()}' WHERE "id" = '${id}'`
    ));

    // Propaga o nome completo para todos os chats deste visitante — SEMPRE sobrescreve
    // (o nome completo coletado pelo Fagner prevalece sobre o nome curto do pré-chat)
    if (data.nome) {
      await db.execute(sql.raw(
        `UPDATE lc_chats SET "visitorName" = '${data.nome.replace(/'/g, "''")}' WHERE "visitorId" = '${id}'`
      ));
    }
  },

  async updateVisitorPecasData(id: string, data: {
    nome?: string | null;
    telefone?: string | null;
    email?: string | null;
    cnpjCpf?: string | null;
    pecaDesejada?: string | null;
    pecasECliente?: string | null;
  }): Promise<void> {
    const setClauses: string[] = [];
    if (data.nome         != null) setClauses.push(`"posVendaNome" = '${data.nome.replace(/'/g, "''")}', "name" = '${data.nome.replace(/'/g, "''")}'`);
    if (data.telefone     != null) setClauses.push(`"posVendaTelefone" = '${data.telefone.replace(/'/g, "''")}'`);
    if (data.email        != null) setClauses.push(`"posVendaEmail" = '${data.email.replace(/'/g, "''")}'`);
    if (data.cnpjCpf      != null) setClauses.push(`"posVendaCnpjCpf" = '${data.cnpjCpf.replace(/'/g, "''")}'`);
    if (data.pecaDesejada != null) setClauses.push(`"pecaDesejada" = '${data.pecaDesejada.replace(/'/g, "''")}'`);
    if (data.pecasECliente!= null) setClauses.push(`"pecasECliente" = '${data.pecasECliente.replace(/'/g, "''")}'`);
    if (setClauses.length === 0) return;
    await db.execute(sql.raw(
      `UPDATE lc_visitors SET ${setClauses.join(', ')}, "lastSeenAt" = '${new Date().toISOString()}' WHERE "id" = '${id}'`
    ));
    // Propaga o nome completo para todos os chats deste visitante — SEMPRE sobrescreve
    if (data.nome) {
      await db.execute(sql.raw(
        `UPDATE lc_chats SET "visitorName" = '${data.nome.replace(/'/g, "''")}' WHERE "visitorId" = '${id}'`
      ));
    }
  },

  // ── Máquinas — Dados coletados pelo Fagner (fluxo de orçamento de máquinas) ─
  async updateVisitorMaquinasData(id: string, data: {
    nome?: string | null;
    telefone?: string | null;
    email?: string | null;
    cnpjCpf?: string | null;
    maquinaDesejada?: string | null;
    produtoFabricado?: string | null;
    volumeProducao?: string | null;
    qualificacaoSDR?: string | null;
    clienteNovo?: string | null;
  }): Promise<void> {
    const setClauses: string[] = [];
    if (data.nome             != null) setClauses.push(`"posVendaNome" = '${data.nome.replace(/'/g, "''")}', "name" = '${data.nome.replace(/'/g, "''")}'`);
    if (data.telefone         != null) setClauses.push(`"posVendaTelefone" = '${data.telefone.replace(/'/g, "''")}'`);
    if (data.email            != null) setClauses.push(`"posVendaEmail" = '${data.email.replace(/'/g, "''")}'`);
    if (data.cnpjCpf          != null) setClauses.push(`"posVendaCnpjCpf" = '${data.cnpjCpf.replace(/'/g, "''")}'`);
    if (data.maquinaDesejada  != null) setClauses.push(`"maquinaDesejada" = '${data.maquinaDesejada.replace(/'/g, "''")}'`);
    if (data.produtoFabricado != null) setClauses.push(`"maquinaProdutoFabricado" = '${data.produtoFabricado.replace(/'/g, "''")}'`);
    if (data.volumeProducao   != null) setClauses.push(`"maquinaVolumeProducao" = '${data.volumeProducao.replace(/'/g, "''")}'`);
    if (data.qualificacaoSDR  != null) setClauses.push(`"maquinaQualificacaoSDR" = '${data.qualificacaoSDR.replace(/'/g, "''")}'`);
    if (data.clienteNovo      != null) setClauses.push(`"maquinaClienteNovo" = '${data.clienteNovo.replace(/'/g, "''")}'`);
    if (setClauses.length === 0) return;
    await db.execute(sql.raw(
      `UPDATE lc_visitors SET ${setClauses.join(', ')}, "lastSeenAt" = '${new Date().toISOString()}' WHERE "id" = '${id}'`
    ));
    // Propaga o nome completo para todos os chats — SEMPRE sobrescreve
    if (data.nome) {
      await db.execute(sql.raw(
        `UPDATE lc_chats SET "visitorName" = '${data.nome.replace(/'/g, "''")}' WHERE "visitorId" = '${id}'`
      ));
    }
  },

  // ── Pedido VTEX — Dados coletados e gerados pelo Fagner ──────────────────
  async updateVisitorOrderData(id: string, data: {
    vtexOrderFormId?: string | null;
    vtexOrderId?: string | null;
    vtexOrderStatus?: string | null;
    vtexOrderData?: any;
  }): Promise<void> {
    const setClauses: string[] = [];
    if (data.vtexOrderFormId !== undefined)
      setClauses.push(`"vtexOrderFormId" = '${(data.vtexOrderFormId ?? '').replace(/'/g, "''")}'`);
    if (data.vtexOrderId !== undefined)
      setClauses.push(`"vtexOrderId" = '${(data.vtexOrderId ?? '').replace(/'/g, "''")}'`);
    if (data.vtexOrderStatus !== undefined)
      setClauses.push(`"vtexOrderStatus" = '${(data.vtexOrderStatus ?? '').replace(/'/g, "''")}'`);
    if (data.vtexOrderData !== undefined)
      setClauses.push(`"vtexOrderData" = '${JSON.stringify(data.vtexOrderData).replace(/'/g, "''")}'::jsonb`);
    if (setClauses.length === 0) return;
    await db.execute(sql.raw(
      `UPDATE lc_visitors SET ${setClauses.join(', ')}, "lastSeenAt" = '${new Date().toISOString()}' WHERE "id" = '${id}'`
    ));
  },

  // Busca visitante pelo orderFormId — usado pelo webhook de pagamento VTEX
  async getVisitorByOrderFormId(orderFormId: string): Promise<LcVisitor | null> {
    const clean = orderFormId.replace(/'/g, "''");
    const rows = await db.execute(sql.raw(
      `SELECT * FROM lc_visitors WHERE "vtexOrderFormId" = '${clean}' LIMIT 1`
    ));
    const data = (rows as any)?.rows ?? (Array.isArray(rows) ? rows : []);
    return (data[0] as LcVisitor) ?? null;
  },

  async setRdCrmDealId(visitorId: string, dealId: string): Promise<void> {
    await db.update(lcVisitors)
      .set({ rdCrmDealId: dealId })
      .where(eq(lcVisitors.id, visitorId));
  },

  // ── Backfill retroativo: extrai dealIds das notas históricas via SQL puro ────
  // Usa REGEXP do PostgreSQL para extrair o dealId diretamente no banco.
  // Padrões suportados:
  //   "ID do Deal: 123456789"          → captura  123456789
  //   "/app/deals/123456789"           → captura  123456789  (da URL)
  async backfillRdCrmDealIds(): Promise<{ updated: number; skipped: number; total: number }> {
    // 1. Diagnóstico: mostra quantos visitantes têm notas de RD CRM sem dealId
    const diagResult = await db.execute(sql.raw(`
      SELECT COUNT(*)::int AS total
      FROM lc_visitors
      WHERE "rdCrmDealId" IS NULL
        AND notes IS NOT NULL
        AND notes::text != '[]'
        AND notes::text ILIKE '%RD CRM%'
    `)) as any;
    const total = Number((diagResult?.rows ?? diagResult)?.[0]?.total ?? 0);
    console.log(`[LiveChat Backfill] Total de visitantes candidatos: ${total}`);

    // 2. UPDATE via SQL puro: extrai dealId usando REGEXP e atualiza num único statement
    // Estratégia: extrai o ID da URL do deal (formato: /app/deals/NNNN\n ou /app/deals/NNNN")
    // que é o mais confiável pois não depende de texto em português
    const updateResult = await db.execute(sql.raw(`
      UPDATE lc_visitors
      SET "rdCrmDealId" = matched.deal_id
      FROM (
        SELECT
          v.id,
          -- Tenta 1: extrai da URL /app/deals/ID (mais confiável)
          COALESCE(
            (REGEXP_MATCH(v.notes::text, '/app/deals/([a-zA-Z0-9]+)'))[1],
            -- Tenta 2: extrai após "ID do Deal: " ou "ID: " (formato da nota)
            (REGEXP_MATCH(v.notes::text, 'ID(?:\\s+do\\s+Deal)?:\\s*([a-zA-Z0-9]{4,})'))[1]
          ) AS deal_id
        FROM lc_visitors v
        WHERE v."rdCrmDealId" IS NULL
          AND v.notes IS NOT NULL
          AND v.notes::text != '[]'
          AND v.notes::text ILIKE '%RD CRM%'
      ) matched
      WHERE lc_visitors.id = matched.id
        AND matched.deal_id IS NOT NULL
    `)) as any;

    const updated = Number(updateResult?.rowCount ?? updateResult?.count ?? 0);
    const skipped = Math.max(0, total - updated);

    console.log(`[LiveChat] ✅ Backfill rdCrmDealId (SQL): ${updated} atualizados, ${skipped} sem dealId nas notas`);
    return { updated, skipped, total };
  },



  // ── Negociações Anteriores: busca todos os cards do mesmo cookie (exceto o atual) ──
  async getVisitorHistoryByCookie(cookieId: string, excludeId: string): Promise<LcVisitor[]> {
    return db.select()
      .from(lcVisitors)
      .where(and(
        eq(lcVisitors.cookieId, cookieId),
        sql`id != ${excludeId}`,
      ))
      .orderBy(desc(lcVisitors.lastSeenAt))
      .limit(20);
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
    intentTag?: string;
  }): Promise<LcPageview> {
    const id = uuidv4();
    await db.insert(lcPageviews).values({
      id,
      visitorId: data.visitorId,
      url: data.url,
      pageTitle: data.pageTitle ?? null,
      intentTag: data.intentTag ?? null,
    } as any);
    const rows = await db.select().from(lcPageviews).where(eq(lcPageviews.id, id)).limit(1);
    return rows[0]!;
  },

  async updatePageview(id: string, data: { scrollDepth?: number; timeSpent?: number; intentTag?: string }): Promise<void> {
    // 1. Busca o pageview para saber o visitorId e o timeSpent anterior
    const [pv] = await db.select({ visitorId: lcPageviews.visitorId, prevTime: lcPageviews.timeSpent })
      .from(lcPageviews).where(eq(lcPageviews.id, id)).limit(1);

    // 2. Atualiza o pageview em si
    await db.update(lcPageviews)
      .set({
        scrollDepth: data.scrollDepth ?? undefined,
        timeSpent: data.timeSpent ?? undefined,
        ...(data.intentTag !== undefined ? { intentTag: data.intentTag } as any : {}),
      })
      .where(eq(lcPageviews.id, id));

    // 3. Atualiza totalTimeSeconds no visitor: incrementa a diferença
    if (pv && typeof data.timeSpent === 'number') {
      const prev = pv.prevTime ?? 0;
      const delta = data.timeSpent - prev; // pode ser 0 ou positivo
      if (delta > 0) {
        await db.execute(sql`
          UPDATE lc_visitors
          SET "totalTimeSeconds" = COALESCE("totalTimeSeconds", 0) + ${delta}
          WHERE id = ${pv.visitorId}
        `);
      }
    }
  },

  async listPageviewsByVisitor(visitorId: string, limit = 1000): Promise<LcPageview[]> {
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

  async getLastChatByVisitor(visitorId: string): Promise<LcChat | null> {
    const rows = await db.select().from(lcChats)
      .where(eq(lcChats.visitorId, visitorId))
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

    // ── Limpa rdCrmDealId para que o próximo atendimento gere um novo card ──
    // Isso garante que cada sessão de chat cria um card independente no RD CRM,
    // mesmo que o visitante já tenha um card de um atendimento anterior.
    await db.update(lcVisitors)
      .set({ rdCrmDealId: null })
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

  async setChatCloseReason(id: string, reason: string): Promise<void> {
    await db.update(lcChats)
      .set({ closeReason: reason } as any)
      .where(eq(lcChats.id, id));
  },

  async listChats(status?: string, limit = 1000): Promise<LcChat[]> {
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

  async listChatsByVisitor(visitorId: string, limit = 200): Promise<LcChat[]> {
    return db.select().from(lcChats)
      .where(eq(lcChats.visitorId, visitorId))
      .orderBy(desc(lcChats.startedAt))
      .limit(limit);
  },

  async sweepOrphanedChats(): Promise<void> {
    // Fecha chats ativos há mais de 90 minutos sem resposta ou sem encerramento
    // (Protege contra crash do servidor que mata os timers in-memory de 10 min)
    //
    // ── FIX CRÍTICO: usar casting para timestamptz ──
    // O campo startedAt é TEXT com formato PG ('2026-04-08 12:00+00').
    // Comparação TEXT com toISOString() ('2026-04-08T12:00Z') SEMPRE retorna TRUE
    // porque espaço (0x20) < T (0x54), fazendo o sweeper fechar TODOS os chats a cada execução.
    // Solução: cast para timestamptz e comparar com interval do PostgreSQL.
    const orphans = await db.select().from(lcChats)
      .where(and(
        sql`status != 'closed'`,
        sql`"startedAt"::timestamptz < (now() - interval '90 minutes')`
      ));
      
    if (orphans.length > 0) {
      console.log(`[LiveChat Sweeper] Encontrados ${orphans.length} chats órfãos (>90min).`);
    }

    for (const chat of orphans) {
      await this.closeChat(chat.id);
      // Só move para sem_resposta se o visitante ainda não foi movido para um estágio final
      // IMPORTANTE: 'outros' é estágio PERMANENTE (ex: candidatos de emprego, perguntas diversas)
      // NÃO mover esses visitantes para sem_resposta
      const visitor = await this.getVisitorById(chat.visitorId);
      const finalStages = ['pos_venda', 'finalizado_com_venda', 'sem_resposta', 'outros', 'maquinas', 'pecas'];
      if (visitor && !finalStages.includes(visitor.pipelineStage ?? '')) {
        await this.updateVisitorPipeline(chat.visitorId, "sem_resposta");
      }
      console.log(`[LiveChat Sweeper] Chat órfão ${chat.id} encerrado.`);
    }
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
    totalVisitorsAll: number;
    totalIdentifiedAll: number;
    totalOfflineAll: number;
  }> {
    const today = new Date().toISOString().slice(0, 10);

    const [online] = await db.select({ c: sql<number>`count(*)` }).from(lcVisitors).where(eq(lcVisitors.isOnline, "true"));
    const [active] = await db.select({ c: sql<number>`count(*)` }).from(lcChats).where(sql`status != 'closed'`);
    const [needs]  = await db.select({ c: sql<number>`count(*)` }).from(lcChats).where(and(eq(lcChats.needsHuman, "true"), sql`status != 'closed'`));
    const [chatsToday] = await db.select({ c: sql<number>`count(*)` }).from(lcChats).where(sql`"startedAt"::date = ${today}::date`);
    const [visitorsToday] = await db.select({ c: sql<number>`count(*)` }).from(lcVisitors).where(sql`"firstSeenAt"::date = ${today}::date`);
    const [visitorsAll]   = await db.select({ c: sql<number>`count(*)` }).from(lcVisitors);
    const [identifiedAll] = await db.select({ c: sql<number>`count(*)` }).from(lcVisitors).where(sql`"name" IS NOT NULL AND "name" != ''`);
    const [offlineAll]    = await db.select({ c: sql<number>`count(*)` }).from(lcVisitors).where(eq(lcVisitors.isOnline, "false"));

    return {
      onlineVisitors: Number(online?.c ?? 0),
      activeChats: Number(active?.c ?? 0),
      needsHuman: Number(needs?.c ?? 0),
      totalChatsToday: Number(chatsToday?.c ?? 0),
      totalVisitorsToday: Number(visitorsToday?.c ?? 0),
      totalVisitorsAll: Number(visitorsAll?.c ?? 0),
      totalIdentifiedAll: Number(identifiedAll?.c ?? 0),
      totalOfflineAll: Number(offlineAll?.c ?? 0),
    };
  },

  // ── Melhoria 1: Salva engagement score no chat ───────────────────────────────
  async updateChatEngagement(chatId: string, score: number): Promise<void> {
    await db.execute(
      sql`UPDATE lc_chats SET "engagementScore" = ${score} WHERE "id" = ${chatId}`
    );
  },

  // ── Melhoria 2: Registra produto VTEX detectado no chat ─────────────────────
  async updateChatVtexProduct(chatId: string, productName: string): Promise<void> {
    await db.execute(
      sql`UPDATE lc_chats SET "vtexProduct" = ${productName} WHERE "id" = ${chatId}`
    );
  },

  // ── Melhoria 3: Incrementa contador de mensagens filtradas como ruído ────────
  async incrementChatNoiseFiltered(chatId: string): Promise<void> {
    await db.execute(
      sql`UPDATE lc_chats SET "noiseFiltered" = COALESCE("noiseFiltered", 0) + 1 WHERE "id" = ${chatId}`
    );
  },

  // ── Melhoria 4: Estatísticas enriquecidas para o dashboard (filtro de datas) ──
  async getEnhancedStats(
    date?: string,      // data exata: YYYY-MM-DD
    dateFrom?: string,  // início do range: YYYY-MM-DD
    dateTo?: string,    // fim do range: YYYY-MM-DD
  ): Promise<{
    avgEngagementScore: number;
    hotLeads: number;
    warmLeads: number;
    coldLeads: number;
    vtexHits: number;
    noiseTotal: number;
    topVtexProducts: { name: string; count: number }[];
    totalChats: number;
    closedWithSale: number;
    closedWithoutSale: number;
  }> {
    // Constrói cláusula WHERE para filtro de data nos chats
    let dateWhereSQL = '';
    if (date) {
      dateWhereSQL = `"startedAt"::date = '${date}'::date`;
    } else if (dateFrom && dateTo) {
      dateWhereSQL = `"startedAt"::timestamptz >= '${dateFrom}T00:00:00Z' AND "startedAt"::timestamptz <= '${dateTo}T23:59:59Z'`;
    } else if (dateFrom) {
      dateWhereSQL = `"startedAt"::timestamptz >= '${dateFrom}T00:00:00Z'`;
    } else if (dateTo) {
      dateWhereSQL = `"startedAt"::timestamptz <= '${dateTo}T23:59:59Z'`;
    }

    const w    = dateWhereSQL ? `WHERE ${dateWhereSQL}` : '';
    const wAnd = dateWhereSQL ? `AND ${dateWhereSQL}` : '';

    const avgResult   = await db.execute(sql.raw(`SELECT COALESCE(AVG("engagementScore"), 0)::int AS avg FROM lc_chats ${w}`)) as any;
    const avgEngagementScore = Number(avgResult?.rows?.[0]?.avg ?? avgResult?.[0]?.avg ?? 0);

    const hotResult   = await db.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM lc_chats WHERE "engagementScore" >= 70 ${wAnd}`)) as any;
    const warmResult  = await db.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM lc_chats WHERE "engagementScore" >= 40 AND "engagementScore" < 70 ${wAnd}`)) as any;
    const coldResult  = await db.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM lc_chats WHERE "engagementScore" < 40 ${wAnd}`)) as any;
    const vtexResult  = await db.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM lc_chats WHERE "vtexProduct" IS NOT NULL ${wAnd}`)) as any;
    const noiseResult = await db.execute(sql.raw(`SELECT COALESCE(SUM("noiseFiltered"), 0)::int AS c FROM lc_chats ${w}`)) as any;
    const totalResult = await db.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM lc_chats ${w}`)) as any;

    const g = (r: any, key = 'c') => Number(r?.rows?.[0]?.[key] ?? r?.[0]?.[key] ?? 0);

    const topResult = await db.execute(
      sql.raw(`SELECT "vtexProduct" AS name, COUNT(*)::int AS count FROM lc_chats WHERE "vtexProduct" IS NOT NULL ${wAnd} GROUP BY "vtexProduct" ORDER BY count DESC LIMIT 5`)
    ) as any;
    const rows = topResult?.rows ?? topResult ?? [];
    const topVtexProducts = Array.isArray(rows)
      ? rows.map((r: any) => ({ name: r.name, count: Number(r.count) }))
      : [];

    // Para closedWithSale/Without: filtrar visitantes por data lastSeenAt
    let visitSaleCount   = 0;
    let visitNoSaleCount = 0;
    if (dateWhereSQL) {
      const visitorW = date
        ? `"lastSeenAt"::date = '${date}'::date`
        : dateFrom && dateTo
          ? `"lastSeenAt"::timestamptz >= '${dateFrom}T00:00:00Z' AND "lastSeenAt"::timestamptz <= '${dateTo}T23:59:59Z'`
          : dateFrom
            ? `"lastSeenAt"::timestamptz >= '${dateFrom}T00:00:00Z'`
            : `"lastSeenAt"::timestamptz <= '${dateTo}T23:59:59Z'`;
      const saleR   = await db.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM lc_visitors WHERE "pipelineStage" = 'finalizado_com_venda' AND ${visitorW}`)) as any;
      const noSaleR = await db.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM lc_visitors WHERE "pipelineStage" = 'finalizado_sem_venda' AND ${visitorW}`)) as any;
      visitSaleCount   = g(saleR);
      visitNoSaleCount = g(noSaleR);
    } else {
      const visitorStats = await this.getPipelineStats();
      visitSaleCount   = visitorStats['finalizado_com_venda'] ?? 0;
      visitNoSaleCount = visitorStats['finalizado_sem_venda'] ?? 0;
    }

    return {
      avgEngagementScore,
      hotLeads: g(hotResult),
      warmLeads: g(warmResult),
      coldLeads: g(coldResult),
      vtexHits: g(vtexResult),
      noiseTotal: g(noiseResult),
      topVtexProducts,
      totalChats: g(totalResult),
      closedWithSale: visitSaleCount,
      closedWithoutSale: visitNoSaleCount,
    };
  },

  // ── Funnel Settings (persistência no servidor para uso no backend) ──────
  async getFunnelSettings(): Promise<any | null> {
    try {
      const [row] = await db.select()
        .from(lcSettings)
        .where(eq(lcSettings.key, "funnel_settings"));
      if (!row?.value) return null;
      return typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
    } catch {
      return null;
    }
  },

  async saveFunnelSettings(data: any): Promise<void> {
    const jsonStr = JSON.stringify(data);
    await db.execute(sql`
      INSERT INTO lc_settings (key, value)
      VALUES ('funnel_settings', ${jsonStr})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `);
  },

  /**
   * Retorna o próximo owner_id para o funil especificado usando rodízio round-robin.
   * Lê os operadores de funnel_settings e mantém um contador atômico em lc_settings.
   */
  async getNextOwnerForFunnel(funnelKey: string): Promise<string | null> {
    const settings = await this.getFunnelSettings();
    if (!settings?.funnels?.[funnelKey]) return null;

    const funnelCfg = settings.funnels[funnelKey];
    const operators: { id: string; name: string }[] = funnelCfg.operators || [];
    if (operators.length === 0) return null;

    // Se só tem 1 operador, retorna direto
    if (operators.length === 1) {
      console.log(`[LiveChat] Funil ${funnelKey}: único operador ${operators[0].name}`);
      return operators[0].id;
    }

    // Rodízio: busca e incrementa contador atômico
    const counterKey = `rotation_counter_${funnelKey}`;
    let counter = 0;
    try {
      const [row] = await db.select()
        .from(lcSettings)
        .where(eq(lcSettings.key, counterKey));
      counter = parseInt(row?.value ?? "0", 10);
    } catch {}

    const index = counter % operators.length;
    const nextCounter = counter + 1;

    // Salva próximo valor do contador
    await db.execute(sql`
      INSERT INTO lc_settings (key, value)
      VALUES (${counterKey}, ${String(nextCounter)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `);

    console.log(`[LiveChat] Rodízio ${funnelKey}: operador ${operators[index].name} (${index + 1}/${operators.length})`);
    return operators[index].id;
  },

  // ── Purchase Intent Score ────────────────────────────────────────────────
  async updatePurchaseIntentScore(visitorId: string, score: number): Promise<void> {
    await db.execute(
      sql`UPDATE lc_visitors SET "purchaseIntentScore" = ${Math.min(score, 100)} WHERE "id" = ${visitorId}`
    );
  },

  async incrementPurchaseIntentScore(visitorId: string, points: number): Promise<number> {
    const result = await db.execute(
      sql`UPDATE lc_visitors SET "purchaseIntentScore" = LEAST(COALESCE("purchaseIntentScore", 0) + ${points}, 100) WHERE "id" = ${visitorId} RETURNING "purchaseIntentScore"`
    ) as any;
    return Number(result?.rows?.[0]?.purchaseIntentScore ?? 0);
  },

  // ── AI Briefing ──────────────────────────────────────────────────────────
  async updateAiBriefing(visitorId: string, briefing: { produtoInteresse?: string; fabricaO?: string; volume?: string; sentimento?: string; proximaAcao?: string; geradoEm?: string }): Promise<void> {
    const jsonStr = JSON.stringify(briefing).replace(/'/g, "''");
    await db.execute(sql.raw(`UPDATE lc_visitors SET "aiBriefing" = '${jsonStr}'::jsonb WHERE "id" = '${visitorId}'`));
  },

  // ── Análise Pré-Chat: top páginas visitadas antes do primeiro chat ────────
  async getPreChatTopPages(limit = 10): Promise<{ url: string; pageTitle: string | null; count: number }[]> {
    // Busca pageviews cujo visitedAt é ANTERIOR ao primeiro chat do mesmo visitante
    const result = await db.execute(sql.raw(`
      SELECT pv.url, pv."pageTitle", COUNT(*)::int AS count
      FROM lc_pageviews pv
      INNER JOIN (
        SELECT "visitorId", MIN("startedAt") AS first_chat_at
        FROM lc_chats
        GROUP BY "visitorId"
      ) fc ON pv."visitorId" = fc."visitorId"
      WHERE pv."visitedAt"::timestamptz < fc.first_chat_at::timestamptz
        AND pv.url NOT LIKE '%/api/%'
        AND pv.url NOT LIKE '%favicon%'
      GROUP BY pv.url, pv."pageTitle"
      ORDER BY count DESC
      LIMIT ${limit}
    `)) as any;
    const rows = result?.rows ?? result ?? [];
    return Array.isArray(rows)
      ? rows.map((r: any) => ({ url: r.url, pageTitle: r.pageTitle ?? null, count: Number(r.count) }))
      : [];
  },

  // ── Taxa de conversão para chat por página ─────────────────────────────
  async getPageChatConversionRates(limit = 10): Promise<{ url: string; visitors: number; converted: number; rate: number }[]> {
    const result = await db.execute(sql.raw(`
      SELECT
        pv.url,
        COUNT(DISTINCT pv."visitorId") AS visitors,
        COUNT(DISTINCT CASE WHEN ch."visitorId" IS NOT NULL THEN pv."visitorId" END) AS converted
      FROM lc_pageviews pv
      LEFT JOIN lc_chats ch ON pv."visitorId" = ch."visitorId"
      WHERE pv.url NOT LIKE '%/api/%'
        AND pv.url NOT LIKE '%favicon%'
      GROUP BY pv.url
      HAVING COUNT(DISTINCT pv."visitorId") >= 5
      ORDER BY (COUNT(DISTINCT CASE WHEN ch."visitorId" IS NOT NULL THEN pv."visitorId" END)::float / COUNT(DISTINCT pv."visitorId")::float) DESC
      LIMIT ${limit}
    `)) as any;
    const rows = result?.rows ?? result ?? [];
    return Array.isArray(rows)
      ? rows.map((r: any) => ({
          url: r.url,
          visitors: Number(r.visitors),
          converted: Number(r.converted),
          rate: Number(r.visitors) > 0 ? Math.round((Number(r.converted) / Number(r.visitors)) * 100) : 0,
        }))
      : [];
  },

  // ── Timeline Unificada do Visitante ─────────────────────────────────────
  async getVisitorTimeline(visitorId: string): Promise<{
    type: string;
    timestamp: string;
    label: string;
    meta?: Record<string, any>;
  }[]> {
    const [visitor, pageviews, chats, history] = await Promise.all([
      this.getVisitorById(visitorId),
      this.listPageviewsByVisitor(visitorId, 100),
      this.listChatsByVisitor(visitorId, 20),
      db.select().from(lcPageviews) // placeholder
        .where(eq(lcPageviews.visitorId, visitorId))
        .orderBy(desc(lcPageviews.visitedAt))
        .limit(0), // empty
    ]);

    const events: { type: string; timestamp: string; label: string; meta?: Record<string, any> }[] = [];

    // Evento: primeira visita
    if (visitor) {
      events.push({
        type: 'session_start',
        timestamp: visitor.firstSeenAt,
        label: `Primeira visita via ${visitor.source ?? 'desconhecido'}`,
        meta: { source: visitor.source, city: visitor.city, country: visitor.country },
      });
    }

    // Eventos: pageviews
    for (const pv of pageviews) {
      events.push({
        type: 'pageview',
        timestamp: pv.visitedAt,
        label: pv.pageTitle ?? pv.url,
        meta: {
          url: pv.url,
          timeSpent: (pv as any).timeSpent,
          scrollDepth: (pv as any).scrollDepth,
          intentTag: (pv as any).intentTag,
        },
      });
    }

    // Eventos: chats
    for (const ch of chats) {
      events.push({
        type: 'chat_start',
        timestamp: ch.startedAt,
        label: `Chat iniciado${ch.visitorName ? ` (${ch.visitorName})` : ''}`,
        meta: { chatId: ch.id, status: ch.status },
      });
      if (ch.endedAt) {
        events.push({
          type: 'chat_closed',
          timestamp: ch.endedAt,
          label: `Chat encerrado (${(ch as any).closeReason ?? 'sem motivo'})`,
          meta: { chatId: ch.id, closeReason: (ch as any).closeReason },
        });
      }
    }

    // Eventos: notas da IA
    if (visitor && Array.isArray(visitor.notes)) {
      for (const note of visitor.notes as any[]) {
        events.push({
          type: 'note_added',
          timestamp: note.date,
          label: `Nota IA: ${(note.content ?? '').slice(0, 80)}`,
          meta: { stage: note.stage, content: note.content },
        });
      }
    }

    // Eventos: clicks CTA
    try {
      const clicks = await db.execute(
        sql.raw(`SELECT * FROM lc_click_events WHERE "visitorId" = '${visitorId}' ORDER BY "clickedAt" ASC LIMIT 200`)
      ) as any;
      const clickRows = Array.isArray(clicks) ? clicks : (clicks?.rows ?? []);
      for (const ck of clickRows) {
        const CTA_LABELS: Record<string, string> = {
          whatsapp:  '📱 Clicou no WhatsApp',
          chat_open: '💬 Abriu o Chat IA',
          cta_button:'🎯 Clicou em CTA',
          phone:     '📞 Clicou em Telefone',
        };
        const label = ck.clickType ? (CTA_LABELS[ck.clickType] ?? `🖱️ Clique: ${ck.elementText || ck.elementId || ck.clickType}`) : `🖱️ Clique registrado`;
        events.push({
          type: 'click_event',
          timestamp: ck.clickedAt,
          label,
          meta: {
            url: ck.url,
            elementId: ck.elementId,
            elementText: ck.elementText,
            clickType: ck.clickType,
          },
        });
      }
    } catch (_) { /* tabela ainda não existe, ignora silenciosamente */ }

    // Ordenar cronologicamente
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return events;
  },

  // ── Click Event Tracking ─────────────────────────────────────────────────

  async recordClickEvent(params: {
    visitorId: string;
    url: string;
    elementId?: string;
    elementText?: string;
    clickType: string; // 'whatsapp' | 'chat_open' | 'cta_button' | 'phone' | 'custom'
  }): Promise<void> {
    await db.execute(sql.raw(`
      INSERT INTO lc_click_events ("visitorId", url, "elementId", "elementText", "clickType", "clickedAt")
      VALUES (
        '${params.visitorId.replace(/'/g, "''")}',
        '${(params.url ?? '').replace(/'/g, "''")}',
        '${(params.elementId ?? '').replace(/'/g, "''")}',
        '${(params.elementText ?? '').slice(0, 120).replace(/'/g, "''")}',
        '${params.clickType.replace(/'/g, "''")}',
        NOW()
      )
    `));
  },

  // ── Dashboard Analytics Avançadas — 8 Métricas ─────────────────────────────

  async getActivationRateStats(dateFrom?: string, dateTo?: string): Promise<{
    totalSessions: number;
    chatActivated: number;
    activationRate: number;
    trend: { date: string; rate: number; total: number; activated: number }[];
  }> {
    const dw = dateFrom && dateTo
      ? `AND "firstSeenAt"::timestamptz >= '${dateFrom}T00:00:00Z' AND "firstSeenAt"::timestamptz <= '${dateTo}T23:59:59Z'`
      : dateFrom ? `AND "firstSeenAt"::timestamptz >= '${dateFrom}T00:00:00Z'`
      : dateTo   ? `AND "firstSeenAt"::timestamptz <= '${dateTo}T23:59:59Z'`
      : '';
    const g = (r: any) => Number(r?.rows?.[0]?.c ?? r?.[0]?.c ?? 0);
    const [totalR, activatedR] = await Promise.all([
      db.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM lc_visitors WHERE 1=1 ${dw}`)) as any,
      db.execute(sql.raw(`SELECT COUNT(DISTINCT v.id)::int AS c FROM lc_visitors v INNER JOIN lc_chats c ON c."visitorId" = v.id WHERE 1=1 ${dw.replace(/"firstSeenAt"/g, 'v."firstSeenAt"')}`)) as any,
    ]);
    const total = g(totalR), activated = g(activatedR);
    // Trend diário — respeita o filtro de período selecionado pelo usuário
    const trendWhere = dateFrom && dateTo
      ? `v."firstSeenAt"::timestamptz >= '${dateFrom}T00:00:00Z' AND v."firstSeenAt"::timestamptz <= '${dateTo}T23:59:59Z'`
      : `v."firstSeenAt"::timestamptz >= NOW() - INTERVAL '14 days'`;
    const trendR = await db.execute(sql.raw(`
      SELECT
        DATE_TRUNC('day', v."firstSeenAt"::timestamptz)::date::text AS date,
        COUNT(DISTINCT v.id)::int                                    AS total,
        COUNT(DISTINCT c."visitorId")::int                          AS activated
      FROM lc_visitors v
      LEFT JOIN lc_chats c ON c."visitorId" = v.id
      WHERE ${trendWhere}
      GROUP BY 1 ORDER BY 1 ASC
    `)) as any;
    const trendRows = trendR?.rows ?? trendR ?? [];
    return {
      totalSessions: total,
      chatActivated: activated,
      activationRate: total > 0 ? Math.round((activated / total) * 100) : 0,
      trend: Array.isArray(trendRows) ? trendRows.map((r: any) => ({
        date:      r.date,
        total:     Number(r.total ?? 0),
        activated: Number(r.activated ?? 0),
        rate:      Number(r.total) > 0 ? Math.round((Number(r.activated) / Number(r.total)) * 100) : 0,
      })) : [],
    };
  },

  async getContainmentRate(dateFrom?: string, dateTo?: string): Promise<{
    aiResolved: number;
    humanEscalated: number;
    abandoned: number;
    totalChats: number;
    containmentRate: number;
  }> {
    const cw = dateFrom && dateTo
      ? `AND "startedAt"::timestamptz >= '${dateFrom}T00:00:00Z' AND "startedAt"::timestamptz <= '${dateTo}T23:59:59Z'`
      : dateFrom ? `AND "startedAt"::timestamptz >= '${dateFrom}T00:00:00Z'`
      : dateTo   ? `AND "startedAt"::timestamptz <= '${dateTo}T23:59:59Z'`
      : '';
    const g = (r: any) => Number(r?.rows?.[0]?.c ?? r?.[0]?.c ?? 0);
    const [totalR, humanR, abandonedR] = await Promise.all([
      // Total: todos os chats do período
      db.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM lc_chats WHERE 1=1 ${cw}`)) as any,

      // Escalado p/ Humano: qualquer chat que teve mensagem de um agente humano (sender='agent').
      // Captura histórico mesmo após chats encerrados (status muda, mensagens ficam).
      db.execute(sql.raw(`
        SELECT COUNT(DISTINCT ch.id)::int AS c
        FROM lc_chats ch
        INNER JOIN lc_messages m ON m."chatId" = ch.id AND m.sender = 'agent'
        WHERE 1=1 ${cw}
      `)) as any,

      // Abandono (Opção B): visitante conversou mas saiu antes de fornecer dados de contato.
      // Critérios:
      //   1. Teve ao menos 1 mensagem do visitante (conversa começou)
      //   2. NÃO capturou nome nem telefone (não virou lead qualificado)
      //   3. NÃO foi escalado para humano (esses são contados em 'Escalado')
      db.execute(sql.raw(`
        SELECT COUNT(DISTINCT ch.id)::int AS c
        FROM lc_chats ch
        INNER JOIN lc_visitors v ON v.id = ch."visitorId"
        WHERE 1=1 ${cw}
          -- Conversa teve ao menos 1 mensagem do visitante
          AND EXISTS (
            SELECT 1 FROM lc_messages m
            WHERE m."chatId" = ch.id AND m.sender = 'visitor'
          )
          -- Dados de contato NÃO foram capturados
          AND v."posVendaNome" IS NULL
          AND v."posVendaTelefone" IS NULL
          -- Não foi escalado para humano (evita dupla contagem)
          AND NOT EXISTS (
            SELECT 1 FROM lc_messages m2
            WHERE m2."chatId" = ch.id AND m2.sender = 'agent'
          )
      `)) as any,
    ]);
    const total = g(totalR), human = g(humanR), abandoned = g(abandonedR);
    // Abandonado = visitante saiu sozinho sem precisar de humano
    // → soma direto em aiResolved para o grafico mostrar apenas 2 segmentos
    const aiBase = Math.max(0, total - human - abandoned);
    const ai = aiBase + abandoned; // IA + abandonados = tudo que nao precisou de humano
    return {
      aiResolved: ai,
      humanEscalated: human,
      abandoned: 0,          // zero: ja absorvido em aiResolved
      totalChats: total,
      containmentRate: total > 0 ? Math.round((ai / total) * 100) : 0,
    };
  },

  async getAiLatencyStats(dateFrom?: string, dateTo?: string): Promise<{
    p50: number; p90: number; p95: number; avgMs: number;
    byDay: { day: number; label: string; avgMs: number }[];
  }> {
    const cw = dateFrom && dateTo
      ? `AND c."startedAt"::timestamptz >= '${dateFrom}T00:00:00Z' AND c."startedAt"::timestamptz <= '${dateTo}T23:59:59Z'`
      : dateFrom ? `AND c."startedAt"::timestamptz >= '${dateFrom}T00:00:00Z'`
      : dateTo   ? `AND c."startedAt"::timestamptz <= '${dateTo}T23:59:59Z'`
      : '';
    // ─── Lógica correta de latência ──────────────────────────────────────────
    // Para medir o tempo de resposta da IA, precisamos:
    //   1. Olhar TODAS as mensagens de um chat (visitor + ai + agent)
    //   2. Para cada mensagem 'visitor', pegar a PRÓXIMA mensagem no chat
    //   3. Se essa próxima mensagem é da IA → a diferença é a latência
    //
    // BUG CORRIGIDO: a versão anterior filtrava WHERE sender='visitor' ANTES
    // da janela LEAD, então LEAD só enxergava a próxima mensagem do visitante
    // (nunca a resposta da IA), resultando em 0ms.
    const percR = await db.execute(sql.raw(`
      WITH all_msgs AS (
        -- Todas as mensagens do período, sem filtro de sender
        SELECT
          m."sentAt"::timestamptz                                                    AS msg_at,
          m.sender,
          LEAD(m."sentAt"::timestamptz) OVER (PARTITION BY m."chatId" ORDER BY m."sentAt"::timestamptz) AS next_at,
          LEAD(m.sender)               OVER (PARTITION BY m."chatId" ORDER BY m."sentAt"::timestamptz) AS next_sender
        FROM lc_messages m
        INNER JOIN lc_chats c ON c.id = m."chatId"
        WHERE 1=1 ${cw}
      ),
      latencies AS (
        -- Filtra só as linhas onde: mensagem atual é do visitante E a próxima é da IA
        SELECT EXTRACT(EPOCH FROM (next_at - msg_at)) * 1000 AS ms
        FROM all_msgs
        WHERE sender = 'visitor'
          AND next_sender = 'ai'
          AND next_at IS NOT NULL
          -- Intervalo razoável: 100ms a 120s (considera respostas lentas do Gemini)
          AND EXTRACT(EPOCH FROM (next_at - msg_at)) BETWEEN 0.1 AND 120
      )
      SELECT
        COALESCE(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY ms), 0)::int AS p50,
        COALESCE(PERCENTILE_CONT(0.9)  WITHIN GROUP (ORDER BY ms), 0)::int AS p90,
        COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ms), 0)::int AS p95,
        COALESCE(AVG(ms), 0)::int AS avg_ms,
        COUNT(*)::int AS sample_count
      FROM latencies
    `)) as any;
    const row = (percR?.rows ?? percR)?.[0] ?? {};
    // Por dia da semana (sem filtro de data para ter volume suficiente)
    const dayR = await db.execute(sql.raw(`
      WITH all_msgs AS (
        SELECT
          m."sentAt"::timestamptz                                                    AS msg_at,
          m.sender,
          LEAD(m."sentAt"::timestamptz) OVER (PARTITION BY m."chatId" ORDER BY m."sentAt"::timestamptz) AS next_at,
          LEAD(m.sender)               OVER (PARTITION BY m."chatId" ORDER BY m."sentAt"::timestamptz) AS next_sender
        FROM lc_messages m
        WHERE m."sentAt"::timestamptz >= NOW() - INTERVAL '30 days'
      ),
      latencies AS (
        SELECT
          EXTRACT(EPOCH FROM (next_at - msg_at)) * 1000 AS ms,
          EXTRACT(DOW FROM msg_at)::int AS dow
        FROM all_msgs
        WHERE sender = 'visitor'
          AND next_sender = 'ai'
          AND next_at IS NOT NULL
          AND EXTRACT(EPOCH FROM (next_at - msg_at)) BETWEEN 0.1 AND 120
      )
      SELECT dow AS day, AVG(ms)::int AS avg_ms, COUNT(*) AS samples
      FROM latencies
      GROUP BY dow ORDER BY dow
    `)) as any;
    const dayRows = dayR?.rows ?? dayR ?? [];
    const DAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    const byDay = DAYS.map((label, d) => {
      const found = Array.isArray(dayRows) ? dayRows.find((r: any) => Number(r.day) === d) : null;
      return { day: d, label, avgMs: found ? Number(found.avg_ms) : 0 };
    });
    return {
      p50:    Number(row.p50    ?? 0),
      p90:    Number(row.p90    ?? 0),
      p95:    Number(row.p95    ?? 0),
      avgMs:  Number(row.avg_ms ?? 0),
      byDay,
    };
  },

  async getUnhandledIntents(limit = 15): Promise<{ id: string; visitorId: string; chatId: string; question: string; date: string }[]> {
    try {
      const result = await db.execute(sql.raw(`
        SELECT id, "visitorId", "chatId", "rawMessage" AS question, "createdAt" AS date
        FROM lc_unhandled_intents
        WHERE "createdAt" >= NOW() - INTERVAL '30 days'
        ORDER BY "createdAt" DESC
        LIMIT ${limit}
      `)) as any;
      const rows = result?.rows ?? result ?? [];
      return Array.isArray(rows)
        ? rows.map((r: any) => ({
            id: String(r.id),
            visitorId: r.visitorId || '',
            chatId: r.chatId || '',
            question: r.question || 'Sem texto',
            date: r.date
          }))
        : [];
    } catch { return []; }
  },

  async recordUnhandledIntent(data: { visitorId?: string; chatId?: string; rawMessage: string; category: string }): Promise<void> {
    try {
      await db.execute(sql.raw(`
        INSERT INTO lc_unhandled_intents ("visitorId","chatId","rawMessage","category","createdAt")
        VALUES (
          '${(data.visitorId ?? '').replace(/'/g,"''")}',
          '${(data.chatId ?? '').replace(/'/g,"''")}',
          '${(data.rawMessage ?? '').slice(0,500).replace(/'/g,"''")}',
          '${(data.category ?? 'outro').replace(/'/g,"''")}',
          NOW()
        )
      `));
    } catch { /* tabela pode ainda não existir */ }
  },

  async getCohortRetention(weeks = 8): Promise<{
    cohortWeek: string;
    data: { weekOffset: number; retentionPct: number; count: number }[];
  }[]> {
    const result = await db.execute(sql.raw(`
      WITH cohorts AS (
        SELECT
          "cookieId",
          DATE_TRUNC('week', "firstSeenAt"::timestamptz)::date AS cohort_week,
          DATE_TRUNC('week', "lastSeenAt"::timestamptz)::date  AS active_week
        FROM lc_visitors
        WHERE "firstSeenAt"::timestamptz >= NOW() - INTERVAL '${weeks} weeks'
      ),
      sizes AS (
        SELECT cohort_week, COUNT(DISTINCT "cookieId")::int AS sz
        FROM cohorts GROUP BY cohort_week
      ),
      activity AS (
        SELECT
          cohort_week,
          ((active_week - cohort_week) / 7)::int AS wo,
          COUNT(DISTINCT "cookieId")::int AS au
        FROM cohorts GROUP BY cohort_week, wo
      )
      SELECT
        a.cohort_week::text,
        a.wo AS week_offset,
        a.au AS active_users,
        LEAST(ROUND(a.au::numeric / NULLIF(s.sz, 0) * 100), 100)::int AS retention_pct
      FROM activity a
      JOIN sizes s ON s.cohort_week = a.cohort_week
      WHERE a.wo >= 0
      ORDER BY a.cohort_week ASC, a.wo ASC
      LIMIT 200
    `)) as any;
    const rows = result?.rows ?? result ?? [];
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const grouped: Record<string, { weekOffset: number; retentionPct: number; count: number }[]> = {};
    for (const r of rows) {
      const w = String(r.cohort_week ?? '');
      if (!grouped[w]) grouped[w] = [];
      grouped[w].push({ weekOffset: Number(r.week_offset), retentionPct: Number(r.retention_pct), count: Number(r.active_users) });
    }
    return Object.entries(grouped).map(([cohortWeek, data]) => ({ cohortWeek, data }));
  },

  async getConversionFunnel(dateFrom?: string, dateTo?: string): Promise<{
    steps: { label: string; count: number; pct: number }[];
  }> {
    const dw = dateFrom && dateTo
      ? `AND "firstSeenAt"::timestamptz >= '${dateFrom}T00:00:00Z' AND "firstSeenAt"::timestamptz <= '${dateTo}T23:59:59Z'`
      : dateFrom ? `AND "firstSeenAt"::timestamptz >= '${dateFrom}T00:00:00Z'`
      : dateTo   ? `AND "firstSeenAt"::timestamptz <= '${dateTo}T23:59:59Z'`
      : '';
    const g = (r: any) => Number(r?.rows?.[0]?.c ?? r?.[0]?.c ?? 0);
    // "Chat Aberto" removido: rastreamento de clique iniciou hoje, dados insuficientes
    // para comparação com etapas históricas. Reintroduzir após 30 dias de acúmulo.
    const [s1, s3, s4, s5] = await Promise.all([
      db.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM lc_visitors WHERE 1=1 ${dw}`)) as any,
      db.execute(sql.raw(`SELECT COUNT(DISTINCT v.id)::int AS c FROM lc_visitors v INNER JOIN lc_chats ch ON ch."visitorId" = v.id WHERE 1=1 ${dw.replace(/"firstSeenAt"/g,'v."firstSeenAt"')}`)) as any,
      db.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM lc_visitors WHERE "posVendaNome" IS NOT NULL ${dw}`)) as any,
      db.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM lc_visitors WHERE "rdCrmDealId" IS NOT NULL ${dw}`)) as any,
    ]);
    const total = g(s1);
    const steps = [
      { label: 'Sessão Iniciada',  count: total },
      { label: '1ª Mensagem',      count: g(s3) },
      { label: 'Dados Capturados', count: g(s4) },
      { label: 'Lead no CRM',      count: g(s5) },
    ];
    return { steps: steps.map(s => ({ ...s, pct: total > 0 ? Math.round((s.count / total) * 100) : 0 })) };
  },

  // ── Drill-down do funil: visitantes de uma etapa específica ─────────────────
  // step: 'sessao' | 'mensagem' | 'dados' | 'crm'
  async getFunnelStepVisitors(
    step: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<{ id: string; name: string | null; posVendaNome: string | null; posVendaTelefone: string | null; rdCrmDealId: string | null; pipelineStage: string; firstSeenAt: string; lastSeenAt: string; category: string; engagementScore: number; city: string | null; country: string | null; source: string | null }[]> {
    const dw = dateFrom && dateTo
      ? `AND "firstSeenAt"::timestamptz >= '${dateFrom}T00:00:00Z' AND "firstSeenAt"::timestamptz <= '${dateTo}T23:59:59Z'`
      : dateFrom ? `AND "firstSeenAt"::timestamptz >= '${dateFrom}T00:00:00Z'`
      : dateTo   ? `AND "firstSeenAt"::timestamptz <= '${dateTo}T23:59:59Z'`
      : '';

    let whereClause: string;
    if (step === 'crm') {
      whereClause = `"rdCrmDealId" IS NOT NULL ${dw}`;
    } else if (step === 'dados') {
      whereClause = `"posVendaNome" IS NOT NULL ${dw}`;
    } else if (step === 'mensagem') {
      const chatDw = dw.replace(/"firstSeenAt"/g, '"startedAt"');
      whereClause = `id IN (SELECT DISTINCT "visitorId" FROM lc_chats WHERE 1=1 ${chatDw}) ${dw}`;
    } else {
      whereClause = `1=1 ${dw}`;
    }

    try {
      const result = await db.execute(sql.raw(`
        SELECT id, name, "posVendaNome", "posVendaTelefone", "rdCrmDealId",
               "pipelineStage", "firstSeenAt", "lastSeenAt",
               category, "engagementScore", city, country, source
        FROM lc_visitors
        WHERE ${whereClause}
        ORDER BY "lastSeenAt" DESC
        LIMIT 100
      `)) as any;
      const rows = result?.rows ?? result ?? [];
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  },

  async getLeadScoringDistribution(dateFrom?: string, dateTo?: string): Promise<{
    hot: number; warm: number; cold: number; total: number;
    hotTrend: { date: string; count: number }[];
  }> {
    const dw = dateFrom && dateTo
      ? `AND "firstSeenAt"::timestamptz >= '${dateFrom}T00:00:00Z' AND "firstSeenAt"::timestamptz <= '${dateTo}T23:59:59Z'`
      : dateFrom ? `AND "firstSeenAt"::timestamptz >= '${dateFrom}T00:00:00Z'`
      : dateTo   ? `AND "firstSeenAt"::timestamptz <= '${dateTo}T23:59:59Z'`
      : '';
    // Para os totais usamos lastSeenAt (atividade recente)
    const dwLast = dateFrom && dateTo
      ? `AND "lastSeenAt"::timestamptz >= '${dateFrom}T00:00:00Z' AND "lastSeenAt"::timestamptz <= '${dateTo}T23:59:59Z'`
      : dateFrom ? `AND "lastSeenAt"::timestamptz >= '${dateFrom}T00:00:00Z'`
      : dateTo   ? `AND "lastSeenAt"::timestamptz <= '${dateTo}T23:59:59Z'`
      : '';
    const g = (r: any) => Number(r?.rows?.[0]?.c ?? r?.[0]?.c ?? 0);
    const [hotR, warmR, totalR, trendR] = await Promise.all([
      db.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM lc_visitors WHERE category = 'lead_hot' ${dwLast}`)) as any,
      db.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM lc_visitors WHERE category = 'lead_warm' ${dwLast}`)) as any,
      db.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM lc_visitors WHERE 1=1 ${dwLast}`)) as any,
      db.execute(sql.raw(`
        SELECT
          -- lastSeenAt é TEXT: usa SUBSTRING para extrair apenas YYYY-MM-DD
          -- mais robusto que ::timestamptz quando o formato pode variar
          SUBSTRING("lastSeenAt", 1, 10) AS date,
          COUNT(*)::int AS count
        FROM lc_visitors
        WHERE category IN ('lead_hot','customer')
          AND "lastSeenAt" >= TO_CHAR(NOW() - INTERVAL '30 days', 'YYYY-MM-DD')
        GROUP BY 1 ORDER BY 1 ASC
      `)) as any,
    ]);
    const hot = g(hotR), warm = g(warmR), total = g(totalR);
    const trendRows: { date: string; count: number }[] = (trendR?.rows ?? trendR ?? [])
      .map((r: any) => ({ date: String(r.date ?? ''), count: Number(r.count ?? 0) }));

    // Preenche dias sem dados com 0 para garantir sparkline contínua (30 dias)
    const filledTrend: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const found = trendRows.find(r => r.date === key);
      filledTrend.push({ date: key, count: found?.count ?? 0 });
    }

    return {
      hot, warm, cold: Math.max(0, total - hot - warm), total,
      hotTrend: filledTrend,
    };
  },

  // ── Reports Logging ──────────────────────────────────────────────────
  async createReportLog(data: {
    reportName: string;
    downloadedBy: string;
    filtersUsed?: any;
  }): Promise<any> {
    const { v4: uuidv4 } = await import("uuid");
    const id = uuidv4();
    await db.insert(lcReportLogs).values({
      id,
      reportName: data.reportName,
      downloadedBy: data.downloadedBy,
      filtersUsed: data.filtersUsed || {},
    });
    return { id };
  },

  async getReportLogs(limit = 100): Promise<any[]> {
    return db.select()
      .from(lcReportLogs)
      .orderBy(desc(lcReportLogs.downloadedAt))
      .limit(limit);
  },

};

/**
 * Garante que todas as colunas do schema existem no DB do Railway.
 * Usa ADD COLUMN IF NOT EXISTS — seguro de rodar toda vez que o servidor inicializa.
 * Resolve o problema de migrações não aplicadas que causam 500 silenciosos.
 */
export async function ensureLiveChatSchema(): Promise<void> {
  const cols: Array<[string, string]> = [
    // lc_visitors
    ['lc_visitors', '"id" TEXT'],
    ['lc_visitors', '"cookieId" TEXT'],
    ['lc_visitors', '"ip" TEXT'],
    ['lc_visitors', '"city" TEXT'],
    ['lc_visitors', '"country" TEXT'],
    ['lc_visitors', '"browser" TEXT'],
    ['lc_visitors', '"userAgent" TEXT'],
    ['lc_visitors', '"currentPage" TEXT'],
    ['lc_visitors', '"currentPageTitle" TEXT'],
    ['lc_visitors', '"source" TEXT'],
    ['lc_visitors', '"utmSource" TEXT'],
    ['lc_visitors', '"utmMedium" TEXT'],
    ['lc_visitors', '"utmCampaign" TEXT'],
    ['lc_visitors', '"referrer" TEXT'],
    ['lc_visitors', '"totalVisits" INTEGER NOT NULL DEFAULT 1'],
    ['lc_visitors', '"totalPages" INTEGER NOT NULL DEFAULT 0'],
    ['lc_visitors', '"totalChats" INTEGER NOT NULL DEFAULT 0'],
    ['lc_visitors', '"category" TEXT NOT NULL DEFAULT \'visitor\''],
    ['lc_visitors', '"engagementScore" INTEGER NOT NULL DEFAULT 0'],
    ['lc_visitors', '"isOnline" TEXT NOT NULL DEFAULT \'true\''],
    ['lc_visitors', '"pipelineStage" TEXT NOT NULL DEFAULT \'novo_atendimento\''],
    ['lc_visitors', '"firstSeenAt" TEXT NOT NULL DEFAULT now()::text'],
    ['lc_visitors', '"lastSeenAt" TEXT NOT NULL DEFAULT now()::text'],
    ['lc_visitors', '"name" TEXT'],
    ['lc_visitors', '"notes" JSONB DEFAULT \'[]\'::jsonb'],
    // lc_visitors — Dados Pós Venda (coletados pelo Fagner)

    ['lc_visitors', '"posVendaNome" TEXT'],

    ['lc_visitors', '"posVendaTelefone" TEXT'],

    ['lc_visitors', '"posVendaEmail" TEXT'],

    ['lc_visitors', '"posVendaCnpjCpf" TEXT'],

    ['lc_visitors', '"posVendaNotaPedido" TEXT'],

    ['lc_visitors', '"posVendaProblema" TEXT'],
    ['lc_visitors', '"posVendaCnpjData" JSONB'],
    ['lc_visitors', '"pecaDesejada" TEXT'],
    ['lc_visitors', '"pecasECliente" TEXT'],
    // lc_visitors — Dados Máquinas (coletados pelo Fagner no fluxo de orçamento)
    ['lc_visitors', '"maquinaDesejada" TEXT'],
    ['lc_visitors', '"maquinaProdutoFabricado" TEXT'],
    ['lc_visitors', '"maquinaVolumeProducao" TEXT'],
    ['lc_visitors', '"maquinaQualificacaoSDR" TEXT'],
    ['lc_visitors', '"maquinaClienteNovo" TEXT'],
    ['lc_visitors', '"rdCrmDealId" TEXT'],
    // lc_visitors — Pedido VTEX (gerado pelo Fagner via checkout link)
    ['lc_visitors', '"vtexOrderFormId" TEXT'],
    ['lc_visitors', '"vtexOrderId" TEXT'],
    ['lc_visitors', '"vtexOrderStatus" TEXT'],
    ['lc_visitors', '"vtexOrderData" JSONB'],

    // lc_chats
    ['lc_chats', '"mood" TEXT'],
    ['lc_chats', '"visitorEmail" TEXT'],
    ['lc_chats', '"visitorName" TEXT'],
    ['lc_chats', '"needsHuman" TEXT NOT NULL DEFAULT \'false\''],
    ['lc_chats', '"proactiveApproach" TEXT NOT NULL DEFAULT \'false\''],
    ['lc_chats', '"aiHandled" TEXT NOT NULL DEFAULT \'true\''],
    // Melhoria 1: Score de engajamento do chat (extraído do [SCORE:xx] do Gemini)
    ['lc_chats', '"engagementScore" INTEGER NOT NULL DEFAULT 0'],
    // Melhoria 2: Produto VTEX detectado nesta conversa
    ['lc_chats', '"vtexProduct" TEXT'],
    // Melhoria 3: Contador de mensagens interceptadas pelo filtro de ruído
    ['lc_chats', '"noiseFiltered" INTEGER NOT NULL DEFAULT 0'],
    // lc_messages
    ['lc_messages', '"read" TEXT NOT NULL DEFAULT \'false\''],
    // Novas colunas Fase 1 & 2 — melhorias visitor intelligence
    ['lc_visitors', '"deviceType" TEXT'],
    ['lc_visitors', '"purchaseIntentScore" INTEGER NOT NULL DEFAULT 0'],
    ['lc_visitors', '"aiBriefing" JSONB'],
    ['lc_pageviews', '"intentTag" TEXT'],
    ['lc_pageviews', '"timeSpent" INTEGER'],
    ['lc_pageviews', '"scrollDepth" INTEGER'],
    // Acumulador de tempo total do visitante no site (soma dos timeSpent dos pageviews)
    ['lc_visitors', '"totalTimeSeconds" INTEGER NOT NULL DEFAULT 0'],
  ];

  // Cria tabela de click events se não existir
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS lc_click_events (
      id SERIAL PRIMARY KEY,
      "visitorId" TEXT NOT NULL,
      url TEXT,
      "elementId" TEXT,
      "elementText" TEXT,
      "clickType" TEXT NOT NULL DEFAULT 'custom',
      "clickedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `));

  // Cria tabela de intents não atendidos (fallbacks do Fagner)
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS lc_unhandled_intents (
      id SERIAL PRIMARY KEY,
      "visitorId" TEXT,
      "chatId" TEXT,
      "rawMessage" TEXT,
      "category" TEXT NOT NULL DEFAULT 'outro',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `));

  let applied = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [table, colDef] of cols) {
    const colName = colDef.split(' ')[0].replace(/"/g, '');
    try {
      await db.execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${colDef}`));
      applied++;
    } catch (e: any) {
      // PG error 42701 = column already exists (only on older PG)
      if (!e.message?.includes('already exists')) {
        errors.push(`${table}.${colName}: ${e.message}`);
      } else {
        skipped++;
      }
    }
  }

  if (errors.length) {
    console.error('[LiveChat] ensureLiveChatSchema ERRORS:', errors);
  } else {
    console.log(`[LiveChat] ✅ ensureLiveChatSchema: ${applied} colunas verificadas, ${skipped} já existiam`);
  }
}

export default lcStorage;

