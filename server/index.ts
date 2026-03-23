import "dotenv/config";

// ─── Global error/signal handlers ────────────────────────────────────────────
// Captura erros e sinais para logs no Railway — sem process.exit desnecessario
process.on("uncaughtException", (err) => {
  console.error("CRASH uncaughtException:", err.message, err.stack);
});
process.on("unhandledRejection", (reason) => {
  console.error("CRASH unhandledRejection:", reason);
});
process.on("SIGTERM", () => {
  console.log("[SIGNAL] SIGTERM recebido — Railway esta encerrando o processo");
  process.exit(0);
});
process.on("SIGINT", () => {
  console.log("[SIGNAL] SIGINT recebido");
  process.exit(0);
});
// Log de memoria a cada 30s para detectar OOM
setInterval(() => {
  const m = process.memoryUsage();
  console.log(`[MEM] rss:${Math.round(m.rss/1024/1024)}MB heap:${Math.round(m.heapUsed/1024/1024)}/${Math.round(m.heapTotal/1024/1024)}MB`);
}, 30_000).unref(); // .unref() para nao manter o processo vivo por causa do interval

import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import session from "express-session";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { storage } from "./storage.js";
import db from "./db.js";

import {
  initOrchestrator,
  handleWebhook,
  startFollowUpLoop,
  getAllSessionsForDashboard,
  getSchedule,
  setSchedule,
} from "./fagner/fagnerOrchestrator.js";
import { serializeSession, deleteSession, getSession } from "./fagner/sessionManager.js";
import {
  validateWebhookToken,
  listFlows,
  listEmployees,
  listTemplates,
  isConfigured as rdIsConfigured,
} from "./fagner/rdConversasService.js";

// ─── In-memory log buffer (circular, max 500 entries) ────────────────────────
const LOG_BUFFER: { message: string; level: string; timestamp: string }[] = [];
const LOG_WS_CLIENTS = new Set<WebSocket>();

// Helper: normaliza param do Express v5 (string | string[]) → string
function p(param: string | string[]): string {
  return Array.isArray(param) ? param[0] : param;
}

function emitLog(message: string, level: "INFO" | "WARN" | "ERROR" | "SUCCESS" = "INFO") {
  const entry = { message, level, timestamp: new Date().toISOString() };
  LOG_BUFFER.push(entry);
  if (LOG_BUFFER.length > 500) LOG_BUFFER.shift();
  const payload = JSON.stringify(entry);
  Array.from(LOG_WS_CLIENTS).forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Upload storage ───────────────────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, "..", "data", "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const multerStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`),
});
const upload = multer({ storage: multerStorage });

// ─── App ──────────────────────────────────────────────────────────────────────
const app = express();

// ─── Trust Proxy ──────────────────────────────────────────────────────────────
// OBRIGATÓRIO no Railway (e qualquer PaaS com proxy reverso).
// Sem isso, req.secure === false mesmo com HTTPS, e o cookie "secure: true"
// nunca é enviado pelo browser → login falha silenciosamente em produção.
app.set("trust proxy", 1);

// ─── Global Request Logger (diagnóstico Railway) ─────────────────────────────
// Loga TODOS os requests que chegam ao servidor. Em produção, se nenhum request
// aparecer nos logs, o problema é no proxy/networking do Railway, não no código.
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[REQ] ${req.method} ${req.url} from=${req.ip} origin=${req.headers.origin ?? "none"}`);
  next();
});

// ─── CORS manual ─────────────────────────────────────────────────────────────
// NÃO usamos o pacote 'cors' pois ele tem incompatibilidades com Express v5.
// Implementação manual garante que os headers SEMPRE sejam adicionados,
// inclusive em respostas de erro (4xx/5xx) e preflights OPTIONS.
function getAllowedOrigin(origin: string | undefined): string | null {
  if (!origin) return null; // same-origin, Postman, etc.
  const allowed = [
    process.env.FRONTEND_URL,        // ex: https://fagner-tecfag.vercel.app
    /\.vercel\.app$/,
    /\.railway\.app$/,
    /^https?:\/\/localhost(:\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  ].some((p) => {
    if (!p) return false;
    return typeof p === "string" ? origin === p : p.test(origin);
  });
  return allowed ? origin : null;
}

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin as string | undefined;
  const allowedOrigin = getAllowedOrigin(origin);

  // Sempre adiciona Vary para CDNs não cachearem resposta errada
  res.setHeader("Vary", "Origin");

  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
    res.setHeader("Access-Control-Max-Age", "86400"); // cache preflight por 24h
  } else if (origin) {
    console.warn(`[CORS] Origem não permitida: ${origin}`);
  }

  // Responde imediatamente ao preflight OPTIONS
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  next();
});



app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ─── SQLite Session Store ──────────────────────────────────────────────────────
// Substitui o MemoryStore padrão (volátil) por um store SQLite persistente.
// Isso garante que as sessões sobrevivam a restarts do container no Railway.
import { Store } from "express-session";

class SqliteSessionStore extends Store {
  private db: typeof import("better-sqlite3").prototype;

  constructor(sqliteDb: any) {
    super();
    this.db = sqliteDb;
    // Cria tabela de sessões se não existir
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS http_sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expired INTEGER NOT NULL
      )
    `);
    // Limpa sessões expiradas a cada 15 min
    setInterval(() => {
      try {
        this.db.prepare("DELETE FROM http_sessions WHERE expired < ?").run(Date.now());
      } catch {}
    }, 15 * 60 * 1000).unref();
  }

  get(sid: string, cb: (err?: any, session?: session.SessionData | null) => void) {
    try {
      const row = this.db.prepare("SELECT sess FROM http_sessions WHERE sid = ? AND expired > ?").get(sid, Date.now()) as { sess: string } | undefined;
      cb(null, row ? JSON.parse(row.sess) : null);
    } catch (e) { cb(e); }
  }

  set(sid: string, sessionData: session.SessionData, cb?: (err?: any) => void) {
    try {
      const maxAge = sessionData.cookie?.maxAge ?? 7 * 24 * 60 * 60 * 1000;
      const expired = Date.now() + maxAge;
      this.db.prepare(
        "INSERT OR REPLACE INTO http_sessions (sid, sess, expired) VALUES (?, ?, ?)"
      ).run(sid, JSON.stringify(sessionData), expired);
      cb?.();
    } catch (e) { cb?.(e); }
  }

  destroy(sid: string, cb?: (err?: any) => void) {
    try {
      this.db.prepare("DELETE FROM http_sessions WHERE sid = ?").run(sid);
      cb?.();
    } catch (e) { cb?.(e); }
  }

  touch(sid: string, sessionData: session.SessionData, cb?: (err?: any) => void) {
    try {
      const maxAge = sessionData.cookie?.maxAge ?? 7 * 24 * 60 * 60 * 1000;
      const expired = Date.now() + maxAge;
      this.db.prepare("UPDATE http_sessions SET expired = ? WHERE sid = ?").run(expired, sid);
      cb?.();
    } catch (e) { cb?.(e); }
  }
}

