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
import { registerLiveChatRoutes } from "./livechat/livechatRoutes.js";
import { initLiveChatWs } from "./livechat/livechatWs.js";
import { ensureLiveChatSchema, lcStorage } from "./livechat/livechatStorage.js";
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
import { pool, bootstrapSchema } from "./db.js";

// Sweeper de chats órfãos (ocorre após reinícios do servidor)
// Roda a cada 5 minutos para capturar chats sem resposta mais rapidamente
setInterval(() => {
  lcStorage.sweepOrphanedChats().catch((err) => {
    console.error("[LiveChat Sweeper] Erro:", err);
  });
}, 5 * 60 * 1000).unref();
// Roda uma vez imediatamente no boot para limpar possíveis chats que ficaram presos antes do reinício
lcStorage.sweepOrphanedChats().catch(() => {});

import {
  initOrchestrator,
  handleWebhook,
  startFollowUpLoop,
  getAllSessionsForDashboard,
  getSchedule,
  setSchedule,
} from "./fagner/fagnerOrchestrator.js";
import { serializeSession, deleteSession, getSession } from "./fagner/sessionManager.js";
import { buildSystemPrompt } from "./fagner/systemPrompt.js";
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
  filename: (_req, file, cb) => {
    // Substitui espaços por hífen para evitar crash no front-end do widget (quebra de URLs)
    const cleanName = file.originalname.replace(/\s+/g, '-');
    cb(null, `${uuidv4()}-${cleanName}`);
  },
});
const upload = multer({ storage: multerStorage });
const chatUpload = multer({ 
  storage: multerStorage,
  limits: { fileSize: 5 * 1024 * 1024 } // Limite rígido API Chat Client: 5MB
});

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
    /tecfag\.com\.br$/,              // site principal VTEX
    /\.vtexcommercestable\.com\.br$/,// domínio VTEX stable
    /\.myvtex\.com$/,                // domínio VTEX dev
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

// ─── PostgreSQL Session Store ─────────────────────────────────────────────────
// Usa connect-pg-simple para persistir sessões HTTP no PostgreSQL.
// Sessões sobrevivem a restarts do container no Railway.
import connectPgSimple from "connect-pg-simple";
const PgStore = connectPgSimple(session);

// Session
const isProduction = process.env.NODE_ENV === "production";
app.use(
  session({
    store: new PgStore({
      pool: pool,
      tableName: "http_sessions",
      createTableIfMissing: false, // já criamos no bootstrapSchema
    }),
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

// Serve uploaded files — lê do PostgreSQL (fileData base64) para persistência no Railway.
// Fallback para disco local em ambiente de desenvolvimento.
app.get("/uploads/:filename", async (req: Request, res: Response) => {
  const filename = p(req.params.filename);
  try {
    // 1. Tentar servir do banco (campo fileData — base64 do arquivo original)
    try {
      const dbResult = await pool.query(
        `SELECT "fileData", "mimeType", name FROM documents WHERE "filePath" = $1 LIMIT 1`,
        [`/uploads/${filename}`]
      );
      if (dbResult.rows.length > 0 && dbResult.rows[0].fileData) {
        const { fileData, mimeType, name } = dbResult.rows[0];
        const buffer = Buffer.from(fileData, "base64");
        res.setHeader("Content-Type", mimeType || "application/octet-stream");
        res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(name)}"`);
        res.setHeader("Content-Length", buffer.length.toString());
        return res.send(buffer);
      }
    } catch (dbErr: any) {
      console.warn(`[/uploads] Falha ao consultar banco para ${filename}, tentando fallback do disco. Erro:`, dbErr.message);
    }

    // 2. Fallback: servir do disco (dev local)
    const diskPath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(diskPath)) {
      return res.sendFile(diskPath);
    }
    return res.status(404).json({ message: "Arquivo não encontrado no banco nem no disco." });
  } catch (err: any) {
    console.error(`[/uploads] Erro crítico ao servir arquivo ${filename}:`, err.message);
    return res.status(500).json({ message: "Erro interno ao servir arquivo" });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!(req.session as any).userId) {
    return res.status(401).json({ message: "Não autenticado" });
  }
  next();
}

// ─── Proxy Meta — extrai OG tags para Rich Cards no Widget (público) ──────────
app.get("/api/proxy-meta", async (req, res) => {
  const url = req.query.url as string;
  if (!url || !url.startsWith("http")) {
    return res.status(400).json({ message: "URL inválida" });
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "TecfagBot/1.0" },
    });
    clearTimeout(timeout);
    const html = await response.text();

    // Extrai OG tags com regex simples (sem dependência de parser HTML)
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1]
                   || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
                   || "";
    const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] || "";

    return res.json({ title: ogTitle, image: ogImage, url });
  } catch {
    return res.json({ title: "", image: "", url });
  }
});

