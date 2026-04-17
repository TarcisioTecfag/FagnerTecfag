/**
 * server/livechat/livechatRoutes.ts
 *
 * Rotas REST do Live Chat Ã¢â‚¬â€ /api/livechat/*
 * Todas protegidas por requireAuth (exceto widget.js que ÃƒÂ© pÃƒÂºblico)
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { lcStorage } from "./livechatStorage.js";
import { getDiagLog, generateConversationNote, generatePosVendaReport, generateMaquinasReport, generatePecasReport } from "./livechatAI.js";
import { getRdValidToken, createPosVendaOS, createMaquinasOS, createPecasOS, isRdCrmConfigured } from "./rdCrmService.js";
import { broadcastPipelineUpdateExternal } from "./livechatWs.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// â”€â”€ Multer: upload de arquivos do agente â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const UPLOADS_DIR = path.join(__dirname, "../../data/uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const agentUploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    cb(null, `${Date.now()}-${safe}`);
  },
});

const ALLOWED_MIMES = [
  "image/jpeg","image/png","image/gif","image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",     // xlsx
  "application/vnd.ms-excel",                                               // xls
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",// docx
  "application/msword",                                                      // doc
  "video/mp4","video/webm","video/ogg",
];

const agentUpload = multer({
  storage: agentUploadStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) return cb(null, true);
    cb(new Error(`Tipo de arquivo nÃ£o permitido: ${file.mimetype}`));
  },
});


// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Auth middleware (mesma lÃƒÂ³gica do index.ts) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!(req.session as any).userId) {
    return res.status(401).json({ message: "NÃƒÂ£o autenticado" });
  }
  next();
}

// Helper
function p(param: string | string[]): string {
  return Array.isArray(param) ? param[0] : param;
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Router Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

export function registerLiveChatRoutes(app: any): void {
  const router = Router();

  // Ã¢â€â‚¬Ã¢â€â‚¬ Stats (dashboard) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  router.get("/stats", requireAuth, async (_req: Request, res: Response) => {
    const stats = await lcStorage.getStats();
    return res.json(stats);
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬ Visitors Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  router.get("/visitors", requireAuth, async (_req: Request, res: Response) => {
    const visitors = await lcStorage.listOnlineVisitors();
    return res.json(visitors);
  });

  router.get("/visitors/all", requireAuth, async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 5000;
      const visitors = await lcStorage.listAllVisitors(limit);
      return res.json(visitors);
    } catch (err: any) {
      console.error("[LiveChat] GET /visitors/all error:", err?.message, err?.stack);
      return res.status(500).json({ message: err?.message ?? "Erro interno" });
    }
  });

  router.get("/visitors/:id", requireAuth, async (req: Request, res: Response) => {
    const visitor = await lcStorage.getVisitorById(p(req.params.id));
    if (!visitor) return res.status(404).json({ message: "Visitante nÃƒÂ£o encontrado" });
    return res.json(visitor);
  });

  router.get("/visitors/:id/history", requireAuth, async (req: Request, res: Response) => {
    const visitor = await lcStorage.getVisitorById(p(req.params.id));
    if (!visitor) return res.status(404).json({ message: "Visitante nÃƒÂ£o encontrado" });
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

  // -- Click Event Tracking (publico - chamado pelo widget/site) ---------------
  router.post('/public/click', async (req: Request, res: Response) => {
    try {
      const { visitorId, url, elementId, elementText, clickType } = req.body;
      if (!visitorId || !clickType) {
        return res.status(400).json({ error: 'visitorId e clickType sao obrigatorios' });
      }
      const VALID_TYPES = ['whatsapp', 'chat_open', 'cta_button', 'phone', 'custom'];
      const safeType = VALID_TYPES.includes(clickType) ? clickType : 'custom';
      await lcStorage.recordClickEvent({ visitorId, url: url ?? '', elementId, elementText, clickType: safeType });
      return res.json({ ok: true });
    } catch (err: any) {
      console.error('[Click Track]', err?.message);
      return res.status(500).json({ error: 'Erro ao registrar clique' });
    }
  });


  // Ã¢â€â‚¬Ã¢â€â‚¬ Chats Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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
    if (!chat) return res.status(404).json({ message: "Chat nÃƒÂ£o encontrado" });
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Renomear tÃƒÂ­tulo do chat (visitorName) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Settings Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  router.get("/settings/:key", requireAuth, async (req: Request, res: Response) => {
    const value = await lcStorage.getSettingParsed(p(req.params.key));
    return res.json(value);
  });

  router.post("/settings", requireAuth, async (req: Request, res: Response) => {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ message: "Chave obrigatÃƒÂ³ria" });
    await lcStorage.setSetting(key, value ?? "");
    return res.json({ ok: true });
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬ Pipeline CRM Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

  // â”€â”€ Mover card no Kanban (drag & drop manual pelo operador) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  router.patch("/visitors/:id/pipeline", requireAuth, async (req: Request, res: Response) => {
    try {
      const { stage } = req.body;
      if (!stage || typeof stage !== "string") {
        return res.status(400).json({ error: "stage required" });
      }
      const VALID_STAGES = [
        "novo_atendimento", "em_atendimento", "maquinas",
        "pecas", "pos_venda", "finalizado_com_venda",
        "sem_resposta", "outros",
      ];
      if (!VALID_STAGES.includes(stage)) {
        return res.status(400).json({ error: `Stage invÃ¡lido: ${stage}` });
      }
      const visitorId = p(req.params.id);
      const visitor = await lcStorage.updateVisitorPipeline(visitorId, stage);
      if (!visitor) return res.status(404).json({ error: "Visitante nÃ£o encontrado" });

      // Notifica todos os agentes via WebSocket em tempo real
      await broadcastPipelineUpdateExternal(visitorId, stage);

      console.log(`[LiveChat] ðŸƒ Card ${visitorId} movido manualmente para '${stage}' pelo operador`);
      return res.json({ ok: true, stage, visitor });
    } catch (err: any) {
      console.error("[LiveChat] PATCH /visitors/:id/pipeline error:", err?.message);
      return res.status(500).json({ message: err?.message ?? "Erro interno" });
    }
  });


  // Ã¢â€â‚¬Ã¢â€â‚¬ PÃƒÂ³s Venda Ã¢â‚¬â€ Salvar dados coletados pelo Fagner Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Melhoria 4: EstatÃƒÂ­sticas enriquecidas (engagement, VTEX, ruÃƒÂ­do) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ DiagnÃƒÂ³stico RD CRM Ã¢â‚¬â€ sem auth (acesso via token secreto na URL) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  router.get("/rd-debug", async (req: Request, res: Response) => {
    // ProteÃƒÂ§ÃƒÂ£o mÃƒÂ­nima: token secreto na query string
    if (req.query.token !== "tecfag2025debug") {
      return res.status(403).json({ error: "Token invÃƒÂ¡lido. Use ?token=tecfag2025debug" });
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
        body: JSON.stringify({ name: "ReferÃƒÂªncia | tecfag.com.br" })
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

      // Diagnostico completo de campos personalizados de DEAL (id + slug + type + options)
      const dealCfRes = await fetch("https://api.rd.services/crm/v2/custom_fields?filter=entity:deal&page[size]=100", {
        headers: { Authorization: `Bearer ${at}` }
      });
      result.deal_custom_fields_status = dealCfRes.status;
      const dealCfJson = await dealCfRes.json();
      const dealCfList: any[] = dealCfJson?.data ?? (Array.isArray(dealCfJson) ? dealCfJson : []);
      result.deal_custom_fields_raw = dealCfList.map((f: any) => ({
        id: f.id, name: f.name, slug: f.slug, type: f.type,
        options: f.options ?? null,
      }));
      const findFD = (partial: string) => dealCfList.find((f: any) =>
        (f.name || '').toLowerCase().includes(partial.toLowerCase()) ||
        (f.slug || '').toLowerCase().includes(partial.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))
      );
      const hit = (f: any) => f
        ? { found: true, id: f.id, name: f.name, slug: f.slug, type: f.type, options: f.options ?? [] }
        : { found: false };
      result.deal_fields_mapping = {
        clienteNovo:  hit(findFD('cliente novo')),
        sdr:          hit(findFD('qualificado por sdr') || findFD('qualificado')),
        produto:      hit(findFD('produto fabricado') || findFD('produto')),
        volume:       hit(findFD('volume de produ') || findFD('volume')),
        complementar: hit(findFD('complementar')),
      };
      // DIAGNOSTICO CHAVE: busca deals recentes para ver estrutura real de custom_fields
      try {
        const recentDealsRes = await fetch(
          "https://api.rd.services/crm/v2/deals?sort[created_at]=desc&page[size]=3",
          { headers: { Authorization: `Bearer ${at}` } }
        );
        const recentDealsJson = await recentDealsRes.json();
        const recentDeals: any[] = recentDealsJson?.data ?? [];
        result.recent_deals_custom_fields = recentDeals.map((d: any) => ({
          id: d.id,
          name: d.name,
          pipeline_id: d.pipeline_id,
          custom_fields: d.custom_fields ?? {},
          custom_fields_keys: Object.keys(d.custom_fields ?? {}),
          custom_fields_all_empty: !d.custom_fields || Object.values(d.custom_fields).every((v: any) => !v),
        }));
        result.diagnostico = {
          instrucao: "Compare 'recent_deals_custom_fields[N].custom_fields_keys' com 'deal_fields_mapping[campo].id' e 'deal_fields_mapping[campo].slug' para saber qual formato a API usa.",
        };
      } catch (dealErr: any) {
        result.recent_deals_error = (dealErr as any)?.message;
      }

    } catch (err: any) {
      result.error = err?.message;
    }
    return res.json(result);
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬ UsuÃƒÂ¡rios do RD CRM (para dropdown de operadores nas configuraÃƒÂ§ÃƒÂµes) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  router.get("/rd-users", requireAuth, async (_req: Request, res: Response) => {
    try {
      const at = await getRdValidToken();
      const allUsers: any[] = [];
      let page = 1;

      // Busca com paginaÃƒÂ§ÃƒÂ£o Ã¢â‚¬â€ formato correto: page[number] e page[size]
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

        console.log(`[LiveChat] rd-users page ${page}: ${pageUsers.length} usuÃƒÂ¡rios`);
        allUsers.push(...pageUsers);

        // Para quando vier menos de 100 (ÃƒÂºltima pÃƒÂ¡gina) ou nÃƒÂ£o vier 'next' nos links
        if (pageUsers.length < 100 || !json?.links?.next) break;
        page++;
      }

      const normalized = allUsers.map((u: any) => ({
        id:    u.id    ?? "",
        name:  u.name  ?? "",
        email: u.email ?? ""
      })).filter(u => u.name); // remove registros sem nome

      console.log(`[LiveChat] rd-users: retornando ${normalized.length} usuÃƒÂ¡rios no total`);
      return res.json(normalized);
    } catch (err: any) {
      console.error("[LiveChat] GET /rd-users ERRO:", err?.message, err?.stack?.slice(0, 300));
      return res.json([]);
    }
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬ ConfiguraÃƒÂ§ÃƒÂµes de Funil (persistidas no servidor para uso no backend) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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
        return res.status(400).json({ message: "Body invÃƒÂ¡lido" });
      }
      await lcStorage.saveFunnelSettings(body);
      console.log("[LiveChat] Ã¢Å¡â„¢Ã¯Â¸Â Funnel settings atualizadas via admin");
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[LiveChat] PUT /funnel-settings error:", err?.message);
      return res.status(500).json({ message: err?.message ?? "Erro interno" });
    }
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬ Reset Completo (Admin only) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  router.delete("/reset-all", requireAuth, async (_req: Request, res: Response) => {
    try {
      await lcStorage.resetAllLiveChatData();
      console.log("[LiveChat] Ã¢Å“â€¦ Reset completo realizado por admin");
      return res.json({ ok: true, message: "Todos os dados do Live Chat foram apagados." });
    } catch (err: any) {
      console.error("[LiveChat] DELETE /reset-all error:", err?.message);
      return res.status(500).json({ message: err?.message ?? "Erro interno" });
    }
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬ DiagnÃƒÂ³stico RD CRM: lista funis/etapas reais (para obter IDs corretos) Ã¢â€â‚¬Ã¢â€â‚¬
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ DiagnÃƒÂ³stico RD CRM: lista etapas de um funil especÃƒÂ­fico Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ DiagnÃƒÂ³stico: Fontes disponÃƒÂ­veis no RD CRM Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  router.get("/rd-sources", async (_req: Request, res: Response) => {
    try {
      const at = await getRdValidToken();
      const r = await fetch("https://api.rd.services/crm/v2/sources", { headers: { Authorization: `Bearer ${at}` } });
      return res.json({ status: r.status, data: await r.json() });
    } catch (err: any) { return res.status(500).json({ message: err?.message }); }
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬ DiagnÃƒÂ³stico: Campanhas disponÃƒÂ­veis no RD CRM Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  router.get("/rd-campaigns", async (_req: Request, res: Response) => {
    try {
      const at = await getRdValidToken();
      const r = await fetch("https://api.rd.services/crm/v2/campaigns", { headers: { Authorization: `Bearer ${at}` } });
      return res.json({ status: r.status, data: await r.json() });
    } catch (err: any) { return res.status(500).json({ message: err?.message }); }
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬ DiagnÃƒÂ³stico: Campos personalizados de Deals Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  router.get("/rd-deal-fields", async (_req: Request, res: Response) => {
    try {
      const at = await getRdValidToken();
      const r = await fetch("https://api.rd.services/crm/v2/deals/custom_fields", { headers: { Authorization: `Bearer ${at}` } });
      return res.json({ status: r.status, data: await r.json() });
    } catch (err: any) { return res.status(500).json({ message: err?.message }); }
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬ DiagnÃƒÂ³stico: Campos personalizados de Contatos Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  router.get("/rd-contact-fields", async (_req: Request, res: Response) => {
    try {
      const at = await getRdValidToken();
      const r = await fetch("https://api.rd.services/crm/v2/contacts/custom_fields", { headers: { Authorization: `Bearer ${at}` } });
      return res.json({ status: r.status, data: await r.json() });
    } catch (err: any) { return res.status(500).json({ message: err?.message }); }
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬ VTEX Order Hook Ã¢â‚¬â€ chamado pela VTEX quando pagamento confirmado ou cancelado
  // NÃƒÆ’O usa requireAuth Ã¢â‚¬â€ a VTEX chama sem sessÃƒÂ£o, protegido por secret no header
  router.post("/vtex-order-hook", async (req: Request, res: Response) => {
    // 1. Valida secret
    const secret = req.headers['x-vtex-hook-secret'] as string | undefined;
    const expectedSecret = process.env.VTEX_ORDER_HOOK_SECRET;
    if (expectedSecret && secret !== expectedSecret) {
      console.warn('[VTEX Hook] Ã¢Å¡Â Ã¯Â¸Â Secret invÃƒÂ¡lido Ã¢â‚¬â€ ignorando webhook');
      return res.status(401).json({ error: 'Invalid secret' });
    }

    // 2. Responde imediatamente (VTEX nÃƒÂ£o espera processamento longo)
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
          console.warn(`[VTEX Hook] NÃƒÂ£o foi encontrado visitante para orderFormId=${orderFormId} Ã¢â‚¬â€ provavelmente pedido externo`);
          return;
        }

        // 5. Atualiza status no banco
        await lcStorage.updateVisitorOrderData(visitor.id, {
          vtexOrderId:     orderId,
          vtexOrderStatus: status,
        });

        // 6. Cria anotaÃƒÂ§ÃƒÂ£o de IA no card (visÃƒÂ­vel no painel)
        const valorFormatado = value > 0
          ? (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
          : '';
        const nota = status === 'payment-approved'
          ? `Ã¢Å“â€¦ Pagamento confirmado!\nPedido: #${orderId}${valorFormatado ? `\nValor: ${valorFormatado}` : ''}\nData: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
          : `Ã¢ÂÅ’ Pedido cancelado\nPedido: #${orderId}\nData: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;

        await lcStorage.addVisitorNote(visitor.id, 'VTEX', nota);

        // 7. Envia mensagem ao cliente no chat (se houver chat aberto)
        const chats = await lcStorage.listChatsByVisitor(visitor.id);
        const openChat = chats.find((c: any) => c.status !== 'closed');

        if (openChat) {
          const clientMsg = status === 'payment-approved'
            ? [
                `Ã¢Å“â€¦ Pagamento confirmado! Seu pedido foi aprovado! Ã°Å¸Å½â€°`,
                ``,
                `Ã°Å¸â€œÂ¦ Pedido: #${orderId}`,
                valorFormatado ? `Ã°Å¸â€™Â° Valor: ${valorFormatado}` : '',
                `Ã°Å¸Å¡Å¡ Em breve vocÃƒÂª receberÃƒÂ¡ as informaÃƒÂ§ÃƒÂµes de rastreio por email.`,
                ``,
                `Qualquer dÃƒÂºvida, estou por aqui! Ã°Å¸ËœÅ `,
              ].filter(Boolean).join('\n')
            : [
                `Ã¢ÂÅ’ Infelizmente seu pedido foi cancelado.`,
                `Pedido: #${orderId}`,
                ``,
                `Se quiser refazer o pedido ou tiver alguma dÃƒÂºvida, ÃƒÂ© sÃƒÂ³ falar comigo! Ã°Å¸ËœÅ `,
              ].join('\n');

          await lcStorage.createMessage({ chatId: openChat.id, sender: 'ai', content: clientMsg });
        }

        console.log(`[VTEX Hook] Ã¢Å“â€¦ Processado: visitante=${visitor.id} orderId=${orderId} status=${status}`);
      } catch (err: any) {
        console.error('[VTEX Hook] âŒ Erro ao processar webhook:', err.message);
      }
    });
  });

  // â”€â”€ Visitor Intelligence â€” Fase 1 & 2 & 3 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // #8 â€” Analytics: top pÃ¡ginas visitadas ANTES do primeiro chat
  router.get("/stats/pre-chat-pages", requireAuth, async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const [topPages, conversionRates] = await Promise.all([
        lcStorage.getPreChatTopPages(limit),
        lcStorage.getPageChatConversionRates(limit),
      ]);
      return res.json({ topPages, conversionRates });
    } catch (err: any) {
      console.error("[LiveChat] GET /stats/pre-chat-pages error:", err?.message);
      return res.status(500).json({ message: err?.message ?? "Erro interno" });
    }
  });

  // #10 â€” Timeline unificada do visitante
  router.get("/visitors/:id/timeline", requireAuth, async (req: Request, res: Response) => {
    try {
      const timeline = await lcStorage.getVisitorTimeline(p(req.params.id));
      return res.json(timeline);
    } catch (err: any) {
      console.error("[LiveChat] GET /visitors/:id/timeline error:", err?.message);
      return res.status(500).json({ message: err?.message ?? "Erro interno" });
    }
  });

  // #7 â€” Salvar aiBriefing manualmente (opcional â€” tambÃ©m gerado automaticamente)
  router.patch("/visitors/:id/briefing", requireAuth, async (req: Request, res: Response) => {
    try {
      const briefing = req.body;
      if (!briefing || typeof briefing !== "object") return res.status(400).json({ error: "Briefing invÃ¡lido" });
      await lcStorage.updateAiBriefing(p(req.params.id), briefing);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err?.message ?? "Erro interno" });
    }
  });

  // â”€â”€ Analytics AvanÃ§adas â€” Dashboard de EstatÃ­sticas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  router.get('/stats/activation-rate', requireAuth, async (req: Request, res: Response) => {
    try {
      const { dateFrom, dateTo } = req.query as Record<string, string | undefined>;
      return res.json(await lcStorage.getActivationRateStats(dateFrom, dateTo));
    } catch (err: any) { return res.status(500).json({ message: err?.message ?? 'Erro interno' }); }
  });

  router.get('/stats/containment', requireAuth, async (req: Request, res: Response) => {
    try {
      const { dateFrom, dateTo } = req.query as Record<string, string | undefined>;
      return res.json(await lcStorage.getContainmentRate(dateFrom, dateTo));
    } catch (err: any) { return res.status(500).json({ message: err?.message ?? 'Erro interno' }); }
  });

  router.get('/stats/ai-latency', requireAuth, async (req: Request, res: Response) => {
    try {
      const { dateFrom, dateTo } = req.query as Record<string, string | undefined>;
      return res.json(await lcStorage.getAiLatencyStats(dateFrom, dateTo));
    } catch (err: any) { return res.status(500).json({ message: err?.message ?? 'Erro interno' }); }
  });

  router.get('/stats/unhandled-intents', requireAuth, async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 15;
      return res.json(await lcStorage.getUnhandledIntents(limit));
    } catch (err: any) { return res.status(500).json({ message: err?.message ?? 'Erro interno' }); }
  });

  router.get('/stats/cohort', requireAuth, async (req: Request, res: Response) => {
    try {
      const weeks = parseInt(req.query.weeks as string) || 8;
      return res.json(await lcStorage.getCohortRetention(weeks));
    } catch (err: any) { return res.status(500).json({ message: err?.message ?? 'Erro interno' }); }
  });

  router.get('/stats/funnel', requireAuth, async (req: Request, res: Response) => {
    try {
      const { dateFrom, dateTo } = req.query as Record<string, string | undefined>;
      return res.json(await lcStorage.getConversionFunnel(dateFrom, dateTo));
    } catch (err: any) { return res.status(500).json({ message: err?.message ?? 'Erro interno' }); }
  });

  // ── Drill-down do funil: lista de visitantes de uma etapa específica ──────────
  // step: 'sessao' | 'mensagem' | 'dados' | 'crm'
  router.get('/stats/funnel-visitors', requireAuth, async (req: Request, res: Response) => {
    try {
      const { step, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
      if (!step) return res.status(400).json({ message: 'Parâmetro step obrigatório' });
      const visitors = await lcStorage.getFunnelStepVisitors(step, dateFrom, dateTo);
      return res.json(visitors);
    } catch (err: any) {
      console.error('[LiveChat] GET /stats/funnel-visitors error:', err?.message);
      return res.status(500).json({ message: err?.message ?? 'Erro interno' });
    }
  });

  router.get('/stats/lead-scoring', requireAuth, async (req: Request, res: Response) => {
    try {
      const { dateFrom, dateTo } = req.query as Record<string, string | undefined>;
      return res.json(await lcStorage.getLeadScoringDistribution(dateFrom, dateTo));
    } catch (err: any) { return res.status(500).json({ message: err?.message ?? 'Erro interno' }); }
  });

  // ── Backfill retroativo de rdCrmDealId (admin only) ─────────────────────────
  // Varre as notas históricas dos visitantes e preenche rdCrmDealId para que o
  // funil "Lead no CRM" contabilize os deals criados antes deste fix.
  router.post('/admin/backfill-crm-deal-ids', requireAuth, async (_req: Request, res: Response) => {
    try {
      const result = await (lcStorage as any).backfillRdCrmDealIds();
      return res.json(result);
    } catch (err: any) {
      console.error('[LiveChat] Backfill CRM DealId erro:', err?.message);
      return res.status(500).json({ message: err?.message ?? 'Erro interno' });
    }
  });

  // ── Sincronização Manual com CRM ─────────────────────────────────────────────
  // POST /api/livechat/visitors/:id/manual-crm-sync
  // Gera o relatório com IA e cria o card/contato/tarefa no RD CRM
  router.post('/visitors/:id/manual-crm-sync', requireAuth, async (req: Request, res: Response) => {
    const visitorId = req.params.id;
    const steps: { step: string; status: 'ok' | 'error' | 'skip'; detail?: string }[] = [];

    try {
      if (!isRdCrmConfigured()) {
        return res.status(400).json({ success: false, message: 'RD CRM não configurado. Verifique as credenciais no painel.' });
      }

      // ── 1. Carrega o visitante ──────────────────────────────────────────────
      const visitor = await lcStorage.getVisitorById(visitorId);
      if (!visitor) {
        return res.status(404).json({ success: false, message: 'Visitante não encontrado.' });
      }
      steps.push({ step: 'Visitante carregado', status: 'ok', detail: visitor.posVendaNome || visitor.name || 'Sem nome' });

      // ── 2. Carrega os chats + mensagens do visitante ───────────────────────
      const chats = await lcStorage.listChatsByVisitor(visitorId, 5);
      const latestChat = chats?.[0] ?? null;

      let transcricao = '';
      let chatId = latestChat?.id ?? null;

      if (chatId) {
        const msgs = await lcStorage.listMessagesByChat(chatId);
        transcricao = msgs
          .filter(m => !m.content.startsWith('[CNPJ_RESULT') && !m.content.startsWith('[CNPJ_CHECK'))
          .slice(-40)
          .map(m => {
            const who = m.sender === 'visitor' ? '[CLIENTE]' : '[FAGNER]';
            const clean = m.content
              .replace(/\[OUTCOME:(SALE|NO_SALE)\]/gi, '')
              .replace(/\[SCORE:\d+\]/gi, '')
              .replace(/\[STAGE:[^\]]+\]/gi, '')
              .replace(/\[POS_VENDA_DADOS:[\s\S]*?\]/gi, '')
              .replace(/\[MAQUINAS_DADOS:[\s\S]*?\]/gi, '')
              .replace(/\[PECAS_DADOS:[\s\S]*?\]/gi, '')
              .replace(/\[SYSTEM_ERROR:[^\]]*\]/gi, '')
              .replace(/\[LOG_OCULTO:[^\]]*\]/gi, '')
              .replace(/<br\s*\/?>/gi, ' ')
              .replace(/<\/?(strong|em|b|i|p|div|span)[^>]*>/gi, ' ')
              .replace(/\s{2,}/g, ' ')
              .trim();
            return clean ? `${who} ${clean}` : null;
          })
          .filter(Boolean)
          .join('\n');
        steps.push({ step: 'Histórico de mensagens carregado', status: 'ok', detail: `${msgs.length} mensagens` });
      } else {
        steps.push({ step: 'Histórico de mensagens', status: 'skip', detail: 'Nenhuma conversa encontrada' });
      }

      // ── 3. Detecta funil pelo pipelineStage do visitante ──────────────────
      const stage = (visitor.pipelineStage ?? '').toLowerCase();
      let funil: 'pos_venda' | 'maquinas' | 'pecas' | 'generico' = 'generico';
      if (stage.includes('pos_venda') || stage.includes('finalizado')) funil = 'pos_venda';
      else if (stage.includes('maquina')) funil = 'maquinas';
      else if (stage.includes('peca')) funil = 'pecas';
      // Fallback: detecta pelo conteúdo da conversa
      else if (transcricao.match(/máquina|envazadora|seladora|embalagem|orçamento/i)) funil = 'maquinas';
      else if (transcricao.match(/peça|reposição|conserto|assistência/i)) funil = 'pecas';
      else if (transcricao.match(/pós.?venda|nota fiscal|garantia|problema|defeito/i)) funil = 'pos_venda';
      steps.push({ step: 'Funil detectado', status: 'ok', detail: funil });

      // ── 4. Dados do cliente ────────────────────────────────────────────────
      const nome     = (visitor.posVendaNome  || visitor.name || 'Não identificado').trim();
      const telefone = (visitor.posVendaTelefone || '0000000000').trim();
      const email    = visitor.posVendaEmail   || null;
      const cnpjCpf  = visitor.posVendaCnpjCpf || null;
      const cnpjData = (visitor.posVendaCnpjData && typeof visitor.posVendaCnpjData === 'object')
        ? visitor.posVendaCnpjData : null;

      // Owner: pega via rodízio se configurado, senão env var
      const funil_key = funil === 'maquinas' ? 'maquinas' : funil === 'pecas' ? 'pecas' : 'pos_venda';
      const ownerId = await lcStorage.getNextOwnerForFunnel(funil_key).catch(() => null);

      // ── 5. Gera relatório com IA ───────────────────────────────────────────
      let relatorio = '';
      try {
        if (funil === 'maquinas') {
          relatorio = await generateMaquinasReport({
            nome, telefone, email, cnpjCpf: cnpjCpf ?? null,
            maquinaDesejada: (visitor as any).maquinaDesejada || 'Não informado',
            detalhes: transcricao ? transcricao.slice(0, 200) : undefined,
            produtoFabricado: (visitor as any).maquinaProdutoFabricado || undefined,
            volumeProducao: (visitor as any).maquinaVolumeProducao || undefined,
            qualificacaoSDR: (visitor as any).maquinaQualificacaoSDR || '2',
            clienteNovo: (visitor as any).maquinaClienteNovo || 'SIM',
            cnpjData,
            transcricaoCompleta: transcricao || undefined,
          });
        } else if (funil === 'pecas') {
          relatorio = await generatePecasReport({
            nome, telefone, email, cnpjCpf: cnpjCpf ?? null,
            pecaDesejada: (visitor as any).pecaDesejada || 'Não informado',
            detalhes: undefined,
            cnpjData,
            transcricaoCompleta: transcricao || undefined,
          });
        } else {
          relatorio = await generatePosVendaReport({
            nome, telefone, email, cnpjCpf: cnpjCpf ?? null,
            notaPedido: visitor.posVendaNotaPedido   || null,
            problema:   visitor.posVendaProblema     || 'Não informado',
            cnpjData,
            transcricaoCompleta: transcricao || undefined,
          });
        }
        steps.push({ step: 'Relatório gerado', status: 'ok', detail: `${relatorio.length} chars` });
      } catch (rptErr: any) {
        steps.push({ step: 'Relatório gerado', status: 'error', detail: rptErr.message });
        relatorio = `[Relatório gerado manualmente pelo operador — erro de IA: ${rptErr.message}]\n\nTranscrição:\n${transcricao}`;
      }

      // ── 6. Cria o card no CRM ─────────────────────────────────────────────
      let dealId: string;
      try {
        if (funil === 'maquinas') {
          dealId = await createMaquinasOS(visitorId, {
            nome, telefone, email, cnpjCpf: cnpjCpf ?? null,
            maquinaDesejada: (visitor as any).maquinaDesejada || 'Não informado',
            produtoFabricado: (visitor as any).maquinaProdutoFabricado || undefined,
            volumeProducao: (visitor as any).maquinaVolumeProducao || undefined,
            qualificacaoSDR: (visitor as any).maquinaQualificacaoSDR || '2',
            clienteNovo: (visitor as any).maquinaClienteNovo || 'SIM',
            cnpjData,
            ownerId: ownerId || undefined,
          }, relatorio);
        } else if (funil === 'pecas') {
          dealId = await createPecasOS(visitorId, {
            nome, telefone, email, cnpjCpf: cnpjCpf ?? null,
            pecaDesejada: (visitor as any).pecaDesejada || 'Não informado',
            cnpjData,
            ownerId: ownerId || undefined,
          }, relatorio);
        } else {
          dealId = await createPosVendaOS(visitorId, {
            nome, telefone, email, cnpjCpf: cnpjCpf ?? null,
            notaPedido: visitor.posVendaNotaPedido || null,
            problema: visitor.posVendaProblema || 'Triagem manual pelo operador',
            cnpjData,
            ownerId: ownerId || undefined,
          }, relatorio);
        }
        steps.push({ step: 'Card criado no CRM', status: 'ok', detail: `Deal ID: ${dealId}` });
      } catch (crmErr: any) {
        steps.push({ step: 'Card criado no CRM', status: 'error', detail: crmErr.message });
        return res.status(500).json({ success: false, message: `Erro ao criar card no CRM: ${crmErr.message}`, steps });
      }

      // ── 7. Adiciona nota no sistema interno com link para o deal ──────────
      try {
        const rdUrl = `https://crm.rdstation.com/app/deals/${dealId}`;
        const funilLabel = funil === 'maquinas' ? 'Máquinas' : funil === 'pecas' ? 'Peças' : 'Pós Venda';
        await lcStorage.addVisitorNote(
          visitorId,
          `Card CRM — ${funilLabel}`,
          `Card criado manualmente pelo operador no RD Station CRM.\nFunil: ${funilLabel} | Deal ID: ${dealId}\n${rdUrl}`
        );
        steps.push({ step: 'Nota registrada no sistema', status: 'ok', detail: 'Nota com link para o deal adicionada' });
      } catch (noteErr: any) {
        steps.push({ step: 'Nota registrada no sistema', status: 'skip', detail: `Não crítico: ${noteErr.message}` });
      }

      console.log(`[LiveChat] ✅ manual-crm-sync visitor=${visitorId} → dealId=${dealId} funil=${funil}`);
      return res.json({ success: true, dealId, funil, steps });

    } catch (err: any) {
      console.error('[LiveChat] manual-crm-sync erro:', err?.message);
      return res.status(500).json({ success: false, message: err?.message ?? 'Erro interno', steps });
    }
  });

  // â”€â”€ Upload de arquivo pelo agente (para enviar ao cliente) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  router.post("/upload-agent", requireAuth, (req: Request, res: Response, next: NextFunction) => {
    agentUpload.single("file")(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message ?? "Erro no upload" });
      }
      if (!req.file) {
        return res.status(400).json({ error: "Nenhum arquivo recebido" });
      }
      const filePath = `/uploads/${req.file.filename}`;
      // Monta URL absoluta — necessário para o widget VTEX (domínio diferente do backend)
      // BACKEND_URL deve ser setado na Railway: https://fagnertecfag-production.up.railway.app
      const rawBackend = process.env.BACKEND_URL
        ?? (process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : "");
      const backendBase = rawBackend.replace(/\/$/, "");
      const url = backendBase ? `${backendBase}${filePath}` : filePath;
      const mimeType = req.file.mimetype;
      const name = req.file.originalname;
      const size = req.file.size;
      console.log(`[LiveChat] ðŸ“Ž Agente fez upload: ${name} (${mimeType}) â†’ ${url}`);
      return res.json({ url, name, mimeType, size });
    });
  });

  // Mount all routes under /api/livechat
  app.use("/api/livechat", router);

  console.log("[LiveChat] âœ… Rotas /api/livechat/* registradas");
}