// Session
const isProduction = process.env.NODE_ENV === "production";
app.use(
  session({
    store: new SqliteSessionStore(db),
    secret: process.env.SESSION_SECRET ?? "tecfag-secret-2024",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // Em produção (cross-domain Vercel→Railway): secure=true + sameSite="none" são OBRIGATÓRIOS
      // para que o browser envie o cookie cross-origin com credentials.
      // sem sameSite="none" o browser bloqueia o cookie silenciosamente.
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

// Serve uploaded files
app.use("/uploads", express.static(UPLOADS_DIR));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!(req.session as any).userId) {
    return res.status(401).json({ message: "Não autenticado" });
  }
  next();
}

// ─── Health check (público — usado pelo Railway) ──────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ─── Ping (ultra-leve, sem DB, sem session — diagnóstico de 502) ──────────────
app.get("/api/ping", (_req, res) => {
  res.json({ pong: true, ts: Date.now(), uptime: process.uptime() });
});

// ─── Auth routes ─────────────────────────────────────────────────────────────

// POST /api/login
app.post("/api/login", (req, res) => {
  const t0 = Date.now();
  console.log(`[LOGIN] ► Request de ${req.ip} | origin: ${req.headers.origin} | email: ${req.body?.email}`);

  const { email, password } = req.body as { email: string; password: string };
  if (!email || !password) {
    console.log(`[LOGIN] ✗ 400 — campos faltando (${Date.now() - t0}ms)`);
    return res.status(400).json({ message: "Email e senha são obrigatórios" });
  }

  const user = storage.getUserByEmail(email);
  if (!user) {
    console.log(`[LOGIN] ✗ 401 — email não encontrado: ${email} (${Date.now() - t0}ms)`);
    return res.status(401).json({ message: "E-mail ou senha incorretos" });
  }

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) {
    console.log(`[LOGIN] ✗ 401 — senha incorreta para ${email} (${Date.now() - t0}ms)`);
    return res.status(401).json({ message: "E-mail ou senha incorretos" });
  }

  (req.session as any).userId = user.id;
  req.session.save((err) => {
    if (err) {
      console.error(`[LOGIN] ✗ 500 — erro ao salvar sessão: ${err.message} (${Date.now() - t0}ms)`);
      return res.status(500).json({ message: "Erro interno ao criar sessão" });
    }
    const { password: _pw, ...safeUser } = user;
    console.log(`[LOGIN] ✓ 200 — ${email} logado com sucesso (${Date.now() - t0}ms)`);
    return res.json({ user: safeUser });
  });
});

// POST /api/logout
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {});
  res.json({ ok: true });
});

// GET /api/me
app.get("/api/me", (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) return res.status(401).json({ message: "Não autenticado" });

  const user = storage.getUserSafeById(userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ message: "Sessão inválida" });
  }
  return res.json(user);
});

// ─── User routes ─────────────────────────────────────────────────────────────

// GET /api/users
app.get("/api/users", requireAuth, (_req, res) => {
  res.json(storage.listUsers());
});

// POST /api/users
app.post("/api/users", requireAuth, (req, res) => {
  const { name, email, username, password } = req.body;
  if (!name || !email || !username || !password) {
    return res.status(400).json({ message: "Todos os campos são obrigatórios" });
  }

  if (storage.userExistsByEmailOrUsername(email, username)) {
    return res.status(409).json({ message: "E-mail ou nome de usuário já cadastrado" });
  }

  const hashed = bcrypt.hashSync(password, 10);
  const user = storage.createUser({ name, email, username, password: hashed });
  return res.status(201).json(user);
});

// PATCH /api/users/:id
app.patch("/api/users/:id", requireAuth, (req, res) => {
  const id = p(req.params.id);
  const { name, email, username, password } = req.body;

  const existing = storage.getUserById(id);
  if (!existing) return res.status(404).json({ message: "Usuário não encontrado" });

  const newPassword = password ? bcrypt.hashSync(password, 10) : undefined;
  const updated = storage.updateUser(id, { name, email, username, password: newPassword });
  return res.json(updated);
});