// ─── Health check (público — usado pelo Railway) ──────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ─── Ping (ultra-leve, sem DB, sem session — diagnóstico de 502) ──────────────
app.get("/api/ping", (_req, res) => {
  res.json({ pong: true, ts: Date.now(), uptime: process.uptime() });
});

import { lastGeminiError } from "./livechat/livechatAI.js";
app.get("/api/test-error", (_req, res) => {
  res.json({ error: lastGeminiError });
});

// ─── Diagnóstico Gemini — testa a API key e o modelo diretamente ─────────────
// Endpoint temporário para diagnóstico rápido em produção (Railway).
// Chame: GET /api/test-gemini?model=gemini-1.5-pro
app.get("/api/test-gemini", async (req, res) => {
  const apiKey = (await lcStorage.getSettingParsed<string>("gemini_api_key")) ?? process.env.GEMINI_API_KEY ?? "";
  if (!apiKey) return res.json({ ok: false, error: "GEMINI_API_KEY não configurada no banco ou env" });

  const model = (req.query.model as string) || "gemini-3.1-pro-preview";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Diga apenas: OK. E responda em linguajar de teste, sem demorar." }] }],
        generationConfig: { maxOutputTokens: 50 },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    
    const body = await resp.text();
    const parsed = JSON.parse(body).catch?.(() => body) ?? JSON.parse(body);
    
    if (!resp.ok) {
      return res.json({ ok: false, status: resp.status, model, error: body.slice(0, 1000) });
    }
    
    const reply = parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? "(sem texto)";
    return res.json({ ok: true, model, reply, status: resp.status });
  } catch (err: any) {
    return res.json({ ok: false, model, error: err.message });
  }
});

// ─── Chat Público — Endpoint para Upload de Imagens no Chat Widget ────────
app.post("/api/chat-upload", (req, res, next) => {
  const handler = chatUpload.single("file");
  handler(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: "A imagem excedeu o limite máximo de 5MB. Por favor, compacte e tente novamente." });
      }
      return res.status(500).json({ message: "Falha ao processar arquivo: " + err.message });
    }
    next();
  });
}, (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Nenhum arquivo enviado." });
  return res.status(201).json({ url: `/uploads/${req.file.filename}`, mimeType: req.file.mimetype });
});

// ─── Auth routes ─────────────────────────────────────────────────────────────

// POST /api/login
app.post("/api/login", async (req, res) => {
  const t0 = Date.now();
  console.log(`[LOGIN] ► Request de ${req.ip} | origin: ${req.headers.origin} | email: ${req.body?.email}`);

  const { email, password } = req.body as { email: string; password: string };
  if (!email || !password) {
    console.log(`[LOGIN] ✗ 400 — campos faltando (${Date.now() - t0}ms)`);
    return res.status(400).json({ message: "Email e senha são obrigatórios" });
  }

  const user = await storage.getUserByEmail(email);
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
app.get("/api/me", async (req, res) => {
  const userId = (req.session as any).userId;
  if (!userId) return res.status(401).json({ message: "Não autenticado" });

  const user = await storage.getUserSafeById(userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ message: "Sessão inválida" });
  }
  return res.json(user);
});

// ─── User routes ─────────────────────────────────────────────────────────────

// GET /api/users
app.get("/api/users", requireAuth, async (_req, res) => {
  res.json(await storage.listUsers());
});

// POST /api/users
app.post("/api/users", requireAuth, async (req, res) => {
  const { name, email, username, password } = req.body;
  if (!name || !email || !username || !password) {
    return res.status(400).json({ message: "Todos os campos são obrigatórios" });
  }

  if (await storage.userExistsByEmailOrUsername(email, username)) {
    return res.status(409).json({ message: "E-mail ou nome de usuário já cadastrado" });
  }

  const hashed = bcrypt.hashSync(password, 10);
  const user = await storage.createUser({ name, email, username, password: hashed });
  return res.status(201).json(user);
});

