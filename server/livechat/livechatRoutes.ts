/**
 * server/livechat/livechatRoutes.ts
 *
 * Rotas REST do Live Chat — /api/livechat/*
 * Todas protegidas por requireAuth (exceto widget.js que é público)
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { lcStorage } from "./livechatStorage.js";
import { getDiagLog } from "./livechatAI.js";
import { getRdValidToken } from "./rdCrmService.js";

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

  router.patch("/chats/:id/close-reason", requireAuth, async (req: Request, res: Response) => {
    const { reason } = req.body;
    if (!reason || typeof reason !== "string") return res.status(400).json({ error: "reason required" });
    await lcStorage.setChatCloseReason(p(req.params.id), reason);
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

  // ── Renomear título do chat (visitorName) ──────────────────────────────────
  router.patch("/chats/:id/rename", requireAuth, async (req: Request, res: Response) => {
    try {
      const { title } = req.body;
      if (!title || typeof title !== "string") return res.status(400).json({ error: "title required" });
      await lcStorage.updateChat(p(req.params.id), { visitorName: title.trim() });
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[LiveChat] PATCH /chats/:id/rename error:", err?.message);
      return res.status(500).json({ message: err?.message ?? "Erro interno" });
    }
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
      const stages = ['novo_atendimento', 'em_atendimento', 'maquinas', 'pecas', 'pos_venda', 'vendido', 'outros', 'sem_resposta'];
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
  router.get("/enhanced-stats", requireAuth, async (req: Request, res: Response) => {
    try {
      // Suporta: ?date=YYYY-MM-DD (data exata) ou ?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD (range)
      const { date, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
      const stats = await lcStorage.getEnhancedStats(date, dateFrom, dateTo);
      return res.json(stats);
    } catch (err: any) {
      console.error("[LiveChat] GET /enhanced-stats error:", err?.message);
      return res.status(500).json({ message: err?.message ?? "Erro interno" });
    }
  });

  // ── Diagnóstico RD CRM — sem auth (acesso via token secreto na URL) ────
  router.get("/rd-debug", async (req: Request, res: Response) => {
    // Proteção mínima: token secreto na query string
    if (req.query.token !== "tecfag2025debug") {
      return res.status(403).json({ error: "Token inválido. Use ?token=tecfag2025debug" });
    }
    const result: Record<string, any> = {};
    try {
      const at = await getRdValidToken();
      result.token_ok = !!at;
      result.token_preview = at?.slice(0, 20) + "...";

      // Testar GET /sources
      const srcRes = await fetch("https://api.rd.services/crm/v2/sources?page[size]=100", {
        headers: { Authorization: `Bearer ${at}` }
      });
      const srcJson = await srcRes.json();
      result.sources_status = srcRes.status;
      result.sources_raw_keys = srcJson ? Object.keys(srcJson) : "null";
      const srcList: any[] = srcJson?.data ?? (Array.isArray(srcJson) ? srcJson : []);
      result.sources_count = srcList.length;
      result.sources_names = srcList.map((s: any) => s.name);

      // Testar GET /organizations
      const orgRes = await fetch("https://api.rd.services/crm/v2/organizations?page[size]=5", {
        headers: { Authorization: `Bearer ${at}` }
      });
      result.organizations_status = orgRes.status;
      const orgJson = await orgRes.json();
      const orgList: any[] = orgJson?.data ?? (Array.isArray(orgJson) ? orgJson : []);
      result.organizations_count = orgList.length;
      result.organizations_sample = orgList.slice(0, 3).map((o: any) => ({ id: o.id, name: o.name }));

      // Testar POST /sources (criar fonte teste)
      const testSrcRes = await fetch("https://api.rd.services/crm/v2/sources", {
        method: "POST",
        headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Referência | tecfag.com.br" })
      });
      const testSrcJson = await testSrcRes.json();
      result.create_source_status = testSrcRes.status;
      result.create_source_body = testSrcJson;

      // Testar GET /custom_fields org
      const cfRes = await fetch("https://api.rd.services/crm/v2/custom_fields?filter=entity:organization&page[size]=50", {
        headers: { Authorization: `Bearer ${at}` }
      });
      result.org_custom_fields_status = cfRes.status;
      const cfJson = await cfRes.json();
      const cfList: any[] = cfJson?.data ?? (Array.isArray(cfJson) ? cfJson : []);
      result.org_custom_fields = cfList.map((f: any) => ({ id: f.id, name: f.name, slug: f.slug }));

    } catch (err: any) {
      result.error = err?.message;
    }
    return res.json(result);
  });

  // ── Usuários do RD CRM (para dropdown de operadores nas configurações) ─────
  router.get("/rd-users", requireAuth, async (_req: Request, res: Response) => {
    try {
      const at = await getRdValidToken();
      const allUsers: any[] = [];
      let page = 1;

      // Busca com paginação — formato correto: page[number] e page[size]
      while (page <= 10) {
        const url = `https://api.rd.services/crm/v2/users?page[number]=${page}&page[size]=100&filter=is:active`;
        const r = await fetch(url, {
          headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" }
        });

        if (!r.ok) {
          const errBody = await r.text();
          console.error(`[LiveChat] rd-users page ${page} HTTP ${r.status}: ${errBody.slice(0, 500)}`);
          break;
        }

        const json = await r.json();
        // API retorna { data: [...], links: {...} }
        const pageUsers: any[] = Array.isArray(json?.data) ? json.data
                                : Array.isArray(json)       ? json
                                : [];

        console.log(`[LiveChat] rd-users page ${page}: ${pageUsers.length} usuários`);
        allUsers.push(...pageUsers);

        // Para quando vier menos de 100 (última página) ou não vier 'next' nos links
        if (pageUsers.length < 100 || !json?.links?.next) break;
        page++;
      }

      const normalized = allUsers.map((u: any) => ({
        id:    u.id    ?? "",
        name:  u.name  ?? "",
        email: u.email ?? ""
      })).filter(u => u.name); // remove registros sem nome

      console.log(`[LiveChat] rd-users: retornando ${normalized.length} usuários no total`);
      return res.json(normalized);
    } catch (err: any) {
      console.error("[LiveChat] GET /rd-users ERRO:", err?.message, err?.stack?.slice(0, 300));
      return res.json([]);
    }
  });

  // ── Configurações de Funil (persistidas no servidor para uso no backend) ────
  router.get("/funnel-settings", requireAuth, async (_req: Request, res: Response) => {
    try {
      const settings = await lcStorage.getFunnelSettings();
      return res.json(settings);
    } catch (err: any) {
      console.error("[LiveChat] GET /funnel-settings error:", err?.message);
      return res.json(null);
    }
  });

  router.put("/funnel-settings", requireAuth, async (req: Request, res: Response) => {
    try {
      const body = req.body;
      if (!body || typeof body !== 'object') {
        return res.status(400).json({ message: "Body inválido" });
      }
      await lcStorage.saveFunnelSettings(body);
      console.log("[LiveChat] ⚙️ Funnel settings atualizadas via admin");
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[LiveChat] PUT /funnel-settings error:", err?.message);
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
  router.get("/rd-pipelines", async (_req: Request, res: Response) => {
    try {
      const at = await getRdValidToken();
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
  router.get("/rd-stages/:pipelineId", async (req: Request, res: Response) => {
    try {
      const at = await getRdValidToken();
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

  // ── Diagnóstico: Fontes disponíveis no RD CRM ─────────────────────────────
  router.get("/rd-sources", async (_req: Request, res: Response) => {
    try {
      const at = await getRdValidToken();
      const r = await fetch("https://api.rd.services/crm/v2/sources", { headers: { Authorization: `Bearer ${at}` } });
      return res.json({ status: r.status, data: await r.json() });
    } catch (err: any) { return res.status(500).json({ message: err?.message }); }
  });

  // ── Diagnóstico: Campanhas disponíveis no RD CRM ──────────────────────────
  router.get("/rd-campaigns", async (_req: Request, res: Response) => {
    try {
      const at = await getRdValidToken();
      const r = await fetch("https://api.rd.services/crm/v2/campaigns", { headers: { Authorization: `Bearer ${at}` } });
      return res.json({ status: r.status, data: await r.json() });
    } catch (err: any) { return res.status(500).json({ message: err?.message }); }
  });

  // ── Diagnóstico: Campos personalizados de Deals ───────────────────────────
  router.get("/rd-deal-fields", async (_req: Request, res: Response) => {
    try {
      const at = await getRdValidToken();
      const r = await fetch("https://api.rd.services/crm/v2/deals/custom_fields", { headers: { Authorization: `Bearer ${at}` } });
      return res.json({ status: r.status, data: await r.json() });
    } catch (err: any) { return res.status(500).json({ message: err?.message }); }
  });

  // ── Diagnóstico: Campos personalizados de Contatos ────────────────────────
  router.get("/rd-contact-fields", async (_req: Request, res: Response) => {
    try {
      const at = await getRdValidToken();
      const r = await fetch("https://api.rd.services/crm/v2/contacts/custom_fields", { headers: { Authorization: `Bearer ${at}` } });
      return res.json({ status: r.status, data: await r.json() });
    } catch (err: any) { return res.status(500).json({ message: err?.message }); }
  });

  // ── VTEX Order Hook — chamado pela VTEX quando pagamento confirmado ou cancelado
  // NÃO usa requireAuth — a VTEX chama sem sessão, protegido por secret no header
  router.post("/vtex-order-hook", async (req: Request, res: Response) => {
    // 1. Valida secret
    const secret = req.headers['x-vtex-hook-secret'] as string | undefined;
    const expectedSecret = process.env.VTEX_ORDER_HOOK_SECRET;
    if (expectedSecret && secret !== expectedSecret) {
      console.warn('[VTEX Hook] ⚠️ Secret inválido — ignorando webhook');
      return res.status(401).json({ error: 'Invalid secret' });
    }

    // 2. Responde imediatamente (VTEX não espera processamento longo)
    res.json({ ok: true });

    // 3. Processa em background
    setImmediate(async () => {
      try {
        const body = req.body as any;
        const orderId: string  = body.orderId  ?? body.OrderId  ?? '';
        const status: string   = body.status   ?? body.Status   ?? '';
        const value: number    = body.value     ?? body.Value    ?? 0;  // centavos
        const orderFormId: string = body.orderFormId ?? body.OrderFormId ?? '';

        console.log(`[VTEX Hook] orderId=${orderId} status=${status} orderFormId=${orderFormId}`);

        if (!['payment-approved', 'canceled'].includes(status)) return;

        // 4. Encontra visitante pelo orderFormId
        const visitor = orderFormId
          ? await lcStorage.getVisitorByOrderFormId(orderFormId)
          : null;

        if (!visitor) {
          console.warn(`[VTEX Hook] Não foi encontrado visitante para orderFormId=${orderFormId} — provavelmente pedido externo`);
          return;
        }

        // 5. Atualiza status no banco
        await lcStorage.updateVisitorOrderData(visitor.id, {
          vtexOrderId:     orderId,
          vtexOrderStatus: status,
        });

        // 6. Cria anotação de IA no card (visível no painel)
        const valorFormatado = value > 0
          ? (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
          : '';
        const nota = status === 'payment-approved'
          ? `✅ Pagamento confirmado!\nPedido: #${orderId}${valorFormatado ? `\nValor: ${valorFormatado}` : ''}\nData: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
          : `❌ Pedido cancelado\nPedido: #${orderId}\nData: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;

        await lcStorage.addVisitorNote(visitor.id, 'VTEX', nota);

        // 7. Envia mensagem ao cliente no chat (se houver chat aberto)
        const chats = await lcStorage.listChatsByVisitor(visitor.id);
        const openChat = chats.find((c: any) => c.status !== 'closed');

        if (openChat) {
          const clientMsg = status === 'payment-approved'
            ? [
                `✅ Pagamento confirmado! Seu pedido foi aprovado! 🎉`,
                ``,
                `📦 Pedido: #${orderId}`,
                valorFormatado ? `💰 Valor: ${valorFormatado}` : '',
                `🚚 Em breve você receberá as informações de rastreio por email.`,
                ``,
                `Qualquer dúvida, estou por aqui! 😊`,
              ].filter(Boolean).join('\n')
            : [
                `❌ Infelizmente seu pedido foi cancelado.`,
                `Pedido: #${orderId}`,
                ``,
                `Se quiser refazer o pedido ou tiver alguma dúvida, é só falar comigo! 😊`,
              ].join('\n');

          await lcStorage.createMessage({ chatId: openChat.id, sender: 'ai', content: clientMsg });
        }

        console.log(`[VTEX Hook] ✅ Processado: visitante=${visitor.id} orderId=${orderId} status=${status}`);
      } catch (err: any) {
        console.error('[VTEX Hook] ❌ Erro ao processar webhook:', err.message);
      }
    });
  });

  // Mount all routes under /api/livechat
  app.use("/api/livechat", router);

  console.log("[LiveChat] ✅ Rotas /api/livechat/* registradas");
}
