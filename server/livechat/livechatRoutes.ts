/**
 * server/livechat/livechatRoutes.ts
 *
 * Rotas REST do Live Chat — /api/livechat/*
 * Todas protegidas por requireAuth (exceto widget.js que é público)
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { lcStorage } from "./livechatStorage.js";
import { getDiagLog } from "./livechatAI.js";

// ─── Auth middleware (mesma lógica do index.ts) ────────────────────────────────

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!(req.session as any).userId) {
    return res.status(401).json({ message: "Não autenticado" });
  }
  next();
}

// Helper
function p(param: string | string[]): string {
  return Array.isArray(param) ? param[0] : param;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function registerLiveChatRoutes(app: any): void {
  const router = Router();

  // ── Stats (dashboard) ─────────────────────────────────────────────
  router.get("/stats", requireAuth, async (_req: Request, res: Response) => {
    const stats = await lcStorage.getStats();
    return res.json(stats);
  });

  // ── Visitors ──────────────────────────────────────────────────────
  router.get("/visitors", requireAuth, async (_req: Request, res: Response) => {
    const visitors = await lcStorage.listOnlineVisitors();
    return res.json(visitors);
  });

  router.get("/visitors/all", requireAuth, async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const visitors = await lcStorage.listAllVisitors(limit);
      return res.json(visitors);
    } catch (err: any) {
      console.error("[LiveChat] GET /visitors/all error:", err?.message, err?.stack);
      return res.status(500).json({ message: err?.message ?? "Erro interno" });
    }
  });

  router.get("/visitors/:id", requireAuth, async (req: Request, res: Response) => {
    const visitor = await lcStorage.getVisitorById(p(req.params.id));
    if (!visitor) return res.status(404).json({ message: "Visitante não encontrado" });
    return res.json(visitor);
  });

  router.get("/visitors/:id/history", requireAuth, async (req: Request, res: Response) => {
    const visitor = await lcStorage.getVisitorById(p(req.params.id));
    if (!visitor) return res.status(404).json({ message: "Visitante não encontrado" });
    const history = await lcStorage.getVisitorHistoryByCookie(visitor.cookieId, visitor.id);
    return res.json(history);
  });

  router.get("/visitors/:id/chats", requireAuth, async (req: Request, res: Response) => {
    try {
      const chats = await lcStorage.listChatsByVisitor(p(req.params.id));
      return res.json(chats);
    } catch (err: any) {
      console.error("[LiveChat] GET /visitors/:id/chats error:", err?.message);
      return res.status(500).json({ message: err?.message ?? "Erro interno" });
    }
  });

  router.get("/visitors/:id/pageviews", requireAuth, async (req: Request, res: Response) => {
    const pageviews = await lcStorage.listPageviewsByVisitor(p(req.params.id));
    return res.json(pageviews);
  });

  // ── Chats ─────────────────────────────────────────────────────────
  router.get("/chats", requireAuth, async (req: Request, res: Response) => {
    const status = req.query.status as string | undefined;
    const chats = await lcStorage.listChats(status);
    return res.json(chats);
  });

  router.get("/chats/needs-human", requireAuth, async (_req: Request, res: Response) => {
    const chats = await lcStorage.listNeedsHumanChats();
    return res.json(chats);
  });

  router.get("/chats/:id", requireAuth, async (req: Request, res: Response) => {
    const chat = await lcStorage.getChatById(p(req.params.id));
    if (!chat) return res.status(404).json({ message: "Chat não encontrado" });
    return res.json(chat);
  });

  router.get("/chats/:id/messages", requireAuth, async (req: Request, res: Response) => {
    const messages = await lcStorage.listMessagesByChat(p(req.params.id));
    return res.json(messages);
  });

  router.post("/chats/:id/close", requireAuth, async (req: Request, res: Response) => {
    await lcStorage.closeChat(p(req.params.id));
    return res.json({ ok: true });
  });

  router.post("/chats/:id/take-over", requireAuth, async (req: Request, res: Response) => {
    const { userId } = req.body;
    await lcStorage.updateChat(p(req.params.id), {
      status: "human_active",
      agentId: userId ?? "admin",
      needsHuman: "false",
    });
    return res.json({ ok: true });
  });

  router.post("/chats/:id/read", requireAuth, async (req: Request, res: Response) => {
    await lcStorage.markMessagesRead(p(req.params.id));
    return res.json({ ok: true });
  });

  // ── Settings ──────────────────────────────────────────────────────
  router.get("/settings/:key", requireAuth, async (req: Request, res: Response) => {
    const value = await lcStorage.getSettingParsed(p(req.params.key));
    return res.json(value);
  });

  router.post("/settings", requireAuth, async (req: Request, res: Response) => {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ message: "Chave obrigatória" });
    await lcStorage.setSetting(key, value ?? "");
    return res.json({ ok: true });
  });

  // ── Pipeline CRM ──────────────────────────────────────────────────
  router.get("/pipeline", requireAuth, async (_req: Request, res: Response) => {
    try {
      try { await lcStorage.migrateNullPipelineStages(); } catch {}
      const stages = ['novo_atendimento', 'em_atendimento', 'pos_venda', 'finalizado_com_venda', 'finalizado_sem_venda', 'outros', 'sem_resposta'];
      const result: Record<string, any[]> = {};
      for (const stage of stages) {
        result[stage] = await lcStorage.listVisitorsByPipeline(stage);
      }
      return res.json(result);
    } catch (err: any) {
      console.error("[LiveChat] GET /pipeline error:", err?.message, err?.stack);
      return res.status(500).json({ message: err?.message ?? "Erro interno" });
    }
  });

  router.get("/pipeline/stats", requireAuth, async (_req: Request, res: Response) => {
    const stats = await lcStorage.getPipelineStats();
    return res.json(stats);
  });


  // ── Pós Venda — Salvar dados coletados pelo Fagner ────────────────────
  router.patch("/visitors/:id/pos-venda", requireAuth, async (req: Request, res: Response) => {
    try {
      const { nome, telefone, email, cnpjCpf, notaPedido, problema } = req.body;
      await lcStorage.updateVisitorPosVendaData(p(req.params.id), {
        nome:        nome        || null,
        telefone:    telefone    || null,
        email:       email       || null,
        cnpjCpf:     cnpjCpf     || null,
        notaPedido:  notaPedido  || null,
        problema:    problema    || null,
      });
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[LiveChat] PATCH /visitors/:id/pos-venda error:", err?.message);
      return res.status(500).json({ message: err?.message ?? "Erro interno" });
    }
  });

  // ── Melhoria 4: Estatísticas enriquecidas (engagement, VTEX, ruído) ─────────
  router.get("/enhanced-stats", requireAuth, async (_req: Request, res: Response) => {
    try {
      const stats = await lcStorage.getEnhancedStats();
      return res.json(stats);
    } catch (err: any) {
      console.error("[LiveChat] GET /enhanced-stats error:", err?.message);
      return res.status(500).json({ message: err?.message ?? "Erro interno" });
    }
  });

  // ── Reset Completo (Admin only) ─────────────────────────────────────────────
  router.delete("/reset-all", requireAuth, async (_req: Request, res: Response) => {
    try {
      await lcStorage.resetAllLiveChatData();
      console.log("[LiveChat] ✅ Reset completo realizado por admin");
      return res.json({ ok: true, message: "Todos os dados do Live Chat foram apagados." });
    } catch (err: any) {
      console.error("[LiveChat] DELETE /reset-all error:", err?.message);
      return res.status(500).json({ message: err?.message ?? "Erro interno" });
    }
  });

  // ── Diagnóstico RD CRM: lista funis/etapas reais (para obter IDs corretos) ──
  router.get("/rd-pipelines", requireAuth, async (_req: Request, res: Response) => {
    try {
      const at = process.env.RD_CRM_ACCESS_TOKEN;
      if (!at) return res.status(400).json({ error: "RD_CRM_ACCESS_TOKEN não configurado" });

      const r = await fetch("https://api.rd.services/crm/v2/pipelines", {
        headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" }
      });
      const data = await r.json();
      return res.json({ status: r.status, data });
    } catch (err: any) {
      return res.status(500).json({ message: err?.message });
    }
  });

  // ── Diagnóstico RD CRM: lista etapas de um funil específico ──────────────────
  router.get("/rd-stages/:pipelineId", requireAuth, async (req: Request, res: Response) => {
    try {
      const at = process.env.RD_CRM_ACCESS_TOKEN;
      if (!at) return res.status(400).json({ error: "RD_CRM_ACCESS_TOKEN não configurado" });
      const pid = p(req.params.pipelineId);
      const r = await fetch(`https://api.rd.services/crm/v2/pipelines/${pid}/stages`, {
        headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" }
      });
      const data = await r.json();
      return res.json({ status: r.status, data });
    } catch (err: any) {
      return res.status(500).json({ message: err?.message });
    }
  });

  // Mount all routes under /api/livechat
  app.use("/api/livechat", router);

  console.log("[LiveChat] ✅ Rotas /api/livechat/* registradas");
}