// DELETE /api/users/:id
app.delete("/api/users/:id", requireAuth, (req, res) => {
  const deleted = storage.deleteUser(p(req.params.id));
  if (!deleted) return res.status(404).json({ message: "Usuário não encontrado" });
  return res.json({ ok: true });
});

// ─── Settings routes ──────────────────────────────────────────────────────────

// GET /api/settings/:key
app.get("/api/settings/:key", requireAuth, (req, res) => {
  const value = storage.getSettingParsed(String(p(req.params.key)));
  return res.json(value);
});

// POST /api/settings
app.post("/api/settings", requireAuth, (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ message: "Chave obrigatória" });
  storage.setSetting(key, value ?? "");
  return res.json({ ok: true });
});

// ─── Sessions routes ──────────────────────────────────────────────────────────

// GET /api/sessions
app.get("/api/sessions", requireAuth, (req, res) => {
  const archived = req.query.archived === "true" ? "true" : "false";
  return res.json(storage.listSessions(archived));
});

// GET /api/sessions/:id/messages
app.get("/api/sessions/:id/messages", requireAuth, (req, res) => {
  return res.json(storage.listMessagesBySession(p(req.params.id)));
});

// GET /api/sessions/:id/logs
app.get("/api/sessions/:id/logs", requireAuth, (req, res) => {
  return res.json(storage.listLogsBySession(p(req.params.id)));
});

// POST /api/sessions/:id/archive
app.post("/api/sessions/:id/archive", requireAuth, (req, res) => {
  storage.archiveSession(p(req.params.id));
  return res.json({ ok: true });
});

// DELETE /api/sessions/delete-all
app.delete("/api/sessions/delete-all", requireAuth, (_req, res) => {
  storage.deleteArchivedSessions();
  return res.json({ ok: true });
});

// ─── Bot status routes ────────────────────────────────────────────────────────

let botStatus = { status: "STOPPED" };
let aiPaused = false;

// GET /api/bot/status
app.get("/api/bot/status", requireAuth, (_req, res) => {
  return res.json(botStatus);
});

// POST /api/bot/toggle
app.post("/api/bot/toggle", requireAuth, (req, res) => {
  const { action } = req.body;
  botStatus.status = action === "start" ? "RUNNING" : "STOPPED";
  return res.json(botStatus);
});

// GET /api/bot/ai-status
app.get("/api/bot/ai-status", requireAuth, (_req, res) => {
  return res.json({ paused: aiPaused });
});

// POST /api/bot/ai-status
app.post("/api/bot/ai-status", requireAuth, (req, res) => {
  aiPaused = req.body.paused ?? aiPaused;
  return res.json({ paused: aiPaused });
});

// ── Interceptador de mensagens de simulação ────────────────────────────────────
const simPendingMessages = new Map<string, string[]>();

(global as any).__fagnerSimInterceptor = (contactId: string, text: string): boolean => {
  if (!contactId.startsWith("sim-")) return false;
  const list = simPendingMessages.get(contactId) ?? [];
  list.push(text);
  simPendingMessages.set(contactId, list);
  return true;
};

// POST /api/bot/simulate
app.post("/api/bot/simulate", requireAuth, async (req: Request, res: Response) => {
  const userId       = (req.session as any)?.userId ?? "anon";
  const simContactId = `sim-${userId}`;

  const { message, mediaBase64, mediaMimeType } = req.body as {
    message?: string;
    mediaBase64?: string;
    mediaMimeType?: string;
  };

  const textMsg = (message ?? "").trim() || (mediaMimeType?.startsWith("audio") ? "[áudio]" : "[imagem]");
  if (!textMsg) return res.status(400).json({ message: "Mensagem ou mídia obrigatória" });

  // ── Auto-reset: se a sessão de simulação estiver concluída, reinicia automaticamente ──
  // Isso resolve o bug onde o chat quebra após encerrar um fluxo no "Ao Vivo".
  // session.isCompleted = true bloqueia processContact(), resultando em resposta vazia.
  const existingSimSession = getSession(simContactId);
  if (existingSimSession?.isCompleted) {
    deleteSession(simContactId);
    simPendingMessages.delete(simContactId);
    emitLog(`[Simulate] Sessão ${simContactId} auto-resetada (fluxo anterior concluído). Nova sessão iniciada.`, "INFO");
  }

  simPendingMessages.set(simContactId, []);

  try {
    await handleWebhook({
      contactId:   simContactId,
      message:     textMsg,
      phone:       "11900000000",
      contactName: `Simulador (${userId})`,
      ...(mediaBase64 && mediaMimeType
        ? { mediaUrl: `data:${mediaMimeType};base64,${mediaBase64.replace(/^data:[^,]+,/, "")}`, mimeType: mediaMimeType }
        : {}),
    });

    const replies = simPendingMessages.get(simContactId) ?? [];
    simPendingMessages.set(simContactId, []);

    // Mensagem de erro melhorada: distingue entre key ausente e outros problemas
    const apiKey = (storage.getSettingParsed<string>("gemini_api_key")) ?? process.env.GEMINI_API_KEY ?? "";
    const fallbackMsg = !apiKey
      ? "⏳ O Fagner não respondeu porque a GEMINI_API_KEY não está configurada. Acesse Configurações → Integrações → API Keys."
      : "⏳ O Fagner não gerou resposta desta vez. Tente enviar a mensagem novamente.";
    const finalReplies = replies.length > 0 ? replies : [fallbackMsg];

    const simSession = getAllSessionsForDashboard().find((s) => s.contactId === simContactId);
    const sessionInfo = simSession ? {
      flow:          simSession.currentFlow,
      subFlow:       simSession.currentSubFlow,
      flowStep:      simSession.flowStep,
      mood:          simSession.sessionMood,
      isCompleted:   simSession.isCompleted,
      isPaused:      simSession.isPaused,
      hasCnpjData:   !!(simSession as any).cnpjApiData,
      creditEligible:(simSession as any).flowData?.creditEligible,
      hasProtests:   (simSession as any).flowData?.hasProtests,
      companyName:   (simSession as any).flowData?.companyName,
      clientCnpj:    (simSession as any).flowData?.clientCnpj,
    } : null;

    return res.json({ response: finalReplies.join("\n\n"), replies: finalReplies, tokens: 0, session: sessionInfo });

  } catch (err: any) {
    emitLog(`[Simulate] Erro: ${err?.message}`, "ERROR");
    return res.status(500).json({ message: "Erro no pipeline do Fagner", detail: err?.message });
  }
});