// PATCH /api/users/:id
app.patch("/api/users/:id", requireAuth, async (req, res) => {
  const id = p(req.params.id);
  const { name, email, username, password } = req.body;

  const existing = await storage.getUserById(id);
  if (!existing) return res.status(404).json({ message: "Usuário não encontrado" });

  const newPassword = password ? bcrypt.hashSync(password, 10) : undefined;
  const updated = await storage.updateUser(id, { name, email, username, password: newPassword });
  return res.json(updated);
});


// DELETE /api/users/:id
app.delete("/api/users/:id", requireAuth, async (req, res) => {
  const deleted = await storage.deleteUser(p(req.params.id));
  if (!deleted) return res.status(404).json({ message: "Usuário não encontrado" });
  return res.json({ ok: true });
});

// ─── Settings routes ──────────────────────────────────────────────────────────

// GET /api/settings/prompt-history — histórico de alterações do prompt
// IMPORTANTE: deve ficar ANTES de /api/settings/:key para não ser capturado como :key
app.get("/api/settings/prompt-history", requireAuth, async (_req, res) => {
  return res.json(await storage.listPromptHistory());
});

// GET /api/settings/:key
app.get("/api/settings/:key", requireAuth, async (req, res) => {
  const key = String(p(req.params.key));
  let value = await storage.getSettingParsed(key);
  // Fallback: se system_prompt nunca foi salvo, retorna o prompt padrão
  if (value === null && key === "system_prompt") {
    value = buildSystemPrompt("normal") as any;
  }
  return res.json(value);
});

// POST /api/settings
app.post("/api/settings", requireAuth, async (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ message: "Chave obrigatória" });
  
  // Se atualizando system_prompt, salva versão anterior no histórico
  if (key === "system_prompt") {
    const previous = await storage.getSetting("system_prompt");
    if (previous !== null && previous !== value) {
      const userId = (req.session as any)?.userId;
      const user = userId ? await storage.getUserSafeById(userId) : null;
      await storage.addPromptHistory(previous, user?.name ?? "Sistema");
    }
  }
  
  await storage.setSetting(key, value ?? "");
  return res.json({ ok: true });
});

// ─── Sessions routes ──────────────────────────────────────────────────────────

// GET /api/sessions
app.get("/api/sessions", requireAuth, async (req, res) => {
  const archived = req.query.archived === "true" ? "true" : "false";
  return res.json(await storage.listSessions(archived));
});

// GET /api/sessions/:id/messages
app.get("/api/sessions/:id/messages", requireAuth, async (req, res) => {
  return res.json(await storage.listMessagesBySession(p(req.params.id)));
});

// GET /api/sessions/:id/logs
app.get("/api/sessions/:id/logs", requireAuth, async (req, res) => {
  return res.json(await storage.listLogsBySession(p(req.params.id)));
});

// POST /api/sessions/:id/archive
app.post("/api/sessions/:id/archive", requireAuth, async (req, res) => {
  await storage.archiveSession(p(req.params.id));
  return res.json({ ok: true });
});

// DELETE /api/sessions/delete-all
app.delete("/api/sessions/delete-all", requireAuth, async (_req, res) => {
  await storage.deleteArchivedSessions();
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

  // ── Auto-reset: se a sessão de simulação estiver concluída OU travada, reinicia ──
  // Resolve: (1) fluxo concluído bloqueia processContact(), (2) sessão presa em isProcessing após crash
  const existingSimSession = getSession(simContactId);
  if (existingSimSession?.isCompleted || existingSimSession?.isProcessing) {
    deleteSession(simContactId);
    simPendingMessages.delete(simContactId);
    emitLog(`[Simulate] Sessão ${simContactId} auto-resetada (${existingSimSession.isCompleted ? 'fluxo concluído' : 'sessão travada'}). Nova sessão iniciada.`, "INFO");
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
    const apiKey = (await storage.getSettingParsed<string>("gemini_api_key")) ?? process.env.GEMINI_API_KEY ?? "";
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

    // ── Persistir sessão e mensagens no banco para o Monitor em Tempo Real ──
    try {
      const simDbSessionId = `sim-session-${userId}`;
      await storage.upsertSession({
        id: simDbSessionId,
        startTime: simSession?.createdAt?.toISOString() ?? new Date().toISOString(),
        status: simSession?.isCompleted ? "COMPLETED" : "ACTIVE",
        clientName: `Simulador (${userId})`,
        clientPhone: "11900000000",
        contactId: simContactId,
      });

      // Salva mensagem do usuário
      await storage.createMessage({ sessionId: simDbSessionId, sender: "user", content: textMsg });

      // Salva respostas do bot
      for (const reply of finalReplies) {
        await storage.createMessage({ sessionId: simDbSessionId, sender: "bot", content: reply });
      }

      // Broadcast via WebSocket para o LiveMonitor
      const wsPayload = JSON.stringify({
        type: "NEW_MESSAGE",
        sessionId: simDbSessionId,
        sender: "bot",
        content: finalReplies[0],
        timestamp: new Date().toISOString(),
        clientName: `Simulador (${userId})`,
      });
      wssChat.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(wsPayload);
      });
    } catch (persistErr: any) {
      emitLog(`[Simulate] Aviso: falha ao persistir sessão/mensagens: ${persistErr.message}`, "WARN");
    }

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

// GET /api/bot/simulate/messages — retorna mensagens persistidas da sessão de simulação
app.get("/api/bot/simulate/messages", requireAuth, async (req: Request, res: Response) => {
  const userId = (req.session as any)?.userId ?? "anon";
  const simDbSessionId = `sim-session-${userId}`;
  const messages = await storage.listMessagesBySession(simDbSessionId);
  return res.json(messages);
});

// ─── Dashboard routes ─────────────────────────────────────────────────────────

// GET /api/dashboard/stats
app.get("/api/dashboard/stats", requireAuth, async (_req, res) => {
  return res.json(await storage.getDashboardStats());
});

// GET /api/dashboard/leads-by-day
app.get("/api/dashboard/leads-by-day", requireAuth, async (_req, res) => {
  return res.json(await storage.getLeadsByDay());
});

// GET /api/dashboard/leads-by-operator
app.get("/api/dashboard/leads-by-operator", requireAuth, async (_req, res) => {
  return res.json(await storage.getLeadsByOperator());
});

// ─── Documents routes ─────────────────────────────────────────────────────────

// GET /api/documents
app.get("/api/documents", requireAuth, async (_req, res) => {
  return res.json(await storage.listDocuments());
});

// POST /api/documents (multipart)
app.post("/api/documents", requireAuth, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Arquivo obrigatório" });

  const { name, type, folderId } = req.body;
  const doc = await storage.createDocument({
    name: name || req.file.originalname,
    type: type || "knowledge",
    mimeType: req.file.mimetype,
    filePath: `/uploads/${req.file.filename}`,
    folderId: folderId || null,
  });

  try {
    const fileBuffer = fs.readFileSync(path.join(UPLOADS_DIR, req.file.filename));
    const fileDataBase64 = fileBuffer.toString("base64");
    
    // Garantir que a coluna fileData existe (idempotente)
    await pool.query(
      `ALTER TABLE documents ADD COLUMN IF NOT EXISTS "fileData" TEXT`
    ).catch(() => {});
    
    await pool.query(
      `UPDATE documents SET "fileData" = $1 WHERE id = $2`,
      [fileDataBase64, doc.id]
    );
    console.log(`[Upload Single] Salvo na DB PostgreSQL (${Math.round(fileBuffer.length / 1024)}KB)`);
  } catch (err: any) {
    console.warn(`[Upload Single] Falha ao salvar fileData:`, err.message);
  }

  return res.status(201).json(doc);
});

// GET /api/documents/:id
app.get("/api/documents/:id", requireAuth, async (req, res) => {
  const doc = await storage.getDocumentById(p(req.params.id));
  if (!doc) return res.status(404).json({ message: "Documento não encontrado" });
  return res.json(doc);
});

// PATCH /api/documents/:id
app.patch("/api/documents/:id", requireAuth, async (req, res) => {
  const { name, paused, folderId } = req.body;
  const doc = await storage.updateDocument(p(req.params.id), { name, paused, folderId });
  if (!doc) return res.status(404).json({ message: "Documento não encontrado" });
  return res.json(doc);
});