// GET /api/bot/simulate/session
app.get("/api/bot/simulate/session", requireAuth, (req: Request, res: Response) => {
  const userId      = (req.session as any)?.userId ?? "anon";
  const simContactId = `sim-${userId}`;
  const simSession   = getAllSessionsForDashboard().find((s) => s.contactId === simContactId);
  return res.json(simSession ? serializeSession(simSession) : null);
});

// DELETE /api/bot/simulate/session
app.delete("/api/bot/simulate/session", requireAuth, (req: Request, res: Response) => {
  const userId       = (req.session as any)?.userId ?? "anon";
  const simContactId = `sim-${userId}`;
  deleteSession(simContactId); // usa import estático (correção: require() falha em ES Modules)
  simPendingMessages.delete(simContactId);
  emitLog(`[Simulate] Sessão ${simContactId} resetada manualmente.`, "INFO");
  return res.json({ ok: true });
});

// ─── Dashboard routes ─────────────────────────────────────────────────────────

// GET /api/dashboard/stats
app.get("/api/dashboard/stats", requireAuth, (_req, res) => {
  return res.json(storage.getDashboardStats());
});

// GET /api/dashboard/leads-by-day
app.get("/api/dashboard/leads-by-day", requireAuth, (_req, res) => {
  return res.json(storage.getLeadsByDay());
});

// GET /api/dashboard/leads-by-operator
app.get("/api/dashboard/leads-by-operator", requireAuth, (_req, res) => {
  return res.json(storage.getLeadsByOperator());
});

// ─── Documents routes ─────────────────────────────────────────────────────────

// GET /api/documents
app.get("/api/documents", requireAuth, (_req, res) => {
  return res.json(storage.listDocuments());
});

// POST /api/documents (multipart)
app.post("/api/documents", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Arquivo obrigatório" });

  const { name, type, folderId } = req.body;
  const doc = storage.createDocument({
    name: name || req.file.originalname,
    type: type || "knowledge",
    mimeType: req.file.mimetype,
    filePath: `/uploads/${req.file.filename}`,
    folderId: folderId || null,
  });

  return res.status(201).json(doc);
});

// GET /api/documents/:id
app.get("/api/documents/:id", requireAuth, (req, res) => {
  const doc = storage.getDocumentById(p(req.params.id));
  if (!doc) return res.status(404).json({ message: "Documento não encontrado" });
  return res.json(doc);
});

// PATCH /api/documents/:id
app.patch("/api/documents/:id", requireAuth, (req, res) => {
  const { name, paused, folderId } = req.body;
  const doc = storage.updateDocument(p(req.params.id), { name, paused, folderId });
  if (!doc) return res.status(404).json({ message: "Documento não encontrado" });
  return res.json(doc);
});

// DELETE /api/documents/:id
app.delete("/api/documents/:id", requireAuth, (req, res) => {
  const doc = storage.getDocumentById(p(req.params.id));
  if (!doc) return res.status(404).json({ message: "Documento não encontrado" });

  try {
    const filePath = path.join(__dirname, "..", doc.filePath.replace(/^\//, ""));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {}

  storage.deleteDocument(p(req.params.id));
  return res.json({ ok: true });
});

// POST /api/documents/bulk
app.post("/api/documents/bulk", requireAuth, (req, res) => {
  const { ids, action, value } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ message: "ids inválidos" });

  if (action === "delete") {
    for (const id of ids) {
      const doc = storage.getDocumentById(id);
      if (doc) {
        try {
          const filePath = path.join(__dirname, "..", doc.filePath.replace(/^\//, ""));
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch {}
      }
    }
    storage.bulkDeleteDocuments(ids);
  } else if (action === "move") {
    storage.bulkMoveDocuments(ids, value ?? null);
  } else if (action === "toggle-paused") {
    storage.bulkTogglePausedDocuments(ids);
  }

  return res.json({ ok: true });
});

// ─── Folders routes ───────────────────────────────────────────────────────────

// GET /api/folders
app.get("/api/folders", requireAuth, (_req, res) => {
  return res.json(storage.listFolders());
});

// POST /api/folders
app.post("/api/folders", requireAuth, (req, res) => {
  const { name, parentId } = req.body;
  if (!name) return res.status(400).json({ message: "Nome obrigatório" });
  return res.status(201).json(storage.createFolder({ name, parentId }));
});

// PATCH /api/folders/:id
app.patch("/api/folders/:id", requireAuth, (req, res) => {
  const folder = storage.getFolderById(p(req.params.id));
  if (!folder) return res.status(404).json({ message: "Pasta não encontrada" });
  return res.json(storage.updateFolder(p(req.params.id), req.body.name ?? folder.name));
});

// DELETE /api/folders/:id
app.delete("/api/folders/:id", requireAuth, (req, res) => {
  storage.deleteFolder(p(req.params.id));
  return res.json({ ok: true });
});

// ─── Fagner — Webhook RD Conversas ──────────────────────────────────────────

// POST /api/rd/webhook
app.post("/api/rd/webhook", async (req: Request, res: Response) => {
  const token =
    (req.headers["x-webhook-token"] ??
     req.headers["authorization"]?.replace("Bearer ", "") ??
     req.query.token ?? "") as string;

  if (!validateWebhookToken(token)) {
    return res.status(401).json({ message: "Token inválido" });
  }

  res.status(200).json({ ok: true });

  const body = req.body as any;
  setImmediate(async () => {
    try {
      const payload = {
        contactId:   body.contact_id ?? body.contactId ?? body.customer_id ?? body.id ?? "",
        message:     body.message?.text ?? body.text ?? body.message ?? "",
        mediaUrl:    body.message?.media_url ?? body.media_url ?? body.mediaUrl ?? "",
        mimeType:    body.message?.mime_type ?? body.mime_type ?? body.mimeType ?? "",
        phone:       body.contact?.phone ?? body.contact?.cel_phone ?? body.phone ?? "",
        contactName: body.contact?.name ?? body.contact?.full_name ?? body.contactName ?? "",
      };

      if (!payload.contactId) {
        emitLog("[Webhook] Payload sem contactId ignorado", "WARN");
        return;
      }

      // ── Whitelist de teste: números permitidos durante fase de testes ──────────
      // Configurada via ENV (RD_TEST_WHITELIST) ou settings do banco (fagner_whitelist).
      // Formato: números separados por vírgula, somente dígitos. Ex: "5514998364338"
      // Para liberar para todos: deixar vazia ou não configurar.
      const whitelistEnv = (process.env.RD_TEST_WHITELIST ?? "").split(",").map((n) => n.trim()).filter(Boolean);
      const whitelistDb = (() => {
        try {
          const raw = db.prepare("SELECT value FROM settings WHERE key = 'fagner_whitelist'").get() as { value?: string } | undefined;
          if (!raw?.value) return [];
          const parsed = JSON.parse(raw.value);
          return Array.isArray(parsed) ? parsed.map(String) : String(parsed).split(",").map((n: string) => n.trim()).filter(Boolean);
        } catch { return []; }
      })();
      const whitelist = Array.from(new Set([...whitelistEnv, ...whitelistDb]));

      if (whitelist.length > 0) {
        const phoneDigits = payload.phone.replace(/\D/g, "");
        const isAllowed = whitelist.some((n) => phoneDigits.endsWith(n.replace(/\D/g, "")) || n.replace(/\D/g, "").endsWith(phoneDigits));
        if (!isAllowed) {
          emitLog(`[Webhook] 🚫 Número ${payload.phone || payload.contactId} fora da whitelist de teste — ignorado.`, "WARN");
          return;
        }
      }

      emitLog(`[Webhook] Mensagem de ${payload.contactId} (${payload.phone}): "${(payload.message ?? "").slice(0, 60)}"`, "INFO");
      await handleWebhook(payload);
    } catch (err: any) {
      emitLog(`[Webhook] Erro ao processar: ${err?.message}`, "ERROR");
    }
  });
});

// POST /api/rd/webhook/test
app.post("/api/rd/webhook/test", requireAuth, async (req: Request, res: Response) => {
  const payload = {
    contactId: req.body.contactId ?? `test-${uuidv4().slice(0, 8)}`,
    message:   req.body.message ?? "Olá, quero saber mais sobre as peças da Tecfag",
    phone:     req.body.phone ?? "",
    contactName: req.body.contactName ?? "Cliente Teste",
  };
  emitLog(`[Webhook Test] Simulando mensagem para ${payload.contactId}`, "INFO");
  await handleWebhook(payload);
  return res.json({ ok: true, contactId: payload.contactId });
});

// ─── Fagner — Rotas de Sessão (Dashboard) ─────────────────────────────────────

// GET /api/fagner/sessions
app.get("/api/fagner/sessions", requireAuth, (_req, res) => {
  return res.json(getAllSessionsForDashboard().map(serializeSession));
});

// GET /api/fagner/sessions/:id
app.get("/api/fagner/sessions/:id", requireAuth, (req, res) => {
  const sessions = getAllSessionsForDashboard();
  const s = sessions.find((s) => s.contactId === p(req.params.id));
  if (!s) return res.status(404).json({ message: "Sessão não encontrada" });
  return res.json(serializeSession(s));
});

// POST /api/fagner/sessions/:id/pause
app.post("/api/fagner/sessions/:id/pause", requireAuth, (req, res) => {
  const sessions = getAllSessionsForDashboard();
  const s = sessions.find((s) => s.contactId === p(req.params.id));
  if (!s) return res.status(404).json({ message: "Sessão não encontrada" });
  s.isPaused = !s.isPaused;
  emitLog(`[Dashboard] Sessão ${p(req.params.id)} ${s.isPaused ? "pausada" : "retomada"} manualmente.`, "INFO");
  return res.json({ ok: true, isPaused: s.isPaused });
});

// ─── Fagner — Horário de Atendimento ────────────────────────────────────────────

// GET /api/fagner/schedule
app.get("/api/fagner/schedule", requireAuth, (_req, res) => {
  return res.json(getSchedule());
});

// POST /api/fagner/schedule
app.post("/api/fagner/schedule", requireAuth, (req: Request, res: Response) => {
  const body = req.body as any;
  const config = {
    enabled:         typeof body.enabled === "boolean" ? body.enabled : true,
    weekdays:        Array.isArray(body.weekdays) ? body.weekdays : [1,2,3,4,5],
    startHour:       typeof body.startHour === "number" ? body.startHour : 8,
    endHour:         typeof body.endHour === "number" ? body.endHour : 18,
    timezone:        body.timezone ?? "America/Sao_Paulo",
    offHoursMessage: body.offHoursMessage ?? "",
  };
  setSchedule(config);
  storage.setSetting("fagner_schedule", config);
  emitLog(`[Horário] Config: ${config.startHour}h–${config.endHour}h dias ${config.weekdays.join(",")} ativo=${config.enabled}`, "INFO");
  return res.json({ ok: true, schedule: config });
});

// ─── Fagner — Operadores por Fluxo ──────────────────────────────────────────────

// GET /api/fagner/operators
app.get("/api/fagner/operators", requireAuth, (_req, res) => {
  const raw = storage.getSettingParsed("fagner_operators");
  if (!raw) {
    return res.json({
      PECAS:         [{ name: "Comercial Peças",       id: "op-pecas" }],
      MAQUINAS:      [{ name: "Comercial Máquinas",    id: "op-maquinas" }],
      PERSONNALITE:  [{ name: "Comercial Personnalite",id: "op-personnalite" }],
      "2A_BOLETO":   [{ name: "Jeisa",                 id: "op-jeisa" }],
      "2B_NF":       [{ name: "Jeisa",                 id: "op-jeisa" }],
      "2C_OUTROS":   [{ name: "Samara",                id: "op-samara" }],
      "3_AT":        [{ name: "Atendimento Técnico",   id: "op-tecnico" }],
      "4A_RASTREAR": [{ name: "Pós Venda",             id: "op-posvenda" }],
      "4B_NF":       [{ name: "Pós Venda",             id: "op-posvenda" }],
      "5A_CLIENTE":  [{ name: "Atendimento Geral",     id: "op-atendimento" }],
    });
  }
  return res.json(raw);
});

// POST /api/fagner/operators
app.post("/api/fagner/operators", requireAuth, (req: Request, res: Response) => {
  const ops = req.body as Record<string, { name: string; id: string }[]>;
  if (!ops || typeof ops !== "object") {
    return res.status(400).json({ message: "Payload inválido" });
  }
  try {
    storage.setSetting("fagner_operators", ops);
    emitLog("[Operadores] Configuração atualizada.", "INFO");
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
});

// ─── RD Conversas — Endpoints auxiliares ──────────────────────────────────────

// GET /api/rd-conversas/status — verifica se o token está configurado
app.get("/api/rd-conversas/status", requireAuth, (_req, res) => {
  const token = process.env.RD_CONVERSAS_TOKEN ?? storage.getSettingParsed<string>("rd_conversas_token") ?? "";
  const integration = process.env.RD_CONVERSAS_INTEGRATION ?? storage.getSettingParsed<string>("rd_conversas_integration") ?? "";
  const whitelist = storage.getSettingParsed<string[]>("fagner_whitelist") ?? [];
  const humanFlowId = storage.getSettingParsed<string>("fagner_rd_human_flow_id") ?? "";
  return res.json({
    configured: !!token,
    hasIntegration: !!integration,
    integration,
    whitelistCount: whitelist.length,
    whitelist,
    humanFlowId,
  });
});

// POST /api/rd-conversas/settings — salva token, integration, whitelist e flowId
app.post("/api/rd-conversas/settings", requireAuth, (req: Request, res: Response) => {
  const { token, integration, whitelist, humanFlowId, departmentMap } = req.body;
  if (token !== undefined) {
    storage.setSetting("rd_conversas_token", token);
    // Também seta no process.env para uso imediato sem restart
    process.env.RD_CONVERSAS_TOKEN = token;
  }
  if (integration !== undefined) {
    storage.setSetting("rd_conversas_integration", integration);
    process.env.RD_CONVERSAS_INTEGRATION = integration;
  }
  if (whitelist !== undefined) {
    storage.setSetting("fagner_whitelist", Array.isArray(whitelist) ? whitelist : String(whitelist).split(",").map((n: string) => n.trim()).filter(Boolean));
  }
  if (humanFlowId !== undefined) {
    storage.setSetting("fagner_rd_human_flow_id", humanFlowId);
  }
  if (departmentMap !== undefined) {
    storage.setSetting("fagner_department_map", departmentMap);
  }
  emitLog("[RD Conversas] Configurações atualizadas.", "INFO");
  return res.json({ ok: true });
});

// GET /api/rd-conversas/flows — lista fluxos disponíveis no RD Conversas
app.get("/api/rd-conversas/flows", requireAuth, async (_req, res) => {
  try {
    const flows = await listFlows();
    return res.json(flows);
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
});

// GET /api/rd-conversas/employees — lista operadores cadastrados no RD Conversas
app.get("/api/rd-conversas/employees", requireAuth, async (_req, res) => {
  try {
    const employees = await listEmployees();
    return res.json(employees);
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
});

// GET /api/rd-conversas/templates — lista templates de mensagem disponíveis
app.get("/api/rd-conversas/templates", requireAuth, async (_req, res) => {
  try {
    const templates = await listTemplates();
    return res.json(templates);
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
});



// ─── Round-Robin Peças — endpoints de controle ────────────────────────────────

// GET /api/rd-conversas/pecas-rr
app.get("/api/rd-conversas/pecas-rr", requireAuth, (_req, res) => {
  const SECTORS = ["Tecfag Peças", "Tecfag Peças 2"];
  try {
    const raw = db.prepare("SELECT value FROM settings WHERE key = 'fagner_pecas_rr_index'").get() as { value?: string } | undefined;
    const idx = parseInt(raw?.value ?? "0", 10) || 0;
    return res.json({
      currentIndex: idx,
      nextSector: SECTORS[idx % SECTORS.length],
      sectors: SECTORS,
    });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
});

// POST /api/rd-conversas/pecas-rr/reset — força próximo setor
app.post("/api/rd-conversas/pecas-rr/reset", requireAuth, (req: Request, res: Response) => {
  const SECTORS = ["Tecfag Peças", "Tecfag Peças 2"];
  const { index } = req.body as { index?: number };
  const newIndex = typeof index === "number" ? (index % SECTORS.length) : 0;
  try {
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('fagner_pecas_rr_index', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run(String(newIndex));
    emitLog(`[Round-Robin Peças] Contador ajustado para ${newIndex} → próximo: ${SECTORS[newIndex]}`, "INFO");
    return res.json({ ok: true, nextSector: SECTORS[newIndex] });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
});

// ─── RD CRM stub routes ───────────────────────────────────────────────────────


app.get("/api/rd-crm/roundrobin", requireAuth, (_req, res) => {
  const val = storage.getSettingParsed("rd_roundrobin");
  return res.json(val || { mode: "fixed", fixedOwnerId: "", users: [], currentIndex: 0 });
});

app.post("/api/rd-crm/roundrobin", requireAuth, (req, res) => {
  storage.setSetting("rd_roundrobin", req.body);
  return res.json({ ok: true });
});

app.post("/api/rd-crm/test", requireAuth, (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ message: "Token obrigatório" });
  return res.json({ ok: true, message: "Token recebido. Verificação real requer conexão com RD Station." });
});

app.post("/api/rd-crm/refresh-token", requireAuth, (_req, res) => {
  return res.json({ ok: true, message: "Renovação de token requer configuração OAuth2 completa." });
});

app.get("/api/rd-crm/pipelines", requireAuth, (_req, res) => res.json([]));
app.get("/api/rd-crm/pipelines/:id/stages", requireAuth, (_req, res) => res.json([]));
app.get("/api/rd-crm/custom-fields", requireAuth, (_req, res) => res.json([]));
app.get("/api/rd-crm/users", requireAuth, (_req, res) => res.json([]));

// ─── API Costs routes ─────────────────────────────────────────────────────────

// GET /api/costs
app.get("/api/costs", requireAuth, (req, res) => {
  const { service, period } = req.query as { service?: string; period?: string };
  return res.json(storage.listCosts({
    service,
    period: period as "day" | "week" | "month" | "all" | undefined,
  }));
});

// GET /api/costs/summary
app.get("/api/costs/summary", requireAuth, (_req, res) => {
  return res.json(storage.getCostsSummary());
});

// POST /api/costs
app.post("/api/costs", requireAuth, (req, res) => {
  const { service, operation, cost, tokens, notes } = req.body;
  if (!service || !operation || cost === undefined) {
    return res.status(400).json({ message: "Serviço, operação e custo são obrigatórios" });
  }

  const row = storage.createCost({ service, operation, cost: Number(cost), tokens, notes });
  return res.status(201).json(row);
});

// DELETE /api/costs/:id
app.delete("/api/costs/:id", requireAuth, (req, res) => {
  const deleted = storage.deleteCost(p(req.params.id));
  if (!deleted) return res.status(404).json({ message: "Registro não encontrado" });
  return res.json({ ok: true });
});

// ─── GET /api/bot/logs ────────────────────────────────────────────────────────
app.get("/api/bot/logs", requireAuth, (_req, res) => {
  return res.json([...LOG_BUFFER].reverse());
});

// ─── VTEX Integration routes ──────────────────────────────────────────────────

// GET /api/vtex/settings
app.get("/api/vtex/settings", requireAuth, (_req, res) => {
  return res.json(storage.getVtexSettings());
});

// POST /api/vtex/settings
app.post("/api/vtex/settings", requireAuth, (req, res) => {
  storage.setVtexSettings(req.body);
  emitLog("[VTEX] Configurações de gatilho atualizadas.", "INFO");
  return res.json({ ok: true });
});

// GET /api/vtex/logs
app.get("/api/vtex/logs", requireAuth, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  return res.json(storage.listVtexLogs(limit));
});

// POST /api/vtex/logs
app.post("/api/vtex/logs", requireAuth, (req, res) => {
  const { type, description, product, autonomous } = req.body;
  if (!type || !description) return res.status(400).json({ message: "type e description obrigatórios" });
  const result = storage.createVtexLog({ type, description, product, autonomous });
  return res.status(201).json(result);
});

// GET /api/vtex/stats
app.get("/api/vtex/stats", requireAuth, (_req, res) => {
  return res.json(storage.getVtexStats());
});

// GET /api/vtex/failures
app.get("/api/vtex/failures", requireAuth, (_req, res) => {
  return res.json(storage.listVtexFailures());
});

// POST /api/vtex/failures/:id/resolve
app.post("/api/vtex/failures/:id/resolve", requireAuth, (req, res) => {
  const resolved = storage.resolveVtexFailure(p(req.params.id));
  if (!resolved) return res.status(404).json({ message: "Falha não encontrada" });
  return res.json({ ok: true });
});

// GET /api/vtex/synonyms
app.get("/api/vtex/synonyms", requireAuth, (_req, res) => {
  return res.json(storage.listVtexSynonyms());
});

// POST /api/vtex/synonyms
app.post("/api/vtex/synonyms", requireAuth, (req, res) => {
  const { term, canonical } = req.body;
  if (!term || !canonical) return res.status(400).json({ message: "term e canonical obrigatórios" });
  const synonym = storage.createVtexSynonym({ term, canonical });
  emitLog(`[VTEX] Sinônimo criado: "${term}" → "${canonical}"`, "INFO");
  return res.status(201).json(synonym);
});

// DELETE /api/vtex/synonyms/:id
app.delete("/api/vtex/synonyms/:id", requireAuth, (req, res) => {
  const deleted = storage.deleteVtexSynonym(p(req.params.id));
  if (!deleted) return res.status(404).json({ message: "Sinônimo não encontrado" });
  return res.json({ ok: true });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 3001;
const httpServer = http.createServer(app);

// WebSocket server for logs (/ws/logs)
const wssLogs = new WebSocketServer({ noServer: true });
wssLogs.on("connection", (ws) => {
  LOG_WS_CLIENTS.add(ws);
  const recent = LOG_BUFFER.slice(-100);
  ws.send(JSON.stringify({ type: "INIT", logs: recent }));
  ws.on("close", () => LOG_WS_CLIENTS.delete(ws));
});

// WebSocket server for chat events (/ws/chat)
const wssChat = new WebSocketServer({ noServer: true });

httpServer.on("upgrade", (req, socket, head) => {
  const url = req.url ?? "";
  if (url === "/ws/logs") {
    wssLogs.handleUpgrade(req, socket as any, head, (ws) => {
      wssLogs.emit("connection", ws, req);
    });
  } else if (url === "/ws/chat") {
    wssChat.handleUpgrade(req, socket as any, head, (ws) => {
      wssChat.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});


// ─── Servidor: escuta na porta PRIMEIRO para o healthcheck do Railway passar ──
const HOST = "0.0.0.0"; // OBRIGATÓRIO: Railway proxy conecta via IPv4
console.log(`[SERVER] PORT=${process.env.PORT} HOST=${HOST} - chamando httpServer.listen...`);
httpServer.on("error", (err: NodeJS.ErrnoException) => {
  console.error(`[SERVER] ERRO no httpServer: ${err.code} ${err.message}`);
  if (err.code === "EADDRINUSE") {
    console.error(`[SERVER] A porta ${PORT} ja esta em uso!`);
  }
  // Encerra o processo pois sem porta o servidor nao funciona
  process.exit(1);
});
httpServer.listen(PORT, HOST, () => {
  console.log(`✅ Servidor rodando em http://${HOST}:${PORT}`);
  console.log(`   Banco: ${process.env.DATABASE_URL ? "PostgreSQL (Railway)" : "SQLite local"}`);
  console.log(`   Ambiente: ${process.env.NODE_ENV ?? "development"}`);
  console.log(`   FRONTEND_URL: ${process.env.FRONTEND_URL ?? "(não definido — usando regex *.vercel.app)"}`);
  console.log(`   Cookie sameSite: ${isProduction ? "none (cross-domain)" : "lax (local dev)"}`);
  console.log(`   Cookie secure: ${isProduction}`);

  // Init em background — não bloqueia o healthcheck
  setImmediate(async () => {
    // Auto-seed: garante usuário padrão no banco
    try {
      const existing = db.prepare("SELECT id FROM users WHERE email = ?").get("suporte2@tecfag.com.br");
      if (!existing) {
        const bcrypt = await import("bcryptjs");
        const { v4 } = await import("uuid");
        db.prepare(
          "INSERT INTO users (id, name, email, username, password) VALUES (?, ?, ?, ?, ?)"
        ).run(v4(), "Suporte 2", "suporte2@tecfag.com.br", "suporte2", bcrypt.hashSync("123", 10));
        console.log("✅ Usuário padrão criado: suporte2@tecfag.com.br / 123");
      }
    } catch (e) {
      console.warn("⚠️  Auto-seed falhou:", e);
    }

    // Inicializa orquestrador e follow-up loop
    console.log("[INIT] Iniciando orchestrator...");
    try {
      initOrchestrator({
        db,
        getApiKey: () =>
          (storage.getSettingParsed<string>("gemini_api_key")) ?? process.env.GEMINI_API_KEY ?? "",
        getRagDocuments: () => {
          try {
            return storage.listActiveDocumentsForRag(50)
              .map((doc) => {
                try {
                  const abs = path.join(__dirname, "..", doc.filePath.replace(/^\//, ""));
                  if (!fs.existsSync(abs)) return null;
                  return { id: doc.id, name: doc.name, content: fs.readFileSync(abs, "utf-8").slice(0, 5000) };
                } catch { return null; }
              })
              .filter(Boolean) as { id: string; name: string; content: string }[];
          } catch { return []; }
        },
        emitLog,
      });
      console.log("[INIT] Orchestrator OK");
      startFollowUpLoop();
      console.log("[INIT] FollowUpLoop OK");
      emitLog("Fagner online e pronto para receber atendimentos 🤖", "SUCCESS");
      console.log("[INIT] ✅ Servidor completamente inicializado e aguardando requests");
    } catch (e) {
      console.error("❌ Erro ao inicializar orquestrador:", e);
    }
  });

  // Serve arquivos estáticos do React (apenas quando SERVE_STATIC=true)
  // Em produção no Railway, o Vercel serve o frontend — isso fica desabilitado.
  if (process.env.SERVE_STATIC === "true") {
    const distPath = path.join(__dirname, "../dist/public");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      // Usa RegExp para bypassar path-to-regexp e funcionar no Express v5
      app.get(/.*/, (_req, res) =>
        res.sendFile(path.join(distPath, "index.html"))
      );
      console.log(`   Static files: ${distPath}`);
    }
  }
});