// DELETE /api/documents/:id
app.delete("/api/documents/:id", requireAuth, async (req, res) => {
  const doc = await storage.getDocumentById(p(req.params.id));
  if (!doc) return res.status(404).json({ message: "Documento não encontrado" });

  try {
    const filePath = path.join(__dirname, "..", doc.filePath.replace(/^\//, ""));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {}

  await storage.deleteDocument(p(req.params.id));
  return res.json({ ok: true });
});

// POST /api/documents/upload-queue — Upload em fila (múltiplos arquivos)
// Aceita múltiplos PDFs, extrai texto automaticamente e cria registro duplo:
//   1) knowledge (texto extraído para RAG)
//   2) O filePath original fica acessível via /uploads/ para download do cliente
app.post("/api/documents/upload-queue", requireAuth, upload.array("files", 50), async (req, res) => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    return res.status(400).json({ message: "Nenhum arquivo enviado" });
  }

  const folderId = req.body.folderId || null;
  const results: { name: string; id: string; status: string; error?: string }[] = [];

  for (const file of files) {
    try {
      const filePath = `/uploads/${file.filename}`;
      let extractedText: string | null = null;

      // Tenta extrair texto de PDF
      if (file.mimetype === "application/pdf") {
        try {
          const pdfParseModule = await import("pdf-parse") as any;
          const pdfParse = pdfParseModule.default ?? pdfParseModule;
          const buffer = fs.readFileSync(path.join(UPLOADS_DIR, file.filename));
          const data = await pdfParse(buffer);
          extractedText = data.text?.trim() || null;
        } catch (pdfErr: any) {
          console.warn(`[Upload Queue] Falha ao extrair PDF ${file.originalname}:`, pdfErr.message);
        }
      }

      // Cria documento do tipo "knowledge" (com texto extraído) ou "media" (sem texto)
      const docType = extractedText ? "knowledge" : "media";
      const doc = await storage.createDocument({
        name: file.originalname,
        type: docType,
        mimeType: file.mimetype,
        filePath,
        folderId,
      });

      // Salvar arquivo binário no banco (base64) — garante persistência no Railway
      // O disco do Railway é efêmero e é zerado a cada redeploy
      try {
        const fileBuffer = fs.readFileSync(path.join(UPLOADS_DIR, file.filename));
        const fileDataBase64 = fileBuffer.toString("base64");
        const { pool: dbPool2 } = await import("./db.js");
        // Garantir que a coluna fileData existe (idempotente)
        await dbPool2.query(
          `ALTER TABLE documents ADD COLUMN IF NOT EXISTS "fileData" TEXT`
        ).catch(() => {});
        await dbPool2.query(
          `UPDATE documents SET "fileData" = $1 WHERE id = $2`,
          [fileDataBase64, doc.id]
        );
        console.log(`[Upload] Arquivo ${file.originalname} salvo no PostgreSQL (${Math.round(fileBuffer.length / 1024)}KB)`);
      } catch (dbErr: any) {
        console.warn(`[Upload] Aviso: falha ao salvar fileData no banco para ${file.originalname}:`, dbErr.message);
      }

      // Se extraiu texto do PDF, salva o conteúdo extraído para o RAG
      if (extractedText) {
        const { pool: dbPool } = await import("./db.js");
        await dbPool.query(
          `UPDATE documents SET content = $1 WHERE id = $2`,
          [extractedText.slice(0, 50000), doc.id]
        );
      }

      results.push({ name: file.originalname, id: doc.id, status: "ok" });
    } catch (err: any) {
      results.push({ name: file.originalname, id: "", status: "error", error: err.message });
    }
  }

  return res.status(201).json({ processed: results.length, results });
});

// POST /api/documents/bulk
app.post("/api/documents/bulk", requireAuth, async (req, res) => {
  const { ids, action, value } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ message: "ids inválidos" });

  if (action === "delete") {
    for (const id of ids) {
      const doc = await storage.getDocumentById(id);
      if (doc) {
        try {
          const filePath = path.join(__dirname, "..", doc.filePath.replace(/^\//, ""));
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch {}
      }
    }
    await storage.bulkDeleteDocuments(ids);
  } else if (action === "move") {
    await storage.bulkMoveDocuments(ids, value ?? null);
  } else if (action === "toggle-paused") {
    await storage.bulkTogglePausedDocuments(ids);
  }

  return res.json({ ok: true });
});

// ─── Folders routes ───────────────────────────────────────────────────────────

// GET /api/folders
app.get("/api/folders", requireAuth, async (_req, res) => {
  return res.json(await storage.listFolders());
});

// POST /api/folders
app.post("/api/folders", requireAuth, async (req, res) => {
  const { name, parentId } = req.body;
  if (!name) return res.status(400).json({ message: "Nome obrigatório" });
  return res.status(201).json(await storage.createFolder({ name, parentId }));
});

// PATCH /api/folders/:id  — Renomear, mudar cor, mudar parentId, mudar ordem
app.patch("/api/folders/:id", requireAuth, async (req, res) => {
  const folder = await storage.getFolderById(p(req.params.id));
  if (!folder) return res.status(404).json({ message: "Pasta não encontrada" });
  const { name, color, sortOrder, parentId } = req.body;
  return res.json(await storage.updateFolder(p(req.params.id), { name, color, sortOrder, parentId }));
});

// POST /api/folders/reorder  — Salvar ordem de arrastamento de pastas em batch
app.post("/api/folders/reorder", requireAuth, async (req, res) => {
  const { orders } = req.body as { orders: { id: string; sortOrder: number }[] };
  if (!orders || !Array.isArray(orders)) return res.status(400).json({ message: "orders inválidos" });
  await storage.bulkReorderFolders(orders);
  return res.json({ ok: true });
});

// DELETE /api/folders/:id
app.delete("/api/folders/:id", requireAuth, async (req, res) => {
  await storage.deleteFolder(p(req.params.id));
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
      const whitelistDb = await (async () => {
        try {
          const raw = await storage.getSettingParsed<string[] | string>("fagner_whitelist");
          if (!raw) return [];
          return Array.isArray(raw) ? raw.map(String) : String(raw).split(",").map((n: string) => n.trim()).filter(Boolean);
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
app.post("/api/fagner/schedule", requireAuth, async (req: Request, res: Response) => {
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
  await storage.setSetting("fagner_schedule", config);
  emitLog(`[Horário] Config: ${config.startHour}h–${config.endHour}h dias ${config.weekdays.join(",")} ativo=${config.enabled}`, "INFO");
  return res.json({ ok: true, schedule: config });
});

// ─── Fagner — Operadores por Fluxo ──────────────────────────────────────────────

// GET /api/fagner/operators
app.get("/api/fagner/operators", requireAuth, async (_req, res) => {
  const raw = await storage.getSettingParsed("fagner_operators");
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
app.post("/api/fagner/operators", requireAuth, async (req: Request, res: Response) => {
  const ops = req.body as Record<string, { name: string; id: string }[]>;
  if (!ops || typeof ops !== "object") {
    return res.status(400).json({ message: "Payload inválido" });
  }
  try {
    await storage.setSetting("fagner_operators", ops);
    emitLog("[Operadores] Configuração atualizada.", "INFO");
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
});

// ─── RD Conversas — Endpoints auxiliares ──────────────────────────────────────

// GET /api/rd-conversas/status — verifica se o token está configurado
app.get("/api/rd-conversas/status", requireAuth, async (_req, res) => {
  const token = process.env.RD_CONVERSAS_TOKEN ?? await storage.getSettingParsed<string>("rd_conversas_token") ?? "";
  const integration = process.env.RD_CONVERSAS_INTEGRATION ?? await storage.getSettingParsed<string>("rd_conversas_integration") ?? "";
  const whitelist = await storage.getSettingParsed<string[]>("fagner_whitelist") ?? [];
  const humanFlowId = await storage.getSettingParsed<string>("fagner_rd_human_flow_id") ?? "";
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
app.post("/api/rd-conversas/settings", requireAuth, async (req: Request, res: Response) => {
  const { token, integration, whitelist, humanFlowId, departmentMap } = req.body;
  if (token !== undefined) {
    await storage.setSetting("rd_conversas_token", token);
    process.env.RD_CONVERSAS_TOKEN = token;
  }
  if (integration !== undefined) {
    await storage.setSetting("rd_conversas_integration", integration);
    process.env.RD_CONVERSAS_INTEGRATION = integration;
  }
  if (whitelist !== undefined) {
    await storage.setSetting("fagner_whitelist", Array.isArray(whitelist) ? whitelist : String(whitelist).split(",").map((n: string) => n.trim()).filter(Boolean));
  }
  if (humanFlowId !== undefined) {
    await storage.setSetting("fagner_rd_human_flow_id", humanFlowId);
  }
  if (departmentMap !== undefined) {
    await storage.setSetting("fagner_department_map", departmentMap);
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
app.get("/api/rd-conversas/pecas-rr", requireAuth, async (_req, res) => {
  const SECTORS = ["Tecfag Peças", "Tecfag Peças 2"];
  try {
    const raw = await storage.getSetting("fagner_pecas_rr_index");
    const idx = parseInt(raw ?? "0", 10) || 0;
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
app.post("/api/rd-conversas/pecas-rr/reset", requireAuth, async (req: Request, res: Response) => {
  const SECTORS = ["Tecfag Peças", "Tecfag Peças 2"];
  const { index } = req.body as { index?: number };
  const newIndex = typeof index === "number" ? (index % SECTORS.length) : 0;
  try {
    await storage.setSetting("fagner_pecas_rr_index", String(newIndex));
    emitLog(`[Round-Robin Peças] Contador ajustado para ${newIndex} → próximo: ${SECTORS[newIndex]}`, "INFO");
    return res.json({ ok: true, nextSector: SECTORS[newIndex] });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
});

// ─── RD CRM stub routes ───────────────────────────────────────────────────────


app.get("/api/rd-crm/roundrobin", requireAuth, async (_req, res) => {
  const val = await storage.getSettingParsed("rd_roundrobin");
  return res.json(val || { mode: "fixed", fixedOwnerId: "", users: [], currentIndex: 0 });
});

app.post("/api/rd-crm/roundrobin", requireAuth, async (req, res) => {
  await storage.setSetting("rd_roundrobin", req.body);
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
app.get("/api/costs", requireAuth, async (req, res) => {
  const { service, period } = req.query as { service?: string; period?: string };
  return res.json(await storage.listCosts({
    service,
    period: period as "day" | "week" | "month" | "all" | undefined,
  }));
});

// GET /api/costs/summary
app.get("/api/costs/summary", requireAuth, async (_req, res) => {
  return res.json(await storage.getCostsSummary());
});

// POST /api/costs
app.post("/api/costs", requireAuth, async (req, res) => {
  const { service, operation, cost, tokens, notes } = req.body;
  if (!service || !operation || cost === undefined) {
    return res.status(400).json({ message: "Serviço, operação e custo são obrigatórios" });
  }

  const row = await storage.createCost({ service, operation, cost: Number(cost), tokens, notes });
  return res.status(201).json(row);
});

// DELETE /api/costs/:id
app.delete("/api/costs/:id", requireAuth, async (req, res) => {
  const deleted = await storage.deleteCost(p(req.params.id));
  if (!deleted) return res.status(404).json({ message: "Registro não encontrado" });
  return res.json({ ok: true });
});

// ─── GET /api/bot/logs ────────────────────────────────────────────────────────
app.get("/api/bot/logs", requireAuth, (_req, res) => {
  return res.json([...LOG_BUFFER].reverse());
});

// ─── VTEX Integration routes ──────────────────────────────────────────────────

// GET /api/vtex/settings
app.get("/api/vtex/settings", requireAuth, async (_req, res) => {
  return res.json(await storage.getVtexSettings());
});

// POST /api/vtex/settings
app.post("/api/vtex/settings", requireAuth, async (req, res) => {
  await storage.setVtexSettings(req.body);
  emitLog("[VTEX] Configurações de gatilho atualizadas.", "INFO");
  return res.json({ ok: true });
});

// GET /api/vtex/logs
app.get("/api/vtex/logs", requireAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  return res.json(await storage.listVtexLogs(limit));
});

// POST /api/vtex/logs
app.post("/api/vtex/logs", requireAuth, async (req, res) => {
  const { type, description, product, autonomous } = req.body;
  if (!type || !description) return res.status(400).json({ message: "type e description obrigatórios" });
  const result = await storage.createVtexLog({ type, description, product, autonomous });
  return res.status(201).json(result);
});

// GET /api/vtex/stats
app.get("/api/vtex/stats", requireAuth, async (_req, res) => {
  return res.json(await storage.getVtexStats());
});

// GET /api/vtex/failures
app.get("/api/vtex/failures", requireAuth, async (_req, res) => {
  return res.json(await storage.listVtexFailures());
});

// POST /api/vtex/failures/:id/resolve
app.post("/api/vtex/failures/:id/resolve", requireAuth, async (req, res) => {
  const resolved = await storage.resolveVtexFailure(p(req.params.id));
  if (!resolved) return res.status(404).json({ message: "Falha não encontrada" });
  return res.json({ ok: true });
});

// GET /api/vtex/synonyms
app.get("/api/vtex/synonyms", requireAuth, async (_req, res) => {
  return res.json(await storage.listVtexSynonyms());
});

// POST /api/vtex/synonyms
app.post("/api/vtex/synonyms", requireAuth, async (req, res) => {
  const { term, canonical } = req.body;
  if (!term || !canonical) return res.status(400).json({ message: "term e canonical obrigatórios" });
  const synonym = await storage.createVtexSynonym({ term, canonical });
  emitLog(`[VTEX] Sinônimo criado: "${term}" → "${canonical}"`, "INFO");
  return res.status(201).json(synonym);
});

// DELETE /api/vtex/synonyms/:id
app.delete("/api/vtex/synonyms/:id", requireAuth, async (req, res) => {
  const deleted = await storage.deleteVtexSynonym(p(req.params.id));
  if (!deleted) return res.status(404).json({ message: "Sinônimo não encontrado" });
  return res.json({ ok: true });
});

// GET /api/vtex/categories
app.get("/api/vtex/categories", requireAuth, async (_req, res) => {
  return res.json(await storage.listVtexCategories());
});

// POST /api/vtex/categories
app.post("/api/vtex/categories", requireAuth, async (req, res) => {
  const { name, tags } = req.body;
  if (!name || !Array.isArray(tags)) return res.status(400).json({ message: "name e tags(array) obrigatórios" });
  const category = await storage.createVtexCategory({ name, tags });
  emitLog(`[VTEX] Categoria criada: "${name}"`, "INFO");
  return res.status(201).json(category);
});

// PATCH /api/vtex/categories/:id
app.patch("/api/vtex/categories/:id", requireAuth, async (req, res) => {
  const { name, tags, expanded } = req.body;
  const category = await storage.updateVtexCategory(p(req.params.id), { name, tags, expanded });
  if (!category) return res.status(404).json({ message: "Categoria não encontrada" });
  return res.json(category);
});

// DELETE /api/vtex/categories/:id
app.delete("/api/vtex/categories/:id", requireAuth, async (req, res) => {
  const deleted = await storage.deleteVtexCategory(p(req.params.id));
  if (!deleted) return res.status(404).json({ message: "Categoria não encontrada" });
  return res.json({ ok: true });
});

// POST /api/vtex/search (Simulador)
app.post("/api/vtex/search", requireAuth, async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ message: "query obrigatória" });
  try {
    const { searchProduct } = await import("./fagner/vtexService.js");
    const result = await searchProduct(query);
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
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

// ─── Live Chat: garante schema do DB antes de aceitar conexões ──────────────
ensureLiveChatSchema().catch(e => console.error('[LiveChat] ensureLiveChatSchema failed:', e.message));

// ─── Live Chat: registra rotas REST ─────────────────────────────────────────
registerLiveChatRoutes(app);

// ─── WebSocket server para /ws/livechat ─────────────────────────────────────
// Criado aqui para usar o MESMO handler 'upgrade' acima (evita conflito)
const wssLiveChat = new WebSocketServer({ noServer: true });
initLiveChatWs(httpServer, wssLiveChat);

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
  } else if (url === "/ws/livechat") {
    wssLiveChat.handleUpgrade(req, socket as any, head, (ws) => {
      wssLiveChat.emit("connection", ws, req);
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
  console.log(`   Banco: PostgreSQL`);
  console.log(`   Ambiente: ${process.env.NODE_ENV ?? "development"}`);
  console.log(`   FRONTEND_URL: ${process.env.FRONTEND_URL ?? "(não definido — usando regex *.vercel.app)"}`);
  console.log(`   Cookie sameSite: ${isProduction ? "none (cross-domain)" : "lax (local dev)"}`);
  console.log(`   Cookie secure: ${isProduction}`);

  // Init em background — não bloqueia o healthcheck
  setImmediate(async () => {
    // Bootstrap schema PostgreSQL (idempotente)
    await bootstrapSchema();

    // Auto-seed: garante usuário padrão no banco
    try {
      const existing = await storage.getUserByEmail("suporte2@tecfag.com.br");
      if (!existing) {
        const bcryptMod = await import("bcryptjs");
        await storage.createUser({
          name: "Suporte 2",
          email: "suporte2@tecfag.com.br",
          username: "suporte2",
          password: bcryptMod.hashSync("123", 10),
        });
        console.log("✅ Usuário padrão criado: suporte2@tecfag.com.br / 123");
      }
    } catch (e) {
      console.warn("⚠️  Auto-seed falhou:", e);
    }

    // Inicializa orquestrador e follow-up loop
    console.log("[INIT] Iniciando orchestrator...");
    try {
      initOrchestrator({
        storage,
        getApiKey: async () =>
          (await storage.getSettingParsed<string>("gemini_api_key")) ?? process.env.GEMINI_API_KEY ?? "",
        getRagDocuments: async () => {
          try {
            const docs = await storage.listActiveDocumentsForRag(50);
            return docs
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
